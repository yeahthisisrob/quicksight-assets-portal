import axios from 'axios';
import { ApiResponse, DashboardInfo, DashboardMetadata, TagInput } from '@/types';
import { config } from '@/config';

// Create axios instance
const apiClient = axios.create({
  baseURL: config.API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies in requests
});

// Add request interceptor to include auth token
apiClient.interceptors.request.use(
  (config) => {
    // Try to get token from localStorage first (set by AuthCallbackPage)
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth token and redirect to login
      localStorage.removeItem('authToken');
      // Only redirect if we're not already on the login page
      if (!window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/auth')) {
        window.location.href = '/login?error=session_expired';
      }
    }
    return Promise.reject(error);
  }
);

// API methods
export const dashboardsApi = {
  // List all dashboards
  async list(includeMetrics = true): Promise<DashboardInfo[]> {
    const response = await apiClient.get<ApiResponse<DashboardInfo[]>>('/dashboards', {
      params: { includeMetrics },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch dashboards');
    }
    return response.data.data || [];
  },

  // Get single dashboard
  async get(dashboardId: string): Promise<DashboardInfo> {
    const response = await apiClient.get<ApiResponse<DashboardInfo>>(`/dashboards/${dashboardId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch dashboard');
    }
    return response.data.data!;
  },

  // Get dashboard metadata
  async getMetadata(dashboardId: string): Promise<DashboardMetadata> {
    const response = await apiClient.get<ApiResponse<DashboardMetadata>>(`/metadata/${dashboardId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch metadata');
    }
    return response.data.data || {};
  },

  // Update dashboard metadata
  async updateMetadata(dashboardId: string, metadata: DashboardMetadata): Promise<DashboardMetadata> {
    const response = await apiClient.post<ApiResponse<DashboardMetadata>>(
      `/metadata/${dashboardId}`,
      metadata
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update metadata');
    }
    return response.data.data!;
  },

  // Get dashboard tags
  async getTags(dashboardId: string): Promise<Array<{ key: string; value: string }>> {
    const response = await apiClient.get<ApiResponse<Array<{ key: string; value: string }>>>(
      `/tags/${dashboardId}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch tags');
    }
    return response.data.data || [];
  },

  // Update dashboard tags
  async updateTags(dashboardId: string, tags: TagInput): Promise<Array<{ key: string; value: string }>> {
    const response = await apiClient.post<ApiResponse<Array<{ key: string; value: string }>>>(
      `/tags/${dashboardId}`,
      tags
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update tags');
    }
    return response.data.data!;
  },
};

// Asset Export API
export const assetsApi = {
  // Get export summary
  async getExportSummary(): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/export-summary');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch export summary');
    }
    return response.data.data;
  },

  // Export all assets
  async exportAll(forceRefresh = false): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>('/assets/export', { forceRefresh });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to export assets');
    }
    return response.data.data;
  },

  // Start export session
  async startExportSession(): Promise<{ sessionId: string }> {
    const response = await apiClient.post<ApiResponse<{ sessionId: string }>>('/assets/export/start');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to start export session');
    }
    return response.data.data!;
  },

  // Get export session status
  async getExportSession(sessionId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/assets/export/session/${sessionId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get export session');
    }
    return response.data.data;
  },

  // Get recent export sessions
  async getRecentSessions(): Promise<any[]> {
    const response = await apiClient.get<ApiResponse<any[]>>('/assets/export/sessions/recent');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get recent sessions');
    }
    return response.data.data || [];
  },

  // Export specific asset type
  async exportAssetType(assetType: string, forceRefresh = false): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>(`/assets/export/${assetType}`, { forceRefresh });
    if (!response.data.success) {
      throw new Error(response.data.error || `Failed to export ${assetType}`);
    }
    return response.data.data;
  },

  // Complete export session
  async completeExportSession(summary: any): Promise<void> {
    const response = await apiClient.post<ApiResponse<void>>('/assets/export/complete', { summary });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to complete export session');
    }
  },

  // Cancel export session
  async cancelExportSession(): Promise<void> {
    const response = await apiClient.post<ApiResponse<void>>('/assets/export/cancel');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to cancel export session');
    }
  },

  // Rebuild index and catalog from existing exported data
  async rebuildIndex(): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>('/assets/rebuild-index');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to rebuild index');
    }
    return response.data.data;
  },

  // Get all cached assets with pagination
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    assetType?: string;
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/all', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch assets');
    }
    return response.data.data;
  },

  // Get paginated datasets with full info
  async getDatasetsPaginated(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/datasets/paginated', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch datasets');
    }
    return response.data.data;
  },

  // Get paginated dashboards with full info
  async getDashboardsPaginated(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/dashboards/paginated', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch dashboards');
    }
    return response.data.data;
  },

  // Get paginated analyses with full info
  async getAnalysesPaginated(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/analyses/paginated', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch analyses');
    }
    return response.data.data;
  },

  // Get paginated datasources with full info
  async getDatasourcesPaginated(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/assets/datasources/paginated', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch datasources');
    }
    return response.data.data;
  },

  // Get specific asset
  async getAsset(assetType: string, assetId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/assets/${assetType}/${assetId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch asset');
    }
    return response.data.data;
  },

  // Refresh tags for multiple assets
  async refreshAssetTags(assetType: string, assetIds: string[]): Promise<{
    successful: number;
    failed: number;
    total: number;
  }> {
    const response = await apiClient.post<ApiResponse<any>>('/assets/refresh-tags', {
      assetType,
      assetIds,
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to refresh tags');
    }
    return response.data.data;
  },

  // Parse asset to extract fields and calculated fields
  async parseAsset(assetType: string, assetId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/assets/${assetType}/${assetId}/parse`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to parse asset');
    }
    return response.data.data;
  },

  // Get live tags for multiple assets
  async getBatchTags(assets: Array<{ type: string; id: string }>): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>('/assets/tags/batch', { assets });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch batch tags');
    }
    return response.data.data;
  },
};

