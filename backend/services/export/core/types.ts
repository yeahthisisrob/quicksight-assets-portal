export type AssetType = 'dashboards' | 'datasets' | 'analyses' | 'datasources';

export interface AssetError {
  assetId: string;
  assetName?: string;
  error: string;
  timestamp: string;
}

export interface AssetStats {
  total: number;
  updated: number;
  cached: number;
  errors: number;
  errorDetails?: AssetError[];
}

export interface AssetExportResult {
  dashboards: AssetStats;
  datasets: AssetStats & { errorDetails?: AssetError[] };
  analyses: AssetStats & { errorDetails?: AssetError[] };
  datasources: AssetStats & { errorDetails?: AssetError[] };
  exportTime: string;
  duration: number;
}

export interface ExportProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
  assetType?: AssetType;
  startTime?: string;
  duration?: number;
  errors?: any[]; // Changed to support both string[] and detailed error objects
  stats?: {
    updated: number;
    cached: number;
    errors: number;
  };
}

export interface ExportSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  lastUpdated?: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: Record<string, ExportProgress>;
  summary?: AssetExportResult;
}

export interface CachedAssetMetadata {
  lastExportTime: string;
  lastModifiedTime?: Date;
  assetType: AssetType;
  assetId: string;
  assetArn: string;
  name: string;
  definition?: any;
  permissions?: any;
  tags?: Record<string, string>;
  fileSize?: number;
}

export interface AssetSummary {
  [key: string]: any; // Flexible for different QuickSight summary types
  DashboardId?: string;
  DataSetId?: string;
  AnalysisId?: string;
  DataSourceId?: string;
  Name?: string;
  Arn?: string;
  LastUpdatedTime?: Date;
  CreatedTime?: Date;
  ImportMode?: string;
}

export interface ProcessingContext {
  forceRefresh: boolean;
  sessionId?: string;
  batchSize?: number;
  delayMs?: number;
}