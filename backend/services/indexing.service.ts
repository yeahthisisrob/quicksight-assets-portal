import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { MetadataService } from './metadata.service';
import { logger } from '../utils/logger';

interface IndexEntry {
  id: string;
  type: 'dashboard' | 'dataset' | 'analysis' | 'datasource';
  name: string;
  lastModified: Date;
  lastExported: string;
  fileSize: number;
  metadata?: Record<string, any>;
  tags?: any[];
  permissions?: any[];
}

interface IndexStats {
  totalAssets: number;
  assetsByType: Record<string, number>;
  totalSize: number;
  lastUpdated: string;
  indexVersion: string;
}

interface IndexUpdateEvent {
  type: 'add' | 'update' | 'delete' | 'rebuild';
  assetType?: string;
  assetId?: string;
  timestamp: string;
}

interface CacheEntry<T> {
  data: T;
  expires: number;
  etag?: string;
}

export class IndexingService extends EventEmitter {
  private static instance: IndexingService;
  private metadataService: MetadataService;
  
  // In-memory caches with TTL
  private indexCache: Map<string, CacheEntry<any>> = new Map();
  private assetCache: Map<string, CacheEntry<any>> = new Map();
  
  // Configuration
  private readonly INDEX_VERSION = '2.0';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly BATCH_SIZE = 100;
  private readonly CONCURRENCY = 5;
  
  // Index paths
  private readonly MASTER_INDEX_PATH = 'assets/index/master-index.json';
  private readonly TYPE_INDEX_PREFIX = 'assets/index/by-type/';
  private readonly FIELD_INDEX_PATH = 'assets/index/field-index.json';
  
  private constructor() {
    super();
    this.metadataService = new MetadataService();
    
    // Start periodic cache cleanup
    setInterval(() => this.cleanupExpiredCache(), 60 * 1000); // Every minute
  }

  static getInstance(): IndexingService {
    if (!IndexingService.instance) {
      IndexingService.instance = new IndexingService();
    }
    return IndexingService.instance;
  }

  /**
   * Get or build the master index
   */
  async getMasterIndex(): Promise<{
    assetsByType: Record<string, IndexEntry[]>;
    summary: IndexStats;
  }> {
    // Check memory cache first
    const cached = this.getCached<any>('master-index');
    if (cached) {
      return cached;
    }

    try {
      // Try to load from S3
      const index = await this.metadataService.getMetadata(this.MASTER_INDEX_PATH);
      if (index && index.indexVersion === this.INDEX_VERSION) {
        this.setCached('master-index', index);
        return index;
      }
    } catch (error) {
      logger.info('Master index not found or outdated, returning empty index');
    }

    // Return empty index structure instead of rebuilding
    // The index will be built incrementally as assets are processed
    const emptyIndex = {
      assetsByType: {
        dashboards: [],
        datasets: [],
        analyses: [],
        datasources: [],
      },
      summary: {
        totalAssets: 0,
        assetsByType: {
          dashboards: 0,
          datasets: 0,
          analyses: 0,
          datasources: 0,
        },
        totalSize: 0,
        lastUpdated: new Date().toISOString(),
        indexVersion: this.INDEX_VERSION,
      },
      indexVersion: this.INDEX_VERSION,
    };
    
    // Cache the empty index
    this.setCached('master-index', emptyIndex);
    
    // Save it to S3 so we have a starting point
    await this.metadataService.saveMetadata(this.MASTER_INDEX_PATH, emptyIndex);
    
    return emptyIndex;
  }

