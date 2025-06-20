import { logger } from '../utils/logger';

export interface CalculatedField {
  name: string;
  expression: string;
  dataSetIdentifier?: string;
}

export interface Field {
  fieldId: string;
  fieldName: string;
  name?: string; // Frontend compatibility
  dataType?: string;
  type?: string; // Frontend compatibility
  dataSetIdentifier?: string;
}

export interface ParsedAssetInfo {
  calculatedFields: CalculatedField[];
  fields: Field[];
  dataSets: Array<{
    identifier: string;
    arn?: string;
    name?: string;
  }>;
  parameters?: Array<{
    name: string;
    type: string;
    defaultValue?: any;
  }>;
  filters?: Array<{
    filterId: string;
    name?: string;
    scope?: string;
    dataSetIdentifier?: string;
  }>;
  sheets?: Array<{
    sheetId: string;
    name?: string;
    visualCount: number;
  }>;
  visuals?: Array<{
    visualId: string;
    type: string;
    title?: string;
    sheetId?: string;
  }>;
  datasourceInfo?: {
    type?: string;
    status?: string;
    engine?: string;
    database?: string;
    schema?: string;
    table?: string;
    manifestFileLocation?: string;
    uploadSettings?: any;
  };
}

export class AssetParserService {
  /**
   * Parse a dashboard definition to extract fields, calculated fields, and other metadata
   */
  parseDashboard(dashboardDefinition: any): ParsedAssetInfo {
    const result: ParsedAssetInfo = {
      calculatedFields: [],
      fields: [],
      dataSets: [],
      parameters: [],
      filters: [],
      sheets: [],
      visuals: [],
    };

    try {
      // Log the structure to debug
      logger.info('Dashboard definition keys:', Object.keys(dashboardDefinition));
      
      // The definition from DescribeDashboardDefinition is wrapped in a Definition property
      const definition = dashboardDefinition.Definition || dashboardDefinition;
      // Extract data sets
      if (definition.DataSetIdentifierDeclarations) {
        result.dataSets = definition.DataSetIdentifierDeclarations.map((ds: any) => ({
          identifier: ds.Identifier,
          arn: ds.DataSetArn,
        }));
      }

      // Extract calculated fields
      if (definition.CalculatedFields) {
        result.calculatedFields = definition.CalculatedFields.map((cf: any) => ({
          name: cf.Name,
          expression: cf.Expression,
          dataSetIdentifier: cf.DataSetIdentifier,
        }));
      }

      // Extract parameters
      if (definition.ParameterDeclarations) {
        result.parameters = definition.ParameterDeclarations.map((param: any) => {
          const paramInfo: any = {
            name: param.Name,
          };
          
          if (param.StringParameterDeclaration) {
            paramInfo.type = 'String';
            paramInfo.defaultValue = param.StringParameterDeclaration.DefaultValues?.StaticValues?.[0];
          } else if (param.IntegerParameterDeclaration) {
            paramInfo.type = 'Integer';
            paramInfo.defaultValue = param.IntegerParameterDeclaration.DefaultValues?.StaticValues?.[0];
          } else if (param.DecimalParameterDeclaration) {
            paramInfo.type = 'Decimal';
            paramInfo.defaultValue = param.DecimalParameterDeclaration.DefaultValues?.StaticValues?.[0];
          } else if (param.DateTimeParameterDeclaration) {
            paramInfo.type = 'DateTime';
            paramInfo.defaultValue = param.DateTimeParameterDeclaration.DefaultValues?.StaticValues?.[0];
          }
          
          return paramInfo;
        });
      }

      // Extract filters
      if (definition.FilterGroups) {
        definition.FilterGroups.forEach((fg: any) => {
          if (fg.Filters) {
            fg.Filters.forEach((filter: any) => {
              const filterInfo: any = {
                filterId: filter.FilterId || fg.FilterGroupId,
                scope: fg.Scope?.ScopeConfiguration?.SelectedSheets ? 'SELECTED_SHEETS' : 'ALL_VISUALS',
              };

              if (filter.CategoryFilter) {
                filterInfo.name = filter.CategoryFilter.Column?.ColumnName;
                filterInfo.dataSetIdentifier = filter.CategoryFilter.Column?.DataSetIdentifier;
              } else if (filter.NumericRangeFilter) {
                filterInfo.name = filter.NumericRangeFilter.Column?.ColumnName;
                filterInfo.dataSetIdentifier = filter.NumericRangeFilter.Column?.DataSetIdentifier;
              } else if (filter.TimeRangeFilter) {
                filterInfo.name = filter.TimeRangeFilter.Column?.ColumnName;
                filterInfo.dataSetIdentifier = filter.TimeRangeFilter.Column?.DataSetIdentifier;
              }

              result.filters?.push(filterInfo);
            });
          }
        });
      }

      // Extract sheets and visuals
      if (definition.Sheets) {
        result.sheets = [];
        definition.Sheets.forEach((sheet: any) => {
          const sheetInfo = {
            sheetId: sheet.SheetId || '',
            name: sheet.Name,
            visualCount: sheet.Visuals?.length || 0,
          };
          result.sheets!.push(sheetInfo);

          if (sheet.Visuals) {
            sheet.Visuals.forEach((visual: any) => {
              const visualInfo: any = {
                visualId: visual.VisualId || '',
                type: this.getVisualType(visual),
                title: visual.Title?.Visibility === 'VISIBLE' ? visual.Title?.FormatText?.PlainText : undefined,
                sheetId: sheet.SheetId,
              };
              result.visuals?.push(visualInfo);

              // Extract fields from visual
              this.extractFieldsFromVisual(visual, result.fields);
            });
          }
        });
      }

      // Remove duplicate fields
      result.fields = this.deduplicateFields(result.fields);

      logger.info(`Parsed dashboard: ${result.calculatedFields.length} calculated fields, ${result.fields.length} fields`);
    } catch (error) {
      logger.error('Error parsing dashboard:', error);
    }

    return result;
  }

