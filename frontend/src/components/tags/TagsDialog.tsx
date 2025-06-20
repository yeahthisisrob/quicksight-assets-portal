import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  TextField,
  Chip,
  Grid,
  Alert,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import {
  Close as CloseIcon,
  LocalOffer as TagIcon,
  Add as AddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { tagsApi } from '@/services/api';

interface Tag {
  key: string;
  value: string;
}

interface TagsDialogProps {
  open: boolean;
  onClose: () => void;
  assetName: string;
  assetType: string;
  assetId: string;
  resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder';
  initialTags?: Tag[];
  onTagsUpdate?: (tags: Tag[]) => void;
}

// Common tag suggestions for QuickSight assets
const commonTagKeys = [
  'Environment',
  'Owner',
  'Department',
  'Project',
  'CostCenter',
  'DataClassification',
  'BusinessUnit',
  'Application',
  'Team',
  'Purpose',
  'Criticality',
  'Compliance',
  'Region',
  'Version',
  'Status',
];

export default function TagsDialog({
  open,
  onClose,
  assetName,
  assetType,
  assetId,
  resourceType,
  initialTags = [],
  onTagsUpdate,
}: TagsDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newTag, setNewTag] = useState({ key: '', value: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assetId, resourceType]);

  const fetchTags = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tagsApi.getResourceTags(resourceType, assetId);
      setTags(response || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
      setError('Failed to load tags');
      setTags(initialTags);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (!newTag.key || !newTag.value) {
      enqueueSnackbar('Both key and value are required', { variant: 'warning' });
      return;
    }

    if (tags.some(tag => tag.key === newTag.key)) {
      enqueueSnackbar('Tag key already exists', { variant: 'warning' });
      return;
    }

    setTags([...tags, newTag]);
    setNewTag({ key: '', value: '' });
  };

  const handleDeleteTag = (tagKey: string) => {
    setTags(tags.filter(tag => tag.key !== tagKey));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Update tags on AWS resource
      await tagsApi.updateResourceTags(resourceType, assetId, tags);
      
      enqueueSnackbar('Tags updated successfully', { variant: 'success' });
      if (onTagsUpdate) {
        onTagsUpdate(tags);
      }
      setEditMode(false);
    } catch (error) {
      console.error('Error saving tags:', error);
      setError('Failed to save tags');
      enqueueSnackbar('Failed to save tags', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.key && newTag.value) {
      handleAddTag();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TagIcon />
            <Typography variant="h6">Tags</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {!loading && !error && (
              <IconButton 
                size="small" 
                onClick={() => setEditMode(!editMode)}
                disabled={saving}
              >
                <EditIcon />
              </IconButton>
            )}
            <IconButton size="small" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {assetType}
          </Typography>
          <Typography variant="subtitle1" fontWeight={500}>
            {assetName}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Tags Display */}
            <Box sx={{ mb: editMode ? 2 : 0 }}>
              {tags.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No tags defined
                </Typography>
              ) : (
                <Grid container spacing={1}>
                  {tags.map((tag, index) => (
                    <Grid item key={index}>
                      <Chip
                        icon={<TagIcon sx={{ fontSize: 16 }} />}
                        label={`${tag.key}: ${tag.value}`}
                        variant="outlined"
                        onDelete={editMode ? () => handleDeleteTag(tag.key) : undefined}
                        sx={{ 
                          height: 28,
                          '& .MuiChip-deleteIcon': {
                            fontSize: 18
                          }
                        }}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {/* Add New Tag Form */}
            {editMode && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Add New Tag
                </Typography>
                <Grid container spacing={2} alignItems="flex-end">
                  <Grid item xs={5}>
                    <Autocomplete
                      freeSolo
                      options={commonTagKeys}
                      value={newTag.key}
                      onChange={(_, value) => setNewTag({ ...newTag, key: value || '' })}
                      onInputChange={(_, value) => setNewTag({ ...newTag, key: value })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Key"
                          size="small"
                          fullWidth
                          onKeyPress={handleKeyPress}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={5}>
                    <TextField
                      label="Value"
                      size="small"
                      fullWidth
                      value={newTag.value}
                      onChange={(e) => setNewTag({ ...newTag, value: e.target.value })}
                      onKeyPress={handleKeyPress}
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <IconButton
                      color="primary"
                      onClick={handleAddTag}
                      disabled={!newTag.key || !newTag.value}
                    >
                      <AddIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">
          Close
        </Button>
        {editMode && (
          <Button 
            onClick={handleSave} 
            variant="contained" 
            size="small"
            disabled={saving}
            startIcon={saving && <CircularProgress size={16} />}
          >
            Save Changes
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}