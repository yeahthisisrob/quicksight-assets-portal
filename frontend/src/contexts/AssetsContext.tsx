import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from '@/services/api';

interface AssetData {
  id: string;
  name: string;
  type: string;
  lastExported: string;
  fileSize: number;
  permissions?: any[];
  tags?: any[];
  metadata?: any;
  [key: string]: any;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
}

interface AssetsContextType {
  // Cached data
  exportSummary: any;
  exportSummaryLoading: boolean;
  
  // Asset data by type
  dashboards: AssetData[];
  dashboardsLoading: boolean;
  dashboardsPagination: PaginationInfo | null;
  
  datasets: AssetData[];
  datasetsLoading: boolean;
  datasetsPagination: PaginationInfo | null;
  
  analyses: AssetData[];
  analysesLoading: boolean;
  analysesPagination: PaginationInfo | null;
  
  datasources: AssetData[];
  datasourcesLoading: boolean;
  datasourcesPagination: PaginationInfo | null;
  
  // Methods
  fetchDashboards: (page: number, pageSize: number, search?: string) => Promise<void>;
  fetchDatasets: (page: number, pageSize: number, search?: string) => Promise<void>;
  fetchAnalyses: (page: number, pageSize: number, search?: string) => Promise<void>;
  fetchDatasources: (page: number, pageSize: number, search?: string) => Promise<void>;
  refreshExportSummary: () => Promise<void>;
  refreshAssetType: (assetType: 'dashboard' | 'dataset' | 'analysis' | 'datasource') => Promise<void>;
  
  // Tag updates
  updateAssetTags: (assetType: string, assetId: string, tags: any[]) => void;
}

const AssetsContext = createContext<AssetsContextType | undefined>(undefined);

export const useAssets = () => {
  const context = useContext(AssetsContext);
  if (!context) {
    throw new Error('useAssets must be used within an AssetsProvider');
  }
  return context;
};

interface AssetsProviderProps {
  children: ReactNode;
}

export const AssetsProvider: React.FC<AssetsProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();
  
  // State for each asset type
  const [dashboards, setDashboards] = useState<AssetData[]>([]);
  const [dashboardsLoading, setDashboardsLoading] = useState(false);
  const [dashboardsPagination, setDashboardsPagination] = useState<PaginationInfo | null>(null);
  
  const [datasets, setDatasets] = useState<AssetData[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsPagination, setDatasetsPagination] = useState<PaginationInfo | null>(null);
  
  const [analyses, setAnalyses] = useState<AssetData[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(false);
  const [analysesPagination, setAnalysesPagination] = useState<PaginationInfo | null>(null);
  
  const [datasources, setDatasources] = useState<AssetData[]>([]);
  const [datasourcesLoading, setDatasourcesLoading] = useState(false);
  const [datasourcesPagination, setDatasourcesPagination] = useState<PaginationInfo | null>(null);
  
  // Export summary query
  const { data: exportSummary, isLoading: exportSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['export-summary'],
    queryFn: () => assetsApi.getExportSummary(),
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (gcTime replaced cacheTime in v5)
  });
  
  // Fetch dashboards
  const fetchDashboards = useCallback(async (page: number, pageSize: number, search?: string) => {
    setDashboardsLoading(true);
    try {
      const data = await assetsApi.getDashboardsPaginated({ page, pageSize, search });
      setDashboards(data.dashboards || []);
      setDashboardsPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch dashboards:', error);
      setDashboards([]);
    } finally {
      setDashboardsLoading(false);
    }
  }, []);
  
  // Fetch datasets
  const fetchDatasets = useCallback(async (page: number, pageSize: number, search?: string) => {
    setDatasetsLoading(true);
    try {
      const data = await assetsApi.getDatasetsPaginated({ page, pageSize, search });
      setDatasets(data.datasets || []);
      setDatasetsPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch datasets:', error);
      setDatasets([]);
    } finally {
      setDatasetsLoading(false);
    }
  }, []);
  
  // Fetch analyses
  const fetchAnalyses = useCallback(async (page: number, pageSize: number, search?: string) => {
    setAnalysesLoading(true);
    try {
      const data = await assetsApi.getAnalysesPaginated({ page, pageSize, search });
      setAnalyses(data.analyses || []);
      setAnalysesPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch analyses:', error);
      setAnalyses([]);
    } finally {
      setAnalysesLoading(false);
    }
  }, []);
  
  // Fetch datasources
  const fetchDatasources = useCallback(async (page: number, pageSize: number, search?: string) => {
    setDatasourcesLoading(true);
    try {
      const data = await assetsApi.getDatasourcesPaginated({ page, pageSize, search });
      setDatasources(data.datasources || []);
      setDatasourcesPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch datasources:', error);
      setDatasources([]);
    } finally {
      setDatasourcesLoading(false);
    }
  }, []);
  
  // Refresh export summary
  const refreshExportSummary = useCallback(async () => {
    await refetchSummary();
  }, [refetchSummary]);
  
  // Refresh specific asset type
  const refreshAssetType = useCallback(async (assetType: 'dashboard' | 'dataset' | 'analysis' | 'datasource') => {
    // Invalidate relevant queries based on asset type
    switch (assetType) {
      case 'dashboard':
        await queryClient.invalidateQueries({ queryKey: ['dashboards-paginated'] });
        break;
      case 'dataset':
        await queryClient.invalidateQueries({ queryKey: ['datasets-paginated'] });
        break;
      case 'analysis':
        await queryClient.invalidateQueries({ queryKey: ['analyses-paginated'] });
        break;
      case 'datasource':
        await queryClient.invalidateQueries({ queryKey: ['datasources-paginated'] });
        break;
    }
  }, [queryClient]);
  
  // Update tags for a specific asset (optimistic update)
  const updateAssetTags = useCallback((assetType: string, assetId: string, tags: any[]) => {
    // Optimistically update the local state immediately
    switch (assetType) {
      case 'dashboard':
        setDashboards(prev => prev.map(item => 
          item.id === assetId ? { ...item, tags } : item
        ));
        break;
      case 'dataset':
        setDatasets(prev => prev.map(item => 
          item.id === assetId ? { ...item, tags } : item
        ));
        break;
      case 'analysis':
        setAnalyses(prev => prev.map(item => 
          item.id === assetId ? { ...item, tags } : item
        ));
        break;
      case 'datasource':
        setDatasources(prev => prev.map(item => 
          item.id === assetId ? { ...item, tags } : item
        ));
        break;
    }
  }, []);
  
  const value: AssetsContextType = {
    // Export summary
    exportSummary,
    exportSummaryLoading,
    
    // Dashboards
    dashboards,
    dashboardsLoading,
    dashboardsPagination,
    
    // Datasets
    datasets,
    datasetsLoading,
    datasetsPagination,
    
    // Analyses
    analyses,
    analysesLoading,
    analysesPagination,
    
    // Datasources
    datasources,
    datasourcesLoading,
    datasourcesPagination,
    
    // Methods
    fetchDashboards,
    fetchDatasets,
    fetchAnalyses,
    fetchDatasources,
    refreshExportSummary,
    refreshAssetType,
    updateAssetTags,
  };
  
  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
};