  /**
   * Parse an analysis definition to extract fields, calculated fields, and other metadata
   */
  parseAnalysis(analysisDefinition: any): ParsedAssetInfo {
    // Analysis definitions have the same structure as dashboard definitions
    return this.parseDashboard(analysisDefinition);
  }

  /**
   * Parse a dataset definition to extract fields and calculated fields
   */
  parseDataset(datasetDefinition: any): ParsedAssetInfo {
    const result: ParsedAssetInfo = {
      calculatedFields: [],
      fields: [],
      dataSets: [],
    };

    try {
      const dataset = datasetDefinition.DataSet || datasetDefinition;

      // Extract physical table fields
      if (dataset.PhysicalTableMap) {
        Object.values(dataset.PhysicalTableMap).forEach((table: any) => {
          if (table.RelationalTable?.Columns) {
            table.RelationalTable.Columns.forEach((col: any) => {
              result.fields.push({
                fieldId: col.Name,
                fieldName: col.Name,
                name: col.Name,
                dataType: col.Type,
                type: col.Type,
              });
            });
          } else if (table.CustomSql?.Columns) {
            table.CustomSql.Columns.forEach((col: any) => {
              result.fields.push({
                fieldId: col.Name,
                fieldName: col.Name,
                name: col.Name,
                dataType: col.Type,
                type: col.Type,
              });
            });
          } else if (table.S3Source?.UploadSettings) {
            // For S3 sources (flat files), column information is only available after data ingestion
            // We can only capture the upload settings and format information
            result.datasourceInfo = {
              type: 'S3',
              uploadSettings: table.S3Source.UploadSettings,
            };
          }
        });
      }

      // Extract logical table fields (including calculated columns)
      if (dataset.LogicalTableMap) {
        Object.values(dataset.LogicalTableMap).forEach((logicalTable: any) => {
          if (logicalTable.DataTransforms) {
            logicalTable.DataTransforms.forEach((transform: any) => {
              if (transform.CreateColumnsOperation) {
                transform.CreateColumnsOperation.Columns.forEach((col: any) => {
                  if (col.ColumnId && col.Expression) {
                    result.calculatedFields.push({
                      name: col.ColumnName || col.ColumnId,
                      expression: col.Expression,
                    });
                  }
                });
              }
            });
          }
        });
      }

      // Extract output columns (these are the final fields available)
      if (dataset.OutputColumns) {
        dataset.OutputColumns.forEach((col: any) => {
          const existingField = result.fields.find(f => f.fieldId === col.Name);
          if (!existingField) {
            result.fields.push({
              fieldId: col.Name,
              fieldName: col.Name,
              name: col.Name,
              dataType: col.Type,
              type: col.Type,
            });
          }
        });
      }

      // Add dataset metadata
      if (dataset.Name || dataset.DataSetId) {
        result.dataSets.push({
          identifier: dataset.DataSetId || 'self',
          name: dataset.Name,
          arn: dataset.Arn,
        });
      }

      // Check if this is a flat file dataset (uploaded file)
      if (dataset.ImportMode === 'DIRECT_QUERY' && dataset.PhysicalTableMap) {
        const hasUploadedFile = Object.values(dataset.PhysicalTableMap).some((table: any) => 
          table.S3Source?.UploadSettings || table.UploadSettings,
        );
        if (hasUploadedFile && !result.datasourceInfo) {
          result.datasourceInfo = {
            type: 'UPLOADED_FILE',
            status: 'Flat file dataset - limited metadata available',
          };
        }
      }

      logger.info(`Parsed dataset: ${result.calculatedFields.length} calculated fields, ${result.fields.length} fields`);
    } catch (error) {
      logger.error('Error parsing dataset:', error);
    }

    return result;
  }

