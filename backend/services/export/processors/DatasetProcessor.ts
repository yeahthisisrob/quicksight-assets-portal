import { 
  DescribeDataSetCommand,
  DescribeDataSetRefreshPropertiesCommand,
  ListRefreshSchedulesCommand,
} from '@aws-sdk/client-quicksight';
import { BaseAssetProcessor } from '../core/BaseAssetProcessor';
import { AssetType, AssetSummary, ProcessingContext } from '../core/types';
import { logger } from '../../../utils/logger';

export class DatasetProcessor extends BaseAssetProcessor {
  readonly assetType: AssetType = 'datasets';

  getServicePath(): string {
    return 'datasets';
  }

  async processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void> {
    const datasetId = summary.DataSetId;
    if (!datasetId) return;

    const cacheKey = this.getCacheKey(datasetId);

    // Check if we need to update
    const existingData = await this.metadataService.getMetadata(cacheKey).catch(() => null);
    const existingMetadata = existingData?.['@metadata'];
    
    const needsUpdate = context.forceRefresh || 
      !existingMetadata?.exportTime ||
      this.isStale(existingMetadata.exportTime) ||
      (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
       new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

    if (!needsUpdate) {
      return; // Already cached and fresh
    }

    logger.info(`Processing dataset ${datasetId} (${summary.Name}) - ImportMode: ${summary.ImportMode}, ARN: ${summary.Arn ? 'present' : 'missing'}`);

    // Handle uploaded file datasets that may fail DescribeDataSet
    let detailResponse: any;
    let isUploadedFile = false;
    
    try {
      detailResponse = await this.executeWithRetry(
        () => this.client.send(new DescribeDataSetCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `DescribeDataSet(${datasetId})`,
      );
    } catch (describeError: any) {
      logger.warn(`DescribeDataSet failed for ${datasetId} (${summary.Name}): ${describeError.message}`);
      logger.info(`Treating dataset ${datasetId} as uploaded file, using fallback metadata`);
      isUploadedFile = true;
      
      // Create minimal response for uploaded file datasets
      detailResponse = {
        DataSet: {
          DataSetId: datasetId,
          Arn: summary.Arn,
          Name: summary.Name,
          ImportMode: 'SPICE', // Uploaded files are typically SPICE
          CreatedTime: summary.CreatedTime,
          LastUpdatedTime: summary.LastUpdatedTime,
        },
      };
    }

    // Parse the dataset
    let parsedDataset: any;
    if (isUploadedFile) {
      parsedDataset = {
        fields: [],
        calculatedFields: [],
        datasourceInfo: { type: 'UPLOADED_FILE' },
      };
    } else {
      parsedDataset = this.assetParserService.parseDataset(detailResponse);
    }

    // Determine datasource type
    let datasourceType = 'Unknown';
    if (isUploadedFile || parsedDataset.datasourceInfo?.type === 'UPLOADED_FILE') {
      datasourceType = 'Uploaded File';
    } else {
      datasourceType = this.determineDatasourceType(detailResponse, parsedDataset);
    }

    // Fetch permissions and tags in parallel
    const [permissions, tags] = await Promise.all([
      this.getPermissions(datasetId).catch(err => {
        if (isUploadedFile) {
          logger.debug(`Permissions not available for uploaded file dataset ${datasetId}`);
        } else {
          logger.warn(`Failed to get permissions for dataset ${datasetId}: ${err.message}`);
        }
        return [];
      }),
      this.getTags(datasetId).catch(err => {
        if (isUploadedFile) {
          logger.debug(`Tags not available for uploaded file dataset ${datasetId}`);
        } else {
          logger.warn(`Failed to get tags for dataset ${datasetId}: ${err.message}`);
        }
        return [];
      }),
    ]);

    const exportData: any = {
      DataSet: detailResponse.DataSet,
      Permissions: permissions,
      Tags: tags,
      '@metadata': {
        exportTime: new Date().toISOString(),
        lastModifiedTime: summary.LastUpdatedTime,
        name: summary.Name || 'Unnamed Dataset',
        importMode: detailResponse.DataSet?.ImportMode || 'DIRECT_QUERY',
        datasourceType: datasourceType,
        fieldCount: parsedDataset.fields.length,
        calculatedFieldCount: parsedDataset.calculatedFields.length,
        totalFieldCount: parsedDataset.fields.length + parsedDataset.calculatedFields.length,
        isUploadedFile: isUploadedFile,
      },
    };

    // For SPICE datasets, get refresh properties and schedules
    if (detailResponse.DataSet?.ImportMode === 'SPICE') {
      await this.addSpiceMetadata(datasetId, exportData);
    }

    await this.metadataService.saveMetadata(cacheKey, exportData);
    
    if (isUploadedFile) {
      logger.info(`Successfully exported uploaded file dataset ${datasetId} (${summary.Name}) with fallback metadata`);
    } else {
      logger.debug(`Successfully exported dataset ${datasetId} (${summary.Name})`);
    }
  }

  private async addSpiceMetadata(datasetId: string, exportData: any): Promise<void> {
    try {
      const refreshPropsResponse = await this.executeWithRetry(
        () => this.client.send(new DescribeDataSetRefreshPropertiesCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `DescribeDataSetRefreshProperties(${datasetId})`,
      );
      exportData.DataSetRefreshProperties = refreshPropsResponse.DataSetRefreshProperties;
    } catch (error: any) {
      if (!error.message?.includes('Dataset refresh properties are not set')) {
        logger.warn(`Could not get refresh properties for dataset ${datasetId}:`, error.message);
      }
    }
    
    try {
      const schedulesResponse = await this.executeWithRetry(
        () => this.client.send(new ListRefreshSchedulesCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `ListRefreshSchedules(${datasetId})`,
      );
      exportData.RefreshSchedules = schedulesResponse.RefreshSchedules || [];
    } catch (error) {
      logger.warn(`Could not get refresh schedules for dataset ${datasetId}:`, error);
    }
  }

  private determineDatasourceType(detailResponse: any, parsedDataset: any): string {
    if (detailResponse.DataSet?.PhysicalTableMap) {
      const tables = Object.values(detailResponse.DataSet.PhysicalTableMap) as any[];
      if (tables.length > 0) {
        const table = tables[0];
        if (table.S3Source) {
          return 'S3';
        } else if (table.UploadSettings) {
          return 'Uploaded File';
        } else if (table.RelationalTable) {
          return this.getDatabaseType(table.RelationalTable.DataSourceArn);
        } else if (table.CustomSql) {
          return 'Custom SQL';
        }
      }
    }
    
    // Check for uploaded files from parser
    if (parsedDataset.datasourceInfo?.type === 'UPLOADED_FILE') {
      return 'Uploaded File';
    }
    
    return 'Unknown';
  }

  private getDatabaseType(datasourceArn?: string): string {
    if (!datasourceArn) return 'Database';
    
    if (datasourceArn.includes('redshift')) return 'REDSHIFT';
    if (datasourceArn.includes('athena')) return 'ATHENA';
    if (datasourceArn.includes('rds')) return 'RDS';
    if (datasourceArn.includes('aurora')) return 'AURORA';
    if (datasourceArn.includes('postgresql')) return 'POSTGRESQL';
    if (datasourceArn.includes('mysql')) return 'MYSQL';
    
    return 'Database';
  }

  protected async getPermissions(assetId: string): Promise<any[]> {
    return this.permissionsService.getDataSetPermissions(assetId);
  }

  protected async getTags(assetId: string): Promise<any[]> {
    return this.tagService.getResourceTags('dataset', assetId);
  }

  private isStale(exportTime: string): boolean {
    const cacheAge = Date.now() - new Date(exportTime).getTime();
    return cacheAge > 60 * 60 * 1000; // 1 hour
  }
}