// Data Catalog API
export const dataCatalogApi = {
  // Get full catalog (no pagination)
  async getCatalog(): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/data-catalog/full');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch data catalog');
    }
    return response.data.data;
  },

  // Get data catalog with pagination
  async getDataCatalog(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    viewMode?: 'all' | 'fields' | 'calculated';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/data-catalog', { params });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch data catalog');
    }
    return response.data.data;
  },

  // Force rebuild catalog
  async rebuildCatalog(): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>('/data-catalog/rebuild');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to rebuild data catalog');
    }
    return response.data.data;
  },
};

// Lineage API
export const lineageApi = {
  // Get all asset lineage
  async getAllLineage(): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>('/lineage/all');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch lineage');
    }
    return response.data.data;
  },

  // Get specific asset lineage
  async getAssetLineage(assetId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/lineage/${assetId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch asset lineage');
    }
    return response.data.data;
  },
};

// Tags API - for all resource types
export const tagsApi = {
  // Get resource tags
  async getResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string
  ): Promise<Array<{ key: string; value: string }>> {
    const response = await apiClient.get<ApiResponse<Array<{ key: string; value: string }>>>(
      `/tags/${resourceType}/${resourceId}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch tags');
    }
    return response.data.data || [];
  },

  // Update resource tags
  async updateResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string,
    tags: Array<{ key: string; value: string }>
  ): Promise<void> {
    const response = await apiClient.post<ApiResponse<any>>(
      `/tags/${resourceType}/${resourceId}`,
      { tags }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update tags');
    }
  },

  // Remove resource tags
  async removeResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string,
    tagKeys: string[]
  ): Promise<void> {
    const response = await apiClient.delete<ApiResponse<any>>(
      `/tags/${resourceType}/${resourceId}`,
      { data: { tagKeys } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove tags');
    }
  },

  // Field metadata operations
  async getFieldMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrUndefined?: string
  ): Promise<any> {
    let url: string;
    if (fieldNameOrUndefined === undefined) {
      // Legacy call: getFieldMetadata(datasetId, fieldName)
      url = `/tags/field/${sourceTypeOrDatasetId}/${encodeURIComponent(sourceIdOrFieldName)}`;
    } else {
      // New call: getFieldMetadata(sourceType, sourceId, fieldName)
      url = `/tags/field/${sourceTypeOrDatasetId}/${sourceIdOrFieldName}/${encodeURIComponent(fieldNameOrUndefined)}`;
    }
    
    const response = await apiClient.get<ApiResponse<any>>(url);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch field metadata');
    }
    return response.data.data;
  },

  async updateFieldMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrMetadata: string | any,
    metadataOrUndefined?: any
  ): Promise<any> {
    let url: string;
    let metadata: any;
    
    if (metadataOrUndefined === undefined) {
      // Legacy call: updateFieldMetadata(datasetId, fieldName, metadata)
      url = `/tags/field/${sourceTypeOrDatasetId}/${encodeURIComponent(sourceIdOrFieldName)}`;
      metadata = fieldNameOrMetadata;
    } else {
      // New call: updateFieldMetadata(sourceType, sourceId, fieldName, metadata)
      url = `/tags/field/${sourceTypeOrDatasetId}/${sourceIdOrFieldName}/${encodeURIComponent(fieldNameOrMetadata as string)}`;
      metadata = metadataOrUndefined;
    }
    
    const response = await apiClient.put<ApiResponse<any>>(url, metadata);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update field metadata');
    }
    return response.data.data;
  },

  async addFieldTags(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrTags: string | Array<{ key: string; value: string }>,
    tagsOrUndefined?: Array<{ key: string; value: string }>
  ): Promise<void> {
    let url: string;
    let tags: Array<{ key: string; value: string }>;
    
    if (Array.isArray(fieldNameOrTags)) {
      // Legacy call: addFieldTags(datasetId, fieldName, tags)
      url = `/tags/field/${sourceTypeOrDatasetId}/${encodeURIComponent(sourceIdOrFieldName)}/tags`;
      tags = fieldNameOrTags;
    } else {
      // New call: addFieldTags(sourceType, sourceId, fieldName, tags)
      url = `/tags/field/${sourceTypeOrDatasetId}/${sourceIdOrFieldName}/${encodeURIComponent(fieldNameOrTags)}/tags`;
      tags = tagsOrUndefined!;
    }
    
    const response = await apiClient.post<ApiResponse<any>>(url, { tags });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add field tags');
    }
  },

  async removeFieldTags(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrTagKeys: string | string[],
    tagKeysOrUndefined?: string[]
  ): Promise<void> {
    let url: string;
    let tagKeys: string[];
    
    if (Array.isArray(fieldNameOrTagKeys)) {
      // Legacy call: removeFieldTags(datasetId, fieldName, tagKeys)
      url = `/tags/field/${sourceTypeOrDatasetId}/${encodeURIComponent(sourceIdOrFieldName)}/tags`;
      tagKeys = fieldNameOrTagKeys;
    } else {
      // New call: removeFieldTags(sourceType, sourceId, fieldName, tagKeys)
      url = `/tags/field/${sourceTypeOrDatasetId}/${sourceIdOrFieldName}/${encodeURIComponent(fieldNameOrTagKeys)}/tags`;
      tagKeys = tagKeysOrUndefined!;
    }
    
    const response = await apiClient.delete<ApiResponse<any>>(url, { data: { tagKeys } });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove field tags');
    }
  },

  async getAllFieldsMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrUndefined?: string
  ): Promise<any[]> {
    let url: string;
    
    if (sourceIdOrUndefined === undefined) {
      // Legacy call: getAllFieldsMetadata(datasetId)
      url = `/tags/field/dataset/${sourceTypeOrDatasetId}/all`;
    } else {
      // New call: getAllFieldsMetadata(sourceType, sourceId)
      url = `/tags/field/${sourceTypeOrDatasetId}/${sourceIdOrUndefined}/all`;
    }
    
    const response = await apiClient.get<ApiResponse<any[]>>(url);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch fields metadata');
    }
    return response.data.data || [];
  },

  async searchFieldsByTags(tags: Array<{ key: string; value?: string }>): Promise<any[]> {
    const response = await apiClient.post<ApiResponse<any[]>>(
      '/tags/field/search',
      { tags }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to search fields');
    }
    return response.data.data || [];
  },
};

// Folders API
export const foldersApi = {
  // List all folders
  async list(): Promise<any[]> {
    const response = await apiClient.get<ApiResponse<any[]>>('/folders');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch folders');
    }
    return response.data.data || [];
  },

  // Get single folder
  async get(folderId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/folders/${folderId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch folder');
    }
    return response.data.data!;
  },

  // Get folder metadata
  async getMetadata(folderId: string): Promise<any> {
    const response = await apiClient.get<ApiResponse<any>>(`/folders/${folderId}/metadata`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch metadata');
    }
    return response.data.data || {};
  },

  // Update folder metadata
  async updateMetadata(folderId: string, metadata: any): Promise<any> {
    const response = await apiClient.post<ApiResponse<any>>(
      `/folders/${folderId}/metadata`,
      metadata
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update metadata');
    }
    return response.data.data!;
  },

  // Get folder tags
  async getTags(folderId: string): Promise<Array<{ key: string; value: string }>> {
    const response = await apiClient.get<ApiResponse<Array<{ key: string; value: string }>>>(
      `/folders/${folderId}/tags`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch tags');
    }
    return response.data.data || [];
  },

  // Update folder tags
  async updateTags(folderId: string, tags: Array<{ key: string; value: string }>): Promise<void> {
    const response = await apiClient.post<ApiResponse<any>>(
      `/folders/${folderId}/tags`,
      { tags }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update tags');
    }
  },

  // Remove folder tags
  async removeTags(folderId: string, tagKeys: string[]): Promise<void> {
    const response = await apiClient.delete<ApiResponse<any>>(
      `/folders/${folderId}/tags`,
      { data: { tagKeys } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove tags');
    }
  },

  // Add member to folder
  async addMember(folderId: string, member: { MemberType: string; MemberId: string }): Promise<void> {
    const response = await apiClient.post<ApiResponse<any>>(
      `/folders/${folderId}/members`,
      member
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add member');
    }
  },

  // Get folder members
  async getMembers(folderId: string): Promise<any[]> {
    const response = await apiClient.get<ApiResponse<any[]>>(
      `/folders/${folderId}/members`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get folder members');
    }
    return response.data.data || [];
  },

  // Remove member from folder
  async removeMember(folderId: string, memberId: string, memberType: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<any>>(
      `/folders/${folderId}/members/${memberId}`,
      { params: { memberType } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove member');
    }
  },
};

// Settings API
export const settingsApi = {
  getAll: () => apiClient.get<Record<string, any>>('/settings').then(res => res.data),
  get: (key: string) => apiClient.get<any>(`/settings/${key}`).then(res => res.data),
  update: (key: string, value: any) => apiClient.put(`/settings/${key}`, { value }).then(res => res.data),
  delete: (key: string) => apiClient.delete(`/settings/${key}`).then(res => res.data),
  getAwsIdentity: () => apiClient.get<ApiResponse<any>>('/settings/aws-identity').then(res => res.data),
};

// Semantic Layer API
export const semanticApi = {
  // Terms
  getTerms: (params?: { search?: string; category?: string }) => 
    apiClient.get('/semantic/terms', { params }).then(res => res.data),
  getTerm: (termId: string) => 
    apiClient.get(`/semantic/terms/${termId}`).then(res => res.data),
  createTerm: (term: any) => 
    apiClient.post('/semantic/terms', term).then(res => res.data),
  updateTerm: (termId: string, updates: any) => 
    apiClient.put(`/semantic/terms/${termId}`, updates).then(res => res.data),
  deleteTerm: (termId: string) => 
    apiClient.delete(`/semantic/terms/${termId}`).then(res => res.data),
    
  // Categories
  getCategories: () => 
    apiClient.get('/semantic/categories').then(res => res.data),
  createCategory: (category: any) => 
    apiClient.post('/semantic/categories', category).then(res => res.data),
    
  // Mappings
  getMappings: (params?: { fieldId?: string; status?: string; type?: string }) => 
    apiClient.get('/semantic/mappings', { params }).then(res => res.data),
  getFieldMapping: (fieldId: string) => 
    apiClient.get(`/semantic/mappings/field/${fieldId}`).then(res => res.data),
  createMapping: (mapping: any) => 
    apiClient.post('/semantic/mappings', mapping).then(res => res.data),
  approveMapping: (mappingId: string) => 
    apiClient.post(`/semantic/mappings/${mappingId}/approve`).then(res => res.data),
  rejectMapping: (mappingId: string, reason?: string) => 
    apiClient.post(`/semantic/mappings/${mappingId}/reject`, { reason }).then(res => res.data),
  suggestMappings: (field: any) => 
    apiClient.post('/semantic/mappings/suggest', field).then(res => res.data),
  autoMap: (minConfidence?: number) => 
    apiClient.post('/semantic/mappings/auto-map', { minConfidence }).then(res => res.data),
    
  // Unmapped fields
  getUnmappedFields: () => 
    apiClient.get('/semantic/unmapped').then(res => res.data),
    
  // Stats
  getStats: () => 
    apiClient.get('/semantic/stats').then(res => res.data),
    
  // Import/Export
  importTerms: (terms: any[]) => 
    apiClient.post('/semantic/terms/import', { terms }).then(res => res.data),
  exportTerms: () => 
    apiClient.get('/semantic/terms/export').then(res => res.data),
};