export interface DashboardMetadata {
  lastUpdated?: string;
  owner?: string;
  category?: string;
  description?: string;
  tags?: string[];
  businessUnit?: string;
  dataSource?: string;
  refreshSchedule?: string;
  [key: string]: any;
}

export interface DashboardPermission {
  principal: string;
  principalType: 'USER' | 'GROUP' | 'ROLE';
  permission: 'OWNER' | 'AUTHOR' | 'READER';
  grantedAt?: string;
}

export interface DashboardUsageMetrics {
  viewCountLast30Days: number;
  viewCountLast7Days: number;
  viewCountToday: number;
  lastViewed?: string;
  topViewers?: Array<{
    user: string;
    viewCount: number;
  }>;
}

export interface DashboardInfo {
  dashboardId: string;
  dashboardArn: string;
  name: string;
  createdTime?: Date;
  lastUpdatedTime?: Date;
  publishedVersionNumber?: number;
  permissions: DashboardPermission[];
  metadata: DashboardMetadata;
  tags?: Array<{ key: string; value: string }>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TagInput {
  tags: Array<{ key: string; value: string }>;
}

export interface RouteHandler {
  (event: any, context: any): Promise<any>;
}