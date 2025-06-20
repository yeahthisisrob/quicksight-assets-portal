import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  LinearProgress,
  Badge,
  Menu,
  MenuItem,
  Divider,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
  GridSortModel,
} from '@mui/x-data-grid';
import {
  ViewList as PhysicalIcon,
  Category as SemanticIcon,
  AutoAwesome as AutoMapIcon,
  FileUpload as ImportIcon,
  FileDownload as ExportIcon,
  Search as SearchIcon,
  MoreVert as MoreIcon,
  CheckCircle as MappedIcon,
  Warning as UnmappedIcon,
  TrendingUp as ConfidenceIcon,
  Calculate as CalculateIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  ManageSearch as MetadataSearchIcon,
} from '@mui/icons-material';
import { dataCatalogApi, semanticApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import { DataCatalogProvider, useDataCatalog } from '@/contexts/DataCatalogContext';
import SemanticTermDialog from '@/components/semantic/SemanticTermDialog';
import SemanticMappingDialog from '@/components/semantic/SemanticMappingDialog';
import UnmappedFieldsDialog from '@/components/semantic/UnmappedFieldsDialog';
import AutoMappingDialog from '@/components/semantic/AutoMappingDialog';
import FieldDetailsDialog from '@/components/dataCatalog/FieldDetailsDialog';
import AssetListDialog from '@/components/dataCatalog/AssetListDialog';
import MappedFieldsDialog from '@/components/semantic/MappedFieldsDialog';

type ViewMode = 'physical' | 'semantic' | 'mapping';

function DataCatalogPageContent() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { rebuildCatalog, isRebuilding } = useDataCatalog();
  const [viewMode, setViewMode] = useState<ViewMode>('semantic');
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedTerm, setSelectedTerm] = useState<any>(null);
  const [selectedField, setSelectedField] = useState<any>(null);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [unmappedDialogOpen, setUnmappedDialogOpen] = useState(false);
  const [autoMapDialogOpen, setAutoMapDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [assetListDialogOpen, setAssetListDialogOpen] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<string>('');
  const [selectedAssets, setSelectedAssets] = useState<any[]>([]);
  const [mappedFieldsDialogOpen, setMappedFieldsDialogOpen] = useState(false);
  const [page, setPage] = useState(0); // DataGrid uses 0-based pages
  const [pageSize, setPageSize] = useState(50);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  
  // Debounce search term
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Use paginated data for display
  const { data: catalogData, isLoading: catalogLoading } = useQuery<{
    items: any[];
    summary: any;
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>({
    queryKey: ['data-catalog-paginated', page + 1, pageSize, debouncedSearchTerm, viewMode, 
               // Only include sort in query key for server-side sorting (physical view)
               viewMode !== 'semantic' && sortModel.length > 0 ? `${sortModel[0].field}-${sortModel[0].sort}` : 'no-sort'],
    queryFn: () => {
      // Only send sort params for server-side sorting (physical view)
      const sortParams = viewMode !== 'semantic' && sortModel.length > 0 && sortModel[0].sort ? {
        sortBy: sortModel[0].field,
        sortOrder: sortModel[0].sort as 'asc' | 'desc',
      } : {};
      
      return dataCatalogApi.getDataCatalog({
        page: page + 1, // API uses 1-based pages
        pageSize,
        search: debouncedSearchTerm,
        viewMode: viewMode === 'physical' ? 'all' : viewMode === 'semantic' ? 'all' : 'all',
        ...sortParams,
      });
    },
    placeholderData: (previousData) => previousData,
  });

  // Fetch semantic terms
  const { data: terms, isLoading: termsLoading } = useQuery({
    queryKey: ['semantic-terms', searchTerm],
    queryFn: () => semanticApi.getTerms({ search: searchTerm }),
  });

  // Fetch mappings
  const { data: mappings } = useQuery({
    queryKey: ['semantic-mappings'],
    queryFn: () => semanticApi.getMappings(),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['semantic-stats'],
    queryFn: semanticApi.getStats,
  });

  // Fetch unmapped fields
  const { data: unmappedFields } = useQuery({
    queryKey: ['unmapped-fields'],
    queryFn: semanticApi.getUnmappedFields,
    enabled: unmappedDialogOpen,
  });

  // Auto-map mutation
  const autoMapMutation = useMutation({
    mutationFn: (minConfidence: number) => semanticApi.autoMap(minConfidence),
    onSuccess: (data) => {
      enqueueSnackbar(`Successfully created ${data.mappings.length} auto-mappings`, { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['semantic-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['semantic-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-fields'] });
    },
  });

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleImportTerms = async () => {
    // TODO: Implement file upload dialog
    handleMenuClose();
  };

  const handleExportTerms = async () => {
    try {
      const data = await semanticApi.exportTerms();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `semantic-terms-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      enqueueSnackbar('Terms exported successfully', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to export terms', { variant: 'error' });
    }
    handleMenuClose();
  };


  // Transform catalog data based on view mode
  const getRowsData = () => {
    if (!catalogData?.items) return [];

    if (viewMode === 'physical') {
      // Show physical fields with mapping status
      return catalogData.items.map((field: any, index: number) => {
        const fieldId = field.semanticFieldId || (field.sources?.[0] 
          ? `${field.sources[0].assetType}:${field.sources[0].assetId}:${field.fieldName}`
          : `unknown:unknown:${field.fieldName}`);
        const mapping = mappings?.find((m: any) => m.fieldId === fieldId && m.status === 'active');
        
        // Calculate counts by asset type
        const sources = field.sources || [];
        const datasetsCount = sources.filter((s: any) => s.assetType === 'dataset').length;
        const analysesCount = sources.filter((s: any) => s.assetType === 'analysis').length;
        const dashboardsCount = sources.filter((s: any) => s.assetType === 'dashboard').length;
        
        return {
          ...field,
          id: index,
          fieldId,
          mapping,
          datasetsCount,
          analysesCount,
          dashboardsCount,
          hasVariants: field.isCalculated && field.expressions && field.expressions.length > 1,
          usageCount: field.usageCount || 0,
        };
      });
    } else if (viewMode === 'semantic') {
      // Show semantic terms with mapping info
      return terms?.map((term: any, index: number) => {
        const termMappings = mappings?.filter((m: any) => m.termId === term.id && m.status === 'active') || [];
        
        // Aggregate usage data from all mapped physical fields
        let totalUsageCount = 0;
        let datasetsCount = 0;
        let analysesCount = 0;
        let dashboardsCount = 0;
        let hasCalculatedFields = false;
        let hasVariants = false;
        const uniqueDatasets = new Set<string>();
        const uniqueAnalyses = new Set<string>();
        const uniqueDashboards = new Set<string>();
        
        // For each mapping, find the corresponding field and aggregate its usage
        for (const mapping of termMappings) {
          const field = catalogData.items
            ?.find((f: any) => {
              const fieldId = f.semanticFieldId || (f.sources?.[0] 
                ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
                : `unknown:unknown:${f.fieldName}`);
              return fieldId === mapping.fieldId;
            });
          
          if (field) {
            // Add usage count
            totalUsageCount += field.usageCount || 0;
            
            // Check if any mapped field is calculated
            if (field.isCalculated) {
              hasCalculatedFields = true;
              // Check if this calculated field has variants
              if (field.hasVariants || (field.expressions && field.expressions.length > 1)) {
                hasVariants = true;
              }
            }
            
            // Count unique assets
            if (field.sources) {
              for (const source of field.sources) {
                if (source.assetType === 'dataset') {
                  uniqueDatasets.add(source.assetId);
                } else if (source.assetType === 'analysis') {
                  uniqueAnalyses.add(source.assetId);
                } else if (source.assetType === 'dashboard') {
                  uniqueDashboards.add(source.assetId);
                }
              }
            }
          }
        }
        
        datasetsCount = uniqueDatasets.size;
        analysesCount = uniqueAnalyses.size;
        dashboardsCount = uniqueDashboards.size;
        
        return {
          ...term,
          id: term.id || index,
          mappedFieldsCount: termMappings.length,
          avgConfidence: termMappings.length > 0
            ? Math.round(termMappings.reduce((sum: number, m: any) => sum + m.confidence, 0) / termMappings.length)
            : 0,
          usageCount: totalUsageCount,
          datasetsCount,
          analysesCount,
          dashboardsCount,
          hasCalculatedFields,
          hasVariants,
        };
      }) || [];
    } else {
      // Show mapping view
      return mappings?.filter((m: any) => m.status === 'active').map((m: any, index: number) => ({
        ...m,
        id: m.id || index,
      })) || [];
    }
  };

  const physicalColumns: GridColDef[] = [
    {
      field: 'fieldName',
      headerName: 'Field Name',
      flex: 1.5,
      minWidth: 200,
      sortable: true,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {params.row.isCalculated && (
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <Tooltip title={params.row.hasVariants ? "Calculated field with variants across assets" : "Calculated field"}>
                <CalculateIcon 
                  fontSize="small" 
                  color="primary" 
                />
              </Tooltip>
              {params.row.hasVariants && (
                <Tooltip title="Has different expressions across assets">
                  <WarningIcon 
                    sx={{ 
                      position: 'absolute', 
                      fontSize: 12, 
                      right: -6, 
                      top: -6, 
                      bgcolor: 'background.paper',
                      borderRadius: '50%',
                      color: 'warning.main'
                    }} 
                  />
                </Tooltip>
              )}
            </Box>
          )}
          <Typography variant="body2" fontWeight="medium">
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'semanticTerm',
      headerName: 'Semantic Term',
      flex: 1,
      minWidth: 180,
      sortable: true,
      valueGetter: (params) => {
        const mapping = params.row.mapping;
        if (mapping) {
          const term = terms?.find((t: any) => t.id === mapping.termId);
          return term?.businessName || '';
        }
        return '';
      },
      renderCell: (params) => {
        const mapping = params.row.mapping;
        
        if (mapping) {
          const term = terms?.find((t: any) => t.id === mapping.termId);
          return (
            <Tooltip title={`Confidence: ${mapping.confidence}%`}>
              <Chip
                icon={<MappedIcon />}
                label={term?.businessName || term?.term || 'Unknown'}
                size="small"
                color="success"
                onClick={() => {
                  setSelectedField(params.row);
                  setMappingDialogOpen(true);
                }}
              />
            </Tooltip>
          );
        }
        
        return (
          <Button
            size="small"
            startIcon={<UnmappedIcon />}
            onClick={() => {
              setSelectedField(params.row);
              setMappingDialogOpen(true);
            }}
          >
            Map Term
          </Button>
        );
      },
    },
    {
      field: 'dataType',
      headerName: 'Data Type',
      width: 100,
      renderCell: (params) => (
        <Chip label={params.value || 'Unknown'} size="small" variant="outlined" />
      ),
    },
    {
      field: 'usageCount',
      headerName: 'Total Usage',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      valueGetter: (params) => params.row.usageCount || 0,
      renderCell: (params) => {
        const count = params.value || 0;
        return (
          <Tooltip 
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Total Usage: {count}
                </Typography>
                <Typography variant="caption" display="block">
                  Count of actual usage in:
                </Typography>
                <Typography variant="caption" display="block">
                  • Visuals (charts, tables, etc.)
                </Typography>
                <Typography variant="caption" display="block">
                  • Calculated field expressions
                </Typography>
              </Box>
            }
            arrow
          >
            <Typography 
              variant="body2" 
              fontWeight={count > 0 ? 'medium' : 'normal'}
              color={count > 0 ? 'text.primary' : 'text.disabled'}
              sx={{ cursor: 'help' }}
            >
              {count}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'datasetsCount',
      headerName: 'Datasets',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderHeader: () => (
        <Tooltip title="Number of datasets containing this field (regardless of actual usage in visuals/calculations)">
          <span>Datasets</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        const sources = params.row.sources || [];
        const datasetSources = sources.filter((s: any) => s.assetType === 'dataset');
        
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setSelectedField(params.row);
              setSelectedAssetType('dataset');
              setSelectedAssets(datasetSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'analysesCount',
      headerName: 'Analyses',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderHeader: () => (
        <Tooltip title="Number of analyses containing this field (regardless of actual usage in visuals/calculations)">
          <span>Analyses</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        const sources = params.row.sources || [];
        const analysisSources = sources.filter((s: any) => s.assetType === 'analysis');
        
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setSelectedField(params.row);
              setSelectedAssetType('analysis');
              setSelectedAssets(analysisSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'dashboardsCount',
      headerName: 'Dashboards',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      renderHeader: () => (
        <Tooltip title="Number of dashboards containing this field (regardless of actual usage in visuals/calculations)">
          <span>Dashboards</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        const sources = params.row.sources || [];
        const dashboardSources = sources.filter((s: any) => s.assetType === 'dashboard');
        
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setSelectedField(params.row);
              setSelectedAssetType('dashboard');
              setSelectedAssets(dashboardSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() => {
            setSelectedField(params.row);
            setDetailsDialogOpen(true);
          }}
        >
          <InfoIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const semanticColumns: GridColDef[] = [
    {
      field: 'businessName',
      headerName: 'Business Term',
      flex: 1,
      minWidth: 200,
      sortable: true,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {params.row.hasCalculatedFields && (
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <Tooltip title={
                params.row.hasVariants 
                  ? "Includes calculated fields with variants" 
                  : "Includes calculated fields"
              }>
                <CalculateIcon 
                  fontSize="small" 
                  color="primary" 
                />
              </Tooltip>
              {params.row.hasVariants && (
                <Tooltip title="Some mapped fields have different expressions across assets">
                  <WarningIcon 
                    sx={{ 
                      position: 'absolute', 
                      fontSize: 12, 
                      right: -6, 
                      top: -6, 
                      bgcolor: 'background.paper',
                      borderRadius: '50%',
                      color: 'warning.main'
                    }} 
                  />
                </Tooltip>
              )}
            </Box>
          )}
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {params.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Technical: {params.row.term}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 120,
      sortable: true,
      renderCell: (params) => params.value ? (
        <Chip label={params.value} size="small" variant="outlined" />
      ) : null,
    },
    {
      field: 'mappedFieldsCount',
      headerName: 'Mapped Fields',
      width: 130,
      sortable: true,
      renderCell: (params) => {
        const count = params.value || 0;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {count > 0 ? (
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setSelectedTerm(params.row);
                  setMappedFieldsDialogOpen(true);
                }}
                sx={{ minWidth: 0, p: 0.5 }}
              >
                <Badge badgeContent={count} color="primary">
                  <MappedIcon color="success" />
                </Badge>
              </Button>
            ) : (
              <Badge badgeContent={0} color="primary">
                <MappedIcon color="disabled" />
              </Badge>
            )}
            {params.row.avgConfidence > 0 && (
              <Typography variant="caption" color="text.secondary">
                {params.row.avgConfidence}% avg
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'usageCount',
      headerName: 'Total Usage',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      sortable: true,
      valueGetter: (params) => params.row.usageCount || 0,
      renderCell: (params) => {
        const count = params.value || 0;
        return (
          <Tooltip 
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Total Usage: {count}
                </Typography>
                <Typography variant="caption" display="block">
                  Aggregated count from all mapped physical fields
                </Typography>
              </Box>
            }
            arrow
          >
            <Typography 
              variant="body2" 
              fontWeight={count > 0 ? 'medium' : 'normal'}
              color={count > 0 ? 'text.primary' : 'text.disabled'}
              sx={{ cursor: 'help' }}
            >
              {count}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'datasetsCount',
      headerName: 'Datasets',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      sortable: true,
      renderHeader: () => (
        <Tooltip title="Number of datasets using any mapped physical field">
          <span>Datasets</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              // Collect all unique datasets from mapped fields
              const termMappings = mappings?.filter((m: any) => m.termId === params.row.id && m.status === 'active') || [];
              const datasetSources: any[] = [];
              const seenDatasets = new Set<string>();
              
              for (const mapping of termMappings) {
                const field = catalogData?.items
                  .find((f: any) => {
                    const fieldId = f.semanticFieldId || (f.sources?.[0] 
                      ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
                      : `unknown:unknown:${f.fieldName}`);
                    return fieldId === mapping.fieldId;
                  });
                
                if (field?.sources) {
                  field.sources
                    .filter((s: any) => s.assetType === 'dataset' && !seenDatasets.has(s.assetId))
                    .forEach((s: any) => {
                      seenDatasets.add(s.assetId);
                      datasetSources.push(s);
                    });
                }
              }
              
              setSelectedTerm(params.row);
              setSelectedAssetType('dataset');
              setSelectedAssets(datasetSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'analysesCount',
      headerName: 'Analyses',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      sortable: true,
      renderHeader: () => (
        <Tooltip title="Number of analyses using any mapped physical field">
          <span>Analyses</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              // Collect all unique analyses from mapped fields
              const termMappings = mappings?.filter((m: any) => m.termId === params.row.id && m.status === 'active') || [];
              const analysisSources: any[] = [];
              const seenAnalyses = new Set<string>();
              
              for (const mapping of termMappings) {
                const field = catalogData?.items
                  .find((f: any) => {
                    const fieldId = f.semanticFieldId || (f.sources?.[0] 
                      ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
                      : `unknown:unknown:${f.fieldName}`);
                    return fieldId === mapping.fieldId;
                  });
                
                if (field?.sources) {
                  field.sources
                    .filter((s: any) => s.assetType === 'analysis' && !seenAnalyses.has(s.assetId))
                    .forEach((s: any) => {
                      seenAnalyses.add(s.assetId);
                      analysisSources.push(s);
                    });
                }
              }
              
              setSelectedTerm(params.row);
              setSelectedAssetType('analysis');
              setSelectedAssets(analysisSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'dashboardsCount',
      headerName: 'Dashboards',
      width: 110,
      align: 'center',
      headerAlign: 'center',
      sortable: true,
      renderHeader: () => (
        <Tooltip title="Number of dashboards using any mapped physical field">
          <span>Dashboards</span>
        </Tooltip>
      ),
      renderCell: (params) => {
        const count = params.value || 0;
        return count > 0 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              // Collect all unique dashboards from mapped fields
              const termMappings = mappings?.filter((m: any) => m.termId === params.row.id && m.status === 'active') || [];
              const dashboardSources: any[] = [];
              const seenDashboards = new Set<string>();
              
              for (const mapping of termMappings) {
                const field = catalogData?.items
                  .find((f: any) => {
                    const fieldId = f.semanticFieldId || (f.sources?.[0] 
                      ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
                      : `unknown:unknown:${f.fieldName}`);
                    return fieldId === mapping.fieldId;
                  });
                
                if (field?.sources) {
                  field.sources
                    .filter((s: any) => s.assetType === 'dashboard' && !seenDashboards.has(s.assetId))
                    .forEach((s: any) => {
                      seenDashboards.add(s.assetId);
                      dashboardSources.push(s);
                    });
                }
              }
              
              setSelectedTerm(params.row);
              setSelectedAssetType('dashboard');
              setSelectedAssets(dashboardSources);
              setAssetListDialogOpen(true);
            }}
            sx={{ minWidth: 0, fontWeight: 'medium' }}
          >
            {count}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled">0</Typography>
        );
      },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 200,
      sortable: false,
      valueGetter: (params) => {
        const tags = params.row.tags || [];
        return tags.join(', ');
      },
      renderCell: (params) => {
        const tags = params.row.tags || [];
        
        if (tags.length === 0) {
          return <Typography variant="body2" color="text.disabled">-</Typography>;
        }
        
        const displayTags = tags.slice(0, 2);
        const remainingCount = tags.length - 2;
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {displayTags.map((tag: string, index: number) => (
              <Chip
                key={index}
                label={tag}
                size="small"
                sx={{ 
                  height: 20,
                  fontSize: '0.75rem',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            ))}
            {remainingCount > 0 && (
              <Tooltip title={tags.slice(2).join(', ')}>
                <Chip
                  label={`+${remainingCount}`}
                  size="small"
                  color="primary"
                  sx={{ 
                    height: 20,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              </Tooltip>
            )}
          </Box>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      renderCell: (params) => (
        <Button
          size="small"
          onClick={() => {
            setSelectedTerm(params.row);
            setTermDialogOpen(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const mappingColumns: GridColDef[] = [
    {
      field: 'fieldId',
      headerName: 'Physical Field',
      flex: 1,
      renderCell: (params) => {
        const parts = params.value.split(':');
        const [type, id, fieldName] = parts;
        return (
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {fieldName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {type} • {id}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'termId',
      headerName: 'Semantic Term',
      flex: 1,
      renderCell: (params) => {
        const term = terms?.find((t: any) => t.id === params.value);
        return term ? (
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {term.businessName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {term.term}
            </Typography>
          </Box>
        ) : null;
      },
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 150,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={params.value}
            sx={{ width: 80, height: 6, borderRadius: 3 }}
            color={params.value >= 85 ? 'success' : params.value >= 70 ? 'warning' : 'error'}
          />
          <Typography variant="caption">{params.value}%</Typography>
        </Box>
      ),
    },
    {
      field: 'mappingType',
      headerName: 'Type',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === 'manual' ? 'primary' : 'secondary'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'reason',
      headerName: 'Reason',
      flex: 1,
      renderCell: (params) => params.value ? (
        <Tooltip title={params.value}>
          <Typography variant="caption" noWrap>
            {params.value}
          </Typography>
        </Tooltip>
      ) : null,
    },
  ];

  if (catalogLoading || termsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Data Catalog</Typography>
          <Typography variant="body1" color="text.secondary">
            Unified view of physical fields and business semantics
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          {/* Metadata Search Link */}
          <Button
            variant="outlined"
            startIcon={<MetadataSearchIcon />}
            onClick={() => window.location.href = '/metadata-search'}
            color="secondary"
          >
            Metadata Search
          </Button>
          
          {/* View Mode Toggle */}
          <ButtonGroup variant="outlined">
            <Button
              startIcon={<PhysicalIcon />}
              onClick={() => setViewMode('physical')}
              variant={viewMode === 'physical' ? 'contained' : 'outlined'}
            >
              Physical
            </Button>
            <Button
              startIcon={<SemanticIcon />}
              onClick={() => setViewMode('semantic')}
              variant={viewMode === 'semantic' ? 'contained' : 'outlined'}
            >
              Semantic
            </Button>
            <Button
              startIcon={<ConfidenceIcon />}
              onClick={() => setViewMode('mapping')}
              variant={viewMode === 'mapping' ? 'contained' : 'outlined'}
            >
              Mappings
            </Button>
          </ButtonGroup>

          {/* Actions Menu */}
          <IconButton onClick={handleMenuOpen}>
            <MoreIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => { setTermDialogOpen(true); handleMenuClose(); }}>
              <SemanticIcon sx={{ mr: 1 }} /> Create Term
            </MenuItem>
            <MenuItem onClick={() => { setAutoMapDialogOpen(true); handleMenuClose(); }}>
              <AutoMapIcon sx={{ mr: 1 }} /> Auto-Map Fields
            </MenuItem>
            <Divider />
            <MenuItem 
              onClick={async () => { 
                handleMenuClose(); 
                try {
                  await rebuildCatalog();
                  enqueueSnackbar('Data catalog rebuild started', { variant: 'info' });
                } catch (error) {
                  enqueueSnackbar('Failed to rebuild catalog', { variant: 'error' });
                }
              }}
              disabled={isRebuilding}
            >
              <CalculateIcon sx={{ mr: 1 }} /> {isRebuilding ? 'Rebuilding...' : 'Rebuild Catalog'}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleImportTerms}>
              <ImportIcon sx={{ mr: 1 }} /> Import Terms
            </MenuItem>
            <MenuItem onClick={handleExportTerms}>
              <ExportIcon sx={{ mr: 1 }} /> Export Terms
            </MenuItem>
          </Menu>
        </Stack>
      </Box>

      {/* Stats Bar */}
      {stats && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" spacing={4} alignItems="center">
            <Box>
              <Typography variant="caption" color="text.secondary">Coverage</Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="h5">{stats.coveragePercentage}%</Typography>
                <Typography variant="body2" color="text.secondary">
                  {stats.mappedFields}/{stats.totalFields} fields
                </Typography>
              </Box>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">Terms</Typography>
              <Typography variant="h6">{terms?.length || 0}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Auto-Mapped</Typography>
              <Typography variant="h6">{stats.autoMappedFields}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Manual</Typography>
              <Typography variant="h6">{stats.manualMappedFields}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Avg Confidence</Typography>
              <Typography variant="h6">{stats.averageConfidence}%</Typography>
            </Box>
            {stats.unmappedFields > 0 && (
              <Box sx={{ ml: 'auto' }}>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<UnmappedIcon />}
                  onClick={() => setUnmappedDialogOpen(true)}
                >
                  {stats.unmappedFields} Unmapped Fields
                </Button>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

      {/* Search Bar */}
      {viewMode === 'semantic' && (
        <TextField
          fullWidth
          placeholder="Search semantic terms..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      )}

      {/* Summary Cards */}
      {catalogData && viewMode === 'physical' && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Total Fields
                </Typography>
                <Typography variant="h4">
                  {catalogData.summary?.totalFields || 0}
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
                  {catalogData.summary?.totalCalculatedFields || 0}
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
                  {catalogData.summary?.totalDatasets || 0}
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
                  {catalogData.summary?.totalAnalyses || 0}
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
                  {catalogData.summary?.totalDashboards || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Search Bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder={`Search ${viewMode === 'physical' ? 'fields' : viewMode === 'semantic' ? 'terms' : 'mappings'}...`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0); // Reset to first page on search
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Data Grid */}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={getRowsData()}
          columns={viewMode === 'physical' ? physicalColumns : viewMode === 'semantic' ? semanticColumns : mappingColumns}
          slots={{
            toolbar: GridToolbar,
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: false, // Use server-side search instead
            },
          }}
          loading={catalogLoading}
          rowCount={catalogData?.pagination?.totalItems || 0}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          sortingMode={viewMode === 'semantic' ? "client" : "server"}
          sortModel={sortModel}
          onSortModelChange={(model) => {
            setSortModel(model);
            setPage(0); // Reset to first page when sorting changes
          }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Dialogs */}
      <SemanticTermDialog
        open={termDialogOpen}
        onClose={() => {
          setTermDialogOpen(false);
          setSelectedTerm(null);
        }}
        term={selectedTerm}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['semantic-terms'] });
          setTermDialogOpen(false);
          setSelectedTerm(null);
        }}
      />

      <SemanticMappingDialog
        open={mappingDialogOpen}
        onClose={() => {
          setMappingDialogOpen(false);
          setSelectedField(null);
        }}
        field={selectedField}
        terms={terms || []}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['semantic-mappings'] });
          queryClient.invalidateQueries({ queryKey: ['semantic-stats'] });
          setMappingDialogOpen(false);
          setSelectedField(null);
        }}
      />

      <UnmappedFieldsDialog
        open={unmappedDialogOpen}
        onClose={() => setUnmappedDialogOpen(false)}
        unmappedFields={unmappedFields || []}
        onMapField={(field) => {
          setSelectedField(field);
          setUnmappedDialogOpen(false);
          setMappingDialogOpen(true);
        }}
      />

      <AutoMappingDialog
        open={autoMapDialogOpen}
        onClose={() => setAutoMapDialogOpen(false)}
        onConfirm={(minConfidence) => {
          autoMapMutation.mutate(minConfidence);
          setAutoMapDialogOpen(false);
        }}
      />

      {/* Field Details Dialog - for physical view */}
      <FieldDetailsDialog
        open={detailsDialogOpen}
        onClose={() => {
          setDetailsDialogOpen(false);
          setSelectedField(null);
          // Refresh the current page to show updated tags
          queryClient.invalidateQueries({ queryKey: ['data-catalog-paginated'] });
        }}
        field={selectedField}
        allCalculatedFields={catalogData?.items?.filter((f: any) => f.isCalculated) || []}
        onFieldUpdate={(fieldName, metadata) => {
          // Optimistically update the current data
          queryClient.setQueryData(['data-catalog-paginated', page + 1, pageSize, debouncedSearchTerm, viewMode, 
            viewMode !== 'semantic' && sortModel.length > 0 ? `${sortModel[0].field}-${sortModel[0].sort}` : 'no-sort'], 
            (oldData: any) => {
              if (!oldData) return oldData;
              
              return {
                ...oldData,
                data: {
                  ...oldData.data,
                  items: oldData.data.items.map((item: any) => {
                    if (item.fieldName === fieldName) {
                      return {
                        ...item,
                        customMetadata: {
                          tags: metadata.tags.map((tag: any) => `${tag.key}:${tag.value}`),
                          description: metadata.description,
                          dataClassification: metadata.dataClassification,
                          isPII: metadata.isPII,
                          isSensitive: metadata.isSensitive,
                        }
                      };
                    }
                    return item;
                  })
                }
              };
            }
          );
        }}
      />

      {/* Asset List Dialog - for showing assets using a field */}
      <AssetListDialog
        open={assetListDialogOpen}
        onClose={() => {
          setAssetListDialogOpen(false);
          setSelectedAssets([]);
          setSelectedAssetType('');
        }}
        field={selectedField || selectedTerm}
        assetType={selectedAssetType}
        assets={selectedAssets}
      />

      {/* Mapped Fields Dialog - for showing fields mapped to a semantic term */}
      <MappedFieldsDialog
        open={mappedFieldsDialogOpen}
        onClose={() => {
          setMappedFieldsDialogOpen(false);
          setSelectedTerm(null);
        }}
        term={selectedTerm}
        mappings={mappings || []}
        fields={catalogData?.items || []}
      />
    </Box>
  );
}

export default function DataCatalogPage() {
  return (
    <DataCatalogProvider>
      <DataCatalogPageContent />
    </DataCatalogProvider>
  );
}