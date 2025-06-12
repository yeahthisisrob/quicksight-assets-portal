import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  CircularProgress,
  Stack,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  DataGrid,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  Refresh as RefreshIcon,
  CloudDownload as ExportIcon,
  Assessment as AssessmentIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  Dashboard as DashboardIcon,
  Storage as DatasetIcon,
  Analytics as AnalysisIcon,
  TableChart as TableIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Code as CodeIcon,
  Source as DatasourceIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { assetsApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import Editor from '@monaco-editor/react';

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
      id={`asset-tabpanel-${index}`}
      aria-labelledby={`asset-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AssetMetadataPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [tabValue, setTabValue] = useState(0);
  const [parsedData, setParsedData] = useState<any>(null);
  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [exportSessionId, setExportSessionId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch export summary
  const { data: exportSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['export-summary'],
    queryFn: () => assetsApi.getExportSummary(),
  });

  // Fetch all assets
  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets-all'],
    queryFn: () => assetsApi.getAll(),
    enabled: tabValue === 1, // Only fetch when asset table tab is active
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: (forceRefresh: boolean) => assetsApi.exportAll(forceRefresh),
    onSuccess: (_) => {
      enqueueSnackbar('Asset export completed successfully', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['export-summary'] });
      queryClient.invalidateQueries({ queryKey: ['assets-all'] });
    },
    onError: (error: Error) => {
      enqueueSnackbar(`Export failed: ${error.message}`, { variant: 'error' });
    },
  });

  const handleExport = (forceRefresh = false) => {
    // Use progressive export instead
    handleProgressiveExport(forceRefresh);
  };

  // Poll for export progress
  useEffect(() => {
    if (!exportSessionId || !isExporting) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await assetsApi.getExportSession(exportSessionId);
        setExportProgress(response);

        // Check if all asset types are completed
        const allCompleted = response.progress && 
          Object.values(response.progress).every((p: any) => p.status === 'completed' || p.status === 'error');
        
        if (allCompleted) {
          setIsExporting(false);
          clearInterval(pollInterval);
          
          // Check if any failed
          const anyFailed = Object.values(response.progress).some((p: any) => p.status === 'error');
          
          if (!anyFailed) {
            // Generate summary from progress data
            const summary = {
              dashboards: response.progress.dashboards,
              datasets: response.progress.datasets,
              analyses: response.progress.analyses,
              datasources: response.progress.datasources,
              exportTime: response.startTime,
              duration: Date.now() - new Date(response.startTime).getTime(),
            };
            
            // Complete the session with the summary
            await assetsApi.completeExportSession(summary);
            
            enqueueSnackbar('Asset export completed successfully', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['export-summary'] });
            queryClient.invalidateQueries({ queryKey: ['assets-all'] });
            queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
          } else {
            enqueueSnackbar('Export completed with errors', { variant: 'warning' });
            queryClient.invalidateQueries({ queryKey: ['export-summary'] });
            queryClient.invalidateQueries({ queryKey: ['assets-all'] });
            queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
          }
        }
      } catch (error) {
        console.error('Error polling export progress:', error);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [exportSessionId, isExporting, queryClient, enqueueSnackbar]);

  // New export handler with progress tracking
  const handleProgressiveExport = async (forceRefresh = false) => {
    try {
      setIsExporting(true);
      
      // Start export session
      const { sessionId } = await assetsApi.startExportSession();
      setExportSessionId(sessionId);

      // Export each asset type sequentially
      const assetTypes = ['dashboards', 'datasets', 'analyses', 'datasources'];
      
      for (const assetType of assetTypes) {
        await assetsApi.exportAssetType(assetType, forceRefresh);
      }

      // Let the polling handle completion
      
    } catch (error: any) {
      enqueueSnackbar(`Export failed: ${error.message}`, { variant: 'error' });
      setIsExporting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const renderStatCard = (title: string, stats: any, icon: React.ReactNode) => {
    if (!stats) return null;
    
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            {icon}
            <Typography variant="h6" sx={{ ml: 1 }}>
              {title}
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Total
              </Typography>
              <Typography variant="h4">{stats.total || 0}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Updated
              </Typography>
              <Typography variant="h4" color="primary">
                {stats.updated || 0}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Cached
              </Typography>
              <Typography variant="body1" color="success.main">
                {stats.cached || 0}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Errors
              </Typography>
              <Typography variant="body1" color="error.main">
                {stats.errors || 0}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Asset Metadata Export</Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => handleExport(false)}
            disabled={isExporting}
          >
            Refresh Cache
          </Button>
          <Button
            variant="contained"
            startIcon={<ExportIcon />}
            onClick={() => handleExport(true)}
            disabled={isExporting}
          >
            Force Export All
          </Button>
        </Stack>
      </Box>

      {isExporting && exportProgress && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Export Progress
          </Typography>
          
          {/* Overall Progress */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">
                Overall Progress
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {exportProgress.startTime && `Duration: ${Math.round((Date.now() - new Date(exportProgress.startTime).getTime()) / 1000)}s`}
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={exportProgress.progress ? 
                (Object.values(exportProgress.progress).reduce((sum: number, p: any) => sum + (p.current || 0), 0) / 
                 Math.max(1, Object.values(exportProgress.progress).reduce((sum: number, p: any) => sum + (p.total || 0), 0))) * 100 : 0
              } 
            />
          </Box>

          {/* Individual Asset Type Progress */}
          <Grid container spacing={2}>
            {exportProgress.progress && Object.entries(exportProgress.progress).map(([assetType, progress]: [string, any]) => (
              <Grid item xs={12} sm={6} md={3} key={assetType}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 2 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ textTransform: 'capitalize' }}>
                      {assetType}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      {progress.status === 'running' && <CircularProgress size={16} sx={{ mr: 1 }} />}
                      {progress.status === 'completed' && (
                        <Chip label="✓" size="small" color="success" sx={{ mr: 1, height: 20 }} />
                      )}
                      {progress.status === 'error' && (
                        <Chip label="✗" size="small" color="error" sx={{ mr: 1, height: 20 }} />
                      )}
                      {progress.status === 'idle' && (
                        <Chip label="-" size="small" sx={{ mr: 1, height: 20 }} />
                      )}
                      <Typography variant="body2">
                        {progress.current || 0} / {progress.total || 0}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ 
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {progress.message}
                    </Typography>
                    {progress.duration && (
                      <Typography variant="caption" color="text.secondary">
                        ({(progress.duration / 1000).toFixed(1)}s)
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {exportSummary?.lastExport && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Export Summary</Typography>
            <Box>
              <Chip
                label={`Last export: ${formatDistanceToNow(new Date(exportSummary.lastExport.exportTime))} ago`}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`Duration: ${(exportSummary.lastExport.duration / 1000).toFixed(1)}s`}
                sx={{ ml: 1 }}
                variant="outlined"
              />
            </Box>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              {renderStatCard(
                'Dashboards',
                exportSummary.lastExport.dashboards,
                <DashboardIcon color="primary" />
              )}
            </Grid>
            <Grid item xs={12} md={3}>
              {renderStatCard(
                'Datasets',
                exportSummary.lastExport.datasets,
                <DatasetIcon color="primary" />
              )}
            </Grid>
            <Grid item xs={12} md={3}>
              {renderStatCard(
                'Analyses',
                exportSummary.lastExport.analyses,
                <AnalysisIcon color="primary" />
              )}
            </Grid>
            <Grid item xs={12} md={3}>
              {renderStatCard(
                'Datasources',
                exportSummary.lastExport.datasources,
                <DatasourceIcon color="primary" />
              )}
            </Grid>
          </Grid>

          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Total Assets: {exportSummary.totalAssets || 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Export Time: {format(new Date(exportSummary.lastExport.exportTime), 'PPpp')}
            </Typography>
          </Box>
        </Paper>
      )}

      {!exportSummary?.lastExport && !summaryLoading && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No assets have been exported yet. Click "Force Export All" to start the initial export.
        </Alert>
      )}

      <Paper sx={{ mt: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Overview" icon={<AssessmentIcon />} iconPosition="start" />
          <Tab label="Asset Table" icon={<TableIcon />} iconPosition="start" />
          <Tab label="Export Details" icon={<ExportIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>
            How Asset Export Works
          </Typography>
          <Typography variant="body2" paragraph>
            The asset export process efficiently caches QuickSight asset metadata in S3:
          </Typography>
          <ul>
            <li>
              <Typography variant="body2">
                <strong>Smart Caching:</strong> Assets are only re-fetched if they've been modified since the last export
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Shared Cache:</strong> All users share the same S3 cache, reducing API calls and improving performance
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Incremental Updates:</strong> Only changed assets are updated, making subsequent exports much faster
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>1-Hour Cache:</strong> Cached data is considered fresh for 1 hour, after which it will be re-validated
              </Typography>
            </li>
          </ul>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {assetsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : assetsData?.assets && assetsData.assets.length > 0 ? (
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Exported Assets ({assetsData.assets.length} total)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Size: {(assetsData.totalSize / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
              <DataGrid
                rows={assetsData.assets.map((asset: any, index: number) => ({
                  ...asset,
                  rowId: index,
                }))}
                autoHeight
                columnHeaderHeight={56}
                columns={[
                  {
                    field: 'type',
                    headerName: 'Type',
                    flex: 0.5,
                    minWidth: 80,
                    renderCell: (params) => {
                      const icon = params.value === 'dashboard' ? <DashboardIcon /> :
                                  params.value === 'dataset' ? <DatasetIcon /> :
                                  params.value === 'analysis' ? <AnalysisIcon /> :
                                  params.value === 'datasource' ? <DatasourceIcon /> : null;
                      const displayName = params.value === 'analysis' ? 'Analysis' : 
                                        params.value === 'dashboard' ? 'Dashboard' :
                                        params.value === 'dataset' ? 'Dataset' :
                                        params.value === 'datasource' ? 'Datasource' : params.value;
                      return (
                        <Tooltip title={displayName}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {icon}
                            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
                              {displayName}
                            </Typography>
                          </Box>
                        </Tooltip>
                      );
                    },
                  },
                  {
                    field: 'name',
                    headerName: 'Name',
                    flex: 1.5,
                    minWidth: 150,
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
                    headerName: 'UUID',
                    flex: 1,
                    minWidth: 180,
                    renderCell: (params) => (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title={params.value}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontFamily: 'monospace', 
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '150px',
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
                    field: 'fileSize',
                    headerName: 'Size',
                    flex: 0.5,
                    minWidth: 80,
                    renderCell: (params) => {
                      const kb = params.value / 1024;
                      const sizeStr = kb > 1024 ? 
                        `${(kb / 1024).toFixed(1)}M` : 
                        `${kb.toFixed(0)}K`;
                      return (
                        <Tooltip title={kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(2)} KB`}>
                          <Typography variant="body2">
                            {sizeStr}
                          </Typography>
                        </Tooltip>
                      );
                    },
                  },
                  {
                    field: 'lastExported',
                    headerName: 'Last Export',
                    flex: 0.8,
                    minWidth: 120,
                    renderCell: (params) => (
                      <Tooltip title={format(new Date(params.value), 'PPpp')}>
                        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                          {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
                        </Typography>
                      </Tooltip>
                    ),
                  },
                  {
                    field: 'actions',
                    headerName: 'Actions',
                    width: 120,
                    sortable: false,
                    renderCell: (params) => (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="View JSON">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              const response = await assetsApi.getAsset(
                                params.row.type + 's', // Convert back to plural
                                params.row.id
                              );
                              setSelectedAsset({
                                ...params.row,
                                data: response,
                              });
                            }}
                            sx={{ padding: '4px' }}
                          >
                            <ViewIcon sx={{ fontSize: '18px' }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Parse Fields">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                const response = await assetsApi.parseAsset(
                                  params.row.type + 's',
                                  params.row.id
                                );
                                setParsedData(response);
                                setParseDialogOpen(true);
                              } catch (error) {
                                enqueueSnackbar('Failed to parse asset', { variant: 'error' });
                              }
                            }}
                            sx={{ padding: '4px' }}
                          >
                            <CodeIcon sx={{ fontSize: '18px' }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download JSON">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              const response = await assetsApi.getAsset(
                                params.row.type + 's',
                                params.row.id
                              );
                              const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${params.row.type}-${params.row.id}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            sx={{ padding: '4px' }}
                          >
                            <DownloadIcon sx={{ fontSize: '18px' }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ),
                  },
                ]}
                getRowId={(row) => row.rowId}
                disableRowSelectionOnClick
                columnBuffer={8}
                columnThreshold={3}
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
                  // Hide column separators since resize doesn't work in community version
                  '& .MuiDataGrid-columnSeparator': {
                    display: 'none',
                  },
                }}
              />
            </Box>
          ) : (
            <Alert severity="info">
              No exported assets found. Run an export to see assets here.
            </Alert>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          {exportSummary?.lastExport ? (
            <Box>
              <Typography variant="h6" gutterBottom>
                Raw Export Data
              </Typography>
              <Box sx={{ position: 'relative' }}>
                <IconButton
                  size="small"
                  onClick={() => copyToClipboard(JSON.stringify(exportSummary.lastExport, null, 2))}
                  sx={{ position: 'absolute', right: 0, top: 0 }}
                >
                  <CopyIcon />
                </IconButton>
                <Editor
                  height="400px"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={JSON.stringify(exportSummary.lastExport, null, 2)}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                  }}
                />
              </Box>
            </Box>
          ) : (
            <Typography color="text.secondary">
              No export data available yet.
            </Typography>
          )}
        </TabPanel>
      </Paper>

      {/* Asset Detail Dialog */}
      <Dialog
        open={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Asset Details
          <IconButton
            aria-label="close"
            onClick={() => setSelectedAsset(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedAsset && (
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {selectedAsset.type.toUpperCase()} - {selectedAsset.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ID: {selectedAsset.id} | Size: {(selectedAsset.fileSize / 1024).toFixed(2)} KB
                </Typography>
              </Box>
              <Editor
                height="500px"
                defaultLanguage="json"
                theme="vs-dark"
                value={JSON.stringify(selectedAsset.data || selectedAsset, null, 2)}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Parse Results Dialog */}
      <Dialog
        open={parseDialogOpen}
        onClose={() => setParseDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Parsed Asset Information
          <IconButton
            aria-label="close"
            onClick={() => setParseDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {parsedData && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {parsedData.assetType.charAt(0).toUpperCase() + parsedData.assetType.slice(1)}: {parsedData.assetName}
              </Typography>
              
              {/* Calculated Fields */}
              {parsedData.parsed?.calculatedFields?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Calculated Fields ({parsedData.parsed.calculatedFields.length})
                  </Typography>
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {parsedData.parsed.calculatedFields.map((cf: any, index: number) => (
                      <Paper key={index} sx={{ p: 2, mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {cf.name}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                          {cf.expression}
                        </Typography>
                        {cf.dataSetIdentifier && (
                          <Typography variant="caption" color="text.secondary">
                            Dataset: {cf.dataSetIdentifier}
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Regular Fields */}
              {parsedData.parsed?.fields?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Fields ({parsedData.parsed.fields.length})
                  </Typography>
                  <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    <DataGrid
                      rows={parsedData.parsed.fields.map((f: any, idx: number) => ({ ...f, id: idx }))}
                      columns={[
                        { field: 'fieldName', headerName: 'Field Name', flex: 1 },
                        { field: 'fieldId', headerName: 'Field ID', flex: 1 },
                        { field: 'dataType', headerName: 'Data Type', width: 120 },
                        { field: 'dataSetIdentifier', headerName: 'Dataset', width: 150 },
                      ]}
                      autoHeight
                      density="compact"
                      hideFooter
                    />
                  </Box>
                </Box>
              )}

              {/* Datasource Info */}
              {parsedData.parsed?.datasourceInfo && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Datasource Information
                  </Typography>
                  <Paper sx={{ p: 2 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Type</Typography>
                        <Typography variant="body1">{parsedData.parsed.datasourceInfo.type || 'Unknown'}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Status</Typography>
                        <Typography variant="body1">{parsedData.parsed.datasourceInfo.status || 'Unknown'}</Typography>
                      </Grid>
                      {parsedData.parsed.datasourceInfo.engine && (
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Engine</Typography>
                          <Typography variant="body1">{parsedData.parsed.datasourceInfo.engine}</Typography>
                        </Grid>
                      )}
                      {parsedData.parsed.datasourceInfo.database && (
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Database</Typography>
                          <Typography variant="body1">{parsedData.parsed.datasourceInfo.database}</Typography>
                        </Grid>
                      )}
                      {parsedData.parsed.datasourceInfo.manifestFileLocation && (
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary">Manifest Location</Typography>
                          <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                            {parsedData.parsed.datasourceInfo.manifestFileLocation}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                </Box>
              )}

              {/* Parameters */}
              {parsedData.parsed?.parameters?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Parameters ({parsedData.parsed.parameters.length})
                  </Typography>
                  {parsedData.parsed.parameters.map((param: any, index: number) => (
                    <Chip
                      key={index}
                      label={`${param.name} (${param.type})`}
                      sx={{ mr: 1, mb: 1 }}
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}

              {/* Visuals */}
              {parsedData.parsed?.visuals?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Visuals ({parsedData.parsed.visuals.length})
                  </Typography>
                  {parsedData.parsed.visuals.map((visual: any, index: number) => (
                    <Chip
                      key={index}
                      label={visual.title || visual.type}
                      sx={{ mr: 1, mb: 1 }}
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}

              {/* Raw Parsed Data */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Raw Parsed Data
                </Typography>
                <Editor
                  height="300px"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={JSON.stringify(parsedData.parsed, null, 2)}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                  }}
                />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}