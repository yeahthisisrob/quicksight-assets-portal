import { 
  DescribeDashboardCommand, 
  DescribeDashboardDefinitionCommand, 
} from '@aws-sdk/client-quicksight';
import { BaseAssetProcessor } from '../core/BaseAssetProcessor';
import { AssetType, AssetSummary, ProcessingContext } from '../core/types';

export class DashboardProcessor extends BaseAssetProcessor {
  readonly assetType: AssetType = 'dashboards';

  getServicePath(): string {
    return 'dashboards';
  }

  async processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void> {
    const dashboardId = summary.DashboardId;
    if (!dashboardId) return;

    const cacheKey = this.getCacheKey(dashboardId);

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
        () => this.client.send(new DescribeDashboardDefinitionCommand({
          AwsAccountId: this.awsAccountId,
          DashboardId: dashboardId,
        })),
        `DescribeDashboardDefinition(${dashboardId})`,
      ),
      this.executeWithRetry(
        () => this.client.send(new DescribeDashboardCommand({
          AwsAccountId: this.awsAccountId,
          DashboardId: dashboardId,
        })),
        `DescribeDashboard(${dashboardId})`,
      ),
      this.fetchPermissionsAndTags(dashboardId),
    ]);

    const exportData = {
      ...definitionResponse,
      Dashboard: detailResponse.Dashboard,
      Permissions: permissions,
      Tags: tags,
      '@metadata': {
        exportTime: new Date().toISOString(),
        lastModifiedTime: summary.LastUpdatedTime,
        name: summary.Name || 'Unnamed Dashboard',
      },
    };

    await this.metadataService.saveMetadata(cacheKey, exportData);
  }

  protected async getPermissions(assetId: string): Promise<any[]> {
    return this.permissionsService.getDashboardPermissions(assetId);
  }

  protected async getTags(assetId: string): Promise<any[]> {
    return this.tagService.getResourceTags('dashboard', assetId);
  }

  private isStale(exportTime: string): boolean {
    const cacheAge = Date.now() - new Date(exportTime).getTime();
    return cacheAge > 60 * 60 * 1000; // 1 hour
  }
}