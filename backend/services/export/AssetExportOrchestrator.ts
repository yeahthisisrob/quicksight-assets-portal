import {
  QuickSightClient,
  ListDashboardsCommand,
  ListDataSetsCommand,
  ListAnalysesCommand,
  ListDataSourcesCommand,
} from '@aws-sdk/client-quicksight';
import { MetadataService } from '../metadata.service';
import { PermissionsService } from '../permissions.service';
import { TagService } from '../tag.service';
import { AssetParserService } from '../assetParser.service';
import { logger } from '../../utils/logger';
import { getAwsConfig } from '../../utils/awsConfig';
import { withRetry } from '../../utils/awsRetry';
import pLimit from 'p-limit';

import { IAssetProcessor, IProgressTracker } from './core/interfaces';
import { AssetExportResult, ExportProgress, ExportSession, ProcessingContext, AssetType, AssetStats } from './core/types';
import { DashboardProcessor } from './processors/DashboardProcessor';
import { DatasetProcessor } from './processors/DatasetProcessor';
import { V2DataSourceLister } from './utils/v2DataSourceLister';
import { AnalysisProcessor } from './processors/AnalysisProcessor';
import { DatasourceProcessor } from './processors/DatasourceProcessor';

export class AssetExportOrchestrator implements IProgressTracker {
  private client: QuickSightClient;
  private metadataService: MetadataService;
  private awsAccountId: string;
  private processors: Map<AssetType, IAssetProcessor>;
  private currentSession: ExportSession | null = null;
  private isCheckingCompletion = false;

