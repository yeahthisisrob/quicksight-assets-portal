import { AssetExportOrchestrator } from './export/AssetExportOrchestrator';
import { logger } from '../utils/logger';

export interface LineageRelationship {
  sourceAssetId: string;
  sourceAssetType: 'dashboard' | 'analysis' | 'dataset' | 'datasource';
  sourceAssetName: string;
  targetAssetId: string;
  targetAssetType: 'dashboard' | 'analysis' | 'dataset' | 'datasource';
  targetAssetName: string;
  relationshipType: 'uses' | 'used_by';
}

export interface AssetLineage {
  assetId: string;
  assetType: 'dashboard' | 'analysis' | 'dataset' | 'datasource';
  assetName: string;
  relationships: LineageRelationship[];
}

export class LineageService {
  private assetExportService: AssetExportOrchestrator;

  constructor() {
    this.assetExportService = new AssetExportOrchestrator();
  }

  async buildLineageMap(): Promise<Map<string, AssetLineage>> {
    const lineageMap = new Map<string, AssetLineage>();
    
    try {
      // Get all assets
      const allAssets = await this.assetExportService.getAllAssets();
      logger.info(`Building lineage for ${allAssets.assets.length} assets`);
      
      // Initialize lineage entries for all assets
      for (const asset of allAssets.assets) {
        lineageMap.set(asset.id, {
          assetId: asset.id,
          assetType: asset.type as any,
          assetName: asset.name,
          relationships: [],
        });
      }

      // Process each asset type to extract relationships
      let processedCount = 0;
      for (const asset of allAssets.assets) {
        try {
          // Map asset types to correct endpoint names
          const endpointMap: { [key: string]: string } = {
            dashboard: 'dashboards',
            analysis: 'analyses', 
            dataset: 'datasets',
            datasource: 'datasources',
          };
          
          const endpoint = endpointMap[asset.type];
          if (!endpoint) {
            logger.warn(`Unknown asset type: ${asset.type}`);
            continue;
          }
          
          const assetData = await this.assetExportService.getAsset(endpoint as any, asset.id);
          
          if (!assetData) {
            logger.warn(`No asset data found for ${asset.type} ${asset.id}`);
            continue;
          }

          if (asset.type === 'dashboard') {
            await this.processDashboardLineage(asset, assetData, lineageMap);
          } else if (asset.type === 'analysis') {
            await this.processAnalysisLineage(asset, assetData, lineageMap);
          } else if (asset.type === 'dataset') {
            await this.processDatasetLineage(asset, assetData, lineageMap);
          }
          processedCount++;
        } catch (error) {
          logger.warn(`Failed to process lineage for ${asset.type} ${asset.id}:`, error);
        }
      }

      logger.info(`Processed lineage for ${processedCount}/${allAssets.assets.length} assets`);
      
      // Log summary of relationships found
      let totalRelationships = 0;
      lineageMap.forEach((lineage) => {
        totalRelationships += lineage.relationships.length;
      });
      logger.info(`Found ${totalRelationships} total relationships`);

      // Build transitive dependencies for datasources
      this.buildTransitiveDependencies(lineageMap);

      return lineageMap;
    } catch (error) {
      logger.error('Error building lineage map:', error);
      throw error;
    }
  }

  private async processDashboardLineage(
    dashboard: any, 
    dashboardData: any, 
    lineageMap: Map<string, AssetLineage>,
  ) {
    const dashboardLineage = lineageMap.get(dashboard.id);
    if (!dashboardLineage) return;

    logger.debug(`Processing dashboard lineage for ${dashboard.id}`, {
      hasDashboard: !!dashboardData.Dashboard,
      hasVersion: !!dashboardData.Dashboard?.Version,
      hasSourceEntityArn: !!dashboardData.Dashboard?.Version?.SourceEntityArn,
      hasDefinition: !!dashboardData.Definition,
    });

    // Extract source analysis from dashboard version
    const sourceAnalysisId = dashboardData.Dashboard?.Version?.SourceEntityArn?.split('/').pop();
    if (sourceAnalysisId) {
      logger.debug(`Found source analysis: ${sourceAnalysisId} for dashboard ${dashboard.id}`);
      const analysisLineage = lineageMap.get(sourceAnalysisId);
      if (analysisLineage) {
        // Dashboard uses analysis
        dashboardLineage.relationships.push({
          sourceAssetId: dashboard.id,
          sourceAssetType: 'dashboard',
          sourceAssetName: dashboard.name,
          targetAssetId: sourceAnalysisId,
          targetAssetType: 'analysis',
          targetAssetName: analysisLineage.assetName,
          relationshipType: 'uses',
        });

        // Analysis used by dashboard
        analysisLineage.relationships.push({
          sourceAssetId: sourceAnalysisId,
          sourceAssetType: 'analysis',
          sourceAssetName: analysisLineage.assetName,
          targetAssetId: dashboard.id,
          targetAssetType: 'dashboard',
          targetAssetName: dashboard.name,
          relationshipType: 'used_by',
        });
        logger.debug(`Added analysis-dashboard relationship: ${sourceAnalysisId} <-> ${dashboard.id}`);
      } else {
        logger.warn(`Analysis ${sourceAnalysisId} not found in lineage map for dashboard ${dashboard.id}`);
      }
    } else {
      logger.debug(`No source analysis found for dashboard ${dashboard.id}`);
    }

    // Extract datasets used by dashboard
    this.extractDatasetUsage(dashboardData.Definition, dashboard, dashboardLineage, lineageMap);
  }