  /**
   * Rebuild the entire master index
   */
  async rebuildMasterIndex(): Promise<{
    assetsByType: Record<string, IndexEntry[]>;
    summary: IndexStats;
  }> {
    logger.info('Starting full index rebuild');
    const startTime = Date.now();

    const assetTypes = ['dashboards', 'datasets', 'analyses', 'datasources'];
    const assetsByType: Record<string, IndexEntry[]> = {};
    let totalSize = 0;
    let totalAssets = 0;

    // Process each asset type in parallel
    await Promise.all(
      assetTypes.map(async (type) => {
        const entries = await this.buildTypeIndex(type);
        assetsByType[type] = entries;
        totalAssets += entries.length;
        totalSize += entries.reduce((sum, entry) => sum + (entry.fileSize || 0), 0);
        
        // Save type-specific index
        await this.saveTypeIndex(type, entries);
      }),
    );

    const summary: IndexStats = {
      totalAssets,
      assetsByType: {
        dashboards: assetsByType.dashboards?.length || 0,
        datasets: assetsByType.datasets?.length || 0,
        analyses: assetsByType.analyses?.length || 0,
        datasources: assetsByType.datasources?.length || 0,
      },
      totalSize,
      lastUpdated: new Date().toISOString(),
      indexVersion: this.INDEX_VERSION,
    };

    const index = { assetsByType, summary, indexVersion: this.INDEX_VERSION };
    
    // Save to S3
    await this.metadataService.saveMetadata(this.MASTER_INDEX_PATH, index);
    
    // Update cache
    this.setCached('master-index', index);
    
    // Emit rebuild event
    this.emit('index:rebuilt', {
      type: 'rebuild',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      stats: summary,
    });

    logger.info(`Index rebuild completed in ${Date.now() - startTime}ms`, summary);
    return index;
  }

  /**
   * Build index for a specific asset type
   */
  private async buildTypeIndex(assetType: string): Promise<IndexEntry[]> {
    const entries: IndexEntry[] = [];
    
    try {
      const objects = await this.metadataService.listObjects(`assets/${assetType}/`);
      const jsonFiles = objects.filter(obj => obj.key.endsWith('.json'));
      
      logger.info(`Building index for ${jsonFiles.length} ${assetType}`);
      
      // Process in batches to avoid memory issues
      const batches = this.createBatches(jsonFiles, this.BATCH_SIZE);
      const limit = pLimit(this.CONCURRENCY);
      
      for (const batch of batches) {
        const batchPromises = batch.map(obj => 
          limit(async () => {
            try {
              const asset = await this.metadataService.getMetadata(obj.key);
              if (asset && asset['@metadata']) {
                const id = obj.key.split('/').pop()?.replace('.json', '') || '';
                const entry: IndexEntry = {
                  id,
                  type: assetType === 'analyses' ? 'analysis' : assetType.slice(0, -1) as any,
                  name: asset['@metadata'].name || 'Unnamed',
                  lastModified: obj.lastModified,
                  lastExported: asset['@metadata'].exportTime || asset['@metadata'].lastModifiedTime,
                  fileSize: obj.size || 0,
                  tags: asset.Tags || [],
                  permissions: asset.Permissions?.map((p: any) => ({
                    principal: p.Principal,
                    actions: p.Actions,
                  })) || [],
                };
                
                // Add type-specific metadata
                if (assetType === 'datasets') {
                  entry.metadata = {
                    importMode: asset['@metadata'].importMode,
                    datasourceType: asset['@metadata'].datasourceType,
                    fieldCount: asset['@metadata'].fieldCount,
                    calculatedFieldCount: asset['@metadata'].calculatedFieldCount,
                  };
                } else if (assetType === 'datasources') {
                  entry.metadata = {
                    connectionStatus: asset.DataSource?.Status || 'Unknown',
                    datasourceType: asset.DataSource?.Type || asset['@metadata'].type || 'Unknown',
                  };
                }
                
                return entry;
              }
              return null;
            } catch (error) {
              logger.warn(`Failed to load metadata for ${obj.key}:`, error);
              return null;
            }
          }),
        );
        
        const results = await Promise.all(batchPromises);
        entries.push(...results.filter(Boolean) as IndexEntry[]);
      }
    } catch (error) {
      logger.error(`Error building ${assetType} index:`, error);
    }
    
    return entries;
  }

