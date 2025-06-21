import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
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
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Search as SearchIcon,
  Build as BuildIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { assetsApi, dataCatalogApi } from '@/services/api';
import { useSnackbar } from 'notistack';
import Editor from '@monaco-editor/react';
import ExportSessionManager from '@/components/export/ExportSessionManager';

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
  const [exportingAssetType, setExportingAssetType] = useState<string | null>(null);
  const [assetsPage, setAssetsPage] = useState(0);
  const [assetsPageSize, setAssetsPageSize] = useState(50);
  const [assetsSearch, setAssetsSearch] = useState('');
  const [assetsTypeFilter, setAssetsTypeFilter] = useState('');
  const [forceExportDialogOpen, setForceExportDialogOpen] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);

  // Fetch export summary
  const { data: exportSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['export-summary'],
    queryFn: () => assetsApi.getExportSummary(),
  });

  // Debounce search term for assets
  const debouncedAssetsSearch = useDebounce(assetsSearch, 500);

  // Fetch asset index/counts (always load for overview)
  const { data: assetIndex } = useQuery({
    queryKey: ['asset-index'],
    queryFn: () => assetsApi.getAll({
      page: 1,
      pageSize: 1, // Just need the summary/counts
    }),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch assets with pagination (only for table view)
  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets-all', assetsPage + 1, assetsPageSize, debouncedAssetsSearch, assetsTypeFilter],
    queryFn: () => assetsApi.getAll({
      page: assetsPage + 1, // API uses 1-based pages
      pageSize: assetsPageSize,
      search: debouncedAssetsSearch,
      assetType: assetsTypeFilter || undefined,
    }),
    enabled: tabValue === 1, // Only fetch when asset table tab is active
    placeholderData: (previousData) => previousData,
  });

  // Fetch data catalog summary
  const { data: catalogData } = useQuery({
    queryKey: ['data-catalog'],
    queryFn: () => dataCatalogApi.getCatalog(),
    staleTime: 5 * 60 * 1000,
  });

  const handleExport = (forceRefresh = false) => {
    // Use progressive export instead
    handleProgressiveExport(forceRefresh);
  };

  const handleExportAssetType = async (assetType: string, forceRefresh = false) => {
    try {
      setExportingAssetType(assetType);
      enqueueSnackbar(`Starting ${assetType} export...`, { variant: 'info' });
      
      const response = await assetsApi.exportAssetType(assetType, forceRefresh);
      
      // The export now starts asynchronously, we get back session info
      if (response.sessionId) {
        setExportSessionId(response.sessionId);
        setIsExporting(true);
        
        // Initialize export progress
        if (!exportProgress) {
          setExportProgress({
            progress: {
              dashboards: { status: 'idle', current: 0, total: 0 },
              datasets: { status: 'idle', current: 0, total: 0 },
              analyses: { status: 'idle', current: 0, total: 0 },
              datasources: { status: 'idle', current: 0, total: 0 },
            },
            startTime: new Date().toISOString(),
          });
        }
        
        // Update the specific asset type progress
        setExportProgress((prev: any) => ({
          ...prev,
          progress: {
            ...prev.progress,
            [assetType]: response.progress || { status: 'running', current: 0, total: 0 },
          },
        }));
        
        enqueueSnackbar(`${assetType} export started. Monitoring progress...`, { variant: 'info' });
      }
    } catch (error: any) {
      enqueueSnackbar(`Failed to start ${assetType} export: ${error.message}`, { variant: 'error' });
      setExportingAssetType(null);
    }
  };

  // Poll for export progress
  useEffect(() => {
    if (!exportSessionId || !isExporting) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await assetsApi.getExportSession(exportSessionId);
        setExportProgress(response);

        // Check if session was cancelled
        if (response.status === 'cancelled') {
          setIsExporting(false);
          setExportingAssetType(null);
          setIsRebuildingIndex(false);
          clearInterval(pollInterval);
          setExportSessionId(null);
          setExportProgress(null);
          setHasActiveSession(false);
          queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          return;
        }

        // Check if the specific export type is completed (if exportingAssetType is set)
        // or if all asset types are completed (for full export)
        let exportCompleted = false;
        
        // Check if this is a rebuild session
        const isRebuildSession = response.progress?.rebuild !== undefined;
        
        if (isRebuildSession) {
          // Rebuild session
          const rebuildProgress = response.progress.rebuild;
          exportCompleted = rebuildProgress && (rebuildProgress.status === 'completed' || rebuildProgress.status === 'error');
        } else if (exportingAssetType) {
          // Single asset type export
          const assetProgress = response.progress?.[exportingAssetType];
          exportCompleted = assetProgress && (assetProgress.status === 'completed' || assetProgress.status === 'error');
        } else {
          // Full export - check all types
          exportCompleted = response.progress && 
            Object.values(response.progress).every((p: any) => p.status === 'completed' || p.status === 'error');
        }
        
        if (exportCompleted) {
          setIsExporting(false);
          setExportingAssetType(null);
          setIsRebuildingIndex(false);
          clearInterval(pollInterval);
          
          // Clear session state
          setExportSessionId(null);
          setExportProgress(null);
          setHasActiveSession(false);
          
          // Check if the export failed
          const failed = isRebuildSession
            ? response.progress?.rebuild?.status === 'error'
            : exportingAssetType 
            ? response.progress?.[exportingAssetType]?.status === 'error'
            : Object.values(response.progress || {}).some((p: any) => p.status === 'error');
          
          if (!failed) {
            // For rebuild sessions, we don't need to complete the session as the backend already did it
            if (!isRebuildSession) {
              // For progressive exports, don't pass a summary - let the backend use its own
              // since individual asset exports already updated the export summary
              await assetsApi.completeExportSession(null);
            }
            
            const successMessage = isRebuildSession 
              ? 'Index and catalog rebuild completed successfully' 
              : 'Asset export completed successfully';
            enqueueSnackbar(successMessage, { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['export-summary'] });
            queryClient.invalidateQueries({ queryKey: ['assets-all'] });
            queryClient.invalidateQueries({ queryKey: ['asset-index'] });
            queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
            queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          } else {
            const errorMessage = isRebuildSession 
              ? 'Index rebuild completed with errors' 
              : 'Export completed with errors';
            enqueueSnackbar(errorMessage, { variant: 'warning' });
            queryClient.invalidateQueries({ queryKey: ['export-summary'] });
            queryClient.invalidateQueries({ queryKey: ['assets-all'] });
            queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
            queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          }
          
          // Clear session state to re-enable buttons
          setExportSessionId(null);
          setExportProgress(null);
          setIsRebuildingIndex(false);
          setExportingAssetType(null);
          
          // Force immediate refetch of active sessions
          queryClient.refetchQueries({ queryKey: ['active-sessions'] });
        }
      } catch (error) {
        console.error('Error polling export progress:', error);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [exportSessionId, isExporting, exportingAssetType, queryClient, enqueueSnackbar]);

  // New export handler with progress tracking
  const handleProgressiveExport = async (forceRefresh = false) => {
    try {
      setIsExporting(true);
      enqueueSnackbar(`Starting ${forceRefresh ? 'force' : 'incremental'} export for all asset types...`, { variant: 'info' });
      
      // Use the exportAll endpoint which already handles sequential exports
      const response = await assetsApi.exportAll(forceRefresh);
      
      if (response.sessionId) {
        setExportSessionId(response.sessionId);
        
        // Initialize progress tracking
        setExportProgress({
          progress: {
            dashboards: { status: 'idle', current: 0, total: 0 },
            datasets: { status: 'idle', current: 0, total: 0 },
            analyses: { status: 'idle', current: 0, total: 0 },
            datasources: { status: 'idle', current: 0, total: 0 },
          },
          startTime: new Date().toISOString(),
        });
        
        enqueueSnackbar('Export started. Monitoring progress...', { variant: 'info' });
      }
      
    } catch (error: any) {
      enqueueSnackbar(`Export failed: ${error.message}`, { variant: 'error' });
      setIsExporting(false);
      setExportSessionId(null);
      setExportProgress(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const handleRebuildIndex = async () => {
    try {
      setIsRebuildingIndex(true);
      setHasActiveSession(true);
      const response = await assetsApi.rebuildIndex();
      
      if (response.sessionId) {
        setExportSessionId(response.sessionId);
        setIsExporting(true); // Set this so polling starts
        enqueueSnackbar('Index and catalog rebuild started...', { variant: 'info' });
      }
    } catch (error: any) {
      enqueueSnackbar(`Failed to rebuild index: ${error.message}`, { variant: 'error' });
      setIsRebuildingIndex(false);
      setHasActiveSession(false);
    }
  };

  const handleCancelExport = async () => {
    try {
      await assetsApi.cancelExportSession();
      setIsExporting(false);
      setExportingAssetType(null);
      setIsRebuildingIndex(false);
      setExportSessionId(null);
      setExportProgress(null);
      setHasActiveSession(false);
      enqueueSnackbar('Export cancelled successfully', { variant: 'info' });
      
      // Force a small delay to ensure backend has saved the cancelled state
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Refresh the export summary and active sessions to get updated state
      await queryClient.invalidateQueries({ queryKey: ['export-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['asset-index'] });
      
      // Force refetch to ensure we get the latest state
      queryClient.refetchQueries({ queryKey: ['active-sessions'] });
    } catch (error: any) {
      enqueueSnackbar(`Failed to cancel export: ${error.message}`, { variant: 'error' });
    }
  };


  return (
    <Box>
      {/* Export Session Manager */}
      <ExportSessionManager
        currentSessionId={exportSessionId}
        exportProgress={exportProgress}
        onCancel={handleCancelExport}
        onSessionChange={setHasActiveSession}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">Asset Metadata Export</Typography>
          <Typography variant="body2" color="text.secondary">
            Export and cache QuickSight asset metadata for faster access
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Tooltip 
            title={hasActiveSession 
              ? "Complete or cancel the active session first" 
              : "Export only new or modified assets since last export"}
            arrow
            placement="bottom"
          >
            <span>
              <Button
                variant="contained"
                startIcon={isExporting && !exportingAssetType ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                onClick={() => handleExport(false)}
                disabled={isExporting || hasActiveSession}
                sx={{
                  minWidth: 140,
                  height: 40,
                  textTransform: 'none',
                  fontWeight: 500,
                  boxShadow: 1,
                  '&:hover': {
                    boxShadow: 2,
                  },
                }}
              >
                Refresh Cache
              </Button>
            </span>
          </Tooltip>
          
          <Tooltip 
            title={hasActiveSession 
              ? "Complete or cancel the active session first" 
              : "Rebuild the index from existing exported data without re-fetching from QuickSight"}
            arrow
            placement="bottom"
          >
            <span>
              <Button
                variant="outlined"
                startIcon={isRebuildingIndex ? <CircularProgress size={20} /> : <BuildIcon />}
                onClick={handleRebuildIndex}
                disabled={isExporting || hasActiveSession || isRebuildingIndex}
                sx={{
                  minWidth: 140,
                  height: 40,
                  textTransform: 'none',
                  fontWeight: 500,
                  borderWidth: 2,
                  '&:hover': {
                    borderWidth: 2,
                    backgroundColor: 'primary.50',
                  },
                }}
              >
                Rebuild Index
              </Button>
            </span>
          </Tooltip>
          
          <Tooltip 
            title={hasActiveSession 
              ? "Complete or cancel the active session first" 
              : "Delete all cached data and re-export everything from scratch (use with caution)"}
            arrow
            placement="bottom"
          >
            <span>
              <Button
                variant="outlined"
                color="error"
                startIcon={<ExportIcon />}
                onClick={() => setForceExportDialogOpen(true)}
                disabled={isExporting || hasActiveSession}
                sx={{
                  minWidth: 140,
                  height: 40,
                  textTransform: 'none',
                  fontWeight: 500,
                  borderWidth: 2,
                  '&:hover': {
                    borderWidth: 2,
                    backgroundColor: 'error.50',
                  },
                }}
              >
                Force Export
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>


      {/* Indexed Assets Summary */}
      <Paper sx={{ 
        p: 3, 
        mb: 3,
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
            Indexed Assets Overview
          </Typography>

          {/* Main Asset Counts */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.25)',
                },
              }}>
                <CardContent sx={{ textAlign: 'center', p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <DashboardIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {assetIndex?.assetCounts?.dashboards || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Dashboards
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="Refresh dashboards">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('dashboards', false)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'primary.50',
                          '&:hover': { bgcolor: 'primary.100' },
                        }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Force export dashboards">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('dashboards', true)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'error.50',
                          '&:hover': { bgcolor: 'error.100' },
                        }}
                      >
                        <ExportIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.25)',
                },
              }}>
                <CardContent sx={{ textAlign: 'center', p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <DatasetIcon sx={{ fontSize: 40, color: 'success.main' }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {assetIndex?.assetCounts?.datasets || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Datasets
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="Refresh datasets">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('datasets', false)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'success.50',
                          '&:hover': { bgcolor: 'success.100' },
                        }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Force export datasets">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('datasets', true)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'error.50',
                          '&:hover': { bgcolor: 'error.100' },
                        }}
                      >
                        <ExportIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.25)',
                },
              }}>
                <CardContent sx={{ textAlign: 'center', p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <AnalysisIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'warning.main' }}>
                    {assetIndex?.assetCounts?.analyses || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Analyses
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="Refresh analyses">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('analyses', false)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'warning.50',
                          '&:hover': { bgcolor: 'warning.100' },
                        }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Force export analyses">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('analyses', true)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'error.50',
                          '&:hover': { bgcolor: 'error.100' },
                        }}
                      >
                        <ExportIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.25)',
                },
              }}>
                <CardContent sx={{ textAlign: 'center', p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <DatasourceIcon sx={{ fontSize: 40, color: 'info.main' }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.main' }}>
                    {assetIndex?.assetCounts?.datasources || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Datasources
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="Refresh datasources">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('datasources', false)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'info.50',
                          '&:hover': { bgcolor: 'info.100' },
                        }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Force export datasources">
                      <IconButton
                        size="small"
                        onClick={() => handleExportAssetType('datasources', true)}
                        disabled={isExporting || hasActiveSession}
                        sx={{ 
                          bgcolor: 'error.50',
                          '&:hover': { bgcolor: 'error.100' },
                        }}
                      >
                        <ExportIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Data Catalog Stats */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(5px)',
              }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TableIcon /> Data Catalog Insights
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Physical Fields</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {catalogData?.summary?.totalFields || 0}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Calculated Fields</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {catalogData?.summary?.totalCalculatedFields || 0}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card sx={{ 
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(5px)',
              }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AssessmentIcon /> Storage Summary
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Total Size</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {assetIndex ? `${(assetIndex.totalSize / 1024 / 1024).toFixed(1)} MB` : '0 MB'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Last Updated</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {catalogData?.summary?.lastUpdated 
                          ? formatDistanceToNow(new Date(catalogData.summary.lastUpdated), { addSuffix: true })
                          : 'Never'}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {!exportSummary?.lastExport && !summaryLoading && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No assets have been exported yet. Click "Refresh Cache" to start the initial export.
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
                <strong>Resume Capability:</strong> Exports save progress after every 10 assets. If interrupted, the next export will skip already processed items
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Error Resilience:</strong> Failed assets don't stop the export. Errors are logged and the export continues with remaining assets
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Incremental Updates:</strong> "Refresh Cache" only processes new or modified assets, while "Force Export" re-processes everything
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>1-Hour Cache:</strong> Cached data is considered fresh for 1 hour, after which it will be re-validated
              </Typography>
            </li>
          </ul>
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Tip:</strong> Use "Refresh Cache" for regular updates. Only use "Force Export All" if you suspect data corruption or after major changes.
            </Typography>
          </Alert>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ width: '100%' }}>
            {/* Search and Filter Controls */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label="Search assets..."
                variant="outlined"
                size="small"
                value={assetsSearch}
                onChange={(e) => {
                  setAssetsSearch(e.target.value);
                  setAssetsPage(0); // Reset to first page on search
                }}
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Asset Type</InputLabel>
                <Select
                  value={assetsTypeFilter}
                  onChange={(e) => {
                    setAssetsTypeFilter(e.target.value);
                    setAssetsPage(0); // Reset to first page on filter
                  }}
                  label="Asset Type"
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="dashboard">Dashboards</MenuItem>
                  <MenuItem value="dataset">Datasets</MenuItem>
                  <MenuItem value="analysis">Analyses</MenuItem>
                  <MenuItem value="datasource">Datasources</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Summary Info */}
            {assetsData && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Exported Assets ({assetsData.pagination?.totalItems || 0} total)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Size: {(assetsData.totalSize / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
            )}

            {assetsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : assetsData?.assets && assetsData.assets.length > 0 ? (
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
                      if (!params.value || isNaN(params.value)) {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        );
                      }
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
                    field: 'lastModified',
                    headerName: 'Last Export',
                    flex: 0.8,
                    minWidth: 120,
                    renderCell: (params) => {
                      if (!params.value) {
                        return (
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            Unknown
                          </Typography>
                        );
                      }
                      try {
                        const date = new Date(params.value);
                        if (isNaN(date.getTime())) {
                          return (
                            <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                              Invalid date
                            </Typography>
                          );
                        }
                        return (
                          <Tooltip title={format(date, 'PPpp')}>
                            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                              {formatDistanceToNow(date, { addSuffix: true })}
                            </Typography>
                          </Tooltip>
                        );
                      } catch (error) {
                        return (
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            Invalid date
                          </Typography>
                        );
                      }
                    },
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
                              const assetType = params.row.type === 'analysis' ? 'analyses' : params.row.type + 's';
                              const response = await assetsApi.getAsset(
                                assetType,
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
                                const assetType = params.row.type === 'analysis' ? 'analyses' : params.row.type + 's';
                                const response = await assetsApi.parseAsset(
                                  assetType,
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
                              const assetType = params.row.type === 'analysis' ? 'analyses' : params.row.type + 's';
                              const response = await assetsApi.getAsset(
                                assetType,
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
                paginationMode="server"
                rowCount={assetsData.pagination?.totalItems || 0}
                paginationModel={{
                  page: assetsPage,
                  pageSize: assetsPageSize,
                }}
                onPaginationModelChange={(model) => {
                  setAssetsPage(model.page);
                  setAssetsPageSize(model.pageSize);
                }}
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  sorting: {
                    sortModel: [{ field: 'lastExported', sort: 'desc' }],
                  },
                }}
                slots={{
                  toolbar: GridToolbar,
                }}
                slotProps={{
                  toolbar: {
                    showQuickFilter: false, // Disabled since we have custom search
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
            ) : (
            <Alert severity="info">
              No exported assets found. Run an export to see assets here.
            </Alert>
          )}
          </Box>
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
          {selectedAsset?.type === 'error-details' ? selectedAsset.title : 'Parsed Asset Information'}
          <IconButton
            aria-label="close"
            onClick={() => setParseDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedAsset?.type === 'error-details' && selectedAsset.errors && (
            <Box>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                The following errors occurred during the export process:
              </Typography>
              
              <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {selectedAsset.errors.map((error: any, index: number) => (
                  <Paper key={index} sx={{ p: 2, mb: 2, backgroundColor: 'error.light', color: 'error.contrastText' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {error.assetName} ({error.assetId})
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', mb: 1 }}>
                      {error.error}
                    </Typography>
                    <Typography variant="caption" color="inherit">
                      {new Date(error.timestamp).toLocaleString()}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
          
          {parsedData && selectedAsset?.type !== 'error-details' && (
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

      {/* Force Export Confirmation Dialog */}
      <Dialog
        open={forceExportDialogOpen}
        onClose={() => setForceExportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'warning.main' }}>
          ⚠️ Confirm Force Export All
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action will DELETE all cached asset data and re-export everything from scratch!
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            <strong>What this will do:</strong>
          </Typography>
          <Box component="ul" sx={{ pl: 2, mb: 2 }}>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              Delete all cached metadata files in S3
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              Re-export ALL assets (dashboards, datasets, analyses, datasources)
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              This process can take 15+ minutes for large accounts
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              All progress from incremental exports will be lost
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>When to use this:</strong>
            <Box component="ul" sx={{ pl: 2, mt: 1 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                Cached data appears corrupted or inconsistent
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                Major structural changes to QuickSight assets
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                Troubleshooting unexplained issues
              </Typography>
            </Box>
          </Alert>

          <Typography variant="body2" color="text.secondary">
            In most cases, use "Refresh Cache" instead, which only exports new or modified assets.
          </Typography>
        </DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, pt: 0 }}>
          <Button 
            onClick={() => setForceExportDialogOpen(false)}
            variant="contained"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setForceExportDialogOpen(false);
              handleExport(true);
            }}
            variant="outlined"
            color="warning"
            startIcon={<ExportIcon />}
          >
            Yes, Delete All & Re-Export
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}