  private async processAnalysisLineage(
    analysis: any, 
    analysisData: any, 
    lineageMap: Map<string, AssetLineage>,
  ) {
    const analysisLineage = lineageMap.get(analysis.id);
    if (!analysisLineage) return;

    // Extract datasets used by analysis
    this.extractDatasetUsage(analysisData.Definition, analysis, analysisLineage, lineageMap);
  }

  private async processDatasetLineage(
    dataset: any, 
    datasetData: any, 
    lineageMap: Map<string, AssetLineage>,
  ) {
    const datasetLineage = lineageMap.get(dataset.id);
    if (!datasetLineage) return;

    // Extract datasources used by dataset
    if (datasetData.DataSet?.PhysicalTableMap) {
      const tables = Object.values(datasetData.DataSet.PhysicalTableMap) as any[];
      
      for (const table of tables) {
        let datasourceId: string | null = null;
        
        if (table.RelationalTable?.DataSourceArn) {
          datasourceId = table.RelationalTable.DataSourceArn.split('/').pop();
        } else if (table.S3Source?.DataSourceArn) {
          datasourceId = table.S3Source.DataSourceArn.split('/').pop();
        }
        
        if (datasourceId) {
          const datasourceLineage = lineageMap.get(datasourceId);
          if (datasourceLineage) {
            // Dataset uses datasource
            datasetLineage.relationships.push({
              sourceAssetId: dataset.id,
              sourceAssetType: 'dataset',
              sourceAssetName: dataset.name,
              targetAssetId: datasourceId,
              targetAssetType: 'datasource',
              targetAssetName: datasourceLineage.assetName,
              relationshipType: 'uses',
            });

            // Datasource used by dataset
            datasourceLineage.relationships.push({
              sourceAssetId: datasourceId,
              sourceAssetType: 'datasource',
              sourceAssetName: datasourceLineage.assetName,
              targetAssetId: dataset.id,
              targetAssetType: 'dataset',
              targetAssetName: dataset.name,
              relationshipType: 'used_by',
            });
          }
        }
      }
    }
  }

  private extractDatasetUsage(
    definition: any,
    asset: any,
    assetLineage: AssetLineage,
    lineageMap: Map<string, AssetLineage>,
  ) {
    // Check both DataSetIdentifierDeclarations (new format) and DataSetIdentifierMap (old format)
    let datasetIds: string[] = [];
    
    if (definition?.DataSetIdentifierDeclarations) {
      datasetIds = definition.DataSetIdentifierDeclarations.map((decl: any) => 
        decl.DataSetArn?.split('/').pop(),
      ).filter(Boolean);
    } else if (definition?.DataSetIdentifierMap) {
      datasetIds = Object.keys(definition.DataSetIdentifierMap);
    } else {
      return; // No dataset usage found
    }
    
    for (const datasetId of datasetIds) {
      const datasetLineage = lineageMap.get(datasetId);
      if (datasetLineage) {
        // Asset uses dataset
        assetLineage.relationships.push({
          sourceAssetId: asset.id,
          sourceAssetType: asset.type,
          sourceAssetName: asset.name,
          targetAssetId: datasetId,
          targetAssetType: 'dataset',
          targetAssetName: datasetLineage.assetName,
          relationshipType: 'uses',
        });

        // Dataset used by asset
        datasetLineage.relationships.push({
          sourceAssetId: datasetId,
          sourceAssetType: 'dataset',
          sourceAssetName: datasetLineage.assetName,
          targetAssetId: asset.id,
          targetAssetType: asset.type,
          targetAssetName: asset.name,
          relationshipType: 'used_by',
        });
      }
    }
  }

