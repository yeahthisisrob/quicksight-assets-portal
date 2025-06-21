import { useState, useEffect, ReactNode } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowSelectionModel,
} from '@mui/x-data-grid';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  LocalOffer as TagIcon,
} from '@mui/icons-material';
import { useDebounce } from '@/hooks/useDebounce';
import { assetsApi, lineageApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import { useQuery } from '@tanstack/react-query';
import BulkActionsToolbar from '@/components/common/BulkActionsToolbar';
import AddToFolderDialog from '@/components/common/AddToFolderDialog';
import BulkTagDialog from '@/components/common/BulkTagDialog';

interface AssetListPageProps {
  title: string;
  subtitle: string;
  assetType: 'dashboard' | 'dataset' | 'analysis' | 'datasource';
  columns: GridColDef[];
  assets: any[];
  loading: boolean;
  totalRows: number;
  onFetchAssets: (page: number, pageSize: number, search?: string) => Promise<void>;
  onRefreshAssets: () => Promise<void>;
  dialogComponents?: {
    permissions?: ReactNode;
    relatedAssets?: ReactNode;
    tags?: ReactNode;
    custom?: ReactNode[];
  };
  enableBulkActions?: boolean;
  defaultPageSize?: number;
  defaultSortModel?: any[];
}

export default function AssetListPage({
  title,
  subtitle,
  assetType,
  columns,
  assets,
  loading,
  totalRows,
  onFetchAssets,
  onRefreshAssets,
  dialogComponents,
  enableBulkActions = true,
  defaultPageSize = 50,
  defaultSortModel = [{ field: 'lastExported', sort: 'desc' }],
}: AssetListPageProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingTags, setRefreshingTags] = useState(false);
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [addToFolderOpen, setAddToFolderOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: defaultPageSize });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortModel, setSortModel] = useState<any[]>(defaultSortModel);
  
  // Debounce search term
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  // Fetch lineage data for related assets
  const { data: lineageData } = useQuery({
    queryKey: ['lineage-all'],
    queryFn: () => lineageApi.getAllLineage(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
  
  // Fetch assets when pagination or search changes
  useEffect(() => {
    onFetchAssets(
      paginationModel.page + 1,
      paginationModel.pageSize,
      debouncedSearchTerm
    );
  }, [paginationModel.page, paginationModel.pageSize, debouncedSearchTerm, onFetchAssets]);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefreshAssets();
    await onFetchAssets(
      paginationModel.page + 1,
      paginationModel.pageSize,
      debouncedSearchTerm
    );
    setRefreshing(false);
  };
  
  const selectedAssets = assets.filter((asset: any) => selectedRows.includes(asset.id));
  
  const handleBulkComplete = () => {
    setSelectedRows([]);
    handleRefresh();
  };
  
  // Helper function to get related assets for a specific asset
  const getRelatedAssetsForAsset = (assetId: string): any[] => {
    if (!lineageData || !lineageData.lineage) return [];
    
    const relatedAssets: any[] = [];
    const assetLineage = lineageData.lineage.find((l: any) => l.assetId === assetId);
    
    if (assetLineage && assetLineage.relationships) {
      assetLineage.relationships.forEach((rel: any) => {
        relatedAssets.push({
          id: rel.targetAssetId,
          name: rel.targetAssetName,
          type: rel.targetAssetType,
          relationshipType: rel.relationshipType,
        });
      });
    }
    
    return relatedAssets;
  };
  
  const handleRefreshTags = async () => {
    setRefreshingTags(true);
    try {
      // Get all asset IDs from the current page
      const assetIds = assets.map((asset: any) => asset.id);
      
      if (assetIds.length === 0) {
        enqueueSnackbar('No assets to refresh', { variant: 'info' });
        return;
      }
      
      const result = await assetsApi.refreshAssetTags(assetType, assetIds);
      
      if (result.successful > 0) {
        enqueueSnackbar(`Successfully refreshed tags for ${result.successful} ${assetType}s`, { 
          variant: 'success' 
        });
        
        // Refresh the current page to show updated tags
        await onFetchAssets(
          paginationModel.page + 1,
          paginationModel.pageSize,
          debouncedSearchTerm
        );
      }
      
      if (result.failed > 0) {
        enqueueSnackbar(`Failed to refresh tags for ${result.failed} ${assetType}s`, { 
          variant: 'error' 
        });
      }
    } catch (error) {
      console.error('Error refreshing tags:', error);
      enqueueSnackbar('Failed to refresh tags', { variant: 'error' });
    } finally {
      setRefreshingTags(false);
    }
  };
  
  // Provide lineage data to columns via context
  const columnsWithContext = columns.map(col => ({
    ...col,
    // Add lineage data to render context
    renderCell: col.renderCell ? (params: any) => {
      const enhancedParams = { ...params, lineageData, getRelatedAssetsForAsset };
      return col.renderCell!(enhancedParams);
    } : undefined,
  }));
  
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">{title}</Typography>
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh Tags">
            <IconButton onClick={handleRefreshTags} disabled={refreshingTags}>
              {refreshingTags ? <CircularProgress size={24} /> : <TagIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={refreshing}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {/* Bulk Actions Toolbar */}
      {enableBulkActions && (
        <BulkActionsToolbar
          selectedCount={selectedRows.length}
          onAddToFolder={() => setAddToFolderOpen(true)}
          onBulkTag={() => setBulkTagOpen(true)}
          onClearSelection={() => setSelectedRows([])}
        />
      )}
      
      {/* Search Bar */}
      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField
          placeholder={`Search ${assetType}s by name or ID...`}
          variant="outlined"
          size="small"
          fullWidth
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            // Reset to first page when searching
            setPaginationModel(prev => ({ ...prev, page: 0 }));
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>
      
      <Paper>
        {loading && assets.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : assets.length > 0 ? (
          <DataGrid
            rows={assets.map((asset: any) => ({
              ...asset,
              id: asset.id,
            }))}
            columns={columnsWithContext}
            autoHeight
            checkboxSelection={enableBulkActions}
            rowSelectionModel={selectedRows}
            onRowSelectionModelChange={(newSelection) => setSelectedRows(newSelection)}
            disableRowSelectionOnClick
            rowCount={totalRows}
            loading={loading}
            paginationMode="server"
            sortingMode="client"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            pageSizeOptions={[25, 50, 100]}
            sx={{
              '& .MuiDataGrid-columnHeader': {
                backgroundColor: 'action.hover',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 'bold',
              },
            }}
          />
        ) : (
          <Alert severity="info" sx={{ m: 2 }}>
            No {assetType}s found. Run an asset export to see {assetType}s here.
          </Alert>
        )}
      </Paper>
      
      {/* Dialog Components */}
      {dialogComponents?.permissions}
      {dialogComponents?.relatedAssets}
      {dialogComponents?.tags}
      {dialogComponents?.custom?.map((dialog, index) => (
        <div key={index}>{dialog}</div>
      ))}
      
      {/* Bulk Action Dialogs */}
      {enableBulkActions && (
        <>
          <AddToFolderDialog
            open={addToFolderOpen}
            onClose={() => setAddToFolderOpen(false)}
            selectedAssets={selectedAssets.map((asset: any) => ({
              id: asset.id,
              name: asset.name,
              type: assetType
            }))}
            onComplete={handleBulkComplete}
          />
          
          <BulkTagDialog
            open={bulkTagOpen}
            onClose={() => setBulkTagOpen(false)}
            selectedAssets={selectedAssets.map((asset: any) => ({
              id: asset.id,
              name: asset.name,
              type: assetType
            }))}
            onComplete={handleBulkComplete}
          />
        </>
      )}
    </Box>
  );
}