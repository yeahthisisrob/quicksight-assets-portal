import { 
  DescribeDataSourceCommand,
} from '@aws-sdk/client-quicksight';
import { BaseAssetProcessor } from '../core/BaseAssetProcessor';
import { AssetType, AssetSummary, ProcessingContext } from '../core/types';
import { logger } from '../../../utils/logger';

export class DatasourceProcessor extends BaseAssetProcessor {
  readonly assetType: AssetType = 'datasources';

  getServicePath(): string {
    return 'datasources';
  }

  async processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void> {
    const datasourceId = summary.DataSourceId;
    if (!datasourceId) {
      logger.warn('Skipping datasource with no DataSourceId:', summary);
      return;
    }

    logger.debug(`Processing datasource ${datasourceId} (${summary.Name}), Type: ${summary.Type}`);
    const cacheKey = this.getCacheKey(datasourceId);

    // Check if we need to update
    const existingData = await this.metadataService.getMetadata(cacheKey).catch(() => null);
    const existingMetadata = existingData?.['@metadata'];
    
    const needsUpdate = context.forceRefresh || 
      !existingMetadata?.exportTime ||
      this.isStale(existingMetadata.exportTime) ||
      (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
       new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

    if (!needsUpdate) {
      logger.debug(`Datasource ${datasourceId} already cached and fresh`);
      return; // Already cached and fresh
    }

    // Handle flat file datasources that may fail DescribeDataSource
    let detailResponse: any;
    let isUploadedFile = false;
    
    try {
      logger.debug(`Calling DescribeDataSource for ${datasourceId}...`);
      detailResponse = await this.executeWithRetry(
        () => this.client.send(new DescribeDataSourceCommand({
          AwsAccountId: this.awsAccountId,
          DataSourceId: datasourceId,
        })),
        `DescribeDataSource(${datasourceId})`,
      );
      logger.debug(`Successfully described datasource ${datasourceId}`);
    } catch (describeError: any) {
      logger.warn(`DescribeDataSource failed for ${datasourceId} (${summary.Name}): ${describeError.message}`);
      logger.info(`Treating datasource ${datasourceId} as uploaded file, using fallback metadata`);
      isUploadedFile = true;
      
      // Create minimal response for uploaded file datasources
      detailResponse = {
        DataSource: {
          DataSourceId: datasourceId,
          Arn: summary.Arn,
          Name: summary.Name,
          Type: 'UPLOADED_FILE',
          CreatedTime: summary.CreatedTime,
          LastUpdatedTime: summary.LastUpdatedTime,
        },
      };
    }

    // Fetch permissions and tags in parallel
    const [permissions, tags] = await Promise.all([
      this.getPermissions(datasourceId).catch(err => {
        if (isUploadedFile) {
          logger.debug(`Permissions not available for uploaded file datasource ${datasourceId}`);
        } else {
          logger.warn(`Failed to get permissions for datasource ${datasourceId}: ${err.message}`);
        }
        return [];
      }),
      this.getTags(datasourceId).catch(err => {
        if (isUploadedFile) {
          logger.debug(`Tags not available for uploaded file datasource ${datasourceId}`);
        } else {
          logger.warn(`Failed to get tags for datasource ${datasourceId}: ${err.message}`);
        }
        return [];
      }),
    ]);

    const exportData = {
      DataSource: detailResponse.DataSource,
      Permissions: permissions,
      Tags: tags,
      '@metadata': {
        exportTime: new Date().toISOString(),
        lastModifiedTime: summary.LastUpdatedTime,
        name: summary.Name || 'Unnamed Datasource',
        type: isUploadedFile ? 'UPLOADED_FILE' : (summary.Type || 'Unknown'),
        isUploadedFile: isUploadedFile,
      },
    };

    await this.metadataService.saveMetadata(cacheKey, exportData);
    
    if (isUploadedFile) {
      logger.info(`Successfully exported uploaded file datasource ${datasourceId} (${summary.Name}) with fallback metadata`);
    } else {
      logger.debug(`Successfully exported datasource ${datasourceId} (${summary.Name})`);
    }
  }


  protected async getPermissions(assetId: string): Promise<any[]> {
    return this.permissionsService.getDataSourcePermissions(assetId);
  }

  protected async getTags(assetId: string): Promise<any[]> {
    return this.tagService.getResourceTags('datasource', assetId);
  }

  private isStale(exportTime: string): boolean {
    const cacheAge = Date.now() - new Date(exportTime).getTime();
    return cacheAge > 60 * 60 * 1000; // 1 hour
  }
}