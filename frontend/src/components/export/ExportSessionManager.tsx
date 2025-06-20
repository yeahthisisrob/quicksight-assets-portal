import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  LinearProgress,
  IconButton,
  Collapse,
  Alert,
  Grid,
  Stack,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  HourglassEmpty as RunningIcon,
  Schedule as IdleIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { assetsApi } from '@/services/api';
import { useQuery } from '@tanstack/react-query';

interface ExportSessionManagerProps {
  currentSessionId: string | null;
  exportProgress: any;
  onCancel: () => void;
  onSessionChange: (hasActiveSession: boolean) => void;
}

interface SessionHistoryItem {
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  assetTypes: string[];
  stats?: {
    total: number;
    updated: number;
    cached: number;
    errors: number;
  };
  detailedStats?: {
    dashboards?: { total: number; updated: number; cached: number; errors: number };
    datasets?: { total: number; updated: number; cached: number; errors: number };
    analyses?: { total: number; updated: number; cached: number; errors: number };
    datasources?: { total: number; updated: number; cached: number; errors: number };
  };
}

export default function ExportSessionManager({
  currentSessionId,
  exportProgress,
  onCancel,
  onSessionChange,
}: ExportSessionManagerProps) {
  const [showHistory, setShowHistory] = useState(true); // Default to expanded
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Check for active sessions on mount
  const { data: activeSessions } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      // Get recent sessions from metadata
      try {
        const response = await assetsApi.getRecentSessions();
        return response;
      } catch {
        return [];
      }
    },
    refetchInterval: currentSessionId ? 5000 : false, // Poll if there's an active session
  });

  useEffect(() => {
    // Notify parent about active session state
    let hasActive = false;
    
    if (currentSessionId && exportProgress?.progress) {
      // Check if any progress item is still running
      const progressStatuses = Object.values(exportProgress.progress).map((p: any) => p.status);
      hasActive = progressStatuses.some(status => status === 'running');
    }
    
    // Also check active sessions from the server
    if (!hasActive && activeSessions) {
      hasActive = activeSessions.some((s: any) => s.status === 'running');
    }
    
    onSessionChange(hasActive);
  }, [currentSessionId, exportProgress, activeSessions, onSessionChange]);

  // Update session history
  useEffect(() => {
    if (activeSessions) {
      const history = activeSessions
        .slice(0, 6) // Last 6 sessions
        .map((session: any) => {
          const progress = session.progress || {};
          const assetTypes = Object.keys(progress).filter(
            type => progress[type].status !== 'idle'
          );

          const stats = {
            total: 0,
            updated: 0,
            cached: 0,
            errors: 0,
          };

          const detailedStats: any = {};

          // Calculate stats from progress
          Object.entries(progress).forEach(([type, p]: [string, any]) => {
            if (p.stats) {
              stats.total += p.total || 0;
              stats.updated += p.stats.updated || 0;
              stats.cached += p.stats.cached || 0;
              stats.errors += p.stats.errors || 0;
              
              // Store detailed stats by type
              detailedStats[type] = {
                total: p.total || 0,
                updated: p.stats.updated || 0,
                cached: p.stats.cached || 0,
                errors: p.stats.errors || 0,
              };
            }
          });

          return {
            sessionId: session.sessionId,
            startTime: session.startTime,
            endTime: session.endTime,
            status: session.status,
            assetTypes,
            stats: stats.total > 0 ? stats : undefined,
            detailedStats: Object.keys(detailedStats).length > 0 ? detailedStats : undefined,
          };
        });

      setSessionHistory(history);
    }
  }, [activeSessions]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <SuccessIcon color="success" fontSize="small" />;
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'cancelled':
        return <CancelIcon color="warning" fontSize="small" />;
      case 'running':
        return <RunningIcon color="primary" fontSize="small" />;
      default:
        return <IdleIcon color="disabled" fontSize="small" />;
    }
  };


  // Find current active session (either the one passed in or from history)
  const activeSession = currentSessionId 
    ? sessionHistory.find(s => s.sessionId === currentSessionId)
    : sessionHistory.find(s => s.status === 'running');

  // If we have a currentSessionId with exportProgress, show that even if not in history yet
  // But only show if it's actually running
  let showCurrentProgress = false;
  if (currentSessionId && exportProgress?.progress) {
    const progressStatuses = Object.values(exportProgress.progress).map((p: any) => p.status);
    showCurrentProgress = progressStatuses.some(status => status === 'running');
  }

  if (!activeSession && !showCurrentProgress && sessionHistory.length === 0) {
    return null; // Don't show anything if no sessions
  }

  return (
    <Paper 
      sx={{ 
        p: 2, 
        mb: 3,
        border: showCurrentProgress ? 2 : 1,
        borderColor: showCurrentProgress ? 'primary.main' : 'divider',
        boxShadow: showCurrentProgress ? 3 : 1,
      }}
    >
      {/* Active Session Alert */}
      {(showCurrentProgress || activeSession) && (
        <Alert 
          severity={activeSession?.status === 'error' ? 'error' : activeSession?.status === 'cancelled' ? 'warning' : 'info'}
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              {(showCurrentProgress || activeSession?.status === 'running') && (
                <>
                  <Button
                    size="small"
                    startIcon={<CancelIcon />}
                    onClick={onCancel}
                    color="inherit"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </Stack>
          }
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {showCurrentProgress && exportProgress.progress?.rebuild ? 'Index Rebuild in Progress' : 'Export in Progress'}
          </Typography>
          <Typography variant="body2">
            {showCurrentProgress && exportProgress.startTime && 
              `Started ${formatDistanceToNow(new Date(exportProgress.startTime), { addSuffix: true })}`}
          </Typography>
          
          {/* Progress bar for current export */}
          {showCurrentProgress && exportProgress.progress && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress 
                variant="determinate" 
                value={
                  Object.values(exportProgress.progress).reduce((sum: number, p: any) => sum + (p.current || 0), 0) / 
                  Math.max(1, Object.values(exportProgress.progress).reduce((sum: number, p: any) => sum + (p.total || 0), 0)) * 100
                } 
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Grid container spacing={1} sx={{ mt: 0.5 }}>
                {Object.entries(exportProgress.progress).map(([type, progress]: [string, any]) => (
                  <Grid item key={type}>
                    <Chip
                      size="small"
                      icon={getStatusIcon(progress.status)}
                      label={`${type}: ${progress.current || 0}/${progress.total || 0}`}
                      variant={progress.status === 'running' ? 'filled' : 'outlined'}
                      color={
                        progress.status === 'completed' ? 'success' : 
                        progress.status === 'error' ? 'error' : 
                        progress.status === 'idle' ? 'default' :
                        'primary'
                      }
                      sx={{ 
                        opacity: progress.status === 'idle' ? 0.6 : 1,
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
              
              {/* Show current progress message */}
              {Object.entries(exportProgress.progress).map(([type, progress]: [string, any]) => 
                progress.status === 'running' && progress.message && (
                  <Typography key={type} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {progress.message}
                  </Typography>
                )
              )}
            </Box>
          )}
        </Alert>
      )}

      {/* Session History */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" color="text.secondary">
            Recent Export Sessions
          </Typography>
          <IconButton size="small" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        
        <Collapse in={showHistory}>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ 
            maxHeight: 200, 
            overflowY: 'auto',
            '&::-webkit-scrollbar': {
              width: 8,
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'action.hover',
              borderRadius: 4,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'action.selected',
              borderRadius: 4,
              '&:hover': {
                backgroundColor: 'action.disabled',
              },
            },
          }}>
            <Stack spacing={0.5}>
              {sessionHistory.map((session) => (
                <Box key={session.sessionId}>
                  <Box
                    sx={{ 
                      p: 1,
                      borderRadius: 1,
                      backgroundColor: session.status === 'running' ? 'action.hover' : 'background.paper',
                      cursor: session.detailedStats ? 'pointer' : 'default',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                    onClick={() => session.detailedStats && setExpandedSession(
                      expandedSession === session.sessionId ? null : session.sessionId
                    )}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        {getStatusIcon(session.status)}
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }}>
                            {session.assetTypes.join(', ')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {session.startTime ? format(new Date(session.startTime), 'MMM d, h:mm a') : 'Unknown time'}
                            {session.endTime && session.startTime && ` • ${formatDistanceToNow(new Date(session.startTime), { addSuffix: false })}`}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {session.stats && (
                          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                            <Tooltip title={`Total: ${session.stats.total}`}>
                              <Chip 
                                size="small" 
                                label={session.stats.total} 
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.75rem' }}
                              />
                            </Tooltip>
                            {session.stats.updated > 0 && (
                              <Tooltip title={`Updated: ${session.stats.updated}`}>
                                <Chip 
                                  size="small" 
                                  label={session.stats.updated} 
                                  color="primary" 
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.75rem' }}
                                />
                              </Tooltip>
                            )}
                            {session.stats.errors > 0 && (
                              <Tooltip title={`Errors: ${session.stats.errors}`}>
                                <Chip 
                                  size="small" 
                                  label={session.stats.errors} 
                                  color="error" 
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.75rem' }}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        )}
                        {session.detailedStats && (
                          <IconButton size="small" sx={{ p: 0.5 }}>
                            {expandedSession === session.sessionId ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  
                  {/* Expanded Details */}
                  <Collapse in={expandedSession === session.sessionId}>
                    {session.detailedStats && (
                      <Box sx={{ pl: 5, pr: 2, pb: 1, pt: 0.5 }}>
                        <Grid container spacing={1}>
                          {Object.entries(session.detailedStats).map(([type, stats]: [string, any]) => (
                            <Grid item xs={6} sm={3} key={type}>
                              <Box sx={{ 
                                p: 1, 
                                borderRadius: 1, 
                                bgcolor: 'background.default',
                                border: '1px solid',
                                borderColor: 'divider',
                              }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                  {type}
                                </Typography>
                                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                                  <Chip size="small" label={`Total: ${stats.total}`} sx={{ height: 18, fontSize: '0.7rem' }} />
                                  {stats.updated > 0 && (
                                    <Chip size="small" label={`Updated: ${stats.updated}`} color="primary" sx={{ height: 18, fontSize: '0.7rem' }} />
                                  )}
                                  {stats.errors > 0 && (
                                    <Chip size="small" label={`Errors: ${stats.errors}`} color="error" sx={{ height: 18, fontSize: '0.7rem' }} />
                                  )}
                                </Stack>
                              </Box>
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    )}
                  </Collapse>
                </Box>
              ))}
            </Stack>
          </Box>
        </Collapse>
      </Box>
    </Paper>
  );
}