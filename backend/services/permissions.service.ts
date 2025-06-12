import {
  QuickSightClient,
  DescribeDashboardPermissionsCommand,
  DescribeAnalysisPermissionsCommand,
  DescribeDataSetPermissionsCommand,
  DescribeDataSourcePermissionsCommand,
} from '@aws-sdk/client-quicksight';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';

export interface AssetPermission {
  principal: string;
  principalType: 'USER' | 'GROUP';
  actions: string[];
}

export class PermissionsService {
  private client: QuickSightClient;
  private awsAccountId: string;

  constructor() {
    this.client = new QuickSightClient(getAwsConfig());
    this.awsAccountId = process.env.AWS_ACCOUNT_ID || '';
  }

  /**
   * Get permissions for a dashboard
   */
  async getDashboardPermissions(dashboardId: string): Promise<AssetPermission[]> {
    try {
      const command = new DescribeDashboardPermissionsCommand({
        AwsAccountId: this.awsAccountId,
        DashboardId: dashboardId,
      });

      const response = await this.client.send(command);
      return this.transformPermissions(response.Permissions || []);
    } catch (error) {
      logger.error(`Error fetching dashboard permissions for ${dashboardId}:`, error);
      return [];
    }
  }

  /**
   * Get permissions for an analysis
   */
  async getAnalysisPermissions(analysisId: string): Promise<AssetPermission[]> {
    try {
      const command = new DescribeAnalysisPermissionsCommand({
        AwsAccountId: this.awsAccountId,
        AnalysisId: analysisId,
      });

      const response = await this.client.send(command);
      return this.transformPermissions(response.Permissions || []);
    } catch (error) {
      logger.error(`Error fetching analysis permissions for ${analysisId}:`, error);
      return [];
    }
  }

  /**
   * Get permissions for a dataset
   */
  async getDataSetPermissions(dataSetId: string): Promise<AssetPermission[]> {
    try {
      const command = new DescribeDataSetPermissionsCommand({
        AwsAccountId: this.awsAccountId,
        DataSetId: dataSetId,
      });

      const response = await this.client.send(command);
      return this.transformPermissions(response.Permissions || []);
    } catch (error) {
      logger.error(`Error fetching dataset permissions for ${dataSetId}:`, error);
      return [];
    }
  }

  /**
   * Get permissions for a data source
   */
  async getDataSourcePermissions(dataSourceId: string): Promise<AssetPermission[]> {
    try {
      const command = new DescribeDataSourcePermissionsCommand({
        AwsAccountId: this.awsAccountId,
        DataSourceId: dataSourceId,
      });

      const response = await this.client.send(command);
      return this.transformPermissions(response.Permissions || []);
    } catch (error) {
      logger.error(`Error fetching datasource permissions for ${dataSourceId}:`, error);
      return [];
    }
  }

  /**
   * Transform QuickSight permissions to our format
   */
  private transformPermissions(permissions: any[]): AssetPermission[] {
    return permissions.map(permission => ({
      principal: permission.Principal,
      principalType: this.determinePrincipalType(permission.Principal),
      actions: permission.Actions || [],
    }));
  }

  /**
   * Determine if a principal is a user or group
   */
  private determinePrincipalType(principal: string): 'USER' | 'GROUP' {
    // QuickSight principals have the format:
    // Users: arn:aws:quicksight:region:account-id:user/namespace/username
    // Groups: arn:aws:quicksight:region:account-id:group/namespace/groupname
    if (principal.includes(':group/')) {
      return 'GROUP';
    }
    return 'USER';
  }
}