import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  CheckCircle as ActiveIcon,
  Cancel as ErrorIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { assetsApi, lineageApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsCell from '@/components/relatedAssets/RelatedAssetsCell';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';
import { RelatedAsset } from '@/types/relatedAssets';

export default function DatasourcesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; datasource?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; datasource?: any }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; datasource?: any }>({ open: false });
  const [liveTags, setLiveTags] = useState<Record<string, Array<{ key: string; value: string }>>>({});

  // Fetch all assets
  const { data: assetsData, isLoading, error, refetch } = useQuery({
    queryKey: ['assets-datasources'],
    queryFn: () => assetsApi.getAll(),
  });

  // Fetch lineage data for related assets
  const { data: lineageData } = useQuery({
    queryKey: ['lineage-all'],
    queryFn: () => lineageApi.getAllLineage(),
  });

  // Fetch live tags for all datasources when asset data changes
  useQuery({
    queryKey: ['live-tags-datasources', assetsData?.assets],
    queryFn: async () => {
      if (!assetsData?.assets) return {};
      
      const datasources = assetsData.assets.filter((asset: any) => asset.type === 'datasource');
      if (datasources.length === 0) return {};
      
      const assetRequests = datasources.map((ds: any) => ({
        type: 'datasource',
        id: ds.id,
      }));
      
      const results = await assetsApi.getBatchTags(assetRequests);
      
      // Convert results to a map for easy lookup
      const tagsMap: Record<string, Array<{ key: string; value: string }>> = {};
      results.forEach((result: any) => {
        if (result.assetType === 'datasource') {
          tagsMap[result.assetId] = result.tags || [];
        }
      });
      
      setLiveTags(tagsMap);
      return tagsMap;
    },
    enabled: !!assetsData?.assets,
    staleTime: 30000, // Cache for 30 seconds
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Filter only datasources
  const datasources = assetsData?.assets?.filter((asset: any) => asset.type === 'datasource') || [];

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Datasource Name',
      flex: 1.5,
      minWidth: 200,
      renderCell: (params) => (
        <Tooltip title={params.value}>
          <Typography 
            variant="body2" 
            sx={{ 
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'id',
      headerName: 'Datasource ID',
      flex: 1,
      minWidth: 300,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={params.value}>
            <Typography 
              variant="body2" 
              sx={{ 
                fontFamily: 'monospace', 
                fontSize: '0.875rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '250px',
              }}
            >
              {params.value}
            </Typography>
          </Tooltip>
          <IconButton
            size="small"
            onClick={() => copyToClipboard(params.value)}
            sx={{ padding: '2px' }}
          >
            <CopyIcon sx={{ fontSize: '16px' }} />
          </IconButton>
        </Box>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 150,
      renderCell: (params) => {
        const [datasourceType, setDatasourceType] = React.useState<string>('Unknown');
        
        React.useEffect(() => {
          const getDatasourceType = async () => {
            try {
              const parsed = await assetsApi.parseAsset('datasources', params.row.id);
              const type = parsed.parsed?.datasourceInfo?.type || 'Unknown';
              setDatasourceType(type);
            } catch {
              setDatasourceType('Unknown');
            }
          };
          getDatasourceType();
        }, [params.row.id]);

        const getTypeColor = (type: string) => {
          const lowerType = type.toLowerCase();
          if (lowerType.includes('redshift')) return 'error';
          if (lowerType.includes('s3')) return 'warning';
          if (lowerType.includes('athena')) return 'default';
          if (lowerType.includes('rds') || lowerType.includes('aurora')) return 'info';
          if (lowerType.includes('postgresql') || lowerType.includes('mysql')) return 'primary';
          return 'default';
        };

        return (
          <Chip
            label={datasourceType}
            size="small"
            color={getTypeColor(datasourceType) as any}
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => {
        const [status, setStatus] = React.useState<string>('Unknown');
        
        React.useEffect(() => {
          const getStatus = async () => {
            try {
              const parsed = await assetsApi.parseAsset('datasources', params.row.id);
              const statusValue = parsed.parsed?.datasourceInfo?.status || 'Unknown';
              setStatus(statusValue);
            } catch {
              setStatus('Unknown');
            }
          };
          getStatus();
        }, [params.row.id]);

        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            {status === 'CREATION_SUCCESSFUL' ? (
              <ActiveIcon color="success" fontSize="small" />
            ) : status === 'CREATION_FAILED' ? (
              <ErrorIcon color="error" fontSize="small" />
            ) : null}
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              {status === 'CREATION_SUCCESSFUL' ? 'Active' : 
               status === 'CREATION_FAILED' ? 'Error' : 
               status}
            </Typography>
          </Stack>
        );
      },
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      width: 140,
      renderCell: (params) => {
        // Use permissions from exported asset data
        const permissions: Permission[] = (params.row.permissions || []).map((p: any) => ({
          principal: p.principal,
          principalType: p.principalType,
          actions: p.actions,
        }));
        
        return (
          <PermissionsCell
            permissions={permissions}
            onClick={() => setPermissionsDialog({ open: true, datasource: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const permissions = params.row.permissions || [];
        return permissions.map((p: any) => `${p.principal} ${p.actions.join(' ')}`).join(' ');
      },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params) => {
        // Use live tags if available, otherwise fall back to cached tags
        const tags = liveTags[params.row.id] || params.row.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => setTagsDialog({ open: true, datasource: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const tags = liveTags[params.row.id] || params.row.tags || [];
        return tags.map((tag: any) => `${tag.key}:${tag.value}`).join(' ');
      },
    },
    {
      field: 'relatedAssets',
      headerName: 'Related Assets',
      flex: 0.8,
      minWidth: 200,
      renderCell: (params) => {
        // Get related assets from lineage service
        const datasourceId = params.row.id;
        const relatedAssets: { type: string; id: string; name: string }[] = [];
        
        if (lineageData) {
          // Find this datasource's lineage
          const datasourceLineage = lineageData.find((l: any) => l.assetId === datasourceId);
          
          if (datasourceLineage) {
            // Get assets that use this datasource
            const usedByAssets = datasourceLineage.relationships.filter((r: any) => 
              r.relationshipType === 'used_by'
            );
            
            usedByAssets.forEach((rel: any) => {
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
            onClick={() => setRelatedAssetsDialog({ open: true, datasource: params.row })}
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
      // Add value getter for search to work
      valueGetter: (params) => {
        const datasourceId = params.row.id;
        const relatedAssets: string[] = [];
        
        if (lineageData) {
          const datasourceLineage = lineageData.find((l: any) => l.assetId === datasourceId);
          if (datasourceLineage) {
            datasourceLineage.relationships.forEach((rel: any) => {
              relatedAssets.push(rel.targetAssetName);
            });
          }
        }
        
        return relatedAssets.join(' ');
      },
    },
    {
      field: 'lastExported',
      headerName: 'Last Updated',
      width: 180,
      renderCell: (params) => (
        <Tooltip title={format(new Date(params.value), 'PPpp')}>
          <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
            {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
          </Typography>
        </Tooltip>
      ),
    },
  ];

  if (error) {
    return (
      <Alert severity="error">
        Failed to load datasources. Please try again later.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Datasources</Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your QuickSight data connections
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Paper>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : datasources.length > 0 ? (
          <DataGrid
            rows={datasources.map((datasource: any, index: number) => ({
              ...datasource,
              rowId: index,
            }))}
            columns={columns}
            autoHeight
            getRowId={(row) => row.rowId}
            disableRowSelectionOnClick
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
              sorting: {
                sortModel: [{ field: 'lastExported', sort: 'desc' }],
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
            }}
          />
        ) : (
          <Alert severity="info" sx={{ m: 2 }}>
            No datasources found. Run an asset export to see datasources here.
          </Alert>
        )}
      </Paper>

      {/* Permissions Dialog */}
      {permissionsDialog.datasource && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onClose={() => setPermissionsDialog({ open: false })}
          assetName={permissionsDialog.datasource.name}
          assetType="Data Source"
          permissions={[]} // Will be populated from API
        />
      )}

      {/* Related Assets Dialog */}
      {relatedAssetsDialog.datasource && (
        <RelatedAssetsDialog
          open={relatedAssetsDialog.open}
          onClose={() => setRelatedAssetsDialog({ open: false })}
          assetName={relatedAssetsDialog.datasource.name}
          assetType="Data Source"
          relatedAssets={(() => {
            // Get related assets from lineage service
            const datasourceId = relatedAssetsDialog.datasource.id;
            const relatedAssets: RelatedAsset[] = [];
            
            if (lineageData) {
              const datasourceLineage = lineageData.find((l: any) => l.assetId === datasourceId);
              
              if (datasourceLineage) {
                datasourceLineage.relationships.forEach((rel: any) => {
                  let relationshipLabel = 'Uses';
                  if (rel.relationshipType === 'used_by') {
                    relationshipLabel = 'Used by';
                  }
                  
                  relatedAssets.push({
                    id: rel.targetAssetId,
                    name: rel.targetAssetName,
                    type: rel.targetAssetType,
                    relationship: relationshipLabel
                  });
                });
              }
            }
            
            return relatedAssets;
          })()}
        />
      )}

      {/* Tags Dialog */}
      {tagsDialog.datasource && (
        <TagsDialog
          open={tagsDialog.open}
          onClose={() => setTagsDialog({ open: false })}
          assetName={tagsDialog.datasource.name}
          assetType="Data Source"
          assetId={tagsDialog.datasource.id}
          resourceType="datasource"
          initialTags={liveTags[tagsDialog.datasource.id] || tagsDialog.datasource.tags || []}
          onTagsUpdate={(updatedTags) => {
            // Update live tags immediately
            setLiveTags(prev => ({
              ...prev,
              [tagsDialog.datasource.id]: updatedTags,
            }));
          }}
        />
      )}
    </Box>
  );
}