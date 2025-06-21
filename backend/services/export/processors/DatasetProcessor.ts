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

    // Use base class cache checking
    if (!await this.shouldUpdate(cacheKey, summary, context)) {
      return;
    }

    logger.debug(`Processing dataset ${datasetId} (${summary.Name})`);

    // Start all API calls in parallel for maximum performance
    const apiPromises = {
      details: this.executeWithRetry(
        () => this.client.send(new DescribeDataSetCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `DescribeDataSet(${datasetId})`,
      ).catch(err => {
        logger.warn(`DescribeDataSet failed for ${datasetId}: ${err.message}`);
        // Return fallback for uploaded file datasets
        return {
          DataSet: {
            DataSetId: datasetId,
            Arn: summary.Arn,
            Name: summary.Name,
            ImportMode: 'SPICE',
            CreatedTime: summary.CreatedTime,
            LastUpdatedTime: summary.LastUpdatedTime,
          },
          _isUploadedFile: true,
        };
      }),
      permissions: this.getPermissions(datasetId).catch(err => {
        logger.debug(`Failed to get permissions for dataset ${datasetId}: ${err.message}`);
        return [];
      }),
      tags: this.getTags(datasetId).catch(err => {
        logger.debug(`Failed to get tags for dataset ${datasetId}: ${err.message}`);
        return [];
      }),
    };

    // Execute all base API calls in parallel
    const { details: detailResponse, permissions, tags } = await this.executeAllPromises(apiPromises);
    const isUploadedFile = (detailResponse as any)._isUploadedFile || false;

    // Parse the dataset
    const parsedDataset = isUploadedFile ? 
      { fields: [], calculatedFields: [], datasourceInfo: { type: 'UPLOADED_FILE' } } :
      this.assetParserService.parseDataset(detailResponse);

    // Determine datasource type
    const datasourceType = (isUploadedFile || parsedDataset.datasourceInfo?.type === 'UPLOADED_FILE') ?
      'Uploaded File' : this.determineDatasourceType(detailResponse, parsedDataset);

    // Fetch SPICE metadata if needed (parallel)
    const spiceMetadata = detailResponse.DataSet?.ImportMode === 'SPICE' ? 
      await this.fetchSpiceMetadata(datasetId) : null;

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

    // Add SPICE metadata if available
    if (spiceMetadata) {
      exportData.DataSetRefreshProperties = spiceMetadata.refreshProperties;
      exportData.RefreshSchedules = spiceMetadata.schedules;
    }

    await this.metadataService.saveMetadata(cacheKey, exportData);
    
    if (isUploadedFile) {
      logger.info(`Successfully exported uploaded file dataset ${datasetId} (${summary.Name}) with fallback metadata`);
    } else {
      logger.debug(`Successfully exported dataset ${datasetId} (${summary.Name})`);
    }
  }

  private async fetchSpiceMetadata(datasetId: string): Promise<{ refreshProperties?: any; schedules?: any[] }> {
    // Fetch both SPICE metadata in parallel
    const [refreshProps, schedules] = await Promise.allSettled([
      this.executeWithRetry(
        () => this.client.send(new DescribeDataSetRefreshPropertiesCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `DescribeDataSetRefreshProperties(${datasetId})`,
      ),
      this.executeWithRetry(
        () => this.client.send(new ListRefreshSchedulesCommand({
          AwsAccountId: this.awsAccountId,
          DataSetId: datasetId,
        })),
        `ListRefreshSchedules(${datasetId})`,
      ),
    ]);
    
    const result: { refreshProperties?: any; schedules?: any[] } = {};
    
    // Handle refresh properties result
    if (refreshProps.status === 'fulfilled') {
      result.refreshProperties = refreshProps.value.DataSetRefreshProperties;
    } else if (!refreshProps.reason?.message?.includes('Dataset refresh properties are not set')) {
      logger.warn(`Could not get refresh properties for dataset ${datasetId}:`, refreshProps.reason?.message);
    }
    
    // Handle schedules result
    if (schedules.status === 'fulfilled') {
      result.schedules = schedules.value.RefreshSchedules || [];
    } else {
      logger.warn(`Could not get refresh schedules for dataset ${datasetId}:`, schedules.reason);
    }
    
    return result;
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
}