import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { assetsApi, lineageApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import DatasourceTypeBadge from '@/components/dataCatalog/DatasourceTypeBadge';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsCell from '@/components/relatedAssets/RelatedAssetsCell';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';
import { RelatedAsset } from '@/types/relatedAssets';

export default function DatasetsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; dataset?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; dataset?: any }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; dataset?: any }>({ open: false });
  const [liveTags, setLiveTags] = useState<Record<string, Array<{ key: string; value: string }>>>({});

  // Fetch all assets
  const { data: assetsData, isLoading: assetsLoading, error, refetch } = useQuery({
    queryKey: ['assets-datasets'],
    queryFn: () => assetsApi.getAll(),
  });

  // Fetch lineage data for related assets
  const { data: lineageData } = useQuery({
    queryKey: ['lineage-all'],
    queryFn: () => lineageApi.getAllLineage(),
  });

  // Fetch live tags for all datasets when asset data changes
  useQuery({
    queryKey: ['live-tags-datasets', assetsData?.assets],
    queryFn: async () => {
      if (!assetsData?.assets) return {};
      
      const datasets = assetsData.assets.filter((asset: any) => asset.type === 'dataset');
      if (datasets.length === 0) return {};
      
      const assetRequests = datasets.map((dataset: any) => ({
        type: 'dataset',
        id: dataset.id,
      }));
      
      const results = await assetsApi.getBatchTags(assetRequests);
      
      // Convert results to a map for easy lookup
      const tagsMap: Record<string, Array<{ key: string; value: string }>> = {};
      results.forEach((result: any) => {
        if (result.assetType === 'dataset') {
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

  // Filter only datasets
  const datasets = assetsData?.assets?.filter((asset: any) => asset.type === 'dataset') || [];

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Dataset Name',
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
      headerName: 'Dataset ID',
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
      field: 'datasourceInfo',
      headerName: 'Source Type',
      width: 200,
      renderCell: (params) => {
        // Extract datasource type and import mode from the asset data
        const getDatasourceInfo = async () => {
          try {
            const assetData = await assetsApi.getAsset('datasets', params.row.id);
            const importMode = assetData.DataSet?.ImportMode;
            let datasourceType = 'Unknown';
            
            if (assetData.DataSet?.PhysicalTableMap) {
              const tables = Object.values(assetData.DataSet.PhysicalTableMap) as any[];
              if (tables.length > 0) {
                const table = tables[0];
                if (table.S3Source) {
                  datasourceType = 'S3';
                } else if (table.RelationalTable?.DataSourceArn) {
                  const arn = table.RelationalTable.DataSourceArn;
                  if (arn.includes('redshift')) datasourceType = 'Redshift';
                  else if (arn.includes('athena')) datasourceType = 'Athena';
                  else if (arn.includes('rds')) datasourceType = 'RDS';
                  else if (arn.includes('aurora')) datasourceType = 'Aurora';
                  else if (arn.includes('postgresql')) datasourceType = 'PostgreSQL';
                  else if (arn.includes('mysql')) datasourceType = 'MySQL';
                  else datasourceType = 'Database';
                } else if (table.CustomSql) {
                  datasourceType = 'Custom SQL';
                }
              }
            }
            
            return { datasourceType, importMode };
          } catch {
            return { datasourceType: 'Unknown', importMode: undefined };
          }
        };

        const [info, setInfo] = React.useState<{ datasourceType?: string; importMode?: string }>({});
        
        React.useEffect(() => {
          getDatasourceInfo().then(setInfo);
        }, [params.row.id]);

        return (
          <DatasourceTypeBadge
            datasourceType={info.datasourceType}
            importMode={info.importMode as 'SPICE' | 'DIRECT_QUERY' | undefined}
          />
        );
      },
    },
    {
      field: 'fileSize',
      headerName: 'Size',
      width: 100,
      renderCell: (params) => {
        const kb = params.value / 1024;
        const sizeStr = kb > 1024 ? 
          `${(kb / 1024).toFixed(1)}M` : 
          `${kb.toFixed(0)}K`;
        return (
          <Tooltip title={kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(2)} KB`}>
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              {sizeStr}
            </Typography>
          </Tooltip>
        );
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
            onClick={() => setPermissionsDialog({ open: true, dataset: params.row })}
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
            onClick={() => setTagsDialog({ open: true, dataset: params.row })}
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
        const datasetId = params.row.id;
        const relatedAssets: { type: string; id: string; name: string }[] = [];
        
        if (lineageData) {
          // Find this dataset's lineage
          const datasetLineage = lineageData.find((l: any) => l.assetId === datasetId);
          
          if (datasetLineage) {
            // Get all related assets (what this dataset uses + what uses this dataset)
            datasetLineage.relationships.forEach((rel: any) => {
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
            onClick={() => setRelatedAssetsDialog({ open: true, dataset: params.row })}
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
                    borderColor: item.type === 'dashboard' ? 'success.main' : 
                                 item.type === 'analysis' ? 'info.main' : 
                                 item.type === 'datasource' ? 'warning.main' : 'primary.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: item.type === 'dashboard' ? 'success.lighter' : 
                                      item.type === 'analysis' ? 'info.lighter' : 
                                      item.type === 'datasource' ? 'warning.lighter' : 'primary.lighter',
                      borderColor: item.type === 'dashboard' ? 'success.dark' : 
                                  item.type === 'analysis' ? 'info.dark' : 
                                  item.type === 'datasource' ? 'warning.dark' : 'primary.dark'
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
        const datasetId = params.row.id;
        const relatedAssets: string[] = [];
        
        if (lineageData) {
          const datasetLineage = lineageData.find((l: any) => l.assetId === datasetId);
          if (datasetLineage) {
            datasetLineage.relationships.forEach((rel: any) => {
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
      renderCell: (params) => (
        <Tooltip title="View Fields">
          <IconButton
            size="small"
            onClick={() => navigate(`/datasets/${params.row.id}`)}
          >
            <ViewIcon />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  if (error) {
    return (
      <Alert severity="error">
        Failed to load datasets. Please try again later.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Datasets</Typography>
          <Typography variant="body1" color="text.secondary">
            Manage and explore your QuickSight datasets
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Paper>
        {assetsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : datasets.length > 0 ? (
          <DataGrid
            rows={datasets.map((dataset: any, index: number) => ({
              ...dataset,
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
            No datasets found. Run an asset export to see datasets here.
          </Alert>
        )}
      </Paper>

      {/* Permissions Dialog */}
      {permissionsDialog.dataset && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onClose={() => setPermissionsDialog({ open: false })}
          assetName={permissionsDialog.dataset.name}
          assetType="Dataset"
          permissions={(permissionsDialog.dataset?.permissions || []).map((p: any) => ({
            principal: p.principal,
            principalType: p.principalType,
            actions: p.actions,
          }))}
        />
      )}

      {/* Related Assets Dialog */}
      {relatedAssetsDialog.dataset && (
        <RelatedAssetsDialog
          open={relatedAssetsDialog.open}
          onClose={() => setRelatedAssetsDialog({ open: false })}
          assetName={relatedAssetsDialog.dataset.name}
          assetType="Dataset"
          relatedAssets={(() => {
            // Get related assets from lineage service
            const datasetId = relatedAssetsDialog.dataset.id;
            const relatedAssets: RelatedAsset[] = [];
            
            if (lineageData) {
              const datasetLineage = lineageData.find((l: any) => l.assetId === datasetId);
              
              if (datasetLineage) {
                datasetLineage.relationships.forEach((rel: any) => {
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
      {tagsDialog.dataset && (
        <TagsDialog
          open={tagsDialog.open}
          onClose={() => setTagsDialog({ open: false })}
          assetName={tagsDialog.dataset.name}
          assetType="Dataset"
          assetId={tagsDialog.dataset.id}
          resourceType="dataset"
          initialTags={liveTags[tagsDialog.dataset.id] || tagsDialog.dataset.tags || []}
          onTagsUpdate={(updatedTags) => {
            // Update live tags immediately
            setLiveTags(prev => ({
              ...prev,
              [tagsDialog.dataset.id]: updatedTags,
            }));
          }}
        />
      )}
    </Box>
  );
}