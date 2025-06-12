import {
  QuickSightClient,
  ListDashboardsCommand,
  DescribeDashboardCommand,
  DescribeDashboardPermissionsCommand,
  Dashboard,
} from '@aws-sdk/client-quicksight';
import { DashboardInfo, DashboardPermission } from '../types';
import { MetadataService } from './metadata.service';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';

export class DashboardService {
  private client: QuickSightClient;
  private metadataService: MetadataService;
  private awsAccountId: string;

  constructor() {
    this.client = new QuickSightClient(getAwsConfig());
    this.metadataService = new MetadataService();
    this.awsAccountId = process.env.AWS_ACCOUNT_ID || '';
    
    // Log initialization for debugging
    console.log('Initializing DashboardService with account:', this.awsAccountId);
  }

  async listAllDashboards(): Promise<DashboardInfo[]> {
    const dashboards: DashboardInfo[] = [];
    let nextToken: string | undefined;

    do {
      try {
        const command = new ListDashboardsCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);

        if (response.DashboardSummaryList) {
          const dashboardPromises = response.DashboardSummaryList.map(async (summary) => {
            if (!summary.DashboardId) return null;
            
            const [details, permissions, metadata] = await Promise.all([
              this.getDashboardDetails(summary.DashboardId),
              this.getDashboardPermissions(summary.DashboardId),
              this.metadataService.getMetadata(summary.DashboardId),
            ]);

            const dashboardInfo: DashboardInfo = {
              dashboardId: summary.DashboardId,
              dashboardArn: summary.Arn || '',
              name: summary.Name || 'Unnamed Dashboard',
              createdTime: summary.CreatedTime,
              lastUpdatedTime: summary.LastUpdatedTime,
              publishedVersionNumber: summary.PublishedVersionNumber,
              permissions,
              metadata,
            };
            return dashboardInfo;
          });

          const results = await Promise.all(dashboardPromises);
          dashboards.push(...results.filter((d): d is DashboardInfo => d !== null));
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error listing dashboards:', error);
        throw error;
      }
    } while (nextToken);

    return dashboards;
  }

  async getDashboard(dashboardId: string): Promise<DashboardInfo | null> {
    try {
      const [details, permissions, metadata] = await Promise.all([
        this.getDashboardDetails(dashboardId),
        this.getDashboardPermissions(dashboardId),
        this.metadataService.getMetadata(dashboardId),
      ]);

      if (!details) return null;

      return {
        dashboardId,
        dashboardArn: details.Arn || '',
        name: details.Name || 'Unnamed Dashboard',
        createdTime: details.CreatedTime,
        lastUpdatedTime: details.LastUpdatedTime,
        publishedVersionNumber: details.Version?.VersionNumber,
        permissions,
        metadata,
      };
    } catch (error) {
      logger.error(`Error getting dashboard ${dashboardId}:`, error);
      return null;
    }
  }

  private async getDashboardDetails(dashboardId: string): Promise<Dashboard | null> {
    try {
      const command = new DescribeDashboardCommand({
        AwsAccountId: this.awsAccountId,
        DashboardId: dashboardId,
      });

      const response = await this.client.send(command);
      return response.Dashboard || null;
    } catch (error) {
      logger.error(`Error getting dashboard details for ${dashboardId}:`, error);
      return null;
    }
  }

  private async getDashboardPermissions(dashboardId: string): Promise<DashboardPermission[]> {
    try {
      const command = new DescribeDashboardPermissionsCommand({
        AwsAccountId: this.awsAccountId,
        DashboardId: dashboardId,
      });

      const response = await this.client.send(command);
      const permissions: DashboardPermission[] = [];

      if (response.Permissions) {
        for (const permission of response.Permissions) {
          if (permission.Principal && permission.Actions) {
            let permissionLevel: 'OWNER' | 'AUTHOR' | 'READER' = 'READER';
            
            if (permission.Actions.some(action => action.includes('Delete'))) {
              permissionLevel = 'OWNER';
            } else if (permission.Actions.some(action => action.includes('Update'))) {
              permissionLevel = 'AUTHOR';
            }

            const principalType = permission.Principal.includes(':user/') ? 'USER' : 
                                permission.Principal.includes(':group/') ? 'GROUP' : 'ROLE';

            permissions.push({
              principal: permission.Principal,
              principalType,
              permission: permissionLevel,
            });
          }
        }
      }

      return permissions;
    } catch (error) {
      logger.error(`Error getting permissions for dashboard ${dashboardId}:`, error);
      return [];
    }
  }
}