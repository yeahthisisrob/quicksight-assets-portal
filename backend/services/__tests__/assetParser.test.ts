import { AssetParserService } from '../assetParser.service';

describe('AssetParserService', () => {
  let parserService: AssetParserService;

  beforeEach(() => {
    parserService = new AssetParserService();
  });

  describe('parseAnalysis', () => {
    it('should extract calculated fields including c_test', () => {
      const analysisDefinition = {
        "$metadata": {
          "httpStatusCode": 200,
          "requestId": "e592c7e0-dcc7-4f83-a7ce-35ff8e132fbf"
        },
        "AnalysisId": "e3b8a7c6-a749-453d-a007-9ecd5b264463",
        "Definition": {
          "AnalysisDefaults": {
            "DefaultNewSheetConfiguration": {
              "InteractiveLayoutConfiguration": {
                "Grid": {
                  "CanvasSizeOptions": {
                    "ScreenCanvasSizeOptions": {
                      "OptimizedViewPortWidth": "1600px",
                      "ResizeOption": "FIXED"
                    }
                  }
                }
              },
              "SheetContentType": "INTERACTIVE"
            }
          },
          "CalculatedFields": [
            {
              "DataSetIdentifier": "substring2.csv",
              "Expression": "1",
              "Name": "c_test"
            },
            {
              "DataSetIdentifier": "substring2.csv",
              "Expression": "parseDate({date_column}, 'yyyy-MM-dd')",
              "Name": "parsed_date"
            }
          ],
          "DataSetIdentifierDeclarations": [
            {
              "DataSetArn": "arn:aws:quicksight:us-east-1:123456789012:dataset/abc123",
              "Identifier": "substring2.csv"
            }
          ]
        }
      };

      const result = parserService.parseAnalysis(analysisDefinition);

      expect(result.calculatedFields).toHaveLength(2);
      expect(result.calculatedFields[0]).toEqual({
        name: 'c_test',
        expression: '1',
        dataSetIdentifier: 'substring2.csv'
      });
      expect(result.calculatedFields[1]).toEqual({
        name: 'parsed_date',
        expression: "parseDate({date_column}, 'yyyy-MM-dd')",
        dataSetIdentifier: 'substring2.csv'
      });

      expect(result.dataSets).toHaveLength(1);
      expect(result.dataSets[0]).toEqual({
        identifier: 'substring2.csv',
        arn: 'arn:aws:quicksight:us-east-1:123456789012:dataset/abc123'
      });
    });

    it('should extract fields from visuals', () => {
      const analysisDefinition = {
        "AnalysisId": "test-analysis",
        "Definition": {
          "Sheets": [
            {
              "SheetId": "sheet1",
              "Name": "Sheet 1",
              "Visuals": [
                {
                  "VisualId": "visual1",
                  "Title": {
                    "Visibility": "VISIBLE",
                    "FormatText": {
                      "PlainText": "Sales by Region"
                    }
                  },
                  "BarChartVisual": {
                    "ChartConfiguration": {
                      "FieldWells": {
                        "BarChartAggregatedFieldWells": {
                          "Category": [
                            {
                              "CategoricalDimensionField": {
                                "FieldId": "region_field",
                                "Column": {
                                  "DataSetIdentifier": "sales_data",
                                  "ColumnName": "region"
                                }
                              }
                            }
                          ],
                          "Values": [
                            {
                              "NumericalMeasureField": {
                                "FieldId": "sales_amount_field",
                                "Column": {
                                  "DataSetIdentifier": "sales_data",
                                  "ColumnName": "sales_amount"
                                }
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                },
                {
                  "VisualId": "visual2",
                  "TableVisual": {
                    "ChartConfiguration": {
                      "FieldWells": {
                        "TableAggregatedFieldWells": {
                          "GroupBy": [
                            {
                              "CategoricalDimensionField": {
                                "FieldId": "product_field",
                                "Column": {
                                  "DataSetIdentifier": "sales_data",
                                  "ColumnName": "product_name"
                                }
                              }
                            }
                          ],
                          "Values": [
                            {
                              "NumericalMeasureField": {
                                "FieldId": "quantity_field",
                                "Column": {
                                  "DataSetIdentifier": "sales_data",
                                  "ColumnName": "quantity"
                                }
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                }
              ]
            }
          ]
        }
      };

      const result = parserService.parseAnalysis(analysisDefinition);

      expect(result.fields).toHaveLength(4);
      expect(result.fields).toContainEqual({
        fieldId: 'region_field',
        fieldName: 'region',
        dataSetIdentifier: 'sales_data'
      });
      expect(result.fields).toContainEqual({
        fieldId: 'sales_amount_field',
        fieldName: 'sales_amount',
        dataSetIdentifier: 'sales_data'
      });
      expect(result.fields).toContainEqual({
        fieldId: 'product_field',
        fieldName: 'product_name',
        dataSetIdentifier: 'sales_data'
      });
      expect(result.fields).toContainEqual({
        fieldId: 'quantity_field',
        fieldName: 'quantity',
        dataSetIdentifier: 'sales_data'
      });

      expect(result.visuals).toHaveLength(2);
      expect(result.visuals![0]).toEqual({
        visualId: 'visual1',
        type: 'BarChart',
        title: 'Sales by Region'
      });
      expect(result.visuals![1]).toEqual({
        visualId: 'visual2',
        type: 'Table',
        title: undefined
      });
    });
  });

  describe('parseDashboard', () => {
    it('should parse dashboard with same structure as analysis', () => {
      const dashboardDefinition = {
        "DashboardId": "test-dashboard",
        "Definition": {
          "CalculatedFields": [
            {
              "DataSetIdentifier": "test_dataset",
              "Expression": "sumOver({sales}, [{region}])",
              "Name": "c_test"
            }
          ],
          "ParameterDeclarations": [
            {
              "Name": "DateParam",
              "DateTimeParameterDeclaration": {
                "Name": "DateParam",
                "DefaultValues": {
                  "StaticValues": ["2024-01-01T00:00:00Z"]
                }
              }
            },
            {
              "Name": "RegionParam",
              "StringParameterDeclaration": {
                "Name": "RegionParam",
                "DefaultValues": {
                  "StaticValues": ["North America"]
                }
              }
            }
          ]
        }
      };

      const result = parserService.parseDashboard(dashboardDefinition);

      expect(result.calculatedFields).toHaveLength(1);
      expect(result.calculatedFields[0]).toEqual({
        name: 'c_test',
        expression: 'sumOver({sales}, [{region}])',
        dataSetIdentifier: 'test_dataset'
      });

      expect(result.parameters).toHaveLength(2);
      expect(result.parameters![0]).toEqual({
        name: 'DateParam',
        type: 'DateTime',
        defaultValue: '2024-01-01T00:00:00Z'
      });
      expect(result.parameters![1]).toEqual({
        name: 'RegionParam',
        type: 'String',
        defaultValue: 'North America'
      });
    });
  });

  describe('parseDataset', () => {
    it('should extract fields and calculated columns from dataset', () => {
      const datasetDefinition = {
        "DataSet": {
          "DataSetId": "test-dataset",
          "Name": "Test Dataset",
          "PhysicalTableMap": {
            "table1": {
              "RelationalTable": {
                "DataSourceArn": "arn:aws:quicksight:us-east-1:123456789012:datasource/abc123",
                "Schema": "public",
                "Name": "sales_table",
                "Columns": [
                  {
                    "Name": "region",
                    "Type": "STRING"
                  },
                  {
                    "Name": "sales_amount",
                    "Type": "DECIMAL"
                  },
                  {
                    "Name": "order_date",
                    "Type": "DATETIME"
                  }
                ]
              }
            }
          },
          "LogicalTableMap": {
            "logical1": {
              "Alias": "Sales Data",
              "Source": {
                "PhysicalTableId": "table1"
              },
              "DataTransforms": [
                {
                  "CreateColumnsOperation": {
                    "Columns": [
                      {
                        "ColumnId": "c_test",
                        "ColumnName": "c_test",
                        "Expression": "1"
                      },
                      {
                        "ColumnId": "sales_rank",
                        "ColumnName": "sales_rank",
                        "Expression": "rank([{sales_amount} DESC], [{region}])"
                      }
                    ]
                  }
                }
              ]
            }
          },
          "OutputColumns": [
            {
              "Name": "region",
              "Type": "STRING"
            },
            {
              "Name": "sales_amount",
              "Type": "DECIMAL"
            },
            {
              "Name": "order_date",
              "Type": "DATETIME"
            },
            {
              "Name": "c_test",
              "Type": "INTEGER"
            },
            {
              "Name": "sales_rank",
              "Type": "INTEGER"
            }
          ]
        }
      };

      const result = parserService.parseDataset(datasetDefinition);

      expect(result.calculatedFields).toHaveLength(2);
      expect(result.calculatedFields).toContainEqual({
        name: 'c_test',
        expression: '1'
      });
      expect(result.calculatedFields).toContainEqual({
        name: 'sales_rank',
        expression: 'rank([{sales_amount} DESC], [{region}])'
      });

      expect(result.fields.length).toBeGreaterThan(0);
      expect(result.fields).toContainEqual({
        fieldId: 'region',
        fieldName: 'region',
        dataType: 'STRING'
      });
      expect(result.fields).toContainEqual({
        fieldId: 'sales_amount',
        fieldName: 'sales_amount',
        dataType: 'DECIMAL'
      });
    });
  });
});