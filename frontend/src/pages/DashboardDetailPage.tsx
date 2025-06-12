import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Group as GroupIcon,
  Tag as TagIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { dashboardsApi } from '@/services/api';
import { DashboardMetadata } from '@/types';
import { useSnackbar } from 'notistack';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DashboardDetailPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  
  const [tabValue, setTabValue] = useState(0);
  const [isEditingMetadata, setIsEditingMetadata] = useState(searchParams.get('edit') === 'true');
  const [editedMetadata, setEditedMetadata] = useState<DashboardMetadata>({});
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState({ key: '', value: '' });

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => dashboardsApi.get(dashboardId!),
    enabled: !!dashboardId,
  });

  const { data: tags } = useQuery({
    queryKey: ['dashboard-tags', dashboardId],
    queryFn: () => dashboardsApi.getTags(dashboardId!),
    enabled: !!dashboardId,
  });

  const updateMetadataMutation = useMutation({
    mutationFn: (metadata: DashboardMetadata) => 
      dashboardsApi.updateMetadata(dashboardId!, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      enqueueSnackbar('Metadata updated successfully', { variant: 'success' });
      setIsEditingMetadata(false);
    },
    onError: (error: any) => {
      enqueueSnackbar(`Failed to update metadata: ${error.message}`, { variant: 'error' });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: (tags: Array<{ key: string; value: string }>) => 
      dashboardsApi.updateTags(dashboardId!, { tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-tags', dashboardId] });
      enqueueSnackbar('Tags updated successfully', { variant: 'success' });
      setTagDialogOpen(false);
      setNewTag({ key: '', value: '' });
    },
    onError: (error: any) => {
      enqueueSnackbar(`Failed to update tags: ${error.message}`, { variant: 'error' });
    },
  });

  useEffect(() => {
    if (dashboard?.metadata) {
      setEditedMetadata(dashboard.metadata);
    }
  }, [dashboard?.metadata]);

  const handleSaveMetadata = () => {
    updateMetadataMutation.mutate(editedMetadata);
  };

  const handleAddTag = () => {
    if (newTag.key && newTag.value) {
      const updatedTags = [...(tags || []), newTag];
      updateTagsMutation.mutate(updatedTags);
    }
  };

  const handleDeleteTag = (index: number) => {
    const updatedTags = tags?.filter((_, i) => i !== index) || [];
    updateTagsMutation.mutate(updatedTags);
  };

  const usageChartData = dashboard ? [
    { name: 'Today', views: dashboard.usage.viewCountToday },
    { name: 'Last 7 Days', views: dashboard.usage.viewCountLast7Days },
    { name: 'Last 30 Days', views: dashboard.usage.viewCountLast30Days },
  ] : [];

  if (error) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboards')}>
          Back to Dashboards
        </Button>
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load dashboard details
        </Alert>
      </Box>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={8}>
            <Skeleton variant="rectangular" height={400} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Skeleton variant="rectangular" height={400} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/dashboards')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{dashboard.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            ID: {dashboard.dashboardId}
          </Typography>
        </Box>
        {!isEditingMetadata && (
          <Button
            startIcon={<EditIcon />}
            variant="outlined"
            onClick={() => setIsEditingMetadata(true)}
          >
            Edit Metadata
          </Button>
        )}
      </Box>

      <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
        <Tab label="Overview" />
        <Tab label="Permissions" />
        <Tab label="Usage Analytics" />
        <Tab label="Tags" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Dashboard Information
              </Typography>
              
              {isEditingMetadata ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Owner"
                    value={editedMetadata.owner || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, owner: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Category"
                    value={editedMetadata.category || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, category: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Description"
                    value={editedMetadata.description || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, description: e.target.value })}
                    multiline
                    rows={3}
                    fullWidth
                  />
                  <FormControl fullWidth>
                    <InputLabel>Business Unit</InputLabel>
                    <Select
                      value={editedMetadata.businessUnit || ''}
                      label="Business Unit"
                      onChange={(e) => setEditedMetadata({ ...editedMetadata, businessUnit: e.target.value })}
                    >
                      <MenuItem value="">None</MenuItem>
                      <MenuItem value="Sales">Sales</MenuItem>
                      <MenuItem value="Marketing">Marketing</MenuItem>
                      <MenuItem value="Finance">Finance</MenuItem>
                      <MenuItem value="Operations">Operations</MenuItem>
                      <MenuItem value="IT">IT</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Data Source"
                    value={editedMetadata.dataSource || ''}
                    onChange={(e) => setEditedMetadata({ ...editedMetadata, dataSource: e.target.value })}
                    fullWidth
                  />
                  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <Button
                      startIcon={<CancelIcon />}
                      onClick={() => {
                        setIsEditingMetadata(false);
                        setEditedMetadata(dashboard.metadata);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      startIcon={<SaveIcon />}
                      variant="contained"
                      onClick={handleSaveMetadata}
                      disabled={updateMetadataMutation.isPending}
                    >
                      Save Changes
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Owner</Typography>
                    <Typography variant="body1">{dashboard.metadata.owner || 'Not specified'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Category</Typography>
                    <Typography variant="body1">{dashboard.metadata.category || 'Uncategorized'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Business Unit</Typography>
                    <Typography variant="body1">{dashboard.metadata.businessUnit || 'Not specified'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Data Source</Typography>
                    <Typography variant="body1">{dashboard.metadata.dataSource || 'Not specified'}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Description</Typography>
                    <Typography variant="body1">
                      {dashboard.metadata.description || 'No description available'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Created</Typography>
                    <Typography variant="body1">
                      {dashboard.createdTime ? format(new Date(dashboard.createdTime), 'PPP') : 'Unknown'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Last Updated</Typography>
                    <Typography variant="body1">
                      {dashboard.lastUpdatedTime ? format(new Date(dashboard.lastUpdatedTime), 'PPP') : 'Unknown'}
                    </Typography>
                  </Grid>
                </Grid>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Quick Stats
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      <VisibilityIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                      Total Views (30 days)
                    </Typography>
                    <Typography variant="h4">{dashboard.usage.viewCountLast30Days}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      <GroupIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                      Permissions
                    </Typography>
                    <Typography variant="h4">{dashboard.permissions.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      <TagIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                      Tags
                    </Typography>
                    <Typography variant="h4">{tags?.length || 0}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Access Permissions
          </Typography>
          <List>
            {dashboard.permissions.map((permission, index) => (
              <ListItem key={index} divider>
                <ListItemText
                  primary={permission.principal.split('/').pop()}
                  secondary={`${permission.principalType} - ${permission.principal}`}
                />
                <Chip
                  label={permission.permission}
                  color={
                    permission.permission === 'OWNER' ? 'error' :
                    permission.permission === 'AUTHOR' ? 'warning' : 'info'
                  }
                  size="small"
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Usage Analytics
          </Typography>
          <Box sx={{ height: 300, mt: 3 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="views" fill="#FF9900" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          {dashboard.usage.topViewers && dashboard.usage.topViewers.length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle1" gutterBottom>
                Top Viewers
              </Typography>
              <List>
                {dashboard.usage.topViewers.map((viewer, index) => (
                  <ListItem key={index} dense>
                    <ListItemText primary={viewer.user} />
                    <Typography variant="body2" color="text.secondary">
                      {viewer.viewCount} views
                    </Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Tags</Typography>
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={() => setTagDialogOpen(true)}
            >
              Add Tag
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags?.map((tag, index) => (
              <Chip
                key={index}
                label={`${tag.key}: ${tag.value}`}
                onDelete={() => handleDeleteTag(index)}
                color="primary"
                variant="outlined"
              />
            ))}
            {(!tags || tags.length === 0) && (
              <Typography variant="body2" color="text.secondary">
                No tags added yet
              </Typography>
            )}
          </Box>
        </Paper>
      </TabPanel>

      <Dialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Tag</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Tag Key"
              value={newTag.key}
              onChange={(e) => setNewTag({ ...newTag, key: e.target.value })}
              fullWidth
            />
            <TextField
              label="Tag Value"
              value={newTag.value}
              onChange={(e) => setNewTag({ ...newTag, value: e.target.value })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddTag}
            variant="contained"
            disabled={!newTag.key || !newTag.value || updateTagsMutation.isPending}
          >
            Add Tag
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}