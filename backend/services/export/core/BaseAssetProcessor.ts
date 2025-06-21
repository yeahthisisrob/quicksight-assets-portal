import { QuickSightClient } from '@aws-sdk/client-quicksight';
import { MetadataService } from '../../metadata.service';
import { PermissionsService } from '../../permissions.service';
import { TagService } from '../../tag.service';
import { AssetParserService } from '../../assetParser.service';
import { indexingService } from '../../indexing.service';
import { logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/awsRetry';
import pLimit from 'p-limit';

import { IAssetProcessor, IProgressTracker } from './interfaces';
import { 
  AssetType, 
  AssetStats, 
  AssetSummary, 
  ProcessingContext, 
} from './types';

export abstract class BaseAssetProcessor implements IAssetProcessor {
  protected client: QuickSightClient;
  protected metadataService: MetadataService;
  protected permissionsService: PermissionsService;
  protected tagService: TagService;
  protected assetParserService: AssetParserService;
  protected awsAccountId: string;
  protected progressTracker: IProgressTracker;
  protected concurrencyLimit: ReturnType<typeof pLimit>;

  protected readonly RETRY_OPTIONS = {
    maxRetries: 5, // Increased retries
    baseDelay: 500, // Start with shorter delay
    maxDelay: 5000, // Cap at 5 seconds
  };

  constructor(
    client: QuickSightClient,
    metadataService: MetadataService,
    permissionsService: PermissionsService,
    tagService: TagService,
    assetParserService: AssetParserService,
    awsAccountId: string,
    progressTracker: IProgressTracker,
    maxConcurrency: number = 3,
  ) {
    this.client = client;
    this.metadataService = metadataService;
    this.permissionsService = permissionsService;
    this.tagService = tagService;
    this.assetParserService = assetParserService;
    this.awsAccountId = awsAccountId;
    this.progressTracker = progressTracker;
    this.concurrencyLimit = pLimit(maxConcurrency);
  }

  abstract readonly assetType: AssetType;
  abstract getServicePath(): string;
  abstract processAsset(summary: AssetSummary, context: ProcessingContext): Promise<void>;

  async processBatch(summaries: AssetSummary[], context: ProcessingContext): Promise<AssetStats> {
    const stats: AssetStats = {
      total: summaries.length,
      updated: 0,
      cached: 0,
      errors: 0,
      errorDetails: [],
    };

    this.progressTracker.updateProgress(this.assetType, {
      status: 'running',
      total: stats.total,
      current: 0,
      message: `Processing ${stats.total} ${this.assetType}...`,
    });

    // Get cached assets if not forcing refresh
    let itemsToProcess = summaries;
    if (!context.forceRefresh) {
      this.progressTracker.updateProgress(this.assetType, {
        message: `Checking cache for ${stats.total} ${this.assetType}...`,
      });
      
      const cachedIds = await this.getCachedAssets(summaries);
      stats.cached = cachedIds.size;
      itemsToProcess = summaries.filter(summary => {
        const id = this.getAssetId(summary);
        return id && !cachedIds.has(id);
      });

      logger.info(`Skipping ${cachedIds.size} already cached ${this.assetType}, processing ${itemsToProcess.length} items`);
      
      this.progressTracker.updateProgress(this.assetType, {
        current: stats.cached,
        message: `Processing ${itemsToProcess.length} ${this.assetType} (${stats.cached} already cached)...`,
      });
    } else {
      // Force refresh means we process everything, nothing is cached
      logger.info(`Force refresh enabled, processing all ${summaries.length} ${this.assetType}`);
    }

    // Process items with rate limiting
    await this.processWithRateLimit(
      itemsToProcess,
      async (summary, index) => {
        try {
          const assetId = this.getAssetId(summary);
          if (!assetId) return;

          this.progressTracker.updateProgress(this.assetType, {
            current: index + stats.cached + 1,
            message: `Processing ${this.assetType}: ${summary.Name || assetId}`,
          });

          await this.processAsset(summary, context);
          stats.updated++;
          logger.debug(`Successfully processed ${this.assetType} ${assetId}`);
          
          // Update the index immediately after successful processing
          // The asset data has been saved to S3, so we can update the index
          try {
            await indexingService.updateAssetInIndex(
              this.assetType,
              assetId,
              await this.metadataService.getMetadata(`assets/${this.assetType}/${assetId}.json`),
            );
            logger.debug(`Updated index for ${this.assetType} ${assetId}`);
          } catch (indexError) {
            // Don't fail the whole process if index update fails
            logger.warn(`Failed to update index for ${this.assetType} ${assetId}:`, indexError);
          }
        } catch (error) {
          const assetId = this.getAssetId(summary);
          logger.error(`Error processing ${this.assetType} ${assetId}:`, error);
          stats.errors++;
          stats.errorDetails?.push({
            assetId: assetId || 'unknown',
            assetName: summary.Name || `Unknown ${this.assetType}`,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        }
      },
      context.batchSize || 100, // Default to larger batches
      context.delayMs || 50, // Default to shorter delays
    );

    // Mark this asset type as completed with full stats
    this.progressTracker.updateProgress(this.assetType, {
      status: 'completed',
      current: stats.total,
      message: `Completed processing ${stats.total} ${this.assetType}`,
      // Store the stats for summary building
      stats: {
        updated: stats.updated,
        cached: stats.cached,
        errors: stats.errors,
      },
    });

    // Force save session state after completion
    if (typeof (this.progressTracker as any).saveSessionState === 'function') {
      await (this.progressTracker as any).saveSessionState();
    }

    return stats;
  }

  async getCachedAssets(summaries: AssetSummary[]): Promise<Set<string>> {
    const cachedIds = new Set<string>();
    
    try {
      const startTime = Date.now();
      const cachedObjects = await this.metadataService.listObjects(`assets/${this.getServicePath()}/`);
      const listTime = Date.now() - startTime;
      logger.info(`S3 listObjects for ${this.assetType} took ${listTime}ms`);
      
      const cachedFileMap = new Map<string, any>();
      
      for (const obj of cachedObjects) {
        if (obj.key.endsWith('.json')) {
          const assetId = obj.key.split('/').pop()?.replace('.json', '');
          if (assetId) {
            cachedFileMap.set(assetId, {
              lastModified: obj.lastModified,
              key: obj.key,
            });
          }
        }
      }
      
      logger.info(`Found ${cachedFileMap.size} cached ${this.assetType} files`);
      
      for (const summary of summaries) {
        const assetId = this.getAssetId(summary);
        if (!assetId) continue;
        
        const cachedFile = cachedFileMap.get(assetId);
        if (cachedFile) {
          const cacheAge = Date.now() - cachedFile.lastModified.getTime();
          const isStale = cacheAge > 60 * 60 * 1000; // 1 hour
          
          if (!isStale && 
              (!summary.LastUpdatedTime || 
               new Date(summary.LastUpdatedTime) <= cachedFile.lastModified)) {
            cachedIds.add(assetId);
          }
        }
      }
    } catch (error) {
      logger.warn(`Error checking cached ${this.assetType}s, will process all:`, error);
    }
    
    return cachedIds;
  }

  protected async processWithRateLimit<T>(
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    batchSize: number = 100, // Increased batch size
    delayMs: number = 50, // Reduced delay
  ): Promise<void> {
    // Process items with higher concurrency - AWS allows 200 req/sec for Describe* APIs
    const maxConcurrent = 20; // Increased concurrency within batches
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch items with limited concurrency
      for (let j = 0; j < batch.length; j += maxConcurrent) {
        const concurrentItems = batch.slice(j, j + maxConcurrent);
        
        await Promise.all(
          concurrentItems.map((item, concurrentIndex) => 
            this.concurrencyLimit(async () => {
              const itemIndex = i + j + concurrentIndex;
              // Minimal stagger to avoid thundering herd
              const delay = concurrentIndex * 10; // 10ms stagger
              if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              await processor(item, itemIndex);
            }),
          ),
        );
        
        // Minimal delay between concurrent groups
        if (j + maxConcurrent < batch.length) {
          await new Promise(resolve => setTimeout(resolve, 20)); // 20ms between groups
        }
      }
      
      const processed = Math.min(i + batchSize, items.length);
      logger.debug(`Processed batch: ${processed}/${items.length} ${this.assetType}s`);
      
      // Minimal delay between batches to respect rate limits
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms between batches
      }
    }
  }

  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    return withRetry(operation, context, this.RETRY_OPTIONS);
  }

  protected getAssetId(summary: AssetSummary): string | undefined {
    return summary.DashboardId || summary.DataSetId || summary.AnalysisId || summary.DataSourceId;
  }

  protected getCacheKey(assetId: string): string {
    return `assets/${this.getServicePath()}/${assetId}.json`;
  }

  protected async shouldUpdate(cacheKey: string, summary: AssetSummary, context: ProcessingContext): Promise<boolean> {
    if (context.forceRefresh) {
      return true;
    }

    try {
      const existingData = await this.metadataService.getMetadata(cacheKey);
      const existingMetadata = existingData?.['@metadata'];
      
      if (!existingMetadata?.exportTime) {
        return true;
      }

      // Check if cache is stale (older than 1 hour)
      const cacheAge = Date.now() - new Date(existingMetadata.exportTime).getTime();
      if (cacheAge > 60 * 60 * 1000) {
        return true;
      }

      // Check if asset was updated after last export
      if (summary.LastUpdatedTime && existingMetadata.lastModifiedTime) {
        return new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime);
      }

      return false;
    } catch {
      // If we can't read the cache, we need to update
      return true;
    }
  }

  protected async fetchPermissionsAndTags(assetId: string) {
    return Promise.all([
      this.getPermissions(assetId).catch(err => {
        logger.warn(`Failed to get permissions for ${this.assetType} ${assetId}: ${err.message}`);
        return [];
      }),
      this.getTags(assetId).catch(err => {
        logger.warn(`Failed to get tags for ${this.assetType} ${assetId}: ${err.message}`);
        return [];
      }),
    ]);
  }

  protected abstract getPermissions(assetId: string): Promise<any[]>;
  protected abstract getTags(assetId: string): Promise<any[]>;

  protected async executeAllPromises<T extends Record<string, Promise<any>>>(
    promises: T
  ): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    const keys = Object.keys(promises) as (keyof T)[];
    const values = await Promise.all(keys.map(key => promises[key]));
    
    const result = {} as { [K in keyof T]: Awaited<T[K]> };
    keys.forEach((key, index) => {
      result[key] = values[index];
    });
    
    return result;
  }
}