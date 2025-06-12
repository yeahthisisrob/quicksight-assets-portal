import {
  QuickSightClient,
  ListDashboardsCommand,
  ListDataSetsCommand,
  ListAnalysesCommand,
  ListDataSourcesCommand,
  DescribeDashboardCommand,
  DescribeDashboardDefinitionCommand,
  DescribeDataSetCommand,
  DescribeAnalysisCommand,
  DescribeAnalysisDefinitionCommand,
  DescribeDataSourceCommand,
  DescribeDataSourcePermissionsCommand,
  ListRefreshSchedulesCommand,
  DescribeDataSetRefreshPropertiesCommand,
  Dashboard,
  DataSet,
  Analysis,
  DataSource,
  ThrottlingException,
} from '@aws-sdk/client-quicksight';
import { MetadataService } from './metadata.service';
import { PermissionsService } from './permissions.service';
import { TagService } from './tag.service';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';
import { differenceInMinutes } from 'date-fns';
import pLimit from 'p-limit';

export interface AssetExportResult {
  dashboards: {
    total: number;
    updated: number;
    cached: number;
    errors: number;
  };
  datasets: {
    total: number;
    updated: number;
    cached: number;
    errors: number;
  };
  analyses: {
    total: number;
    updated: number;
    cached: number;
    errors: number;
  };
  datasources: {
    total: number;
    updated: number;
    cached: number;
    errors: number;
  };
  exportTime: string;
  duration: number;
}

export interface CachedAssetMetadata {
  lastExportTime: string;
  lastModifiedTime?: Date;
  assetType: 'dashboard' | 'dataset' | 'analysis' | 'datasource';
  assetId: string;
  assetArn: string;
  name: string;
  definition?: any;
  permissions?: any;
  tags?: Record<string, string>;
  fileSize?: number;
}

export interface ExportProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
  assetType?: 'dashboards' | 'datasets' | 'analyses' | 'datasources';
  startTime?: string;
  duration?: number;
  errors?: string[];
}

export interface ExportSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'error';
  progress: {
    dashboards: ExportProgress;
    datasets: ExportProgress;
    analyses: ExportProgress;
    datasources: ExportProgress;
  };
  summary?: AssetExportResult;
}

export class AssetExportService {
  private client: QuickSightClient;
  private metadataService: MetadataService;
  private permissionsService: PermissionsService;
  private tagService: TagService;
  private awsAccountId: string;
  private cacheValidityMinutes = 60; // Cache is valid for 1 hour
  private currentSession: ExportSession | null = null;
  private concurrencyLimit: ReturnType<typeof pLimit>;
  
  // Best practices for AWS API concurrency
  private readonly MAX_CONCURRENT_API_CALLS = 5;
  private readonly RETRY_OPTIONS = {
    maxRetries: 3,
    retryDelayBase: 1000, // Start with 1 second
    maxRetryDelay: 20000, // Max 20 seconds
  };

  constructor() {
    // Initialize client with retry configuration and AWS config
    this.client = new QuickSightClient({
      ...getAwsConfig(),
      maxAttempts: this.RETRY_OPTIONS.maxRetries,
      retryMode: 'adaptive', // Uses SDK's intelligent retry with backoff
    });
    this.metadataService = new MetadataService();
    this.permissionsService = new PermissionsService();
    this.tagService = new TagService();
    this.awsAccountId = process.env.AWS_ACCOUNT_ID || '';
    
    // Initialize concurrency limiter
    this.concurrencyLimit = pLimit(this.MAX_CONCURRENT_API_CALLS);
  }

  async getAsset(assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources', assetId: string): Promise<any | null> {
    try {
      const cacheKey = `assets/${assetType}/${assetId}.json`;
      const data = await this.metadataService.getMetadata(cacheKey);
      return data;
    } catch (error) {
      logger.error(`Error getting asset ${assetType}/${assetId}:`, error);
      return null;
    }
  }