  /**
   * Parse a datasource definition to extract connection information
   */
  parseDatasource(datasourceDefinition: any): ParsedAssetInfo {
    const result: ParsedAssetInfo = {
      calculatedFields: [],
      fields: [],
      dataSets: [],
    };

    try {
      const datasource = datasourceDefinition.DataSource || datasourceDefinition;

      result.datasourceInfo = {
        type: datasource.Type,
        status: datasource.Status,
      };

      // Extract connection details based on type
      if (datasource.DataSourceParameters) {
        const params = datasource.DataSourceParameters;
        
        if (params.AuroraParameters) {
          result.datasourceInfo.engine = 'Aurora';
          result.datasourceInfo.database = params.AuroraParameters.Database;
        } else if (params.AuroraPostgreSqlParameters) {
          result.datasourceInfo.engine = 'Aurora PostgreSQL';
          result.datasourceInfo.database = params.AuroraPostgreSqlParameters.Database;
        } else if (params.RdsParameters) {
          result.datasourceInfo.engine = 'RDS';
          result.datasourceInfo.database = params.RdsParameters.Database;
        } else if (params.RedshiftParameters) {
          result.datasourceInfo.engine = 'Redshift';
          result.datasourceInfo.database = params.RedshiftParameters.Database;
        } else if (params.AthenaParameters) {
          result.datasourceInfo.engine = 'Athena';
          result.datasourceInfo.database = params.AthenaParameters.WorkGroup;
        } else if (params.S3Parameters) {
          result.datasourceInfo.engine = 'S3';
          result.datasourceInfo.manifestFileLocation = params.S3Parameters.ManifestFileLocation?.Bucket ?
            `s3://${params.S3Parameters.ManifestFileLocation.Bucket}/${params.S3Parameters.ManifestFileLocation.Key}` :
            'Unknown';
        }
      }

      logger.info(`Parsed datasource: Type ${datasource.Type}, Status ${datasource.Status}`);
    } catch (error) {
      logger.error('Error parsing datasource:', error);
    }

    return result;
  }

