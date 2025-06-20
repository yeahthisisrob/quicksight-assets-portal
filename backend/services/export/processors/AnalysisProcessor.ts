import { 
  DescribeAnalysisCommand, 
  DescribeAnalysisDefinitionCommand, 
} from '@aws-sdk/client-quicksight';
import { BaseAssetProcessor } from '../core/BaseAssetProcessor';
import { AssetType, AssetSummary, ProcessingContext } from '../core/types';

export class AnalysisProcessor extends BaseAssetProcessor {
  readonly assetType: AssetType = 'analyses';

  getServicePath(): string {
    return 'analyses';
  }

  async processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void> {
    const analysisId = summary.AnalysisId;
    if (!analysisId) return;

    const cacheKey = this.getCacheKey(analysisId);

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

    // Fetch definition, details, permissions, and tags in parallel
    const [definitionResponse, detailResponse, [permissions, tags]] = await Promise.all([
      this.executeWithRetry(
        () => this.client.send(new DescribeAnalysisDefinitionCommand({
          AwsAccountId: this.awsAccountId,
          AnalysisId: analysisId,
        })),
        `DescribeAnalysisDefinition(${analysisId})`,
      ),
      this.executeWithRetry(
        () => this.client.send(new DescribeAnalysisCommand({
          AwsAccountId: this.awsAccountId,
          AnalysisId: analysisId,
        })),
        `DescribeAnalysis(${analysisId})`,
      ),
      this.fetchPermissionsAndTags(analysisId),
    ]);

    const exportData = {
      ...definitionResponse,
      Analysis: detailResponse.Analysis,
      Permissions: permissions,
      Tags: tags,
      '@metadata': {
        exportTime: new Date().toISOString(),
        lastModifiedTime: summary.LastUpdatedTime,
        name: summary.Name || 'Unnamed Analysis',
      },
    };

    await this.metadataService.saveMetadata(cacheKey, exportData);
  }

  protected async getPermissions(assetId: string): Promise<any[]> {
    return this.permissionsService.getAnalysisPermissions(assetId);
  }

  protected async getTags(assetId: string): Promise<any[]> {
    return this.tagService.getResourceTags('analysis', assetId);
  }

  private isStale(exportTime: string): boolean {
    const cacheAge = Date.now() - new Date(exportTime).getTime();
    return cacheAge > 60 * 60 * 1000; // 1 hour
  }
}