  async exportAllAssets(forceRefresh = false): Promise<AssetExportResult> {
    const startTime = Date.now();
    const result: AssetExportResult = {
      dashboards: { total: 0, updated: 0, cached: 0, errors: 0 },
      datasets: { total: 0, updated: 0, cached: 0, errors: 0 },
      analyses: { total: 0, updated: 0, cached: 0, errors: 0 },
      datasources: { total: 0, updated: 0, cached: 0, errors: 0 },
      exportTime: new Date().toISOString(),
      duration: 0,
    };

    try {
      // Export dashboards
      logger.info('Starting dashboard export...');
      const dashboardResult = await this.exportDashboards(forceRefresh);
      result.dashboards = dashboardResult;

      // Export datasets
      logger.info('Starting dataset export...');
      const datasetResult = await this.exportDatasets(forceRefresh);
      result.datasets = datasetResult;

      // Export analyses
      logger.info('Starting analysis export...');
      const analysisResult = await this.exportAnalyses(forceRefresh);
      result.analyses = analysisResult;

      // Export datasources
      logger.info('Starting datasource export...');
      const datasourceResult = await this.exportDatasources(forceRefresh);
      result.datasources = datasourceResult;

      result.duration = Date.now() - startTime;
      
      // Save export summary
      await this.metadataService.saveMetadata('assets/export-summary.json', {
        lastExport: result,
        totalAssets: result.dashboards.total + result.datasets.total + result.analyses.total + result.datasources.total,
      });

      logger.info(`Asset export completed in ${result.duration}ms`, result);
      return result;
    } catch (error) {
      logger.error('Error during asset export:', error);
      throw error;
    }
  }

