import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Chip,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Calculate as CalculateIcon,
  TableChart as TableIcon,
  LocalOffer as TagIcon,
  Security as SecurityIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { dataCatalogApi, tagsApi } from '@/services/api';
import FieldUsageBadges from '@/components/dataCatalog/FieldUsageBadges';
import MultipleExpressionsDisplay from '@/components/dataCatalog/MultipleExpressionsDisplay';
import FieldDetailsDialog from '@/components/dataCatalog/FieldDetailsDialog';
import DatasourceTypeBadge from '@/components/dataCatalog/DatasourceTypeBadge';
import TagsCell from '@/components/tags/TagsCell';
import { countUniqueExpressions, hasMultipleVariations } from '@/utils/expressionUtils';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`data-catalog-tabpanel-${index}`}
      aria-labelledby={`data-catalog-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}


export default function DataCatalogPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedField, setSelectedField] = useState<any>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [tagSearchKey, setTagSearchKey] = useState('');
  const [tagSearchValue, setTagSearchValue] = useState('');
  const [fieldMetadata, setFieldMetadata] = useState<Record<string, any>>({});
  const [metadataRefreshKey, setMetadataRefreshKey] = useState(0);
  const [filters, setFilters] = useState({
    showDatasets: true,
    showAnalyses: true,
    showDashboards: true,
    showCalculated: true,
    showRegular: true,
  });

  // Fetch data catalog
  const { data: catalog, isLoading, error } = useQuery({
    queryKey: ['data-catalog'],
    queryFn: () => dataCatalogApi.getDataCatalog(),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Search fields by tags
  const { data: tagSearchResults, isLoading: tagSearchLoading } = useQuery({
    queryKey: ['field-tag-search', tagSearchKey, tagSearchValue],
    queryFn: async () => {
      const tags = tagSearchValue 
        ? [{ key: tagSearchKey, value: tagSearchValue }]
        : [{ key: tagSearchKey }];
      console.log('Searching for fields with tags:', tags);
      const results = await tagsApi.searchFieldsByTags(tags);
      console.log('Search results:', results);
      return results;
    },
    enabled: tabValue === 2 && !!tagSearchKey,
  });

  // Fetch metadata for all fields
  useEffect(() => {
    const fetchFieldMetadata = async () => {
      if (!catalog?.fields && !catalog?.calculatedFields) return;
      
      const metadataMap: Record<string, any> = {};
      
      // Get unique source IDs by type
      const sourcesByType = {
        dataset: new Set<string>(),
        analysis: new Set<string>(),
        dashboard: new Set<string>(),
      };
      
      // Process all fields to find unique sources
      [...(catalog.fields || []), ...(catalog.calculatedFields || [])].forEach(field => {
        field.sources?.forEach((source: any) => {
          if (source.assetType in sourcesByType) {
            sourcesByType[source.assetType as keyof typeof sourcesByType].add(source.assetId);
          }
        });
      });
      
      // Fetch metadata for each source type
      for (const [sourceType, sourceIds] of Object.entries(sourcesByType)) {
        for (const sourceId of sourceIds) {
          try {
            console.log(`Fetching metadata for ${sourceType} ${sourceId}`);
            const metadata = await tagsApi.getAllFieldsMetadata(
              sourceType as 'dataset' | 'analysis' | 'dashboard',
              sourceId
            );
            console.log(`Got ${metadata.length} field metadata items for ${sourceType} ${sourceId}`);
            metadata.forEach((fieldMeta: any) => {
              metadataMap[fieldMeta.fieldId] = fieldMeta;
              console.log(`Loaded metadata for field: ${fieldMeta.fieldId}`, fieldMeta);
            });
          } catch (error) {
            console.error(`Error fetching metadata for ${sourceType} ${sourceId}:`, error);
          }
        }
      }
      
      setFieldMetadata(metadataMap);
    };
    
    fetchFieldMetadata();
  }, [catalog, metadataRefreshKey]); // This will re-run when catalog changes or when manually refreshed

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({
      ...filters,
      [event.target.name]: event.target.checked,
    });
  };

  const filterFields = (fields: any[]) => {
    if (!fields) return [];
    
    return fields.filter(field => {
      // Search filter
      if (searchTerm && !field.fieldName.toLowerCase().includes(searchTerm.toLowerCase()) &&
          (!field.expression || !field.expression.toLowerCase().includes(searchTerm.toLowerCase()))) {
        return false;
      }

      // Type filters
      if (!filters.showCalculated && field.isCalculated) return false;
      if (!filters.showRegular && !field.isCalculated) return false;

      // Source filters
      const hasDashboard = field.sources.some((s: any) => s.assetType === 'dashboard');
      const hasAnalysis = field.sources.some((s: any) => s.assetType === 'analysis');
      const hasDataset = field.sources.some((s: any) => s.assetType === 'dataset');

      if (!filters.showDashboards && hasDashboard && !hasAnalysis && !hasDataset) return false;
      if (!filters.showAnalyses && hasAnalysis && !hasDashboard && !hasDataset) return false;
      if (!filters.showDatasets && hasDataset && !hasDashboard && !hasAnalysis) return false;

      return true;
    });
  };


  const fieldColumns: GridColDef[] = [
    {
      field: 'fieldName',
      headerName: 'Field Name',
      flex: 0.6,
      minWidth: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {params.row.isCalculated && <CalculateIcon fontSize="small" color="primary" />}
          <Typography variant="body2">{params.value}</Typography>
          {params.row.expressions && hasMultipleVariations(params.row.expressions) && (
            <Chip 
              label={`${countUniqueExpressions(params.row.expressions)} var`} 
              size="small" 
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
      ),
    },
    {
      field: 'dataType',
      headerName: 'Type',
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value || 'Unknown'} 
          size="small" 
          variant="outlined"
          color={params.row.isCalculated ? 'primary' : 'default'}
          sx={{ fontSize: '0.75rem' }}
        />
      ),
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params) => {
        // Determine the source for this field's metadata
        let metadataKey: string | null = null;
        
        if (params.row.isCalculated) {
          // For calculated fields, check if they belong to an analysis or dashboard
          const analysisSource = params.row.sources?.find((s: any) => s.assetType === 'analysis');
          const dashboardSource = params.row.sources?.find((s: any) => s.assetType === 'dashboard');
          const datasetSource = params.row.sources?.find((s: any) => s.assetType === 'dataset');
          
          if (analysisSource && !datasetSource) {
            metadataKey = `analysis::${analysisSource.assetId}::${params.row.fieldName}`;
          } else if (dashboardSource && !datasetSource) {
            metadataKey = `dashboard::${dashboardSource.assetId}::${params.row.fieldName}`;
          } else if (datasetSource) {
            metadataKey = `dataset::${datasetSource.assetId}::${params.row.fieldName}`;
          }
        } else {
          // Regular fields belong to datasets
          const firstDataset = params.row.sources?.find((s: any) => s.assetType === 'dataset');
          if (firstDataset) {
            metadataKey = `dataset::${firstDataset.assetId}::${params.row.fieldName}`;
          }
        }
        
        const metadata = metadataKey && fieldMetadata[metadataKey];
        const tags = metadata?.tags || [];
        
        // Debug logging for all fields
        console.log(`Field: ${params.row.fieldName}, Key: ${metadataKey || 'NO KEY'}, Metadata: `, metadata);
        console.log('Available metadata keys:', Object.keys(fieldMetadata));
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => {
              setSelectedField(params.row);
              setDetailsDialogOpen(true);
            }}
          />
        );
      },
    },
    {
      field: 'datasets',
      headerName: 'Datasets',
      flex: 0.6,
      minWidth: 180,
      renderCell: (params) => {
        const datasets = params.row.sources?.filter((s: any) => s.assetType === 'dataset') || [];
        if (datasets.length === 0) return <Typography variant="body2" color="text.disabled">-</Typography>;
        
        const displayItems = datasets.slice(0, 2);
        const remainingCount = datasets.length - 2;
        
        return (
          <Box 
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedField(params.row);
              setDetailsDialogOpen(true);
            }}
          >
            {displayItems.map((item: any) => (
              <Tooltip key={item.assetId} title={item.assetName}>
                <Chip
                  label={item.assetName.length > 12 ? `${item.assetName.substring(0, 12)}...` : item.assetName}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    height: 20,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': { px: 1 },
                    borderColor: 'primary.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: 'primary.lighter',
                      borderColor: 'primary.dark'
                    }
                  }}
                />
              </Tooltip>
            ))}
            {remainingCount > 0 && (
              <Chip
                label={`+${remainingCount}`}
                size="small"
                variant="filled"
                sx={{ 
                  height: 20,
                  fontSize: '0.75rem',
                  '& .MuiChip-label': { px: 0.75 },
                  backgroundColor: 'grey.200',
                  color: 'text.secondary'
                }}
              />
            )}
          </Box>
        );
      },
    },
    {
      field: 'analyses',
      headerName: 'Analyses',
      flex: 0.6,
      minWidth: 180,
      renderCell: (params) => {
        const analyses = params.row.sources?.filter((s: any) => s.assetType === 'analysis') || [];
        if (analyses.length === 0) return <Typography variant="body2" color="text.disabled">-</Typography>;
        
        const displayItems = analyses.slice(0, 2);
        const remainingCount = analyses.length - 2;
        
        return (
          <Box 
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedField(params.row);
              setDetailsDialogOpen(true);
            }}
          >
            {displayItems.map((item: any) => (
              <Tooltip key={item.assetId} title={item.assetName}>
                <Chip
                  label={item.assetName.length > 12 ? `${item.assetName.substring(0, 12)}...` : item.assetName}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    height: 20,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': { px: 1 },
                    borderColor: 'secondary.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: 'secondary.lighter',
                      borderColor: 'secondary.dark'
                    }
                  }}
                />
              </Tooltip>
            ))}
            {remainingCount > 0 && (
              <Chip
                label={`+${remainingCount}`}
                size="small"
                variant="filled"
                sx={{ 
                  height: 20,
                  fontSize: '0.75rem',
                  '& .MuiChip-label': { px: 0.75 },
                  backgroundColor: 'grey.200',
                  color: 'text.secondary'
                }}
              />
            )}
          </Box>
        );
      },
    },
    {
      field: 'dashboards',
      headerName: 'Dashboards',
      flex: 0.6,
      minWidth: 180,
      renderCell: (params) => {
        const dashboards = params.row.sources?.filter((s: any) => s.assetType === 'dashboard') || [];
        if (dashboards.length === 0) return <Typography variant="body2" color="text.disabled">-</Typography>;
        
        const displayItems = dashboards.slice(0, 2);
        const remainingCount = dashboards.length - 2;
        
        return (
          <Box 
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedField(params.row);
              setDetailsDialogOpen(true);
            }}
          >
            {displayItems.map((item: any) => (
              <Tooltip key={item.assetId} title={item.assetName}>
                <Chip
                  label={item.assetName.length > 12 ? `${item.assetName.substring(0, 12)}...` : item.assetName}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    height: 20,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': { px: 1 },
                    borderColor: 'success.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: 'success.lighter',
                      borderColor: 'success.dark'
                    }
                  }}
                />
              </Tooltip>
            ))}
            {remainingCount > 0 && (
              <Chip
                label={`+${remainingCount}`}
                size="small"
                variant="filled"
                sx={{ 
                  height: 20,
                  fontSize: '0.75rem',
                  '& .MuiChip-label': { px: 0.75 },
                  backgroundColor: 'grey.200',
                  color: 'text.secondary'
                }}
              />
            )}
          </Box>
        );
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="View Details & Edit Metadata">
            <IconButton
              size="small"
              onClick={() => {
                setSelectedField(params.row);
                setDetailsDialogOpen(true);
              }}
              sx={{ padding: '4px' }}
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {params.row.isCalculated && (
            <Tooltip title="Copy Expression">
              <IconButton
                size="small"
                onClick={() => copyToClipboard(params.row.expression || '')}
                sx={{ padding: '4px' }}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  const allFields = [...(catalog?.fields || []), ...(catalog?.calculatedFields || [])];
  const filteredFields = filterFields(allFields);

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">
          Failed to load data catalog. Please try again later.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Data Catalog
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Comprehensive view of all fields and calculated fields across your QuickSight assets
      </Typography>

      {/* Summary Cards */}
      {catalog && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Total Fields
                </Typography>
                <Typography variant="h4">
                  {catalog.summary.totalFields}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Calculated Fields
                </Typography>
                <Typography variant="h4" color="primary">
                  {catalog.summary.totalCalculatedFields}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Datasets
                </Typography>
                <Typography variant="h4">
                  {catalog.summary.totalDatasets}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Analyses
                </Typography>
                <Typography variant="h4">
                  {catalog.summary.totalAnalyses}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Dashboards
                </Typography>
                <Typography variant="h4">
                  {catalog.summary.totalDashboards}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Paper>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="All Fields" icon={<TableIcon />} iconPosition="start" />
          <Tab label="Calculated Fields" icon={<CalculateIcon />} iconPosition="start" />
          <Tab label="Field Metadata Search" icon={<TagIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  variant="outlined"
                  placeholder="Search fields by name or expression..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormGroup row>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.showDatasets}
                        onChange={handleFilterChange}
                        name="showDatasets"
                      />
                    }
                    label="Datasets"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.showAnalyses}
                        onChange={handleFilterChange}
                        name="showAnalyses"
                      />
                    }
                    label="Analyses"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.showDashboards}
                        onChange={handleFilterChange}
                        name="showDashboards"
                      />
                    }
                    label="Dashboards"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.showCalculated}
                        onChange={handleFilterChange}
                        name="showCalculated"
                      />
                    }
                    label="Calculated"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.showRegular}
                        onChange={handleFilterChange}
                        name="showRegular"
                      />
                    }
                    label="Regular"
                  />
                </FormGroup>
              </Grid>
            </Grid>
          </Box>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
              <DataGrid
              rows={filteredFields.map((field, index) => ({ ...field, id: index }))}
              columns={fieldColumns}
              autoHeight
              columnHeaderHeight={56}
              rowHeight={40}
              disableRowSelectionOnClick
              columnBuffer={8}
              columnThreshold={3}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 25 },
                },
              }}
              pageSizeOptions={[25, 50, 100]}
              slots={{
                toolbar: GridToolbar,
              }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 },
                },
              }}
              sx={{
                '& .MuiDataGrid-columnHeader': {
                  backgroundColor: 'action.hover',
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontWeight: 'bold',
                },
                // Hide column separators since resize doesn't work in community version
                '& .MuiDataGrid-columnSeparator': {
                  display: 'none',
                },
              }}
            />
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {catalog?.calculatedFields.map((field: any, index: number) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                      <CalculateIcon color="primary" />
                      <Typography sx={{ flexGrow: 1 }}>{field.fieldName}</Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {field.sources.map((source: any, idx: number) => (
                          <Chip
                            key={idx}
                            size="small"
                            label={source.assetName}
                            variant="outlined"
                            color={
                              source.assetType === 'dashboard' ? 'success' :
                              source.assetType === 'analysis' ? 'secondary' :
                              'primary'
                            }
                          />
                        ))}
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box>
                      <MultipleExpressionsDisplay
                        expressions={field.expressions}
                        primaryExpression={field.expression}
                      />
                      {field.lineage && (
                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <DatasourceTypeBadge
                            datasourceType={field.lineage.datasourceType}
                            importMode={field.lineage.importMode}
                          />
                        </Box>
                      )}
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Usage Details:
                        </Typography>
                        <FieldUsageBadges sources={field.sources} />
                      </Box>
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>
              Field Metadata Search
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Tag Key"
                  value={tagSearchKey}
                  onChange={(e) => setTagSearchKey(e.target.value)}
                  placeholder="e.g., PII, DataClassification, BusinessUnit"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <TagIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Tag Value"
                  value={tagSearchValue}
                  onChange={(e) => setTagSearchValue(e.target.value)}
                  placeholder="e.g., true, Confidential, Finance"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            </Grid>

            {/* Search results */}
            {tagSearchKey && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Search Results for {tagSearchKey}{tagSearchValue && `: ${tagSearchValue}`}
                </Typography>
                
                {tagSearchLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : tagSearchResults && tagSearchResults.length > 0 ? (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Found {tagSearchResults.length} fields matching your search
                    </Typography>
                    <Grid container spacing={2}>
                      {tagSearchResults.map((field: any) => {
                        console.log('Search result field:', field);
                        // Determine the source info
                        const sourceId = field.datasetId || field.analysisId || field.dashboardId;
                        const sourceType = field.sourceType || (field.datasetId ? 'dataset' : field.analysisId ? 'analysis' : 'dashboard');
                        
                        return (
                          <Grid item xs={12} key={field.fieldId || `${sourceId}-${field.fieldName}`}>
                            <Card variant="outlined">
                              <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="h6" component="div">
                                      {field.fieldName}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                      {sourceType === 'dataset' ? 'Dataset' : sourceType === 'analysis' ? 'Analysis' : 'Dashboard'}: {sourceId}
                                    </Typography>
                                  {field.description && (
                                    <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
                                      {field.description}
                                    </Typography>
                                  )}
                                  
                                  {/* Display tags */}
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                                    {field.tags?.map((tag: any, index: number) => (
                                      <Chip
                                        key={index}
                                        size="small"
                                        label={`${tag.key}: ${tag.value}`}
                                        icon={<TagIcon sx={{ fontSize: 16 }} />}
                                        variant={tag.key === tagSearchKey ? 'filled' : 'outlined'}
                                        color={tag.key === tagSearchKey ? 'primary' : 'default'}
                                      />
                                    ))}
                                  </Box>
                                  
                                  {/* Data classification badges */}
                                  <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                                    {field.dataClassification && (
                                      <Chip 
                                        label={field.dataClassification} 
                                        size="small" 
                                        color={field.dataClassification === 'Confidential' || field.dataClassification === 'Restricted' ? 'error' : 'default'}
                                        icon={<SecurityIcon sx={{ fontSize: 16 }} />}
                                      />
                                    )}
                                    {field.isPII && (
                                      <Chip 
                                        label={`PII: ${field.piiCategory || 'Yes'}`} 
                                        size="small" 
                                        color="warning"
                                        icon={<SecurityIcon sx={{ fontSize: 16 }} />}
                                      />
                                    )}
                                    {field.isSensitive && (
                                      <Chip 
                                        label="Sensitive" 
                                        size="small" 
                                        color="error"
                                        icon={<SecurityIcon sx={{ fontSize: 16 }} />}
                                      />
                                    )}
                                  </Box>
                                </Box>
                              </Box>
                            </CardContent>
                          </Card>
                        </Grid>
                      );
                    })}
                    </Grid>
                  </Box>
                ) : tagSearchResults ? (
                  <Alert severity="info">
                    No fields found with tag {tagSearchKey}{tagSearchValue && `: ${tagSearchValue}`}
                  </Alert>
                ) : null}
              </Box>
            )}

            {/* Quick search suggestions */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Common Searches
              </Typography>
              <Grid container spacing={1}>
                <Grid item>
                  <Chip
                    label="PII Fields"
                    variant="outlined"
                    onClick={() => {
                      setTagSearchKey('PII');
                      setTagSearchValue('true');
                    }}
                    icon={<SecurityIcon />}
                  />
                </Grid>
                <Grid item>
                  <Chip
                    label="Sensitive Data"
                    variant="outlined"
                    onClick={() => {
                      setTagSearchKey('Sensitive');
                      setTagSearchValue('true');
                    }}
                    icon={<SecurityIcon />}
                  />
                </Grid>
                <Grid item>
                  <Chip
                    label="Confidential"
                    variant="outlined"
                    onClick={() => {
                      setTagSearchKey('DataClassification');
                      setTagSearchValue('Confidential');
                    }}
                    icon={<SecurityIcon />}
                  />
                </Grid>
                <Grid item>
                  <Chip
                    label="Finance Fields"
                    variant="outlined"
                    onClick={() => {
                      setTagSearchKey('BusinessUnit');
                      setTagSearchValue('Finance');
                    }}
                    icon={<TagIcon />}
                  />
                </Grid>
              </Grid>
            </Box>
          </Box>
        </TabPanel>
      </Paper>

      {/* Field Details Dialog */}
      <FieldDetailsDialog
        open={detailsDialogOpen}
        onClose={() => {
          setDetailsDialogOpen(false);
          setSelectedField(null);
          // Force refresh metadata when dialog closes
          setMetadataRefreshKey(prev => prev + 1);
        }}
        field={selectedField}
        allCalculatedFields={catalog?.calculatedFields || []}
      />
    </Box>
  );
}