import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  Edit as EditIcon,
  FolderOpen as FolderIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { foldersApi, assetsApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';
import MetadataForm from '@/components/metadata/MetadataForm';

interface FolderMetadata {
  description?: string;
  owner?: string;
  category?: string;
  notes?: string;
  lastReviewed?: string;
  reviewedBy?: string;
  businessUnit?: string;
  dataClassification?: string;
}

export default function FoldersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; folder?: any }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; folder?: any }>({ open: false });
  const [metadataDialog, setMetadataDialog] = useState<{ open: boolean; folder?: any }>({ open: false });
  const [liveTags, setLiveTags] = useState<Record<string, Array<{ key: string; value: string }>>>({});

  const { data: folders = [], isLoading, error, refetch } = useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersApi.list(),
  });

  // Fetch member counts for folders
  const { data: folderMembers = {} } = useQuery({
    queryKey: ['folder-members', folders],
    queryFn: async () => {
      if (!folders || folders.length === 0) return {};
      
      const memberCounts: Record<string, number> = {};
      
      // Fetch member counts for each folder
      await Promise.all(
        folders.map(async (folder: any) => {
          try {
            const members = await foldersApi.getMembers(folder.FolderId);
            memberCounts[folder.FolderId] = members.length;
          } catch (error) {
            // If error, assume 0 members
            memberCounts[folder.FolderId] = 0;
          }
        })
      );
      
      return memberCounts;
    },
    enabled: folders.length > 0,
  });

  // Fetch live tags for all folders when folder data changes
  useQuery({
    queryKey: ['live-tags-folders', folders],
    queryFn: async () => {
      if (!folders || folders.length === 0) return {};
      
      const assetRequests = folders.map((folder: any) => ({
        type: 'folder',
        id: folder.FolderId,
      }));
      
      const results = await assetsApi.getBatchTags(assetRequests);
      
      // Convert results to a map for easy lookup
      const tagsMap: Record<string, Array<{ key: string; value: string }>> = {};
      results.forEach((result: any) => {
        if (result.assetType === 'folder') {
          tagsMap[result.assetId] = result.tags || [];
        }
      });
      
      setLiveTags(tagsMap);
      return tagsMap;
    },
    enabled: folders.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Handle errors with useEffect to avoid state update during render
  React.useEffect(() => {
    if (error) {
      enqueueSnackbar(`Failed to load folders: ${(error as Error).message}`, { variant: 'error' });
    }
  }, [error, enqueueSnackbar]);


  const handleMetadataUpdate = async (folderId: string, metadata: FolderMetadata) => {
    try {
      await foldersApi.updateMetadata(folderId, metadata);
      enqueueSnackbar('Metadata updated successfully', { variant: 'success' });
      setMetadataDialog({ open: false });
    } catch (error) {
      enqueueSnackbar(`Failed to update metadata: ${(error as Error).message}`, { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'Name',
      headerName: 'Folder Name',
      flex: 2,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderIcon color="action" />
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {params.value || 'Unnamed Folder'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {params.row.FolderId}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'displayPath',
      headerName: 'Path',
      flex: 1.5,
      minWidth: 150,
      renderCell: (params: GridRenderCellParams) => {
        const folder = params.row;
        
        // Use displayPath from backend (already has full hierarchy)
        let pathToShow: string[] = folder.displayPath || [];
        
        // If no displayPath, fall back to just the folder name
        if (pathToShow.length === 0 && folder.Name) {
          pathToShow = [folder.Name];
        }
        
        // Remove 'shared' prefix if it exists (case-insensitive)
        if (pathToShow.length > 0 && pathToShow[0]?.toLowerCase() === 'shared') {
          pathToShow = pathToShow.slice(1);
        }
        
        // Display the path
        const displayString = pathToShow.length > 0 ? pathToShow.join('/') : '/';
        
        return (
          <Tooltip title={displayString}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayString}
            </Typography>
          </Tooltip>
        );
      },
      // For search functionality
      valueGetter: (params) => {
        const folder = params.row;
        if (folder.displayPath) return folder.displayPath.join(' ');
        return folder.Name || '';
      },
    },
    {
      field: 'FolderType',
      headerName: 'Type',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip 
          label={params.value || 'SHARED'} 
          size="small" 
          variant="outlined"
          color={params.value === 'SHARED' ? 'primary' : 'default'}
        />
      ),
    },
    {
      field: 'members',
      headerName: 'Members',
      width: 100,
      align: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const memberCount = folderMembers[params.row.FolderId] || 0;
        return (
          <Chip 
            label={memberCount} 
            size="small" 
            color={memberCount > 0 ? 'primary' : 'default'}
          />
        );
      },
      valueGetter: (params) => folderMembers[params.row.FolderId] || 0,
    },
    {
      field: 'CreatedTime',
      headerName: 'Created',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return <Typography variant="body2">-</Typography>;
        }
        
        const date = new Date(params.value);
        if (isNaN(date.getTime())) {
          return <Typography variant="body2">Invalid date</Typography>;
        }
        
        return (
          <Typography variant="body2">
            {format(date, 'MMM d, yyyy')}
          </Typography>
        );
      },
    },
    {
      field: 'LastUpdatedTime',
      headerName: 'Last Updated',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return <Typography variant="body2">-</Typography>;
        }
        
        const date = new Date(params.value);
        if (isNaN(date.getTime())) {
          return <Typography variant="body2">Invalid date</Typography>;
        }
        
        return (
          <Typography variant="body2">
            {format(date, 'MMM d, yyyy')}
          </Typography>
        );
      },
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        // Transform QuickSight permissions to our format
        const permissions: Permission[] = (params.row.permissions || []).map((p: any) => ({
          principal: p.Principal,
          principalType: p.Principal?.includes('group') ? 'GROUP' : 'USER',
          actions: p.Actions || [],
        }));
        
        return (
          <PermissionsCell
            permissions={permissions}
            onClick={() => setPermissionsDialog({ open: true, folder: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const permissions = params.row.permissions || [];
        return permissions.map((p: any) => `${p.Principal} ${p.Actions?.join(' ')}`).join(' ');
      },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params: GridRenderCellParams) => {
        // Use live tags if available, otherwise fall back to cached tags
        const tags = liveTags[params.row.FolderId] || params.row.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => setTagsDialog({ open: true, folder: params.row })}
          />
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const tags = liveTags[params.row.FolderId] || params.row.tags || [];
        return tags.map((tag: any) => `${tag.key}:${tag.value}`).join(' ');
      },
    },
    {
      field: 'metadata',
      headerName: 'Metadata',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        const metadata = params.value || {};
        const hasMetadata = Object.keys(metadata).length > 0;
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasMetadata && (
              <Tooltip title={metadata.description || 'Has metadata'}>
                <Chip
                  label="Has metadata"
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              </Tooltip>
            )}
            <Tooltip title="Edit Metadata">
              <IconButton
                size="small"
                onClick={() => setMetadataDialog({ open: true, folder: params.row })}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
      // Add value getter for search to work
      valueGetter: (params) => {
        const metadata = params.value || {};
        return Object.values(metadata).join(' ');
      },
    },
  ];

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load folders. Please check your AWS credentials and try again.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">QuickSight Folders</Typography>
          <Typography variant="body1" color="text.secondary">
            Manage and organize your QuickSight folders
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      <Paper>
        <DataGrid
          rows={folders}
          columns={columns}
          autoHeight
          getRowId={(row) => row.FolderId}
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
              sortModel: [{ field: 'LastUpdatedTime', sort: 'desc' }],
            },
          }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-columnHeader': {
              backgroundColor: 'action.hover',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 'bold',
            },
          }}
        />
      </Paper>

      {/* Permissions Dialog */}
      {permissionsDialog.folder && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onClose={() => setPermissionsDialog({ open: false })}
          assetName={permissionsDialog.folder.Name || 'Unnamed Folder'}
          assetType="Folder"
          permissions={(permissionsDialog.folder.permissions || []).map((p: any) => ({
            principal: p.Principal,
            principalType: p.Principal?.includes('group') ? 'GROUP' : 'USER',
            actions: p.Actions || [],
          }))}
        />
      )}

      {/* Tags Dialog */}
      {tagsDialog.folder && (
        <TagsDialog
          open={tagsDialog.open}
          onClose={() => setTagsDialog({ open: false })}
          assetName={tagsDialog.folder.Name || 'Unnamed Folder'}
          assetType="Folder"
          assetId={tagsDialog.folder.FolderId}
          resourceType="folder"
          initialTags={liveTags[tagsDialog.folder.FolderId] || tagsDialog.folder.tags || []}
          onTagsUpdate={(updatedTags) => {
            // Update live tags immediately
            setLiveTags(prev => ({
              ...prev,
              [tagsDialog.folder.FolderId]: updatedTags,
            }));
          }}
        />
      )}

      {/* Metadata Dialog */}
      <Dialog
        open={metadataDialog.open}
        onClose={() => setMetadataDialog({ open: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Edit Folder Metadata
          <IconButton
            aria-label="close"
            onClick={() => setMetadataDialog({ open: false })}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {metadataDialog.folder && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {metadataDialog.folder.Name || 'Unnamed Folder'}
              </Typography>
              <MetadataForm
                metadata={metadataDialog.folder.metadata || {}}
                onSave={(metadata) => handleMetadataUpdate(metadataDialog.folder.FolderId, metadata)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetadataDialog({ open: false })}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}