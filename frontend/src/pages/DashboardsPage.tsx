import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  InputAdornment,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { dashboardsApi, lineageApi, assetsApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsCell from '@/components/relatedAssets/RelatedAssetsCell';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';
import { RelatedAsset } from '@/types/relatedAssets';

export default function DashboardsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; dashboard?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; dashboard?: any }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; dashboard?: any }>({ open: false });
  const [liveTags, setLiveTags] = useState<Record<string, Array<{ key: string; value: string }>>>({});

  const { data: dashboards = [], isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: () => dashboardsApi.list(true),
  });

  // Fetch lineage data for related assets
  const { data: lineageData } = useQuery({
    queryKey: ['lineage-all'],
    queryFn: () => lineageApi.getAllLineage(),
  });

  // Fetch live tags for all dashboards when dashboard data changes
  useQuery({
    queryKey: ['live-tags-dashboards', dashboards],
    queryFn: async () => {
      if (!dashboards || dashboards.length === 0) return {};
      
      const assetRequests = dashboards.map((dashboard: any) => ({
        type: 'dashboard',
        id: dashboard.dashboardId,
      }));
      
      const results = await assetsApi.getBatchTags(assetRequests);
      
      // Convert results to a map for easy lookup
      const tagsMap: Record<string, Array<{ key: string; value: string }>> = {};
      results.forEach((result: any) => {
        if (result.assetType === 'dashboard') {
          tagsMap[result.assetId] = result.tags || [];
        }
      });
      
      setLiveTags(tagsMap);
      return tagsMap;
    },
    enabled: dashboards.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Handle errors with useEffect to avoid state update during render
  React.useEffect(() => {
    if (error) {
      enqueueSnackbar(`Failed to load dashboards: ${(error as Error).message}`, { variant: 'error' });
    }
  }, [error, enqueueSnackbar]);

  const filteredDashboards = useMemo(() => {
    return dashboards.filter(dashboard => {
      const matchesSearch = searchTerm === '' || 
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dashboard.dashboardId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dashboard.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }, [dashboards, searchTerm]);

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Dashboard Name',
      flex: 2,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Typography variant="body2" fontWeight={500}>
            {params.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {params.row.dashboardId}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 150,
      valueGetter: (params) => params.row.metadata?.category || 'Uncategorized',
      renderCell: (params: GridRenderCellParams) => (
        <Chip 
          label={params.value || 'Uncategorized'} 
          size="small" 
          color={params.value ? 'primary' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'lastUpdated',
      headerName: 'Last Updated',
      width: 150,
      valueGetter: (params) => params.row.lastUpdatedTime,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {params.value ? format(new Date(params.value), 'MMM d, yyyy') : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        // Transform QuickSight permissions to our format
        const permissions: Permission[] = (params.row.permissions || []).map((p: any) => ({
          principal: p.principal,
          principalType: p.principal.includes('group') ? 'GROUP' : 'USER',
          actions: [p.permission],
        }));
        
        return (
          <PermissionsCell
            permissions={permissions}
            onClick={() => setPermissionsDialog({ open: true, dashboard: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const permissions = params.row.permissions || [];
        return permissions.map((p: any) => `${p.principal} ${p.permission}`).join(' ');
      },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params: GridRenderCellParams) => {
        // Use live tags if available, otherwise fall back to cached tags
        const tags = liveTags[params.row.dashboardId] || params.row.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => setTagsDialog({ open: true, dashboard: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const tags = liveTags[params.row.dashboardId] || params.row.tags || [];
        return tags.map((tag: any) => `${tag.key}:${tag.value}`).join(' ');
      },
    },
    {
      field: 'relatedAssets',
      headerName: 'Related Assets',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => {
        // Get related assets from lineage service
        const dashboardId = params.row.dashboardId;
        const relatedAssets: { type: string; id: string; name: string }[] = [];
        
        if (lineageData) {
          // Find this dashboard's lineage
          const dashboardLineage = lineageData.find((l: any) => l.assetId === dashboardId);
          
          if (dashboardLineage) {
            // Get assets this dashboard uses (analysis and datasets)
            const usedAssets = dashboardLineage.relationships.filter((r: any) => 
              r.relationshipType === 'created_from' || r.relationshipType === 'uses'
            );
            
            usedAssets.forEach((rel: any) => {
              relatedAssets.push({
                type: rel.targetAssetType,
                id: rel.targetAssetId,
                name: rel.targetAssetName
              });
            });
          }
        }
        
        if (relatedAssets.length === 0) {
          return (
            <Typography variant="body2" color="text.disabled">
              -
            </Typography>
          );
        }
        
        // Show first 2 items with +N using chip format
        const displayItems = relatedAssets.slice(0, 2);
        const remainingCount = relatedAssets.length - 2;
        
        return (
          <Box 
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            onClick={() => setRelatedAssetsDialog({ open: true, dashboard: params.row })}
          >
            {displayItems.map((item) => (
              <Tooltip key={item.id} title={item.name}>
                <Chip
                  label={item.name.length > 12 ? `${item.name.substring(0, 12)}...` : item.name}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    height: 20,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': { px: 1 },
                    borderColor: item.type === 'analysis' ? 'info.main' : 'primary.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: item.type === 'analysis' ? 'info.lighter' : 'primary.lighter',
                      borderColor: item.type === 'analysis' ? 'info.dark' : 'primary.dark'
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
      // Add value getter for search to work
      valueGetter: (params) => {
        const dashboardId = params.row.dashboardId;
        const relatedAssets: string[] = [];
        
        if (lineageData) {
          const dashboardLineage = lineageData.find((l: any) => l.assetId === dashboardId);
          if (dashboardLineage) {
            dashboardLineage.relationships.forEach((rel: any) => {
              relatedAssets.push(rel.targetAssetName);
            });
          }
        }
        
        return relatedAssets.join(' ');
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Tooltip title="View Details">
            <IconButton
              size="small"
              onClick={() => navigate(`/dashboards/${params.row.dashboardId}`)}
            >
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit Metadata">
            <IconButton
              size="small"
              onClick={() => navigate(`/dashboards/${params.row.dashboardId}?edit=true`)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load dashboards. Please check your AWS credentials and try again.
        </Alert>
      </Box>
    );
  }

  return (
    <>
    <Box>
      <Typography variant="h4" gutterBottom>
        QuickSight Dashboards
      </Typography>
      
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            placeholder="Search dashboards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1, maxWidth: 400 }}
          />
          
          <Box sx={{ flexGrow: 1 }} />
          
          <Typography variant="body2" color="text.secondary">
            {filteredDashboards.length} of {dashboards.length} dashboards
          </Typography>
        </Box>
      </Paper>

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredDashboards}
          columns={columns}
          getRowId={(row) => row.dashboardId}
          loading={isLoading}
          slots={{
            toolbar: GridToolbar,
            loadingOverlay: () => (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ),
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: { debounceMs: 500 },
            },
          }}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 },
            },
            sorting: {
              sortModel: [{ field: 'lastUpdated', sort: 'desc' }],
            },
          }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Permissions Dialog */}
      {permissionsDialog.dashboard && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onClose={() => setPermissionsDialog({ open: false })}
          assetName={permissionsDialog.dashboard.name}
          assetType="Dashboard"
          permissions={(permissionsDialog.dashboard.permissions || []).map((p: any) => ({
            principal: p.principal,
            principalType: p.principal.includes('group') ? 'GROUP' : 'USER',
            actions: [p.permission],
          }))}
        />
      )}

      {/* Related Assets Dialog */}
      {relatedAssetsDialog.dashboard && (
        <RelatedAssetsDialog
          open={relatedAssetsDialog.open}
          onClose={() => setRelatedAssetsDialog({ open: false })}
          assetName={relatedAssetsDialog.dashboard.name}
          assetType="Dashboard"
          relatedAssets={(() => {
            // Get related assets from lineage service
            const dashboardId = relatedAssetsDialog.dashboard.dashboardId;
            const relatedAssets: RelatedAsset[] = [];
            
            if (lineageData) {
              const dashboardLineage = lineageData.find((l: any) => l.assetId === dashboardId);
              
              if (dashboardLineage) {
                const usedAssets = dashboardLineage.relationships.filter((r: any) => 
                  r.relationshipType === 'created_from' || r.relationshipType === 'uses'
                );
                
                usedAssets.forEach((rel: any) => {
                  relatedAssets.push({
                    id: rel.targetAssetId,
                    name: rel.targetAssetName,
                    type: rel.targetAssetType,
                    relationship: rel.relationshipType === 'created_from' ? 'Created from' : 'Uses'
                  });
                });
              }
            }
            
            return relatedAssets;
          })()}
        />
      )}

      {/* Tags Dialog */}
      {tagsDialog.dashboard && (
        <TagsDialog
          open={tagsDialog.open}
          onClose={() => setTagsDialog({ open: false })}
          assetName={tagsDialog.dashboard.name}
          assetType="Dashboard"
          assetId={tagsDialog.dashboard.dashboardId}
          resourceType="dashboard"
          initialTags={liveTags[tagsDialog.dashboard.dashboardId] || tagsDialog.dashboard.tags || []}
          onTagsUpdate={(updatedTags) => {
            // Update live tags immediately
            setLiveTags(prev => ({
              ...prev,
              [tagsDialog.dashboard.dashboardId]: updatedTags,
            }));
          }}
        />
      )}
    </Box>
    </>
  );
}