  /**
   * Get assets by type with caching
   */
  async getAssetsByType(
    assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    options?: {
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    assets: IndexEntry[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    // Get the index
    const index = await this.getMasterIndex();
    let assets = index.assetsByType[assetType] || [];
    
    // Apply search filter
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      assets = assets.filter(asset => 
        asset.name.toLowerCase().includes(searchLower) ||
        asset.id.toLowerCase().includes(searchLower),
      );
    }
    
    // Apply sorting
    if (options?.sortBy) {
      assets = this.sortAssets(assets, options.sortBy, options.sortOrder || 'asc');
    }
    
    // Apply pagination
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 50;
    const totalItems = assets.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      assets: assets.slice(startIndex, endIndex),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasMore: endIndex < totalItems,
      },
    };
  }

  /**
   * Get a single asset with caching
   */
  async getAsset(assetType: string, assetId: string): Promise<any | null> {
    const cacheKey = `${assetType}/${assetId}`;
    
    // Check memory cache
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const asset = await this.metadataService.getMetadata(`assets/${assetType}/${assetId}.json`);
      if (asset) {
        this.setCached(cacheKey, asset);
        return asset;
      }
    } catch (error) {
      logger.debug(`Asset not found: ${assetType}/${assetId}`);
    }
    
    return null;
  }

  /**
   * Update an asset in the index
   */
  async updateAssetInIndex(
    assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    assetId: string,
    assetData: any,
  ): Promise<void> {
    // Note: Asset is already saved to S3 by the processor, no need to save again
    
    // Invalidate caches
    this.invalidateCache(`${assetType}/${assetId}`);
    this.invalidateCache('master-index');
    this.invalidateCache(`type-index-${assetType}`);
    
    // Update the type index incrementally
    await this.updateTypeIndexIncremental(assetType, assetId);
    
    // Emit update event
    this.emit('index:updated', {
      type: 'update',
      assetType,
      assetId,
      timestamp: new Date().toISOString(),
    } as IndexUpdateEvent);
  }

  /**
   * Delete an asset from the index
   */
  async deleteAssetFromIndex(
    assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    assetId: string,
  ): Promise<void> {
    // Delete from S3
    await this.metadataService.deleteMetadata(`assets/${assetType}/${assetId}.json`);
    
    // Invalidate caches
    this.invalidateCache(`${assetType}/${assetId}`);
    this.invalidateCache('master-index');
    this.invalidateCache(`type-index-${assetType}`);
    
    // Update the master index
    const index = await this.getMasterIndex();
    if (index.assetsByType[assetType]) {
      index.assetsByType[assetType] = index.assetsByType[assetType].filter(
        asset => asset.id !== assetId,
      );
      await this.metadataService.saveMetadata(this.MASTER_INDEX_PATH, index);
    }
    
    // Emit delete event
    this.emit('index:deleted', {
      type: 'delete',
      assetType,
      assetId,
      timestamp: new Date().toISOString(),
    } as IndexUpdateEvent);
  }

  /**
   * Build field index for data catalog
   */
  async buildFieldIndex(): Promise<any> {
    const cached = this.getCached('field-index');
    if (cached) {
      return cached;
    }
    
    try {
      const fieldIndex = await this.metadataService.getMetadata(this.FIELD_INDEX_PATH);
      if (fieldIndex) {
        this.setCached('field-index', fieldIndex);
        return fieldIndex;
      }
    } catch {
      // Field index doesn't exist yet
    }
    
    return null;
  }

  /**
   * Save field index
   */
  async saveFieldIndex(fieldIndex: any): Promise<void> {
    await this.metadataService.saveMetadata(this.FIELD_INDEX_PATH, fieldIndex);
    this.setCached('field-index', fieldIndex);
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<IndexStats> {
    const index = await this.getMasterIndex();
    return index.summary;
  }

  /**
   * Check index health
   */
  async checkIndexHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    stats: IndexStats | null;
  }> {
    const issues: string[] = [];
    let stats: IndexStats | null = null;
    
    try {
      const index = await this.getMasterIndex();
      stats = index.summary;
      
      // Check index age
      const age = Date.now() - new Date(stats.lastUpdated).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        issues.push('Index is older than 24 hours');
      }
      
      // Check for empty index
      if (stats.totalAssets === 0) {
        issues.push('Index contains no assets');
      }
      
      // Verify sample assets exist
      for (const [type, assets] of Object.entries(index.assetsByType)) {
        if (assets.length > 0) {
          const sample = assets[0];
          const exists = await this.getAsset(type, sample.id);
          if (!exists) {
            issues.push(`Sample ${type} asset ${sample.id} not found in storage`);
          }
        }
      }
    } catch (error) {
      issues.push(`Failed to load index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      stats,
    };
  }

  // Private helper methods

  private getCached<T>(key: string): T | null {
    const entry = this.indexCache.get(key) || this.assetCache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.data as T;
    }
    return null;
  }

  private setCached<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + (ttl || this.CACHE_TTL),
    };
    
    // Determine which cache to use based on key
    if (key.includes('index')) {
      this.indexCache.set(key, entry);
    } else {
      this.assetCache.set(key, entry);
    }
  }

  private invalidateCache(key: string): void {
    this.indexCache.delete(key);
    this.assetCache.delete(key);
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.indexCache.entries()) {
      if (entry.expires < now) {
        this.indexCache.delete(key);
      }
    }
    
    for (const [key, entry] of this.assetCache.entries()) {
      if (entry.expires < now) {
        this.assetCache.delete(key);
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private sortAssets(assets: IndexEntry[], sortBy: string, order: 'asc' | 'desc'): IndexEntry[] {
    return [...assets].sort((a, b) => {
      let aVal: any = a[sortBy as keyof IndexEntry];
      let bVal: any = b[sortBy as keyof IndexEntry];
      
      // Handle nested metadata fields
      if (sortBy.includes('.')) {
        const [parent, child] = sortBy.split('.');
        aVal = (a as any)[parent]?.[child];
        bVal = (b as any)[parent]?.[child];
      }
      
      // Handle dates
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();
      
      // Compare
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  private async saveTypeIndex(assetType: string, entries: IndexEntry[]): Promise<void> {
    const path = `${this.TYPE_INDEX_PREFIX}${assetType}.json`;
    await this.metadataService.saveMetadata(path, {
      type: assetType,
      entries,
      count: entries.length,
      lastUpdated: new Date().toISOString(),
    });
  }

  private async updateTypeIndexIncremental(
    assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    assetId: string,
  ): Promise<void> {
    try {
      // Get current index
      const index = await this.getMasterIndex();
      const typeAssets = index.assetsByType[assetType] || [];
      
      // Remove old entry if exists
      const filteredAssets = typeAssets.filter(a => a.id !== assetId);
      
      // Load the updated asset
      const asset = await this.getAsset(assetType, assetId);
      if (asset && asset['@metadata']) {
        // Create new entry
        const obj = await this.metadataService.getObjectMetadata(`assets/${assetType}/${assetId}.json`);
        const entry: IndexEntry = {
          id: assetId,
          type: assetType === 'analyses' ? 'analysis' : assetType.slice(0, -1) as any,
          name: asset['@metadata'].name || 'Unnamed',
          lastModified: obj?.lastModified || new Date(),
          lastExported: asset['@metadata'].exportTime || asset['@metadata'].lastModifiedTime,
          fileSize: obj?.size || 0,
          tags: asset.Tags || [],
          permissions: asset.Permissions?.map((p: any) => ({
            principal: p.Principal,
            actions: p.Actions,
          })) || [],
        };
        
        // Add type-specific metadata
        if (assetType === 'datasets' && asset['@metadata']) {
          entry.metadata = {
            importMode: asset['@metadata'].importMode,
            datasourceType: asset['@metadata'].datasourceType,
            fieldCount: asset['@metadata'].fieldCount,
            calculatedFieldCount: asset['@metadata'].calculatedFieldCount,
          };
        } else if (assetType === 'datasources' && asset.DataSource) {
          entry.metadata = {
            connectionStatus: asset.DataSource.Status || 'Unknown',
            datasourceType: asset.DataSource.Type || asset['@metadata']?.type || 'Unknown',
          };
        }
        
        // Add back to index
        filteredAssets.push(entry);
      }
      
      // Update index
      index.assetsByType[assetType] = filteredAssets;
      
      // Update summary counts
      index.summary.assetsByType[assetType] = filteredAssets.length;
      index.summary.totalAssets = Object.values(index.assetsByType)
        .reduce((sum, assets) => sum + assets.length, 0);
      index.summary.totalSize = Object.values(index.assetsByType)
        .flat()
        .reduce((sum, asset) => sum + (asset.fileSize || 0), 0);
      index.summary.lastUpdated = new Date().toISOString();
      
      // Save updated index
      await this.metadataService.saveMetadata(this.MASTER_INDEX_PATH, index);
      this.setCached('master-index', index);
      
    } catch (error) {
      logger.error(`Failed to update type index for ${assetType}/${assetId}:`, error);
    }
  }
}

// Export singleton instance
export const indexingService = IndexingService.getInstance();