  private readonly RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
  };

  constructor() {
    this.client = new QuickSightClient({
      ...getAwsConfig(),
      maxAttempts: this.RETRY_OPTIONS.maxRetries,
      retryMode: 'adaptive',
    });
    this.metadataService = new MetadataService();
    this.awsAccountId = process.env.AWS_ACCOUNT_ID || '';
    
    this.processors = new Map();
    this.initializeProcessors();
    
    // Try to load any existing running session
    this.loadLatestRunningSession();
  }

  private async loadLatestRunningSession(): Promise<void> {
    try {
      const sessions = await this.metadataService.listObjects('sessions/');
      // Find the most recent running session
      const runningSessions = [];
      
      for (const sessionObj of sessions) {
        if (sessionObj.key.endsWith('.json')) {
          try {
            const session = await this.metadataService.getMetadata(sessionObj.key);
            if (session && session.status === 'running') {
              // Check if session is stale (older than 1 hour)
              const sessionAge = Date.now() - new Date(session.startTime).getTime();
              if (sessionAge > 60 * 60 * 1000) {
                logger.info('Found stale running session', { sessionId: session.sessionId, age: sessionAge });
                session.status = 'error';
                session.endTime = new Date().toISOString();
                await this.metadataService.saveMetadata(sessionObj.key, session);
              } else {
                runningSessions.push({ ...session, lastModified: sessionObj.lastModified });
              }
            }
          } catch {
            // Ignore individual session load errors
          }
        }
      }
      
      if (runningSessions.length > 0) {
        // Use the most recent running session
        runningSessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        const latestSession = runningSessions[0];
        this.currentSession = latestSession;
        logger.info('Loaded existing running session', { sessionId: latestSession.sessionId });
      }
    } catch {
      // Ignore errors - just means no existing sessions
      logger.debug('No existing running sessions found');
    }
  }

  private initializeProcessors(): void {
    const permissionsService = new PermissionsService();
    const tagService = new TagService();
    const assetParserService = new AssetParserService();

    this.processors.set('dashboards', new DashboardProcessor(
      this.client,
      this.metadataService,
      permissionsService,
      tagService,
      assetParserService,
      this.awsAccountId,
      this,
      3, // max concurrency
    ));

    this.processors.set('datasets', new DatasetProcessor(
      this.client,
      this.metadataService,
      permissionsService,
      tagService,
      assetParserService,
      this.awsAccountId,
      this,
      3, // max concurrency
    ));

    this.processors.set('analyses', new AnalysisProcessor(
      this.client,
      this.metadataService,
      permissionsService,
      tagService,
      assetParserService,
      this.awsAccountId,
      this,
      3, // max concurrency
    ));

    this.processors.set('datasources', new DatasourceProcessor(
      this.client,
      this.metadataService,
      permissionsService,
      tagService,
      assetParserService,
      this.awsAccountId,
      this,
      3, // max concurrency
    ));
  }

  async exportAllAssets(forceRefresh = false): Promise<AssetExportResult> {
    const startTime = Date.now();
    const context: ProcessingContext = { forceRefresh };
    
    const result: AssetExportResult = {
      dashboards: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
      datasets: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
      analyses: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
      datasources: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
      exportTime: new Date().toISOString(),
      duration: 0,
    };

    try {
      // Only start a new session if we don't have one already
      if (!this.currentSession || this.currentSession.status !== 'running') {
        await this.startExportSession(); // Full export - all types
      }

      // Export dashboards
      logger.info('Starting dashboard export...');
      result.dashboards = await this.exportAssetType('dashboards', context);

      // Export datasets
      logger.info('Starting dataset export...');
      result.datasets = await this.exportAssetType('datasets', context);

      // Export analyses
      logger.info('Starting analysis export...');
      result.analyses = await this.exportAssetType('analyses', context);

      // Export datasources
      logger.info('Starting datasource export...');
      result.datasources = await this.exportAssetType('datasources', context);

      result.duration = Date.now() - startTime;
      
      // Save export summary
      await this.metadataService.saveMetadata('assets/export-summary.json', {
        lastExport: result,
        totalAssets: result.dashboards.total + result.datasets.total + result.analyses.total + result.datasources.total,
      });

      // Rebuild asset index after full export
      await this.rebuildAssetIndex();

      await this.completeExportSession(result);
      logger.info('Asset export completed', result);
      
      return result;
    } catch (error) {
      logger.error('Error during asset export:', error);
      throw error;
    }
  }

  async exportAssetType(assetType: AssetType, context: ProcessingContext) {
    const processor = this.processors.get(assetType);
    if (!processor) {
      throw new Error(`No processor found for asset type: ${assetType}`);
    }

    // Update progress to show we're listing assets
    this.updateProgress(assetType, {
      status: 'running',
      current: 0,
      total: 0,
      message: `Listing ${assetType}...`,
    });

    // Get all assets of this type
    const listStartTime = Date.now();
    const summaries = await this.listAssets(assetType);
    const listDuration = Date.now() - listStartTime;
    logger.info('Assets listed', { assetType, count: summaries.length, listingDuration: listDuration });
    
    // Process them
    return processor.processBatch(summaries, context);
  }

  private async listAssets(assetType: AssetType): Promise<any[]> {
    logger.info('Starting asset listing', { assetType });
    
    // Special handling for datasources using SDK v2 to avoid union deserialization bug
    if (assetType === 'datasources') {
      try {
        const v2Lister = new V2DataSourceLister(
          process.env.AWS_ACCOUNT_ID || this.awsAccountId, 
          process.env.AWS_REGION || 'us-east-1'
        );
        const dataSources = await v2Lister.listAllDataSources();
        
        this.updateProgress(assetType, {
          message: `Listed ${dataSources.length} ${assetType}`,
          current: dataSources.length,
          total: dataSources.length,
          status: 'completed',
        });
        
        return dataSources;
      } catch (error: any) {
        logger.error('Failed to list data sources with SDK v2:', error);
        this.updateProgress(assetType, {
          status: 'error',
          message: `Failed to list ${assetType}: ${error.message}`,
          errors: [{
            assetId: 'datasources-listing',
            assetName: 'All Datasources',
            error: error.message,
            errorType: error.name,
            timestamp: new Date().toISOString(),
          }],
        });
        throw error;
      }
    }
    
    // Regular SDK v3 handling for all other asset types
    const assets: any[] = [];
    let nextToken: string | undefined;
    let pageCount = 0;
    const pageRetryLimit = 5;
    
    const commands = {
      dashboards: () => new ListDashboardsCommand({
        AwsAccountId: this.awsAccountId,
        NextToken: nextToken,
        MaxResults: 100,
      }),
      datasets: () => new ListDataSetsCommand({
        AwsAccountId: this.awsAccountId,
        NextToken: nextToken,
        MaxResults: 100,
      }),
      analyses: () => new ListAnalysesCommand({
        AwsAccountId: this.awsAccountId,
        NextToken: nextToken,
        MaxResults: 100,
      }),
      datasources: () => new ListDataSourcesCommand({
        AwsAccountId: this.awsAccountId,
        NextToken: nextToken,
        MaxResults: 100,
      }),
    };

    const command = commands[assetType];
    if (!command) {
      throw new Error(`Unsupported asset type: ${assetType}`);
    }

    const listKey = {
      dashboards: 'DashboardSummaryList',
      datasets: 'DataSetSummaries', 
      analyses: 'AnalysisSummaryList',
      datasources: 'DataSources',
    }[assetType];

    // Continue pagination until we've fetched all pages
    while (true) {
      pageCount++;
      let pageRetryCount = 0;
      let pageSuccess = false;
      
      // Retry logic for individual pages
      while (pageRetryCount < pageRetryLimit && !pageSuccess) {
        try {
          // Add exponential backoff between retries
          if (pageRetryCount > 0) {
            const backoffTime = Math.min(Math.pow(2, pageRetryCount) * 1000, 30000);
            logger.debug('Retry backoff', { backoffTime, retryCount: pageRetryCount, maxRetries: pageRetryLimit, assetType, page: pageCount });
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
          
          // Use withRetry for additional protection
          logger.debug('Fetching page', { assetType, page: pageCount });
          const response = await withRetry(
            () => this.client.send(command()),
            `List${assetType}s page ${pageCount}`,
            {
              maxRetries: 3,
              baseDelay: 2000,
              maxDelay: 30000,
            },
          );
          
          // Debug logging
          logger.debug('API response', { assetType, page: pageCount, responseKeys: Object.keys(response) });
          logger.debug('Pagination status', { hasNextToken: !!response.NextToken });
          
          if (listKey && response[listKey as keyof typeof response]) {
            const responseList = response[listKey as keyof typeof response] as any[];
            
            assets.push(...responseList);
            logger.info('Page fetched', { assetType, page: pageCount, pageItems: responseList.length, totalItems: assets.length });
            
            // Update progress while listing
            this.updateProgress(assetType, {
              message: `Listing ${assetType}... (page ${pageCount}, ${assets.length} found)`,
              current: assets.length,
              total: 0, // We don't know the total yet
              status: 'running',
            });
            
            // Save session state periodically (every 5 pages or 500 items)
            if (pageCount % 5 === 0 || assets.length % 500 === 0) {
              await this.saveSessionState();
            }
          } else {
            logger.warn('Unexpected API response structure', { assetType, expectedKey: listKey, availableKeys: Object.keys(response) });
            // Still mark as success to continue pagination
          }

          // Update nextToken for the next iteration
          nextToken = response.NextToken;
          pageSuccess = true;
          
          // Add delay between successful pages to avoid rate limiting
          if (nextToken) {
            const delayMs = assets.length > 1000 ? 500 : 200;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
        } catch (error: any) {
          pageRetryCount++;
          
          const isThrottling = error.name === 'ThrottlingException' || 
                              error.name === 'TooManyRequestsException' ||
                              error.$metadata?.httpStatusCode === 429;
          
          const isTransient = error.name === 'ServiceUnavailableException' ||
                             error.$metadata?.httpStatusCode === 503 ||
                             error.$metadata?.httpStatusCode === 502;
          
          if ((isThrottling || isTransient) && pageRetryCount < pageRetryLimit) {
            logger.warn('Retryable error', { errorType: isThrottling ? 'rate_limit' : 'transient', assetType, page: pageCount, retryCount: pageRetryCount, maxRetries: pageRetryLimit, error: error.message });
            // Continue to retry
          } else if (pageRetryCount >= pageRetryLimit) {
            logger.error('Page fetch failed', { assetType, page: pageCount, retries: pageRetryLimit, error: error.message });
            
            // Create detailed error info
            const errorDetails = {
              assetId: `${assetType}-page-${pageCount}`,
              assetName: `Page ${pageCount} of ${assetType}`,
              error: error.message,
              errorType: error.name,
              timestamp: new Date().toISOString(),
              details: {
                pageCount,
                assetType,
                itemsFetchedSoFar: assets.length,
                retryCount: pageRetryCount,
                ...(error.stack && { stack: error.stack }),
              },
            };
            
            // Update progress with error details
            this.updateProgress(assetType, {
              status: 'error',
              message: `Failed to list ${assetType} page ${pageCount} after ${pageRetryLimit} retries`,
              errors: [errorDetails],
            });
            await this.saveSessionState();
            
            throw new Error(`Failed to list ${assetType} page ${pageCount} after ${pageRetryLimit} retries: ${error.message}`);
          } else {
            // Non-retryable error
            logger.error(`Non-retryable error listing ${assetType} page ${pageCount}:`, error);
            
            // Create detailed error info
            const errorDetails = {
              assetId: `${assetType}-page-${pageCount}`,
              assetName: `Page ${pageCount} of ${assetType}`,
              error: error.message,
              errorType: error.name,
              timestamp: new Date().toISOString(),
              details: {
                pageCount,
                assetType,
                itemsFetchedSoFar: assets.length,
                ...(error.stack && { stack: error.stack }),
              },
            };
            
            // Update progress with error details
            this.updateProgress(assetType, {
              status: 'error',
              message: `Non-retryable error listing ${assetType}`,
              errors: [errorDetails],
            });
            await this.saveSessionState();
            
            throw error;
          }
        }
      }
      
      // Check if we have more pages
      if (!nextToken) {
        logger.info(`✓ Completed listing all ${assetType}: ${assets.length} total items in ${pageCount} pages`);
        break;
      }
      
      // Log progress for large paginations
      if (assets.length > 0 && assets.length % 100 === 0) {
        logger.info(`Progress: Listed ${assets.length} ${assetType} so far, continuing...`);
      }
    }
    
    // Final session save after completing all pages
    await this.saveSessionState();
    
    return assets;
  }

  // IProgressTracker implementation
  updateProgress(assetType: string, progress: Partial<ExportProgress>): void {
    if (!this.currentSession) return;
    
    // Ensure progress object exists
    if (!this.currentSession.progress) {
      this.currentSession.progress = {
        dashboards: { status: 'idle', current: 0, total: 0, message: '', errors: [] },
        datasets: { status: 'idle', current: 0, total: 0, message: '', errors: [] },
        analyses: { status: 'idle', current: 0, total: 0, message: '', errors: [] },
        datasources: { status: 'idle', current: 0, total: 0, message: '', errors: [] },
      };
    }

    const current = this.currentSession.progress[assetType] || {
      status: 'idle',
      current: 0,
      total: 0,
      message: '',
      errors: [],
    };

    this.currentSession.progress[assetType] = { ...current, ...progress };
    this.currentSession.lastUpdated = new Date().toISOString();
    
    // Save more frequently during listing phase and status changes
    const shouldSave = progress.status !== undefined || // Any status change
                       progress.message?.includes('Listing') || // During listing phase
                       progress.current === progress.total || // Completion
                       (progress.current && progress.current % 10 === 0); // Every 10 items
    
    if (shouldSave) {
      this.saveSessionState().catch(error => {
        logger.error('Failed to save session state during progress update:', error);
      });
    }
  }

  getCurrentProgress(): Record<string, ExportProgress> | null {
    return this.currentSession?.progress || null;
  }

  getCurrentSessionId(): string | null {
    return this.currentSession?.sessionId || null;
  }

  async startExportSession(assetTypes?: AssetType[]): Promise<string> {
    // If there's an existing running session, cancel it first
    if (this.currentSession && this.currentSession.status === 'running') {
      logger.info(`Cancelling existing session ${this.currentSession.sessionId} before starting new one`);
      await this.cancelExportSession();
    }

    const sessionId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // If specific asset types are provided, only initialize those
    // Otherwise, initialize all (for full export)
    const typesToInitialize = assetTypes || ['dashboards', 'datasets', 'analyses', 'datasources'];
    const progress: Record<string, ExportProgress> = {};
    
    if (assetTypes) {
      // Individual export - only initialize requested types
      for (const type of assetTypes) {
        progress[type] = { status: 'idle', current: 0, total: 0, message: 'Not started', errors: [] };
      }
    } else {
      // Full export - initialize all types
      progress.dashboards = { status: 'idle', current: 0, total: 0, message: 'Not started', errors: [] };
      progress.datasets = { status: 'idle', current: 0, total: 0, message: 'Not started', errors: [] };
      progress.analyses = { status: 'idle', current: 0, total: 0, message: 'Not started', errors: [] };
      progress.datasources = { status: 'idle', current: 0, total: 0, message: 'Not started', errors: [] };
    }
    
    this.currentSession = {
      sessionId,
      startTime: new Date().toISOString(),
      status: 'running',
      progress,
      lastUpdated: new Date().toISOString(),
    };

    await this.saveSessionState();
    return sessionId;
  }

  async loadExportSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.metadataService.getMetadata(`sessions/${sessionId}.json`);
      if (session) {
        this.currentSession = session;
        return true;
      }
    } catch (error) {
      logger.warn(`Failed to load session ${sessionId}:`, error);
    }
    return false;
  }

  async completeExportSession(result?: AssetExportResult): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.status = 'completed';
    this.currentSession.endTime = new Date().toISOString();
    if (result) {
      this.currentSession.summary = result;
    }

    await this.saveSessionState();
    
    // Rebuild the asset index after completing the export
    try {
      logger.info('Rebuilding asset index after export completion...');
      await this.rebuildAssetIndex();
      logger.info('Asset index rebuilt successfully');
    } catch (error) {
      logger.error('Failed to rebuild asset index:', error);
      // Don't throw - this is an optimization, not critical
    }
  }

  async getExportSummary() {
    try {
      return await this.metadataService.getMetadata('assets/export-summary.json');
    } catch {
      return null;
    }
  }

  async getExportSession(sessionId: string) {
    try {
      const session = await this.metadataService.getMetadata(`sessions/${sessionId}.json`);
      // If this is our current session, reload it to get latest progress
      if (this.currentSession?.sessionId === sessionId) {
        this.currentSession = session;
      }
      return session;
    } catch {
      return null;
    }
  }

  async exportDashboardsWithProgress(forceRefresh = false, sessionId?: string) {
    const context: ProcessingContext = { forceRefresh };
    
    // If a sessionId is provided, try to load it
    if (sessionId) {
      const loaded = await this.loadExportSession(sessionId);
      if (!loaded) {
        logger.warn(`Session ${sessionId} not found, will create new session`);
      }
    } else if (!this.currentSession) {
      // Try to load the latest running session if we don't have one in memory
      await this.loadLatestRunningSession();
    }
    
    // Start a new session if we don't have one or the current one is completed
    if (!this.currentSession || this.currentSession.status !== 'running') {
      await this.startExportSession(['dashboards']);
    }
    
    logger.info(`Starting dashboard export in session ${this.currentSession!.sessionId}`);
    const result = await this.exportAssetType('dashboards', context);
    
    // Small delay to allow other parallel exports to update their status
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if all asset types are complete
    await this.checkAndCompleteSession();
    
    return result;
  }

  async exportDatasetsWithProgress(forceRefresh = false, sessionId?: string) {
    const context: ProcessingContext = { forceRefresh };
    
    // If a sessionId is provided, try to load it
    if (sessionId) {
      const loaded = await this.loadExportSession(sessionId);
      if (!loaded) {
        logger.warn(`Session ${sessionId} not found, will create new session`);
      }
    } else if (!this.currentSession) {
      // Try to load the latest running session if we don't have one in memory
      await this.loadLatestRunningSession();
    }
    
    // Start a new session if we don't have one or the current one is completed
    if (!this.currentSession || this.currentSession.status !== 'running') {
      await this.startExportSession(['datasets']);
    }
    
    logger.info(`Starting dataset export in session ${this.currentSession!.sessionId}`);
    const result = await this.exportAssetType('datasets', context);
    
    // Small delay to allow other parallel exports to update their status
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if all asset types are complete
    await this.checkAndCompleteSession();
    
    return result;
  }

  async exportAnalysesWithProgress(forceRefresh = false, sessionId?: string) {
    const context: ProcessingContext = { forceRefresh };
    
    // If a sessionId is provided, try to load it
    if (sessionId) {
      const loaded = await this.loadExportSession(sessionId);
      if (!loaded) {
        logger.warn(`Session ${sessionId} not found, will create new session`);
      }
    } else if (!this.currentSession) {
      // Try to load the latest running session if we don't have one in memory
      await this.loadLatestRunningSession();
    }
    
    // Start a new session if we don't have one or the current one is completed
    if (!this.currentSession || this.currentSession.status !== 'running') {
      await this.startExportSession(['analyses']);
    }
    
    logger.info(`Starting analysis export in session ${this.currentSession!.sessionId}`);
    const result = await this.exportAssetType('analyses', context);
    
    // Small delay to allow other parallel exports to update their status
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if all asset types are complete
    await this.checkAndCompleteSession();
    
    return result;
  }

  async exportDatasourcesWithProgress(forceRefresh = false, sessionId?: string) {
    const context: ProcessingContext = { forceRefresh };
    
    try {
      // If a sessionId is provided, try to load it
      if (sessionId) {
        const loaded = await this.loadExportSession(sessionId);
        if (!loaded) {
          logger.warn(`Session ${sessionId} not found, will create new session`);
        }
      } else if (!this.currentSession) {
        // Try to load the latest running session if we don't have one in memory
        await this.loadLatestRunningSession();
      }
      
      // Start a new session if we don't have one or the current one is completed
      if (!this.currentSession || this.currentSession.status !== 'running') {
        await this.startExportSession(['datasources']);
      }
      
      logger.info(`Starting datasource export in session ${this.currentSession!.sessionId}`);
      const result = await this.exportAssetType('datasources', context);
      
      // Small delay to allow other parallel exports to update their status
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if all asset types are complete
      await this.checkAndCompleteSession();
      
      return result;
    } catch (error: any) {
      logger.error('Datasource export failed:', error);
      
      // Mark session as error
      if (this.currentSession) {
        this.currentSession.status = 'error';
        this.currentSession.endTime = new Date().toISOString();
        await this.saveSessionState();
      }
      
      throw error;
    }
  }

  async cancelExportSession() {
    // First, try to load the latest running session if we don't have one in memory
    if (!this.currentSession) {
      await this.loadLatestRunningSession();
    }
    
    if (!this.currentSession) {
      logger.warn('No active session to cancel');
      return;
    }
    
    const sessionId = this.currentSession.sessionId;
    logger.info(`Cancelling export session ${sessionId}`);
    
    // Mark all running progress as cancelled
    if (this.currentSession.progress) {
      for (const [assetType, progress] of Object.entries(this.currentSession.progress)) {
        if (progress && (progress.status === 'running' || progress.status === 'idle')) {
          this.currentSession.progress[assetType] = {
            ...progress,
            status: 'error',
            message: 'Export cancelled by user',
          };
        }
      }
    }
    
    this.currentSession.status = 'cancelled';
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.lastUpdated = new Date().toISOString();
    
    // Save the cancelled state before clearing
    await this.saveSessionState();
    
    // Clear current session
    this.currentSession = null;
    
    // Force a small delay to ensure S3 consistency
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.info(`Export session ${sessionId} cancelled successfully`);
  }

  async getAllAssets() {
    // Try to use optimized index first
    try {
      const index = await this.metadataService.getMetadata('assets/index/master-index.json');
      if (index && index.assetsByType) {
        logger.info('Using optimized asset index');
        
        // Flatten all assets from the index
        const assets: any[] = [];
        
        if (index.assetsByType.dashboards) {
          assets.push(...index.assetsByType.dashboards);
        }
        if (index.assetsByType.datasets) {
          assets.push(...index.assetsByType.datasets);
        }
        if (index.assetsByType.analyses) {
          assets.push(...index.assetsByType.analyses);
        }
        if (index.assetsByType.datasources) {
          assets.push(...index.assetsByType.datasources);
        }
        
        // Calculate total size from indexed assets
        const totalSize = assets.reduce((sum, asset) => sum + (asset.fileSize || 0), 0);
        
        return {
          assets,
          summary: index.summary || {
            total: assets.length,
            types: {
              dashboards: index.assetsByType.dashboards?.length || 0,
              datasets: index.assetsByType.datasets?.length || 0,
              analyses: index.assetsByType.analyses?.length || 0,
              datasources: index.assetsByType.datasources?.length || 0,
            },
          },
          totalSize,
        };
      }
    } catch (error) {
      logger.debug('No optimized index found, falling back to listing objects');
    }
    
    // Fallback to listing objects if index is not available
    const assets: any[] = [];
    
    try {
      const [dashboards, datasets, analyses, datasources] = await Promise.all([
        this.metadataService.listObjects('assets/dashboards/'),
        this.metadataService.listObjects('assets/datasets/'),
        this.metadataService.listObjects('assets/analyses/'),
        this.metadataService.listObjects('assets/datasources/'),
      ]);

      // Convert S3 objects to asset summaries
      for (const obj of dashboards) {
        if (obj.key.endsWith('.json')) {
          const id = obj.key.split('/').pop()?.replace('.json', '');
          if (id) {
            assets.push({ 
              id, 
              type: 'dashboard', 
              name: id, // Use ID as name for fallback (index has proper names)
              lastModified: obj.lastModified,
              fileSize: obj.size 
            });
          }
        }
      }

      for (const obj of datasets) {
        if (obj.key.endsWith('.json')) {
          const id = obj.key.split('/').pop()?.replace('.json', '');
          if (id) {
            assets.push({ 
              id, 
              type: 'dataset', 
              name: id, // Use ID as name for fallback (index has proper names)
              lastModified: obj.lastModified,
              fileSize: obj.size 
            });
          }
        }
      }

      for (const obj of analyses) {
        if (obj.key.endsWith('.json')) {
          const id = obj.key.split('/').pop()?.replace('.json', '');
          if (id) {
            assets.push({ 
              id, 
              type: 'analysis', 
              name: id, // Use ID as name for fallback (index has proper names)
              lastModified: obj.lastModified,
              fileSize: obj.size 
            });
          }
        }
      }

      for (const obj of datasources) {
        if (obj.key.endsWith('.json')) {
          const id = obj.key.split('/').pop()?.replace('.json', '');
          if (id) {
            assets.push({ 
              id, 
              type: 'datasource', 
              name: id, // Use ID as name for fallback (index has proper names)
              lastModified: obj.lastModified,
              fileSize: obj.size 
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error getting all assets:', error);
    }

    // Calculate total size
    const totalSize = assets.reduce((sum, asset) => sum + (asset.fileSize || 0), 0);
    
    return { 
      assets,
      summary: {
        total: assets.length,
        types: {
          dashboards: assets.filter(a => a.type === 'dashboard').length,
          datasets: assets.filter(a => a.type === 'dataset').length,
          analyses: assets.filter(a => a.type === 'analysis').length,
          datasources: assets.filter(a => a.type === 'datasource').length,
        },
      },
      totalSize,
    };
  }

  async getAsset(assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources', assetId: string) {
    const servicePath = assetType.slice(0, -1); // Remove 's' from plural
    const cacheKey = `assets/${servicePath}s/${assetId}.json`;
    
    try {
      return await this.metadataService.getMetadata(cacheKey);
    } catch {
      return null;
    }
  }

  async refreshAssetTags(assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources', assetId: string) {
    const processor = this.processors.get(assetType);
    if (!processor) {
      throw new Error(`No processor found for asset type: ${assetType}`);
    }

    // Get the asset summary (simplified for tag refresh)
    const assetTypeSingular = assetType.slice(0, -1); // Remove 's'
    const summary = { 
      [`${assetTypeSingular === 'datasource' ? 'DataSource' : assetTypeSingular.charAt(0).toUpperCase() + assetTypeSingular.slice(1)}Id`]: assetId,
      Name: `Refreshing tags for ${assetId}`,
    };

    const context: ProcessingContext = { forceRefresh: true };
    await processor.processAsset(summary as any, context);
    
    return { message: 'Tags refreshed successfully' };
  }

  async rebuildExportSummary() {
    // Build fresh summary from current session progress
    if (!this.currentSession) {
      logger.warn('No current session to rebuild export summary');
      return;
    }

    // Build summary from progress even if session isn't complete yet
    const summary = this.buildSummaryFromProgress();
    const totalAssets = summary.dashboards.total + summary.datasets.total + 
                       summary.analyses.total + summary.datasources.total;

    await this.metadataService.saveMetadata('assets/export-summary.json', {
      lastExport: summary,
      totalAssets: totalAssets,
      lastUpdated: new Date().toISOString(),
    });
    
    logger.info('Export summary rebuilt from session progress');
  }

  getMetadataService() {
    return this.metadataService;
  }

  async getRecentSessions(limit = 6): Promise<any[]> {
    try {
      // List sessions with a timeout to prevent hanging
      const sessions = await Promise.race([
        this.metadataService.listObjects('sessions/'),
        new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout listing sessions')), 5000)
        )
      ]);
      
      // Sort by S3 last modified time first to get most recent
      sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      
      // Only load the most recent sessions (limit * 2 to account for failures)
      const recentSessions = sessions.slice(0, limit * 2);
      const sessionList = [];
      
      // Load session details with concurrency limit
      const loadLimit = pLimit(3);
      const loadPromises = recentSessions
        .filter(obj => obj.key.endsWith('.json'))
        .map(sessionObj => 
          loadLimit(async () => {
            try {
              const session = await this.metadataService.getMetadata(sessionObj.key);
              if (session) {
                return { ...session, lastModified: sessionObj.lastModified };
              }
            } catch {
              // Ignore individual session load errors
            }
            return null;
          })
        );
      
      const loadedSessions = await Promise.all(loadPromises);
      const validSessions = loadedSessions.filter(s => s !== null);
      
      // Sort by start time (newest first) and limit
      validSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      
      return validSessions.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent sessions:', error);
      return [];
    }
  }


  async saveSessionState(): Promise<void> {
    if (!this.currentSession) return;
    
    try {
      await this.metadataService.saveMetadata(
        `sessions/${this.currentSession.sessionId}.json`,
        this.currentSession,
      );
    } catch (error) {
      logger.error('Failed to save session state:', error);
    }
  }

  private async checkAndCompleteSession(): Promise<void> {
    if (!this.currentSession || this.isCheckingCompletion) return;

    // Prevent concurrent completion checks
    this.isCheckingCompletion = true;
    
    try {
      // Log current session state for debugging
      const progressSummary = Object.entries(this.currentSession.progress)
        .map(([type, progress]) => `${type}: ${progress.status} (${progress.current}/${progress.total})`)
        .join(', ');
      logger.info(`Checking session completion. Session: ${this.currentSession.sessionId}, Progress: ${progressSummary}`);

    // Check if all running asset types have completed
    const runningTypes = Object.entries(this.currentSession.progress)
      .filter(([_, progress]) => progress.status === 'running');
    
    const allRunningComplete = runningTypes.length === 0;

    if (allRunningComplete) {
      // Check if at least one asset type was actually processed or completed
      const anyCompleted = Object.values(this.currentSession.progress).some(
        progress => progress.status === 'completed',
      );

      if (anyCompleted) {
        logger.info('All requested asset types have been processed, completing session');
        
        // Build summary from current progress
        const summary = this.buildSummaryFromProgress();
        await this.completeExportSession(summary);
        
        // Update export summary
        await this.metadataService.saveMetadata('assets/export-summary.json', {
          lastExport: summary,
          totalAssets: summary.dashboards.total + summary.datasets.total + 
                      summary.analyses.total + summary.datasources.total,
          lastUpdated: new Date().toISOString(),
        });
        
        logger.info('Export session completed and summary updated');
      } else {
        logger.info('No asset types were completed, not completing session');
      }
    } else {
      logger.info(`Still have ${runningTypes.length} running exports: ${runningTypes.map(([type]) => type).join(', ')}`);
    }
    } finally {
      this.isCheckingCompletion = false;
    }
  }

  private buildSummaryFromProgress(): AssetExportResult {
    const startTime = new Date(this.currentSession!.startTime).getTime();
    const duration = Date.now() - startTime;
    
    const getStatsFromProgress = (assetType: string): AssetStats => {
      const progress = this.currentSession!.progress[assetType];
      if (!progress || progress.status === 'idle') {
        return { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] };
      }
      
      // Use the actual stats if available
      if (progress.stats) {
        return {
          total: progress.total || 0,
          updated: progress.stats.updated || 0,
          cached: progress.stats.cached || 0,
          errors: progress.stats.errors || 0,
          errorDetails: [],
        };
      }
      
      // Fallback for older sessions
      return {
        total: progress.total || 0,
        updated: (progress.total || 0) - (progress.errors?.length || 0),
        cached: 0,
        errors: progress.errors?.length || 0,
        errorDetails: [],
      };
    };

    return {
      dashboards: getStatsFromProgress('dashboards'),
      datasets: getStatsFromProgress('datasets'),
      analyses: getStatsFromProgress('analyses'),
      datasources: getStatsFromProgress('datasources'),
      exportTime: new Date().toISOString(),
      duration,
    };
  }

  async rebuildAssetIndex(): Promise<{ totalAssets: number; assetTypes: Record<string, number> }> {
    logger.info('Rebuilding asset index...');
    try {
      const startTime = Date.now();
      
      // Load all asset metadata
      const [dashboards, datasets, analyses, datasources] = await Promise.all([
        this.loadAssetMetadata('dashboards'),
        this.loadAssetMetadata('datasets'),
        this.loadAssetMetadata('analyses'),
        this.loadAssetMetadata('datasources'),
      ]);
      
      // Build the index
      const index = {
        assetsByType: {
          dashboards,
          datasets,
          analyses,
          datasources,
        },
        summary: {
          total: dashboards.length + datasets.length + analyses.length + datasources.length,
          types: {
            dashboards: dashboards.length,
            datasets: datasets.length,
            analyses: analyses.length,
            datasources: datasources.length,
          },
        },
        lastUpdated: new Date().toISOString(),
      };
      
      // Save the index
      await this.metadataService.saveMetadata('assets/index/master-index.json', index);
      
      const duration = Date.now() - startTime;
      logger.info(`Asset index rebuilt successfully in ${duration}ms`);
      
      return {
        totalAssets: index.summary.total,
        assetTypes: index.summary.types,
      };
    } catch (error) {
      logger.error('Failed to rebuild asset index:', error);
      throw error;
    }
  }

  private async loadAssetMetadata(assetType: string): Promise<any[]> {
    const assets: any[] = [];
    
    try {
      const objects = await this.metadataService.listObjects(`assets/${assetType}/`);
      
      // Load metadata for each asset in parallel (with concurrency limit)
      // Use lower concurrency for large asset counts to avoid memory issues
      const assetCount = objects.filter(obj => obj.key.endsWith('.json')).length;
      const concurrency = assetCount > 500 ? 3 : 5;
      const limit = pLimit(concurrency);
      
      if (assetCount > 100) {
        logger.info(`Loading metadata for ${assetCount} ${assetType} with concurrency ${concurrency}`);
      }
      const loadPromises = objects
        .filter(obj => obj.key.endsWith('.json'))
        .map(obj => limit(async () => {
          try {
            const data = await this.metadataService.getMetadata(obj.key);
            if (data && data['@metadata']) {
              const id = obj.key.split('/').pop()?.replace('.json', '') || '';
              const baseAsset: any = {
                id,
                type: assetType === 'analyses' ? 'analysis' : assetType.slice(0, -1), // Handle 'analyses' -> 'analysis' correctly
                name: data['@metadata'].name || 'Unnamed',
                lastModified: obj.lastModified,
                lastExported: data['@metadata'].exportTime || data['@metadata'].lastModifiedTime,
                importMode: data['@metadata'].importMode,
                datasourceType: data['@metadata'].datasourceType || data['@metadata'].type,
                fieldCount: data['@metadata'].fieldCount,
                calculatedFieldCount: data['@metadata'].calculatedFieldCount,
                fileSize: obj.size, // Add file size from S3 object
                tags: data.Tags || [],
                permissions: data.Permissions?.map((p: any) => ({
                  principal: p.Principal,
                  actions: p.Actions,
                })) || [],
              };
              
              // Add datasource-specific fields
              if (assetType === 'datasources' && data.DataSource) {
                baseAsset.connectionStatus = data.DataSource.Status || 'Unknown';
                baseAsset.datasourceType = data.DataSource.Type || data['@metadata'].type || 'Unknown';
              }
              
              return baseAsset;
            }
            return null;
          } catch (error) {
            logger.warn(`Failed to load metadata for ${obj.key}:`, error);
            return null;
          }
        }));
      
      const results = await Promise.all(loadPromises);
      assets.push(...results.filter(Boolean));
      
    } catch (error) {
      logger.error(`Error loading ${assetType} metadata:`, error);
    }
    
    return assets;
  }
}