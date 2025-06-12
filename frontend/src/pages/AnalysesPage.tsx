import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

export default function AnalysesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; analysis?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; analysis?: any }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; analysis?: any }>({ open: false });
  const [liveTags, setLiveTags] = useState<Record<string, Array<{ key: string; value: string }>>>({});

  // Fetch all assets
  const { data: assetsData, isLoading, error, refetch } = useQuery({
    queryKey: ['assets-analyses'],
    queryFn: () => assetsApi.getAll(),
  });

  // Fetch lineage data for related assets
  const { data: lineageData } = useQuery({
    queryKey: ['lineage-all'],
    queryFn: () => lineageApi.getAllLineage(),
  });

  // Fetch live tags for all analyses when asset data changes
  useQuery({
    queryKey: ['live-tags-analyses', assetsData?.assets],
    queryFn: async () => {
      if (!assetsData?.assets) return {};
      
      const analyses = assetsData.assets.filter((asset: any) => asset.type === 'analysis');
      if (analyses.length === 0) return {};
      
      const assetRequests = analyses.map((analysis: any) => ({
        type: 'analysis',
        id: analysis.id,
      }));
      
      const results = await assetsApi.getBatchTags(assetRequests);
      
      // Convert results to a map for easy lookup
      const tagsMap: Record<string, Array<{ key: string; value: string }>> = {};
      results.forEach((result: any) => {
        if (result.assetType === 'analysis') {
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

  // Filter only analyses
  const analyses = assetsData?.assets?.filter((asset: any) => asset.type === 'analysis') || [];

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Analysis Name',
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
      headerName: 'Analysis ID',
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
            onClick={() => setPermissionsDialog({ open: true, analysis: params.row })}
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
            onClick={() => setTagsDialog({ open: true, analysis: params.row })}
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
      flex: 1,
      minWidth: 200,
      renderCell: (params) => {
        // Get related assets from lineage service
        const analysisId = params.row.id;
        const relatedAssets: { type: string; id: string; name: string }[] = [];
        
        if (lineageData) {
          // Find this analysis's lineage
          const analysisLineage = lineageData.find((l: any) => l.assetId === analysisId);
          
          if (analysisLineage) {
            // Get all related assets (what this analysis uses + what uses this analysis)
            analysisLineage.relationships.forEach((rel: any) => {
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
            onClick={() => setRelatedAssetsDialog({ open: true, analysis: params.row })}
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
                                 item.type === 'dataset' ? 'primary.main' : 'warning.main',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: item.type === 'dashboard' ? 'success.lighter' : 
                                      item.type === 'dataset' ? 'primary.lighter' : 'warning.lighter',
                      borderColor: item.type === 'dashboard' ? 'success.dark' : 
                                  item.type === 'dataset' ? 'primary.dark' : 'warning.dark'
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
        const analysisId = params.row.id;
        const relatedAssets: string[] = [];
        
        if (lineageData) {
          const analysisLineage = lineageData.find((l: any) => l.assetId === analysisId);
          if (analysisLineage) {
            analysisLineage.relationships.forEach((rel: any) => {
              relatedAssets.push(rel.targetAssetName);
            });
          }
        }
        
        return relatedAssets.join(' ');
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
      field: 'sheets',
      headerName: 'Sheets',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const [sheetCount, setSheetCount] = React.useState<number>(0);
        
        React.useEffect(() => {
          const getSheetCount = async () => {
            try {
              const parsed = await assetsApi.parseAsset('analyses', params.row.id);
              const count = parsed.parsed?.sheets?.length || 0;
              setSheetCount(count);
            } catch {
              setSheetCount(0);
            }
          };
          getSheetCount();
        }, [params.row.id]);

        return (
          <Typography variant="body2">
            {sheetCount || '-'}
          </Typography>
        );
      },
    },
    {
      field: 'visuals',
      headerName: 'Visuals',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const [visualCount, setVisualCount] = React.useState<number>(0);
        
        React.useEffect(() => {
          const getVisualCount = async () => {
            try {
              const parsed = await assetsApi.parseAsset('analyses', params.row.id);
              const count = parsed.parsed?.visuals?.length || 0;
              setVisualCount(count);
            } catch {
              setVisualCount(0);
            }
          };
          getVisualCount();
        }, [params.row.id]);

        return (
          <Typography variant="body2">
            {visualCount || '-'}
          </Typography>
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
  ];

  if (error) {
    return (
      <Alert severity="error">
        Failed to load analyses. Please try again later.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Analyses</Typography>
          <Typography variant="body1" color="text.secondary">
            Explore your QuickSight analyses and their relationships
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
        ) : analyses.length > 0 ? (
          <DataGrid
            rows={analyses.map((analysis: any, index: number) => ({
              ...analysis,
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
            No analyses found. Run an asset export to see analyses here.
          </Alert>
        )}
      </Paper>

      {/* Permissions Dialog */}
      {permissionsDialog.analysis && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onClose={() => setPermissionsDialog({ open: false })}
          assetName={permissionsDialog.analysis.name}
          assetType="Analysis"
          permissions={(permissionsDialog.analysis?.permissions || []).map((p: any) => ({
            principal: p.principal,
            principalType: p.principalType,
            actions: p.actions,
          }))}
        />
      )}

      {/* Related Assets Dialog */}
      {relatedAssetsDialog.analysis && (
        <RelatedAssetsDialog
          open={relatedAssetsDialog.open}
          onClose={() => setRelatedAssetsDialog({ open: false })}
          assetName={relatedAssetsDialog.analysis.name}
          assetType="Analysis"
          relatedAssets={(() => {
            // Get related assets from lineage service
            const analysisId = relatedAssetsDialog.analysis.id;
            const relatedAssets: RelatedAsset[] = [];
            
            if (lineageData) {
              const analysisLineage = lineageData.find((l: any) => l.assetId === analysisId);
              
              if (analysisLineage) {
                analysisLineage.relationships.forEach((rel: any) => {
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
      {tagsDialog.analysis && (
        <TagsDialog
          open={tagsDialog.open}
          onClose={() => setTagsDialog({ open: false })}
          assetName={tagsDialog.analysis.name}
          assetType="Analysis"
          assetId={tagsDialog.analysis.id}
          resourceType="analysis"
          initialTags={liveTags[tagsDialog.analysis.id] || tagsDialog.analysis.tags || []}
          onTagsUpdate={(updatedTags) => {
            // Update live tags immediately
            setLiveTags(prev => ({
              ...prev,
              [tagsDialog.analysis.id]: updatedTags,
            }));
          }}
        />
      )}
    </Box>
  );
}