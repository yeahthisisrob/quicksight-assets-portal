/**
 * Shared types for permissions across all asset types
 */

export interface Permission {
  principal: string;
  principalType: 'USER' | 'GROUP';
  actions: string[];
}

export interface PermissionsSummary {
  totalUsers: number;
  totalGroups: number;
  permissions: Permission[];
}

export interface AssetWithPermissions {
  id: string;
  name: string;
  type: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder';
  permissions?: Permission[];
}