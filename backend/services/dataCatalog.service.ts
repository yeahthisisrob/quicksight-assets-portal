import { AssetExportService } from './assetExport.service';
import { AssetParserService } from './assetParser.service';
import { logger } from '../utils/logger';

export interface CatalogField {
  fieldId: string;
  fieldName: string;
  dataType?: string;
  isCalculated: boolean;
  expression?: string;
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
  }>;
  lineage?: {
    datasetId?: string;
    datasetName?: string;
    datasourceType?: string;
    importMode?: 'SPICE' | 'DIRECT_QUERY';
    analysisIds?: string[];
    dashboardIds?: string[];
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
  private assetExportService: AssetExportService;
  private assetParserService: AssetParserService;

  constructor() {
    this.assetExportService = new AssetExportService();
    this.assetParserService = new AssetParserService();
  }

  async buildDataCatalog(): Promise<DataCatalogResult> {
    try {
      logger.info('Building data catalog...');
      
      // Get all exported assets
      const assetsData = await this.assetExportService.getAllAssets();
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
          const assetData = await this.assetExportService.getAsset('datasets', asset.id);
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
          }
        }
      }

      // Process analyses
      for (const asset of assetsData.assets) {
        if (asset.type === 'analysis') {
          summary.totalAnalyses++;
          const assetData = await this.assetExportService.getAsset('analyses', asset.id);
          const parsed = this.assetParserService.parseAnalysis(assetData);
          
          // Map datasets used in this analysis
          const usedDatasets = new Map<string, { id: string; name: string }>();
          for (const ds of parsed.dataSets) {
            // Try to find dataset by ARN first (most reliable)
            let datasetInfo = Array.from(datasetMap.values()).find(d => 
              d.arn === ds.arn
            );
            
            // If not found by ARN, try by identifier or name
            if (!datasetInfo) {
              datasetInfo = Array.from(datasetMap.values()).find(d => 
                d.id === ds.identifier || d.name === ds.name
              );
            }
            
            if (datasetInfo) {
              usedDatasets.set(ds.identifier, { id: datasetInfo.id, name: datasetInfo.name });
            } else {
              // Even if we can't find the dataset in our map, we might have the name from the identifier
              logger.debug(`Dataset not found in map: ${ds.identifier}, ARN: ${ds.arn}`);
              usedDatasets.set(ds.identifier, { 
                id: ds.identifier, 
                name: ds.name || ds.identifier 
              });
            }
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
          }
        }
      }

      // Process dashboards
      for (const asset of assetsData.assets) {
        if (asset.type === 'dashboard') {
          summary.totalDashboards++;
          const assetData = await this.assetExportService.getAsset('dashboards', asset.id);
          const parsed = this.assetParserService.parseDashboard(assetData);
          
          // Map datasets used in this dashboard
          const usedDatasets = new Map<string, { id: string; name: string }>();
          for (const ds of parsed.dataSets) {
            // Try to find dataset by ARN first (most reliable)
            let datasetInfo = Array.from(datasetMap.values()).find(d => 
              d.arn === ds.arn
            );
            
            // If not found by ARN, try by identifier or name
            if (!datasetInfo) {
              datasetInfo = Array.from(datasetMap.values()).find(d => 
                d.id === ds.identifier || d.name === ds.name
              );
            }
            
            if (datasetInfo) {
              usedDatasets.set(ds.identifier, { id: datasetInfo.id, name: datasetInfo.name });
            } else {
              // Even if we can't find the dataset in our map, we might have the name from the identifier
              logger.debug(`Dataset not found in map: ${ds.identifier}, ARN: ${ds.arn}`);
              usedDatasets.set(ds.identifier, { 
                id: ds.identifier, 
                name: ds.name || ds.identifier 
              });
            }
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
                { expression: existing.expression || '', sources: existing.sources.filter(s => s.assetType !== 'dataset') }
              ];
            }
            existing.expressions!.push({
              expression: field.expression,
              sources: field.sources.filter(s => s.assetType !== 'dataset')
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
                  ...field.lineage.analysisIds
                ]));
              }
              if (field.lineage.dashboardIds) {
                existing.lineage.dashboardIds = Array.from(new Set([
                  ...(existing.lineage.dashboardIds || []),
                  ...field.lineage.dashboardIds
                ]));
              }
            }
          }
        } else {
          mergedFieldMap.set(key, { ...field });
        }
      }
      
      const mergedFields = Array.from(mergedFieldMap.values());
      const fields = mergedFields.filter(f => !f.isCalculated);
      const calculatedFields = mergedFields.filter(f => f.isCalculated);

      summary.totalFields = fields.length;
      summary.totalCalculatedFields = calculatedFields.length;

      logger.info(`Data catalog built: ${summary.totalFields} fields, ${summary.totalCalculatedFields} calculated fields`);

      return {
        fields,
        calculatedFields,
        summary,
      };
    } catch (error) {
      logger.error('Error building data catalog:', error);
      throw error;
    }
  }
}