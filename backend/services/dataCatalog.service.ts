import { AssetExportOrchestrator } from './export/AssetExportOrchestrator';
import { AssetParserService } from './assetParser.service';
import { MetadataService } from './metadata.service';
import { FieldMetadataService } from './fieldMetadata.service';
import { logger } from '../utils/logger';

export interface CatalogField {
  fieldId: string;
  fieldName: string;
  dataType?: string;
  isCalculated: boolean;
  expression?: string;
  hasVariants?: boolean;
  usageCount?: number;
  semanticFieldId?: string; // For semantic mapping: {sourceType}:{sourceId}:{fieldName}
  expressions?: Array<{
    expression: string;
    sources: Array<{
      assetType: 'dataset' | 'analysis' | 'dashboard';
      assetId: string;
      assetName: string;
      datasetId?: string;
      datasetName?: string;
      datasourceType?: string;
      importMode?: 'SPICE' | 'DIRECT_QUERY';
      lastModified?: Date;
    }>;
  }>;
  sources: Array<{
    assetType: 'dataset' | 'analysis' | 'dashboard';
    assetId: string;
    assetName: string;
    datasetId?: string;
    datasetName?: string;
    datasourceType?: string;
    importMode?: 'SPICE' | 'DIRECT_QUERY';
    lastModified?: Date;
    usedInVisuals?: boolean;
    usedInCalculatedFields?: boolean;
  }>;
  lineage?: {
    datasetId?: string;
    datasetName?: string;
    datasourceType?: string;
    importMode?: 'SPICE' | 'DIRECT_QUERY';
    analysisIds?: string[];
    dashboardIds?: string[];
  };
  customMetadata?: {
    tags?: string[];
    description?: string;
    dataClassification?: string;
    isPII?: boolean;
    isSensitive?: boolean;
  };
}

export interface DataCatalogResult {
  fields: CatalogField[];
  calculatedFields: CatalogField[];
  summary: {
    totalFields: number;
    totalCalculatedFields: number;
    totalDatasets: number;
    totalAnalyses: number;
    totalDashboards: number;
    lastUpdated: Date;
  };
}

export class DataCatalogService {
  private assetParserService: AssetParserService;
  private metadataService: MetadataService;
  private fieldMetadataService: FieldMetadataService;

  constructor() {
    this.assetParserService = new AssetParserService();
    this.metadataService = new MetadataService();
    this.fieldMetadataService = new FieldMetadataService();
  }

  /**
   * Get all exported assets from S3
   */
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
      // Try to use optimized index first
      try {
        const index = await this.metadataService.getMetadata('assets/index/master-index.json');
        if (index && index.assetsByType) {
          logger.info('Using optimized index for getAllAssets');
          
          // Convert index format to getAllAssets format
          for (const [type, assets] of Object.entries(index.assetsByType)) {
            for (const asset of assets as any[]) {
              allAssets.push({
                type: type.slice(0, -1), // Remove 's' from type
                name: asset.name,
                id: asset.id,
                fileSize: asset.fileSize || 0,
                lastExported: asset.lastExported ? new Date(asset.lastExported) : new Date(),
                s3Key: asset.s3Key,
                permissions: asset.permissions || [],
                tags: asset.tags || [],
                // Include asset-specific fields for frontend
                ...asset, // Spread all asset properties
              });
            }
          }
          
          return {
            assets: allAssets,
            summary: null,
            totalSize: allAssets.reduce((sum, asset) => sum + asset.fileSize, 0),
          };
        }
      } catch (indexError) {
        logger.debug('No optimized index available, falling back to file listing');
      }

      // Fall back to original method
      // List all objects in the assets directory
      const objects = await this.metadataService.listObjects('assets/');
      