  /**
   * Get the visual type from a visual definition
   */
  private getVisualType(visual: any): string {
    if (visual.BarChartVisual) return 'BarChart';
    if (visual.LineChartVisual) return 'LineChart';
    if (visual.PieChartVisual) return 'PieChart';
    if (visual.TableVisual) return 'Table';
    if (visual.PivotTableVisual) return 'PivotTable';
    if (visual.KPIVisual) return 'KPI';
    if (visual.GaugeChartVisual) return 'GaugeChart';
    if (visual.GeospatialMapVisual) return 'GeospatialMap';
    if (visual.HeatMapVisual) return 'HeatMap';
    if (visual.TreeMapVisual) return 'TreeMap';
    if (visual.ScatterPlotVisual) return 'ScatterPlot';
    if (visual.HistogramVisual) return 'Histogram';
    if (visual.FunnelChartVisual) return 'FunnelChart';
    if (visual.SankeyDiagramVisual) return 'SankeyDiagram';
    if (visual.WaterfallVisual) return 'Waterfall';
    if (visual.WordCloudVisual) return 'WordCloud';
    if (visual.InsightVisual) return 'Insight';
    if (visual.ComboChartVisual) return 'ComboChart';
    if (visual.BoxPlotVisual) return 'BoxPlot';
    if (visual.FilledMapVisual) return 'FilledMap';
    if (visual.RadarChartVisual) return 'RadarChart';
    return 'Unknown';
  }

  /**
   * Extract fields from a visual definition
   */
  private extractFieldsFromVisual(visual: any, fields: Field[]): void {
    const visualData = visual.BarChartVisual || visual.LineChartVisual || visual.PieChartVisual || 
                      visual.TableVisual || visual.PivotTableVisual || visual.KPIVisual || 
                      visual.ScatterPlotVisual || visual.ComboChartVisual || {};

    // Extract from field wells
    const fieldWells = visualData.ChartConfiguration?.FieldWells || 
                      visualData.Configuration?.FieldWells ||
                      visualData.ConditionalFormatting?.ConditionalFormattingOptions;

    if (fieldWells) {
      this.extractFieldsFromObject(fieldWells, fields);
    }
  }

  /**
   * Recursively extract field references from an object
   */
  private extractFieldsFromObject(obj: any, fields: Field[]): void {
    if (!obj) return;

    if (Array.isArray(obj)) {
      obj.forEach(item => this.extractFieldsFromObject(item, fields));
    } else if (typeof obj === 'object') {
      // Check for column definitions
      if (obj.FieldId && obj.ColumnName) {
        fields.push({
          fieldId: obj.FieldId,
          fieldName: obj.ColumnName,
          dataSetIdentifier: obj.DataSetIdentifier,
        });
      }

      // Check for categorical/numerical/date dimensions and measures
      if (obj.CategoricalDimensionField || obj.NumericalDimensionField || 
          obj.DateDimensionField || obj.CategoricalMeasureField || 
          obj.NumericalMeasureField || obj.DateMeasureField) {
        const fieldObj = obj.CategoricalDimensionField || obj.NumericalDimensionField || 
                      obj.DateDimensionField || obj.CategoricalMeasureField || 
                      obj.NumericalMeasureField || obj.DateMeasureField;
        
        if (fieldObj.Column?.ColumnName) {
          fields.push({
            fieldId: fieldObj.FieldId || fieldObj.Column.ColumnName,
            fieldName: fieldObj.Column.ColumnName,
            dataSetIdentifier: fieldObj.Column.DataSetIdentifier,
          });
        }
      }

      // Recurse through all properties
      Object.values(obj).forEach(value => this.extractFieldsFromObject(value, fields));
    }
  }

  /**
   * Remove duplicate fields based on fieldId and dataSetIdentifier
   */
  private deduplicateFields(fields: Field[]): Field[] {
    const seen = new Set<string>();
    return fields.filter(field => {
      const key = `${field.fieldId}:${field.dataSetIdentifier || ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}