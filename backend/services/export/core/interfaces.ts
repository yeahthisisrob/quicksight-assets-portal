import { AssetType, AssetStats, ProcessingContext, AssetSummary, ExportProgress } from './types';

export interface IAssetProcessor {
  readonly assetType: AssetType;
  
  /**
   * Get the QuickSight service path for this asset type
   */
  getServicePath(): string;
  
  /**
   * Process a batch of asset summaries
   */
  processBatch(
    summaries: AssetSummary[], 
    context: ProcessingContext
  ): Promise<AssetStats>;
  
  /**
   * Check which assets are already cached and fresh
   */
  getCachedAssets(summaries: AssetSummary[]): Promise<Set<string>>;
  
  /**
   * Process a single asset
   */
  processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void>;
}

export interface IProgressTracker {
  updateProgress(assetType: string, progress: Partial<ExportProgress>): void;
  getCurrentProgress(): Record<string, ExportProgress> | null;
  getCurrentSessionId(): string | null;
}

export interface IExportStrategy {
  execute(context: ProcessingContext): Promise<AssetStats>;
}