      // Filter out non-JSON files, export summary, and index files
      const assetFiles = objects.filter(obj => 
        obj.key.endsWith('.json') && 
        !obj.key.endsWith('export-summary.json') &&
        !obj.key.includes('/index/'),
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
          } catch {
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
      
      return {
        assets: allAssets,
        summary: null,
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

  /**
   * Extract field references from a calculated field expression
   */
  private extractFieldReferences(expression: string): string[] {
    const fieldReferences: string[] = [];
    
    // QuickSight calculated field expressions use curly braces for field references
    // e.g., {Sales Amount} + {Tax Amount}
    const fieldPattern = /\{([^}]+)\}/g;
    let match;
    
    while ((match = fieldPattern.exec(expression)) !== null) {
      const fieldName = match[1].trim();
      if (fieldName && !fieldReferences.includes(fieldName)) {
        fieldReferences.push(fieldName);
      }
    }
    
    return fieldReferences;
  }

  async buildDataCatalog(): Promise<DataCatalogResult> {
    try {
      // First check if we have a cached catalog in S3
      try {
        const cachedCatalog = await this.metadataService.getMetadata('catalog/data-catalog.json');
        if (cachedCatalog && cachedCatalog.fields && cachedCatalog.calculatedFields) {
          logger.info('Returning cached data catalog from S3');
          return cachedCatalog;
        } else {
          logger.info('Cached catalog exists but is empty, rebuilding');
        }
      } catch (error) {
        logger.info('No cached catalog found, building new one');
      }

      logger.info('Building data catalog...');
      
      // Get all exported assets directly from S3
      const assetsData = await this.getAllAssets();
      logger.info('Found assets for catalog', { 
        totalAssets: assetsData?.assets?.length || 0,
        assetTypes: assetsData?.assets?.map(a => a.type) || [],
      });
      
      // If no assets have been exported yet, return empty catalog
      if (!assetsData || !assetsData.assets || assetsData.assets.length === 0) {
        logger.info('No exported assets found, returning empty catalog');
        const emptyCatalog = {
          fields: [],
          calculatedFields: [],
          summary: {
            totalFields: 0,
            totalCalculatedFields: 0,
            totalDatasets: 0,
            totalAnalyses: 0,
            totalDashboards: 0,
            lastUpdated: new Date(),
          },
        };
        
        // Don't cache empty catalog, let it rebuild when assets are available
        return emptyCatalog;
      }
      
      const fieldMap = new Map<string, CatalogField>();
      
      const summary = {
        totalFields: 0,
        totalCalculatedFields: 0,
        totalDatasets: 0,
        totalAnalyses: 0,
        totalDashboards: 0,
        lastUpdated: new Date(),
      };

      // Process datasets first to establish base fields
      const datasetMap = new Map<string, { id: string; name: string; fields: any[]; arn?: string; datasourceType?: string; importMode?: 'SPICE' | 'DIRECT_QUERY' }>();
      
      // First, build a complete map of ALL datasets from the assets list
      for (const asset of assetsData.assets) {
        if (asset.type === 'dataset') {
          summary.totalDatasets++;
          datasetMap.set(asset.id, {
            id: asset.id,
            name: asset.name,
            fields: [],
            arn: undefined,
          });
        }
      }
      
      // Then process each dataset to get fields
      for (const asset of assetsData.assets) {
        if (asset.type === 'dataset') {
          const assetData = await this.metadataService.getMetadata(`assets/datasets/${asset.id}.json`);
          const parsed = this.assetParserService.parseDataset(assetData);
          
          // Update dataset info with parsed data
          const datasetInfo = datasetMap.get(asset.id);
          if (datasetInfo) {
            datasetInfo.fields = [...parsed.fields, ...parsed.calculatedFields];
            datasetInfo.arn = assetData.DataSet?.Arn;
            datasetInfo.importMode = assetData.DataSet?.ImportMode;
            
            // Determine datasource type
            if (assetData.DataSet?.PhysicalTableMap) {
              const tables = Object.values(assetData.DataSet.PhysicalTableMap) as any[];
              if (tables.length > 0) {
                const table = tables[0];
                if (table.S3Source) {
                  datasetInfo.datasourceType = 'S3';
                } else if (table.RelationalTable) {
                  // Try to determine the database type from datasource parameters
                  if (table.RelationalTable.DataSourceArn) {
                    const datasourceArn = table.RelationalTable.DataSourceArn;
                    if (datasourceArn.includes('redshift')) {
                      datasetInfo.datasourceType = 'Redshift';
                    } else if (datasourceArn.includes('athena')) {
                      datasetInfo.datasourceType = 'Athena';
                    } else if (datasourceArn.includes('rds')) {
                      datasetInfo.datasourceType = 'RDS';
                    } else if (datasourceArn.includes('aurora')) {
                      datasetInfo.datasourceType = 'Aurora';
                    } else if (datasourceArn.includes('postgresql')) {
                      datasetInfo.datasourceType = 'PostgreSQL';
                    } else if (datasourceArn.includes('mysql')) {
                      datasetInfo.datasourceType = 'MySQL';
                    } else {
                      datasetInfo.datasourceType = 'Database';
                    }
                  } else {
                    datasetInfo.datasourceType = 'Database';
                  }
                } else if (table.CustomSql) {
                  datasetInfo.datasourceType = 'Custom SQL';
                }
              }
            }
            
            // Check for uploaded files
            if (!datasetInfo.datasourceType && parsed.datasourceInfo?.type) {
              datasetInfo.datasourceType = parsed.datasourceInfo.type === 'UPLOADED_FILE' ? 'Uploaded File' : parsed.datasourceInfo.type;
            }
          }
          
          // Process regular fields from dataset
          for (const field of parsed.fields) {
            const fieldKey = `${field.fieldName}::${asset.id}`;
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: field.fieldId,
              fieldName: field.fieldName,
              dataType: field.dataType,
              isCalculated: false,
              sources: [],
              lineage: {
                datasetId: asset.id,
                datasetName: asset.name,
                datasourceType: datasetInfo?.datasourceType,
                importMode: datasetInfo?.importMode,
                analysisIds: [],
                dashboardIds: [],
              },
            };
            
            catalogField.sources.push({
              assetType: 'dataset',
              assetId: asset.id,
              assetName: asset.name,
              lastModified: asset.lastExported,
            });
            
            fieldMap.set(fieldKey, catalogField);
          }
          
          // Process calculated fields from dataset
          for (const calcField of parsed.calculatedFields) {
            const fieldKey = `${calcField.name}::${asset.id}::calculated`;
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: calcField.name,
              fieldName: calcField.name,
              dataType: 'Calculated',
              isCalculated: true,
              expression: calcField.expression,
              sources: [],
              lineage: {
                datasetId: asset.id,
                datasetName: asset.name,
                datasourceType: datasetInfo?.datasourceType,
                importMode: datasetInfo?.importMode,
                analysisIds: [],
                dashboardIds: [],
              },
            };
            
            catalogField.sources.push({
              assetType: 'dataset',
              assetId: asset.id,
              assetName: asset.name,
              lastModified: asset.lastExported,
            });
            
            fieldMap.set(fieldKey, catalogField);
            
            // Mark fields referenced in the calculated field expression as being used
            const referencedFields = this.extractFieldReferences(calcField.expression);
            for (const refFieldName of referencedFields) {
              // Try to find the field in the same dataset
              const refFieldKey = `${refFieldName}::${asset.id}`;
              const refField = fieldMap.get(refFieldKey);
              
              if (refField) {
                // Find if this source already exists and update it
                const existingSource = refField.sources.find(s => 
                  s.assetType === 'dataset' && s.assetId === asset.id,
                );
                
                if (existingSource) {
                  existingSource.usedInCalculatedFields = true;
                }
              }
            }
          }
        }
      }

      // Process analyses
      for (const asset of assetsData.assets) {
        if (asset.type === 'analysis') {
          summary.totalAnalyses++;
          const assetData = await this.metadataService.getMetadata(`assets/analyses/${asset.id}.json`);
          const parsed = this.assetParserService.parseAnalysis(assetData);
          
          // Map datasets used in this analysis
          const usedDatasets = new Map<string, { id: string; name: string }>();
          for (const ds of parsed.dataSets) {
            // Try to find dataset by ARN first (most reliable)
            let datasetInfo = Array.from(datasetMap.values()).find(d => 
              d.arn === ds.arn,
            );
            
            // If not found by ARN, try by identifier or name
            if (!datasetInfo) {
              datasetInfo = Array.from(datasetMap.values()).find(d => 
                d.id === ds.identifier || d.name === ds.name,
              );
            }
            
            if (datasetInfo) {
              usedDatasets.set(ds.identifier, { id: datasetInfo.id, name: datasetInfo.name });
            } else {
              // Even if we can't find the dataset in our map, we might have the name from the identifier
              logger.debug(`Dataset not found in map: ${ds.identifier}, ARN: ${ds.arn}`);
              usedDatasets.set(ds.identifier, { 
                id: ds.identifier, 
                name: ds.name || ds.identifier, 
              });
            }
          }
          
          // Track fields used in visuals
          const fieldsUsedInVisuals = new Set<string>();
          for (const field of parsed.fields) {
            const datasetInfo = field.dataSetIdentifier ? usedDatasets.get(field.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const fieldKey = datasetId ? `${field.fieldName}::${datasetId}` : `${field.fieldName}::unknown`;
            fieldsUsedInVisuals.add(fieldKey);
          }

          // Process fields referenced in analysis
          for (const field of parsed.fields) {
            const datasetInfo = field.dataSetIdentifier ? usedDatasets.get(field.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const datasetName = datasetInfo?.name;
            
            // Check if this field exists as a calculated field in the dataset
            const calcFieldKey = datasetId ? `${field.fieldName}::${datasetId}::calculated` : null;
            const isDatasetCalcField = calcFieldKey && fieldMap.has(calcFieldKey);
            
            // Use the calculated field key if it exists, otherwise use regular field key
            const fieldKey = isDatasetCalcField ? calcFieldKey : (datasetId ? `${field.fieldName}::${datasetId}` : `${field.fieldName}::unknown`);
            
            // If it's a dataset calculated field, get the existing entry
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: field.fieldId,
              fieldName: field.fieldName,
              dataType: field.dataType,
              isCalculated: false,
              sources: [],
              lineage: {
                datasetId,
                datasetName,
                datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                analysisIds: [],
                dashboardIds: [],
              },
            };
            
            catalogField.sources.push({
              assetType: 'analysis',
              assetId: asset.id,
              assetName: asset.name,
              datasetId,
              datasetName,
              datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
              importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
              lastModified: asset.lastExported,
              usedInVisuals: true,
            });
            
            if (catalogField.lineage && !catalogField.lineage.analysisIds?.includes(asset.id)) {
              catalogField.lineage.analysisIds?.push(asset.id);
            }
            
            fieldMap.set(fieldKey, catalogField);
          }
          
          // Process calculated fields in analysis
          for (const calcField of parsed.calculatedFields) {
            const datasetInfo = calcField.dataSetIdentifier ? usedDatasets.get(calcField.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const datasetName = datasetInfo?.name;
            const fieldKey = `${calcField.name}::analysis::${asset.id}::calculated`;
            
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: calcField.name,
              fieldName: calcField.name,
              dataType: 'Calculated',
              isCalculated: true,
              expression: calcField.expression,
              sources: [],
              lineage: {
                datasetId,
                datasetName,
                datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                analysisIds: [asset.id],
                dashboardIds: [],
              },
            };
            
            catalogField.sources.push({
              assetType: 'analysis',
              assetId: asset.id,
              assetName: asset.name,
              datasetId,
              datasetName,
              datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
              importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
              lastModified: asset.lastExported,
            });
            
            fieldMap.set(fieldKey, catalogField);
            
            // Mark fields referenced in the calculated field expression as being used
            const referencedFields = this.extractFieldReferences(calcField.expression);
            for (const refFieldName of referencedFields) {
              // Try to find the field in the catalog
              const refFieldKey = datasetId ? `${refFieldName}::${datasetId}` : `${refFieldName}::unknown`;
              const refField = fieldMap.get(refFieldKey);
              
              if (refField) {
                // Find if this source already exists and update it
                const existingSource = refField.sources.find(s => 
                  s.assetType === 'analysis' && s.assetId === asset.id,
                );
                
                if (existingSource) {
                  existingSource.usedInCalculatedFields = true;
                } else {
                  // Add a new source entry
                  refField.sources.push({
                    assetType: 'analysis',
                    assetId: asset.id,
                    assetName: asset.name,
                    datasetId,
                    datasetName,
                    datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                    importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                    lastModified: asset.lastExported,
                    usedInCalculatedFields: true,
                  });
                }
              }
            }
          }
        }
      }

      // Process dashboards
      for (const asset of assetsData.assets) {
        if (asset.type === 'dashboard') {
          summary.totalDashboards++;
          const assetData = await this.metadataService.getMetadata(`assets/dashboards/${asset.id}.json`);
          const parsed = this.assetParserService.parseDashboard(assetData);
          
          // Map datasets used in this dashboard
          const usedDatasets = new Map<string, { id: string; name: string }>();
          for (const ds of parsed.dataSets) {
            // Try to find dataset by ARN first (most reliable)
            let datasetInfo = Array.from(datasetMap.values()).find(d => 
              d.arn === ds.arn,
            );
            
            // If not found by ARN, try by identifier or name
            if (!datasetInfo) {
              datasetInfo = Array.from(datasetMap.values()).find(d => 
                d.id === ds.identifier || d.name === ds.name,
              );
            }
            
            if (datasetInfo) {
              usedDatasets.set(ds.identifier, { id: datasetInfo.id, name: datasetInfo.name });
            } else {
              // Even if we can't find the dataset in our map, we might have the name from the identifier
              logger.debug(`Dataset not found in map: ${ds.identifier}, ARN: ${ds.arn}`);
              usedDatasets.set(ds.identifier, { 
                id: ds.identifier, 
                name: ds.name || ds.identifier, 
              });
            }
          }
          
          // Track fields used in visuals
          const fieldsUsedInVisuals = new Set<string>();
          for (const field of parsed.fields) {
            const datasetInfo = field.dataSetIdentifier ? usedDatasets.get(field.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const fieldKey = datasetId ? `${field.fieldName}::${datasetId}` : `${field.fieldName}::unknown`;
            fieldsUsedInVisuals.add(fieldKey);
          }

          // Process fields referenced in dashboard
          for (const field of parsed.fields) {
            const datasetInfo = field.dataSetIdentifier ? usedDatasets.get(field.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const datasetName = datasetInfo?.name;
            
            // Check if this field exists as a calculated field in the dataset
            const calcFieldKey = datasetId ? `${field.fieldName}::${datasetId}::calculated` : null;
            const isDatasetCalcField = calcFieldKey && fieldMap.has(calcFieldKey);
            
            // Use the calculated field key if it exists, otherwise use regular field key
            const fieldKey = isDatasetCalcField ? calcFieldKey : (datasetId ? `${field.fieldName}::${datasetId}` : `${field.fieldName}::unknown`);
            
            // If it's a dataset calculated field, get the existing entry
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: field.fieldId,
              fieldName: field.fieldName,
              dataType: field.dataType,
              isCalculated: false,
              sources: [],
              lineage: {
                datasetId,
                datasetName,
                datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                analysisIds: [],
                dashboardIds: [],
              },
            };
            
            catalogField.sources.push({
              assetType: 'dashboard',
              assetId: asset.id,
              assetName: asset.name,
              datasetId,
              datasetName,
              datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
              importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
              lastModified: asset.lastExported,
              usedInVisuals: true,
            });
            
            if (catalogField.lineage && !catalogField.lineage.dashboardIds?.includes(asset.id)) {
              catalogField.lineage.dashboardIds?.push(asset.id);
            }
            
            fieldMap.set(fieldKey, catalogField);
          }
          
          // Process calculated fields in dashboard
          for (const calcField of parsed.calculatedFields) {
            const datasetInfo = calcField.dataSetIdentifier ? usedDatasets.get(calcField.dataSetIdentifier) : undefined;
            const datasetId = datasetInfo?.id;
            const datasetName = datasetInfo?.name;
            const fieldKey = `${calcField.name}::dashboard::${asset.id}::calculated`;
            
            const catalogField = fieldMap.get(fieldKey) || {
              fieldId: calcField.name,
              fieldName: calcField.name,
              dataType: 'Calculated',
              isCalculated: true,
              expression: calcField.expression,
              sources: [],
              lineage: {
                datasetId,
                datasetName,
                datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                analysisIds: [],
                dashboardIds: [asset.id],
              },
            };
            
            catalogField.sources.push({
              assetType: 'dashboard',
              assetId: asset.id,
              assetName: asset.name,
              datasetId,
              datasetName,
              datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
              importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
              lastModified: asset.lastExported,
            });
            
            fieldMap.set(fieldKey, catalogField);
            
            // Mark fields referenced in the calculated field expression as being used
            const referencedFields = this.extractFieldReferences(calcField.expression);
            for (const refFieldName of referencedFields) {
              // Try to find the field in the catalog
              const refFieldKey = datasetId ? `${refFieldName}::${datasetId}` : `${refFieldName}::unknown`;
              const refField = fieldMap.get(refFieldKey);
              
              if (refField) {
                // Find if this source already exists and update it
                const existingSource = refField.sources.find(s => 
                  s.assetType === 'dashboard' && s.assetId === asset.id,
                );
                
                if (existingSource) {
                  existingSource.usedInCalculatedFields = true;
                } else {
                  // Add a new source entry
                  refField.sources.push({
                    assetType: 'dashboard',
                    assetId: asset.id,
                    assetName: asset.name,
                    datasetId,
                    datasetName,
                    datasourceType: datasetId ? datasetMap.get(datasetId)?.datasourceType : undefined,
                    importMode: datasetId ? datasetMap.get(datasetId)?.importMode : undefined,
                    lastModified: asset.lastExported,
                    usedInCalculatedFields: true,
                  });
                }
              }
            }
          }
        }
      }

      // Convert map to arrays and merge by field name
      const allFields = Array.from(fieldMap.values());
      
      // Merge fields with the same name
      const mergedFieldMap = new Map<string, CatalogField>();
      
      for (const field of allFields) {
        // Use just the field name as the key - this will merge calculated and regular versions
        const key = field.fieldName;
        const existing = mergedFieldMap.get(key);
        
        if (existing) {
          // If either version is calculated, the field should be marked as calculated
          if (field.isCalculated && !existing.isCalculated) {
            existing.isCalculated = true;
            existing.expression = field.expression;
          }
          
          // Merge sources
          const sourceMap = new Map<string, any>();
          [...existing.sources, ...field.sources].forEach(source => {
            const sourceKey = `${source.assetType}::${source.assetId}`;
            sourceMap.set(sourceKey, source);
          });
          existing.sources = Array.from(sourceMap.values());
          
          // Merge data types (keep the most specific one)
          if (!existing.dataType || existing.dataType === 'Unknown' || existing.dataType === 'Calculated') {
            existing.dataType = field.dataType;
          }
          
          // For calculated fields, handle multiple expressions
          if (field.isCalculated && field.expression && field.expression !== existing.expression) {
            // Store multiple expressions
            if (!existing.expressions) {
              existing.expressions = [
                { expression: existing.expression || '', sources: existing.sources.filter(s => s.assetType !== 'dataset') },
              ];
            }
            existing.expressions!.push({
              expression: field.expression,
              sources: field.sources.filter(s => s.assetType !== 'dataset'),
            });
            // Keep the most common expression as the primary one
            existing.expression = existing.expressions![0].expression;
          }
          
          // Merge lineage
          if (field.lineage) {
            if (!existing.lineage) {
              existing.lineage = field.lineage;
            } else {
              // Merge analysis and dashboard IDs
              if (field.lineage.analysisIds) {
                existing.lineage.analysisIds = Array.from(new Set([
                  ...(existing.lineage.analysisIds || []),
                  ...field.lineage.analysisIds,
                ]));
              }
              if (field.lineage.dashboardIds) {
                existing.lineage.dashboardIds = Array.from(new Set([
                  ...(existing.lineage.dashboardIds || []),
                  ...field.lineage.dashboardIds,
                ]));
              }
            }
          }
        } else {
          mergedFieldMap.set(key, { ...field });
        }
      }
      
      const mergedFields = Array.from(mergedFieldMap.values());
      
      // Post-process to calculate usage counts and detect variants
      for (const field of mergedFields) {
        // Calculate total usage count
        // Count all sources from analyses and dashboards as they represent actual usage
        let usageCount = 0;
        for (const source of field.sources) {
          // Count all analysis and dashboard sources as actual usage
          // Dataset sources are just definitions, not usage
          if (source.assetType === 'analysis' || source.assetType === 'dashboard') {
            usageCount++;
          }
        }
        field.usageCount = usageCount;
        
        // For calculated fields, check if there are variants
        if (field.isCalculated && field.expressions && field.expressions.length > 1) {
          field.hasVariants = true;
          // Sort expressions by occurrence count
          field.expressions.sort((a, b) => b.sources.length - a.sources.length);
          // Use the most common expression as the primary one
          field.expression = field.expressions[0].expression;
        }
        
        // Add semantic field ID for mapping purposes
        // Use the first source to create a consistent ID
        if (field.sources && field.sources.length > 0) {
          const firstSource = field.sources[0];
          field.semanticFieldId = `${firstSource.assetType}:${firstSource.assetId}:${field.fieldName}`;
        } else {
          field.semanticFieldId = `unknown:unknown:${field.fieldName}`;
        }
        
        // Load field metadata (tags, description, etc.)
        try {
          // Try to get metadata from the first dataset source
          const datasetSource = field.sources.find(s => s.assetType === 'dataset');
          if (datasetSource) {
            const metadata = await this.fieldMetadataService.getFieldMetadata(
              'dataset',
              datasetSource.assetId,
              field.fieldName
            );
            
            if (metadata && metadata.tags && metadata.tags.length > 0) {
              field.customMetadata = {
                tags: metadata.tags.map(tag => `${tag.key}:${tag.value}`),
                description: metadata.description,
                dataClassification: metadata.dataClassification,
                isPII: metadata.isPII,
                isSensitive: metadata.isSensitive,
              };
            }
          }
        } catch (error) {
          // Ignore metadata loading errors - field will just not have metadata
          logger.debug(`Failed to load metadata for field ${field.fieldName}:`, error);
        }
      }
      
      const fields = mergedFields.filter(f => !f.isCalculated);
      const calculatedFields = mergedFields.filter(f => f.isCalculated);

      summary.totalFields = fields.length;
      summary.totalCalculatedFields = calculatedFields.length;

      logger.info(`Data catalog built: ${summary.totalFields} fields, ${summary.totalCalculatedFields} calculated fields`);

      const catalog = {
        fields,
        calculatedFields,
        summary,
      };

      // Save the catalog to S3 for future use
      try {
        await this.metadataService.saveMetadata('catalog/data-catalog.json', catalog);
        logger.info('Data catalog cached to S3');
      } catch (error) {
        logger.error('Failed to cache data catalog:', error);
      }

      return catalog;
    } catch (error) {
      logger.error('Error building data catalog:', error);
      throw error;
    }
  }
}