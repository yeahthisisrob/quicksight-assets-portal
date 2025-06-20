import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Autocomplete,
  Chip,
  Button,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Tag as TagIcon,
  Security as SecurityIcon,
  Info as InfoIcon,
  Storage as DatasetIcon,
  Assessment as AnalysisIcon,
  Dashboard as DashboardIcon,
  Calculate as CalculateIcon,
  Category as SemanticIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridToolbar } from '@mui/x-data-grid';
import { tagsApi, dataCatalogApi, semanticApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import FieldDetailsDialog from '@/components/dataCatalog/FieldDetailsDialog';
import AssetListDialog from '@/components/dataCatalog/AssetListDialog';

interface SearchFilters {
  tags: Array<{ key: string; value: string }>;
  dataClassification?: string;
  piiCategory?: string;
  semanticTerm?: string;
  dataType?: string;
  assetType?: string;
  hasDescription?: boolean;
  isCalculated?: boolean;
  isMapped?: boolean;
}

export default function MetadataSearchPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [filters, setFilters] = useState<SearchFilters>({
    tags: [],
  });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedField, setSelectedField] = useState<any>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [assetListDialogOpen, setAssetListDialogOpen] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<string>('');
  const [selectedAssets, setSelectedAssets] = useState<any[]>([]);

  // Fetch catalog data (without pagination for metadata search)
  const { data: catalogData } = useQuery({
    queryKey: ['data-catalog', 1, 1000, '', 'all'], // Get all items for search
    queryFn: () => dataCatalogApi.getDataCatalog({ page: 1, pageSize: 1000, search: '', viewMode: 'all' }),
  });

  // Fetch semantic terms
  const { data: semanticTerms } = useQuery({
    queryKey: ['semantic-terms'],
    queryFn: () => semanticApi.getTerms(),
  });

  // Fetch semantic mappings
  const { data: mappings } = useQuery({
    queryKey: ['semantic-mappings'],
    queryFn: () => semanticApi.getMappings(),
  });

  // For now, we'll use an empty array for available tags
  // This could be enhanced to fetch actual tags from the backend
  const availableTags: Array<{ key: string; value: string }> = [];

  const allFields = catalogData?.items || [];

  const handleSearch = async () => {
    setLoading(true);
    try {
      let results = [...allFields];

      // Filter by tags if provided
      if (filters.tags.length > 0) {
        const searchResponse = await tagsApi.searchFieldsByTags(filters.tags);
        // searchFieldsByTags returns an array directly, not an object with fields property
        const taggedFieldIds = new Set(searchResponse.map((f: any) => f.fieldId));
        results = results.filter(field => taggedFieldIds.has(field.fieldId));
      }

      // Apply other filters
      if (filters.dataClassification) {
        results = results.filter(field => 
          field.metadata?.dataClassification === filters.dataClassification
        );
      }

      if (filters.piiCategory) {
        results = results.filter(field => 
          field.metadata?.piiCategory === filters.piiCategory
        );
      }

      if (filters.dataType) {
        results = results.filter(field => 
          field.dataType === filters.dataType
        );
      }

      if (filters.assetType) {
        results = results.filter(field => 
          field.sources.some((s: any) => s.assetType === filters.assetType)
        );
      }

      if (filters.hasDescription !== undefined) {
        results = results.filter(field => 
          filters.hasDescription ? !!field.metadata?.description : !field.metadata?.description
        );
      }

      if (filters.isCalculated !== undefined) {
        results = results.filter(field => field.isCalculated === filters.isCalculated);
      }

      if (filters.semanticTerm) {
        // Get all mappings for the selected semantic term
        const termMappings = mappings?.filter((m: any) => 
          m.termId === filters.semanticTerm && m.status === 'active'
        ) || [];
        const mappedFieldIds = new Set(termMappings.map((m: any) => m.fieldId));
        
        // Filter to only show fields mapped to this specific semantic term
        results = results.filter(field => {
          const fieldId = field.sources?.[0] 
            ? `${field.sources[0].assetType}:${field.sources[0].assetId}:${field.fieldName}`
            : `unknown:unknown:${field.fieldName}`;
          return mappedFieldIds.has(fieldId);
        });
      }
      
      // Apply the isMapped filter independently (for when no specific term is selected)
      if (filters.isMapped !== undefined && !filters.semanticTerm) {
        const allMappings = mappings?.filter((m: any) => m.status === 'active') || [];
        const allMappedFieldIds = new Set(allMappings.map((m: any) => m.fieldId));
        
        results = results.filter(field => {
          const fieldId = field.sources?.[0] 
            ? `${field.sources[0].assetType}:${field.sources[0].assetId}:${field.fieldName}`
            : `unknown:unknown:${field.fieldName}`;
          const isMapped = allMappedFieldIds.has(fieldId);
          return filters.isMapped ? isMapped : !isMapped;
        });
      }

      setSearchResults(results);
      enqueueSnackbar(`Found ${results.length} fields matching your criteria`, { variant: 'success' });
    } catch (error) {
      console.error('Search error:', error);
      enqueueSnackbar('Error searching fields', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setFilters({ tags: [] });
    setSearchResults([]);
  };

  const handleAssetClick = (assetType: string, field: any) => {
    const assets = field.sources
      .filter((s: any) => s.assetType === assetType)
      .map((s: any) => ({
        assetId: s.assetId,
        assetName: s.assetName,
        assetType: s.assetType,
        usedInVisuals: s.usedInVisuals,
        usedInCalculatedFields: s.usedInCalculatedFields,
      }));
    
    setSelectedAssets(assets);
    setSelectedAssetType(assetType);
    setSelectedField(field);
    setAssetListDialogOpen(true);
  };

  const columns: GridColDef[] = [
    {
      field: 'fieldName',
      headerName: 'Field Name',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {params.row.isCalculated && (
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <Tooltip title={params.row.hasVariants ? "Calculated field with variants across assets" : "Calculated field"}>
                <CalculateIcon fontSize="small" color="primary" />
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
          <Typography>{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'dataType',
      headerName: 'Data Type',
      width: 120,
      renderCell: (params) => (
        <Chip label={params.value || 'Unknown'} size="small" variant="outlined" />
      ),
    },
    {
      field: 'semanticTerm',
      headerName: 'Semantic Term',
      width: 180,
      renderCell: (params) => {
        const fieldId = params.row.sources?.[0] 
          ? `${params.row.sources[0].assetType}:${params.row.sources[0].assetId}:${params.row.fieldName}`
          : `unknown:unknown:${params.row.fieldName}`;
        
        const mapping = mappings?.find((m: any) => 
          m.fieldId === fieldId && m.status === 'active'
        );
        
        const term = mapping ? semanticTerms?.find((t: any) => t.id === mapping.termId) : null;
        
        return term ? (
          <Chip 
            icon={<SemanticIcon />}
            label={term.businessName} 
            size="small" 
            color="secondary"
          />
        ) : (
          <Typography variant="caption" color="text.secondary">Not mapped</Typography>
        );
      },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 200,
      renderCell: (params) => {
        const tags = params.row.metadata?.tags || [];
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {tags.slice(0, 2).map((tag: any, index: number) => (
              <Chip
                key={index}
                label={`${tag.key}: ${tag.value}`}
                size="small"
                variant="outlined"
                icon={<TagIcon />}
              />
            ))}
            {tags.length > 2 && (
              <Chip label={`+${tags.length - 2}`} size="small" variant="outlined" />
            )}
          </Box>
        );
      },
    },
    {
      field: 'dataClassification',
      headerName: 'Classification',
      width: 130,
      renderCell: (params) => {
        const classification = params.row.metadata?.dataClassification;
        if (!classification) return null;
        
        const color = classification === 'Public' ? 'success' : 
                     classification === 'Internal' ? 'warning' : 
                     classification === 'Confidential' ? 'error' : 'default';
        
        return (
          <Chip 
            icon={<SecurityIcon />}
            label={classification} 
            size="small" 
            color={color}
          />
        );
      },
    },
    {
      field: 'datasets',
      headerName: 'Datasets',
      width: 100,
      align: 'center',
      renderCell: (params) => {
        const count = params.row.sources.filter((s: any) => s.assetType === 'dataset').length;
        return count > 0 ? (
          <Chip
            label={count}
            size="small"
            icon={<DatasetIcon />}
            clickable
            onClick={() => handleAssetClick('dataset', params.row)}
          />
        ) : null;
      },
    },
    {
      field: 'analyses',
      headerName: 'Analyses',
      width: 100,
      align: 'center',
      renderCell: (params) => {
        const count = params.row.sources.filter((s: any) => s.assetType === 'analysis').length;
        return count > 0 ? (
          <Chip
            label={count}
            size="small"
            icon={<AnalysisIcon />}
            clickable
            onClick={() => handleAssetClick('analysis', params.row)}
            color="secondary"
          />
        ) : null;
      },
    },
    {
      field: 'dashboards',
      headerName: 'Dashboards',
      width: 100,
      align: 'center',
      renderCell: (params) => {
        const count = params.row.sources.filter((s: any) => s.assetType === 'dashboard').length;
        return count > 0 ? (
          <Chip
            label={count}
            size="small"
            icon={<DashboardIcon />}
            clickable
            onClick={() => handleAssetClick('dashboard', params.row)}
            color="success"
          />
        ) : null;
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() => {
            setSelectedField(params.row);
            setDetailsDialogOpen(true);
          }}
        >
          <InfoIcon />
        </IconButton>
      ),
    },
  ];

  const uniqueDataTypes: string[] = Array.from(new Set(allFields.map((f: any) => f.dataType).filter(Boolean))) as string[];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Metadata Search
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Search for fields across all assets using metadata attributes, tags, and semantic mappings
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Search Filters
            </Typography>
          </Grid>

          {/* Tags Filter */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              freeSolo
              options={availableTags.map((tag) => ({
                key: tag.key,
                value: tag.value,
                label: `${tag.key}: ${tag.value}`,
              }))}
              value={filters.tags}
              onChange={(_, newValue) => {
                setFilters({
                  ...filters,
                  tags: newValue.map(v => 
                    typeof v === 'string' 
                      ? { key: v.split(':')[0]?.trim() || '', value: v.split(':')[1]?.trim() || '' }
                      : { key: v.key, value: v.value }
                  ),
                });
              }}
              getOptionLabel={(option) => 
                typeof option === 'string' ? option : `${option.key}: ${option.value}`
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder="Search by tags..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <TagIcon />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={typeof option === 'string' ? option : `${option.key}: ${option.value}`}
                    {...getTagProps({ index })}
                  />
                ))
              }
            />
          </Grid>

          {/* Data Classification Filter */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Data Classification</InputLabel>
              <Select
                value={filters.dataClassification || ''}
                onChange={(e) => setFilters({ ...filters, dataClassification: e.target.value })}
                label="Data Classification"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Public">Public</MenuItem>
                <MenuItem value="Internal">Internal</MenuItem>
                <MenuItem value="Confidential">Confidential</MenuItem>
                <MenuItem value="Restricted">Restricted</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* PII Category Filter */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>PII Category</InputLabel>
              <Select
                value={filters.piiCategory || ''}
                onChange={(e) => setFilters({ ...filters, piiCategory: e.target.value })}
                label="PII Category"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="None">None</MenuItem>
                <MenuItem value="Direct">Direct</MenuItem>
                <MenuItem value="Indirect">Indirect</MenuItem>
                <MenuItem value="Sensitive">Sensitive</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Semantic Term Filter */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Semantic Term</InputLabel>
              <Select
                value={filters.semanticTerm || ''}
                onChange={(e) => setFilters({ ...filters, semanticTerm: e.target.value })}
                label="Semantic Term"
              >
                <MenuItem value="">All</MenuItem>
                {semanticTerms?.map((term: any) => (
                  <MenuItem key={term.id} value={term.id}>
                    {term.businessName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Data Type Filter */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Data Type</InputLabel>
              <Select
                value={filters.dataType || ''}
                onChange={(e) => setFilters({ ...filters, dataType: e.target.value })}
                label="Data Type"
              >
                <MenuItem value="">All</MenuItem>
                {uniqueDataTypes.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Asset Type Filter */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Asset Type</InputLabel>
              <Select
                value={filters.assetType || ''}
                onChange={(e) => setFilters({ ...filters, assetType: e.target.value })}
                label="Asset Type"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="dataset">Datasets</MenuItem>
                <MenuItem value="analysis">Analyses</MenuItem>
                <MenuItem value="dashboard">Dashboards</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Additional Filters */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small">
                <InputLabel>Has Description</InputLabel>
                <Select
                  value={filters.hasDescription === undefined ? '' : filters.hasDescription.toString()}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    hasDescription: e.target.value === '' ? undefined : e.target.value === 'true' 
                  })}
                  label="Has Description"
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel>Is Calculated</InputLabel>
                <Select
                  value={filters.isCalculated === undefined ? '' : filters.isCalculated.toString()}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    isCalculated: e.target.value === '' ? undefined : e.target.value === 'true' 
                  })}
                  label="Is Calculated"
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel>Is Mapped</InputLabel>
                <Select
                  value={filters.isMapped === undefined ? '' : filters.isMapped.toString()}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    isMapped: e.target.value === '' ? undefined : e.target.value === 'true' 
                  })}
                  label="Is Mapped"
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
                onClick={handleSearch}
                disabled={loading}
              >
                Search
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClearFilters}
              >
                Clear Filters
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Summary Cards */}
      {searchResults.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">{searchResults.length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Fields Found
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">
                  {searchResults.filter(f => f.isCalculated).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Calculated Fields
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">
                  {searchResults.filter(f => {
                    const fieldId = f.sources?.[0] 
                      ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
                      : `unknown:unknown:${f.fieldName}`;
                    return mappings?.some((m: any) => 
                      m.fieldId === fieldId && m.status === 'active'
                    );
                  }).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mapped to Semantic Terms
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">
                  {searchResults.filter(f => f.metadata?.tags?.length > 0).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tagged Fields
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <Paper sx={{ height: 600 }}>
          <DataGrid
            rows={searchResults}
            columns={columns}
            getRowId={(row) => row.fieldId || `${row.fieldName}-${Math.random()}`}
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            slots={{
              toolbar: GridToolbar,
            }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 500 },
              },
            }}
            disableRowSelectionOnClick
          />
        </Paper>
      )}

      {/* No Results */}
      {searchResults.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {filters.tags.length > 0 || filters.dataClassification || filters.piiCategory || filters.semanticTerm
              ? 'No fields match your search criteria'
              : 'Use the filters above to search for fields'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try adjusting your filters or search for different criteria
          </Typography>
        </Paper>
      )}

      {/* Dialogs */}
      <FieldDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        field={selectedField}
      />

      <AssetListDialog
        open={assetListDialogOpen}
        onClose={() => setAssetListDialogOpen(false)}
        field={selectedField}
        assetType={selectedAssetType}
        assets={selectedAssets}
      />
    </Box>
  );
}