  private async exportDashboards(forceRefresh: boolean) {
    const stats = { total: 0, updated: 0, cached: 0, errors: 0 };
    let nextToken: string | undefined;

    do {
      try {
        const command = new ListDashboardsCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.DashboardSummaryList) {
          stats.total += response.DashboardSummaryList.length;
          
          // Update progress with total count
          this.updateProgress('dashboards', { 
            total: stats.total,
            message: `Processing ${response.DashboardSummaryList.length} dashboards...`
          });

          // Process with concurrency limit
          await Promise.all(
            response.DashboardSummaryList.map((summary) => 
              this.concurrencyLimit(async () => {
                try {
                  if (!summary.DashboardId || !summary.Arn) return;
                  
                  // Update progress
                  this.updateProgress('dashboards', {
                    current: stats.updated + stats.cached + stats.errors,
                    message: `Processing dashboard: ${summary.Name || summary.DashboardId}`
                  });
                
                const cacheKey = `assets/dashboards/${summary.DashboardId}.json`;
                const existingData = await this.metadataService.getMetadata(cacheKey);
                const existingMetadata = existingData?.['@metadata'];
                
                // Check if we need to update
                const needsUpdate = forceRefresh || 
                  !existingMetadata?.exportTime ||
                  this.isStale(existingMetadata.exportTime) ||
                  (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
                   new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

                if (needsUpdate) {
                  // Fetch dashboard definition (full JSON including visuals)
                  const definitionCommand = new DescribeDashboardDefinitionCommand({
                    AwsAccountId: this.awsAccountId,
                    DashboardId: summary.DashboardId,
                  });
                  
                  const definitionResponse = await this.client.send(definitionCommand);
                  
                  // Also get basic dashboard info for metadata
                  const detailCommand = new DescribeDashboardCommand({
                    AwsAccountId: this.awsAccountId,
                    DashboardId: summary.DashboardId,
                  });
                  
                  const detailResponse = await this.client.send(detailCommand);
                  
                  // Fetch permissions
                  const permissions = await this.permissionsService.getDashboardPermissions(summary.DashboardId);
                  
                  // Fetch tags
                  const tags = await this.tagService.getResourceTags('dashboard', summary.DashboardId);
                  
                  // Combine definition and details
                  const exportData = {
                    ...definitionResponse,
                    Dashboard: detailResponse.Dashboard,
                    Permissions: permissions,
                    Tags: tags,
                    '@metadata': {
                      exportTime: new Date().toISOString(),
                      lastModifiedTime: summary.LastUpdatedTime,
                      name: summary.Name || 'Unnamed Dashboard',
                    },
                  };
                  
                  await this.metadataService.saveMetadata(cacheKey, exportData);
                  stats.updated++;
                } else {
                  stats.cached++;
                }
                } catch (error) {
                  logger.error(`Error processing dashboard ${summary.DashboardId}:`, error);
                  stats.errors++;
                }
              })
            )
          );
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error listing dashboards:', error);
        throw error;
      }
    } while (nextToken);

    return stats;
  }

  private async exportDatasets(forceRefresh: boolean) {
    const stats = { total: 0, updated: 0, cached: 0, errors: 0 };
    let nextToken: string | undefined;

    do {
      try {
        const command = new ListDataSetsCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.DataSetSummaries) {
          stats.total += response.DataSetSummaries.length;
          
          // Update progress with total count
          this.updateProgress('datasets', { 
            total: stats.total,
            message: `Processing ${response.DataSetSummaries.length} datasets...`
          });

          // Process with concurrency limit
          await Promise.all(
            response.DataSetSummaries.map((summary) => 
              this.concurrencyLimit(async () => {
                try {
                  if (!summary.DataSetId || !summary.Arn) return;
                  
                  // Update progress
                  this.updateProgress('datasets', {
                    current: stats.updated + stats.cached + stats.errors,
                    message: `Processing dataset: ${summary.Name || summary.DataSetId}`
                  });
                
                  const cacheKey = `assets/datasets/${summary.DataSetId}.json`;
                const existingData = await this.metadataService.getMetadata(cacheKey);
                const existingMetadata = existingData?.['@metadata'];
                
                const needsUpdate = forceRefresh || 
                  !existingMetadata?.exportTime ||
                  this.isStale(existingMetadata.exportTime) ||
                  (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
                   new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

                if (needsUpdate) {
                  const detailCommand = new DescribeDataSetCommand({
                    AwsAccountId: this.awsAccountId,
                    DataSetId: summary.DataSetId,
                  });
                  
                  const detailResponse = await this.client.send(detailCommand);
                  
                  // Fetch permissions
                  const permissions = await this.permissionsService.getDataSetPermissions(summary.DataSetId);
                  
                  // Fetch tags
                  const tags = await this.tagService.getResourceTags('dataset', summary.DataSetId);
                  
                  const exportData: any = {
                    DataSet: detailResponse.DataSet,
                    Permissions: permissions,
                    Tags: tags,
                    '@metadata': {
                      exportTime: new Date().toISOString(),
                      lastModifiedTime: summary.LastUpdatedTime,
                      name: summary.Name || 'Unnamed Dataset',
                      importMode: detailResponse.DataSet?.ImportMode || 'DIRECT_QUERY',
                    },
                  };
                  
                  // For SPICE datasets, get refresh properties and schedules
                  // Note: Flat file (DIRECT_QUERY) datasets won't have refresh properties
                  if (detailResponse.DataSet?.ImportMode === 'SPICE') {
                    try {
                      const refreshPropsCommand = new DescribeDataSetRefreshPropertiesCommand({
                        AwsAccountId: this.awsAccountId,
                        DataSetId: summary.DataSetId,
                      });
                      const refreshPropsResponse = await this.client.send(refreshPropsCommand);
                      exportData.DataSetRefreshProperties = refreshPropsResponse.DataSetRefreshProperties;
                    } catch (error: any) {
                      // Not all SPICE datasets have refresh properties
                      if (!error.message?.includes('Dataset refresh properties are not set')) {
                        logger.warn(`Could not get refresh properties for dataset ${summary.DataSetId}:`, error.message);
                      }
                    }
                    
                    try {
                      const schedulesCommand = new ListRefreshSchedulesCommand({
                        AwsAccountId: this.awsAccountId,
                        DataSetId: summary.DataSetId,
                      });
                      const schedulesResponse = await this.client.send(schedulesCommand);
                      exportData.RefreshSchedules = schedulesResponse.RefreshSchedules || [];
                    } catch (error) {
                      logger.warn(`Could not get refresh schedules for dataset ${summary.DataSetId}:`, error);
                    }
                  }
                  
                  await this.metadataService.saveMetadata(cacheKey, exportData);
                  stats.updated++;
                } else {
                  stats.cached++;
                }
                } catch (error) {
                  logger.error(`Error processing dataset ${summary.DataSetId}:`, error);
                  stats.errors++;
                }
              })
            )
          );
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error listing datasets:', error);
        throw error;
      }
    } while (nextToken);

    return stats;
  }

  private async exportAnalyses(forceRefresh: boolean) {
    const stats = { total: 0, updated: 0, cached: 0, errors: 0 };
    let nextToken: string | undefined;

    do {
      try {
        const command = new ListAnalysesCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.AnalysisSummaryList) {
          stats.total += response.AnalysisSummaryList.length;
          
          // Update progress with total count
          this.updateProgress('analyses', { 
            total: stats.total,
            message: `Processing ${response.AnalysisSummaryList.length} analyses...`
          });

          // Process with concurrency limit
          await Promise.all(
            response.AnalysisSummaryList.map((summary) => 
              this.concurrencyLimit(async () => {
                try {
                  if (!summary.AnalysisId || !summary.Arn) return;
                  
                  // Update progress
                  this.updateProgress('analyses', {
                    current: stats.updated + stats.cached + stats.errors,
                    message: `Processing analysis: ${summary.Name || summary.AnalysisId}`
                  });
                
                  const cacheKey = `assets/analyses/${summary.AnalysisId}.json`;
                const existingData = await this.metadataService.getMetadata(cacheKey);
                const existingMetadata = existingData?.['@metadata'];
                
                const needsUpdate = forceRefresh || 
                  !existingMetadata?.exportTime ||
                  this.isStale(existingMetadata.exportTime) ||
                  (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
                   new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

                if (needsUpdate) {
                  // Fetch analysis definition (full JSON)
                  const definitionCommand = new DescribeAnalysisDefinitionCommand({
                    AwsAccountId: this.awsAccountId,
                    AnalysisId: summary.AnalysisId,
                  });
                  
                  const definitionResponse = await this.client.send(definitionCommand);
                  
                  // Also get basic analysis info
                  const detailCommand = new DescribeAnalysisCommand({
                    AwsAccountId: this.awsAccountId,
                    AnalysisId: summary.AnalysisId,
                  });
                  
                  const detailResponse = await this.client.send(detailCommand);
                  
                  // Fetch permissions
                  const permissions = await this.permissionsService.getAnalysisPermissions(summary.AnalysisId);
                  
                  // Fetch tags
                  const tags = await this.tagService.getResourceTags('analysis', summary.AnalysisId);
                  
                  // Combine definition and details
                  const exportData = {
                    ...definitionResponse,
                    Analysis: detailResponse.Analysis,
                    Permissions: permissions,
                    Tags: tags,
                    '@metadata': {
                      exportTime: new Date().toISOString(),
                      lastModifiedTime: summary.LastUpdatedTime,
                      name: summary.Name || 'Unnamed Analysis',
                    },
                  };
                  
                  await this.metadataService.saveMetadata(cacheKey, exportData);
                  stats.updated++;
                } else {
                  stats.cached++;
                }
                } catch (error) {
                  logger.error(`Error processing analysis ${summary.AnalysisId}:`, error);
                  stats.errors++;
                }
              })
            )
          );
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error listing analyses:', error);
        throw error;
      }
    } while (nextToken);

    return stats;
  }

  private async exportDatasources(forceRefresh: boolean) {
    const stats = { total: 0, updated: 0, cached: 0, errors: 0 };
    let nextToken: string | undefined;

    do {
      try {
        const command = new ListDataSourcesCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.DataSources) {
          stats.total += response.DataSources.length;
          
          // Update progress with total count
          this.updateProgress('datasources', { 
            total: stats.total,
            message: `Processing ${response.DataSources.length} datasources...`
          });

          // Process with concurrency limit
          await Promise.all(
            response.DataSources.map((summary) => 
              this.concurrencyLimit(async () => {
                try {
                  if (!summary.DataSourceId || !summary.Arn) return;
                  
                  // Update progress
                  this.updateProgress('datasources', {
                    current: stats.updated + stats.cached + stats.errors,
                    message: `Processing datasource: ${summary.Name || summary.DataSourceId}`
                  });
                
                  const cacheKey = `assets/datasources/${summary.DataSourceId}.json`;
                const existingData = await this.metadataService.getMetadata(cacheKey);
                const existingMetadata = existingData?.['@metadata'];
                
                const needsUpdate = forceRefresh || 
                  !existingMetadata?.exportTime ||
                  this.isStale(existingMetadata.exportTime) ||
                  (summary.LastUpdatedTime && existingMetadata?.lastModifiedTime && 
                   new Date(summary.LastUpdatedTime) > new Date(existingMetadata.lastModifiedTime));

                if (needsUpdate) {
                  // Fetch datasource details
                  const detailCommand = new DescribeDataSourceCommand({
                    AwsAccountId: this.awsAccountId,
                    DataSourceId: summary.DataSourceId,
                  });
                  
                  const detailResponse = await this.client.send(detailCommand);
                  
                  // Fetch permissions
                  const permissions = await this.permissionsService.getDataSourcePermissions(summary.DataSourceId);
                  
                  // Fetch tags
                  const tags = await this.tagService.getResourceTags('datasource', summary.DataSourceId);
                  
                  const exportData: any = {
                    DataSource: detailResponse.DataSource,
                    Permissions: permissions,
                    Tags: tags,
                    '@metadata': {
                      exportTime: new Date().toISOString(),
                      lastModifiedTime: summary.LastUpdatedTime,
                      name: summary.Name || 'Unnamed DataSource',
                      type: summary.Type,
                    },
                  };
                  
                  await this.metadataService.saveMetadata(cacheKey, exportData);
                  stats.updated++;
                } else {
                  stats.cached++;
                }
                } catch (error) {
                  logger.error(`Error processing datasource ${summary.DataSourceId}:`, error);
                  stats.errors++;
                }
              })
            )
          );
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error listing datasources:', error);
        throw error;
      }
    } while (nextToken);

    return stats;
  }

  private isStale(lastExportTime: string): boolean {
    const lastExport = new Date(lastExportTime);
    const now = new Date();
    return differenceInMinutes(now, lastExport) > this.cacheValidityMinutes;
  }

  async getExportSummary() {
    try {
      const summary = await this.metadataService.getMetadata('assets/export-summary.json');
      return summary;
    } catch (error) {
      logger.info('No export summary found yet');
      return null;
    }
  }

  async getAllAssets() {
    const allAssets: Array<{
      type: string;
      name: string;
      id: string;
      fileSize: number;
      lastExported: Date;
      s3Key: string;
      permissions?: any[];
      tags?: any[];
    }> = [];

    try {
      // List all objects in the assets directory
      const objects = await this.metadataService.listObjects('assets/');
      
      // Filter out non-JSON files and the export summary
      const assetFiles = objects.filter(obj => 
        obj.key.endsWith('.json') && 
        !obj.key.endsWith('export-summary.json')
      );

      // Process each asset file
      for (const obj of assetFiles) {
        const parts = obj.key.split('/');
        if (parts.length >= 3) {
          const type = parts[1]; // dashboards, datasets, analyses, datasources
          const filename = parts[parts.length - 1];
          const id = filename.replace('.json', '');
          
          // Try to get the asset metadata including permissions and tags
          let name = id;
          let permissions: any[] = [];
          let tags: any[] = [];
          try {
            const metadata = await this.metadataService.getMetadata(obj.key);
            name = metadata['@metadata']?.name || 
                   metadata.Dashboard?.Name || 
                   metadata.DataSet?.Name || 
                   metadata.Analysis?.Name || 
                   metadata.DataSource?.Name ||
                   id;
            permissions = metadata.Permissions || [];
            tags = metadata.Tags || [];
          } catch (error) {
            // If we can't read the metadata, just use the ID
            logger.debug(`Could not read metadata for ${obj.key}`);
          }
          
          // Handle special case for analyses -> analysis
          let assetType: string;
          if (type === 'analyses') {
            assetType = 'analysis';
          } else {
            assetType = type.slice(0, -1); // Remove 's' from end
          }
          
          allAssets.push({
            type: assetType,
            name,
            id,
            fileSize: obj.size,
            lastExported: obj.lastModified,
            s3Key: obj.key,
            permissions,
            tags,
          });
        }
      }

      // Sort by last exported date, newest first
      allAssets.sort((a, b) => b.lastExported.getTime() - a.lastExported.getTime());
      
      // Get export summary
      const summary = await this.getExportSummary();
      
      return {
        assets: allAssets,
        summary,
        totalSize: allAssets.reduce((sum, asset) => sum + asset.fileSize, 0),
      };
    } catch (error) {
      logger.error('Error getting all assets:', error);
      return {
        assets: allAssets,
        summary: null,
        totalSize: 0,
      };
    }
  }

  // Session management methods
  async startExportSession(): Promise<string> {
    const sessionId = `export-${Date.now()}`;
    this.currentSession = {
      sessionId,
      startTime: new Date().toISOString(),
      status: 'running',
      progress: {
        dashboards: { status: 'idle', current: 0, total: 0, message: 'Waiting to start' },
        datasets: { status: 'idle', current: 0, total: 0, message: 'Waiting to start' },
        analyses: { status: 'idle', current: 0, total: 0, message: 'Waiting to start' },
        datasources: { status: 'idle', current: 0, total: 0, message: 'Waiting to start' },
      },
    };
    
    await this.saveSessionState();
    return sessionId;
  }

  async getExportSession(sessionId?: string): Promise<ExportSession | null> {
    if (sessionId) {
      try {
        const session = await this.metadataService.getMetadata(`sessions/${sessionId}.json`);
        return session;
      } catch (error) {
        return null;
      }
    }
    return this.currentSession;
  }

  async getCurrentProgress(): Promise<ExportProgress | null> {
    if (!this.currentSession) return null;
    
    // Calculate overall progress
    const progress = this.currentSession.progress;
    const totalItems = Object.values(progress).reduce((sum, p) => sum + p.total, 0);
    const currentItems = Object.values(progress).reduce((sum, p) => sum + p.current, 0);
    
    return {
      status: this.currentSession.status as any,
      current: currentItems,
      total: totalItems,
      message: `Exporting assets: ${currentItems}/${totalItems}`,
      startTime: this.currentSession.startTime,
      duration: Date.now() - new Date(this.currentSession.startTime).getTime(),
    };
  }

  private async saveSessionState() {
    if (!this.currentSession) return;
    
    try {
      await this.metadataService.saveMetadata(
        `sessions/${this.currentSession.sessionId}.json`,
        this.currentSession
      );
    } catch (error) {
      logger.error('Error saving session state:', error);
    }
  }

  private updateProgress(
    assetType: 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    update: Partial<ExportProgress>
  ) {
    if (!this.currentSession) return;
    
    this.currentSession.progress[assetType] = {
      ...this.currentSession.progress[assetType],
      ...update,
    };
    
    // Don't await to avoid blocking
    this.saveSessionState().catch(err => 
      logger.error('Error updating progress:', err)
    );
  }

  // Export individual asset types with progress tracking
  async exportDashboardsWithProgress(forceRefresh = false) {
    const assetType = 'dashboards';
    this.updateProgress(assetType, { 
      status: 'running', 
      message: 'Listing dashboards...',
      startTime: new Date().toISOString()
    });

    try {
      const result = await this.exportDashboards(forceRefresh);
      
      this.updateProgress(assetType, {
        status: 'completed',
        current: result.total,
        total: result.total,
        message: `Completed: ${result.updated} updated, ${result.cached} cached, ${result.errors} errors`,
        duration: Date.now() - new Date(this.currentSession!.progress[assetType].startTime!).getTime()
      });

      return result;
    } catch (error: any) {
      this.updateProgress(assetType, {
        status: 'error',
        message: `Error: ${error.message}`,
        errors: [error.message]
      });
      throw error;
    }
  }

  async exportDatasetsWithProgress(forceRefresh = false) {
    const assetType = 'datasets';
    this.updateProgress(assetType, { 
      status: 'running', 
      message: 'Listing datasets...',
      startTime: new Date().toISOString()
    });

    try {
      const result = await this.exportDatasets(forceRefresh);
      
      this.updateProgress(assetType, {
        status: 'completed',
        current: result.total,
        total: result.total,
        message: `Completed: ${result.updated} updated, ${result.cached} cached, ${result.errors} errors`,
        duration: Date.now() - new Date(this.currentSession!.progress[assetType].startTime!).getTime()
      });

      return result;
    } catch (error: any) {
      this.updateProgress(assetType, {
        status: 'error',
        message: `Error: ${error.message}`,
        errors: [error.message]
      });
      throw error;
    }
  }

  async exportAnalysesWithProgress(forceRefresh = false) {
    const assetType = 'analyses';
    this.updateProgress(assetType, { 
      status: 'running', 
      message: 'Listing analyses...',
      startTime: new Date().toISOString()
    });

    try {
      const result = await this.exportAnalyses(forceRefresh);
      
      this.updateProgress(assetType, {
        status: 'completed',
        current: result.total,
        total: result.total,
        message: `Completed: ${result.updated} updated, ${result.cached} cached, ${result.errors} errors`,
        duration: Date.now() - new Date(this.currentSession!.progress[assetType].startTime!).getTime()
      });

      return result;
    } catch (error: any) {
      this.updateProgress(assetType, {
        status: 'error',
        message: `Error: ${error.message}`,
        errors: [error.message]
      });
      throw error;
    }
  }

  async exportDatasourcesWithProgress(forceRefresh = false) {
    const assetType = 'datasources';
    this.updateProgress(assetType, { 
      status: 'running', 
      message: 'Listing datasources...',
      startTime: new Date().toISOString()
    });

    try {
      const result = await this.exportDatasources(forceRefresh);
      
      this.updateProgress(assetType, {
        status: 'completed',
        current: result.total,
        total: result.total,
        message: `Completed: ${result.updated} updated, ${result.cached} cached, ${result.errors} errors`,
        duration: Date.now() - new Date(this.currentSession!.progress[assetType].startTime!).getTime()
      });

      return result;
    } catch (error: any) {
      this.updateProgress(assetType, {
        status: 'error',
        message: `Error: ${error.message}`,
        errors: [error.message]
      });
      throw error;
    }
  }

  async completeExportSession(summary: AssetExportResult) {
    if (!this.currentSession) return;
    
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.status = 'completed';
    this.currentSession.summary = summary;
    
    // Save the session state
    await this.saveSessionState();
    
    // Also save the export summary in the standard location
    await this.metadataService.saveMetadata('assets/export-summary.json', {
      lastExport: summary,
      totalAssets: summary.dashboards.total + summary.datasets.total + summary.analyses.total + summary.datasources.total,
    });
    
    // Clear current session
    this.currentSession = null;
  }
}