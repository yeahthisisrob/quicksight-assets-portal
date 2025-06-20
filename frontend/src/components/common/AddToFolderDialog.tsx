import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  CircularProgress,
  Box,
  Typography,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Search as SearchIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { foldersApi } from '@/services/api';
import { useSnackbar } from 'notistack';

interface AddToFolderDialogProps {
  open: boolean;
  onClose: () => void;
  selectedAssets: Array<{ id: string; name: string; type: string }>;
  onComplete?: () => void;
}

export default function AddToFolderDialog({
  open,
  onClose,
  selectedAssets,
  onComplete,
}: AddToFolderDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [successfulAssets, setSuccessfulAssets] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (open) {
      loadFolders();
      // Reset state when dialog opens
      setSelectedFolder(null);
      setProcessing(false);
      setProgress(0);
      setProcessedCount(0);
      setErrors([]);
      setSuccessfulAssets([]);
      setCompleted(false);
    }
  }, [open]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const foldersData = await foldersApi.list();
      // Filter to only shared folders
      const sharedFolders = foldersData.filter((folder: any) => 
        folder.SharingModel === 'ACCOUNT' || folder.SharingModel === 'NAMESPACE'
      );
      setFolders(sharedFolders);
    } catch (error) {
      enqueueSnackbar('Failed to load folders', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const filteredFolders = folders.filter(folder =>
    folder.Name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddToFolder = async () => {
    if (!selectedFolder) {
      enqueueSnackbar('Please select a folder', { variant: 'warning' });
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProcessedCount(0);
    setErrors([]);
    setSuccessfulAssets([]);

    
    for (let i = 0; i < selectedAssets.length; i++) {
      const asset = selectedAssets[i];
      try {
        // Add asset to folder
        await foldersApi.addMember(selectedFolder, {
          MemberType: asset.type.toUpperCase(),
          MemberId: asset.id,
        });
        
        setSuccessfulAssets(prev => [...prev, asset.name]);
        
      } catch (error: any) {
        console.error(`Failed to add ${asset.name} to folder:`, error);
        setErrors(prev => [...prev, `${asset.name}: ${error.message || 'Failed to add'}`]);
      }
      
      setProcessedCount(i + 1);
      setProgress(((i + 1) / selectedAssets.length) * 100);
    }

    setCompleted(true);
    
    // Don't auto-close if there were any operations
    if (errors.length === 0 && successfulAssets.length > 0) {
      // Only auto-close on complete success
      setTimeout(() => {
        onClose();
        onComplete?.();
      }, 2000);
    }
  };

  const handleClose = () => {
    if (!processing || completed) {
      onClose();
      if (completed && onComplete) {
        onComplete();
      }
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add {selectedAssets.length} Asset{selectedAssets.length !== 1 ? 's' : ''} to Shared Folder
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : processing || completed ? (
          <Box sx={{ py: 2 }}>
            {!completed ? (
              <>
                <Typography variant="body1" gutterBottom>
                  Adding assets to folder...
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={progress} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Processed {processedCount} of {selectedAssets.length}
                  </Typography>
                </Box>
              </>
            ) : (
              <>
                <Typography variant="h6" gutterBottom>
                  Operation Complete
                </Typography>
                
                {successfulAssets.length > 0 && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight="bold" gutterBottom>
                      Successfully processed {successfulAssets.length} asset{successfulAssets.length !== 1 ? 's' : ''}:
                    </Typography>
                    {successfulAssets.map((name, index) => (
                      <Typography key={index} variant="caption" display="block">
                        ✓ {name}
                      </Typography>
                    ))}
                  </Alert>
                )}
                
                {errors.length > 0 && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight="bold" gutterBottom>
                      Failed to process {errors.length} asset{errors.length !== 1 ? 's' : ''}:
                    </Typography>
                    {errors.map((error, index) => (
                      <Typography key={index} variant="caption" display="block">
                        ✗ {error}
                      </Typography>
                    ))}
                  </Alert>
                )}
                
                {selectedFolder && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                    <Typography variant="body2">
                      <strong>Target Folder:</strong> {folders.find((f: any) => f.FolderId === selectedFolder)?.Name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ID: {selectedFolder}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Box>
        ) : (
          <>
            <TextField
              fullWidth
              placeholder="Search folders..."
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
            
            {filteredFolders.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                No shared folders found
              </Typography>
            ) : (
              <>
                <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {filteredFolders.map((folder) => (
                    <ListItem key={folder.FolderId} disablePadding>
                      <ListItemButton
                        selected={selectedFolder === folder.FolderId}
                        onClick={() => setSelectedFolder(folder.FolderId)}
                      >
                        <ListItemIcon>
                          <FolderIcon color={selectedFolder === folder.FolderId ? 'primary' : 'inherit'} />
                        </ListItemIcon>
                        <ListItemText
                          primary={folder.Name}
                          secondary={
                            <>
                              Type: {folder.FolderType || 'SHARED'}
                              {folder.SharingModel && ` • Sharing: ${folder.SharingModel}`}
                            </>
                          }
                        />
                        {selectedFolder === folder.FolderId && (
                          <CheckIcon color="primary" />
                        )}
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose} disabled={processing && !completed}>
          {completed ? 'Close' : 'Cancel'}
        </Button>
        {!completed && !processing && (
          <Button
            onClick={handleAddToFolder}
            variant="contained"
            disabled={!selectedFolder}
          >
            Add to Folder
          </Button>
        )}
        {completed && errors.length > 0 && successfulAssets.length === 0 && (
          <Button
            onClick={() => {
              setCompleted(false);
              setErrors([]);
              setSuccessfulAssets([]);
            }}
            variant="contained"
          >
            Try Again
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}