  private buildTransitiveDependencies(lineageMap: Map<string, AssetLineage>) {
    // Build transitive dependencies in both directions
    
    // 1. For each datasource, find all transitive dependencies (analyses and dashboards)
    lineageMap.forEach((lineage) => {
      if (lineage.assetType === 'datasource') {
        const transitiveRelationships: LineageRelationship[] = [];
        
        // Find datasets that use this datasource
        const directDatasets = lineage.relationships
          .filter(rel => rel.relationshipType === 'used_by' && rel.targetAssetType === 'dataset')
          .map(rel => rel.targetAssetId);
        
        // For each dataset, find what uses it (analyses and dashboards)
        directDatasets.forEach(datasetId => {
          const datasetLineage = lineageMap.get(datasetId);
          if (datasetLineage) {
            datasetLineage.relationships
              .filter(rel => rel.relationshipType === 'used_by' && 
                            (rel.targetAssetType === 'analysis' || rel.targetAssetType === 'dashboard'))
              .forEach(rel => {
                // Add transitive relationship
                transitiveRelationships.push({
                  sourceAssetId: lineage.assetId,
                  sourceAssetType: 'datasource',
                  sourceAssetName: lineage.assetName,
                  targetAssetId: rel.targetAssetId,
                  targetAssetType: rel.targetAssetType,
                  targetAssetName: rel.targetAssetName,
                  relationshipType: 'used_by',
                });
              });
          }
        });
        
        // Add transitive relationships to datasource (deduplicate)
        transitiveRelationships.forEach(newRel => {
          const exists = lineage.relationships.some(existingRel => 
            existingRel.targetAssetId === newRel.targetAssetId && 
            existingRel.targetAssetType === newRel.targetAssetType &&
            existingRel.relationshipType === newRel.relationshipType,
          );
          if (!exists) {
            lineage.relationships.push(newRel);
          }
        });
      }
    });

    // 2. For each dashboard and analysis, find datasources they indirectly use through datasets
    lineageMap.forEach((lineage) => {
      if (lineage.assetType === 'dashboard' || lineage.assetType === 'analysis') {
        const transitiveRelationships: LineageRelationship[] = [];
        
        // Find datasets that this asset uses
        const usedDatasets = lineage.relationships
          .filter(rel => rel.relationshipType === 'uses' && rel.targetAssetType === 'dataset')
          .map(rel => rel.targetAssetId);
        
        // For each dataset, find what datasources it uses
        usedDatasets.forEach(datasetId => {
          const datasetLineage = lineageMap.get(datasetId);
          if (datasetLineage) {
            datasetLineage.relationships
              .filter(rel => rel.relationshipType === 'uses' && rel.targetAssetType === 'datasource')
              .forEach(rel => {
                // Add transitive relationship
                transitiveRelationships.push({
                  sourceAssetId: lineage.assetId,
                  sourceAssetType: lineage.assetType,
                  sourceAssetName: lineage.assetName,
                  targetAssetId: rel.targetAssetId,
                  targetAssetType: rel.targetAssetType,
                  targetAssetName: rel.targetAssetName,
                  relationshipType: 'uses',
                });
              });
          }
        });
        
        // Add transitive relationships to dashboard/analysis (deduplicate)
        transitiveRelationships.forEach(newRel => {
          const exists = lineage.relationships.some(existingRel => 
            existingRel.targetAssetId === newRel.targetAssetId && 
            existingRel.targetAssetType === newRel.targetAssetType &&
            existingRel.relationshipType === newRel.relationshipType,
          );
          if (!exists) {
            lineage.relationships.push(newRel);
          }
        });
      }
    });
  }

  async getAssetLineage(assetId: string): Promise<AssetLineage | null> {
    try {
      const lineageMap = await this.buildLineageMap();
      return lineageMap.get(assetId) || null;
    } catch (error) {
      logger.error(`Error getting lineage for asset ${assetId}:`, error);
      return null;
    }
  }

  async getAllLineage(): Promise<AssetLineage[]> {
    try {
      const lineageMap = await this.buildLineageMap();
      return Array.from(lineageMap.values());
    } catch (error) {
      logger.error('Error getting all lineage:', error);
      return [];
    }
  }
}