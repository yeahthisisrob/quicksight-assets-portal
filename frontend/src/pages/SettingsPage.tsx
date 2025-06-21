import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Grid,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  AccountCircle as AccountIcon,
  VpnKey as KeyIcon,
  Badge as BadgeIcon,
  Cloud as CloudIcon,
  Computer as ComputerIcon,
  Dns as DnsIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { settingsApi } from '@/services/api';
import { config } from '@/config';

interface AWSIdentity {
  accountId: string;
  userId: string;
  arn: string;
  authMethod: 'credentials' | 'profile' | 'role' | 'unknown';
  profileName?: string;
  region: string;
}

export default function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [awsIdentity, setAwsIdentity] = useState<AWSIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState<string | null>(null);
  
  // Detect environment
  const isLocalEnvironment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isAWSEnvironment = window.location.hostname.includes('cloudfront.net') || window.location.hostname.includes('amazonaws.com');
  const environmentName = isLocalEnvironment ? 'Local Development' : isAWSEnvironment ? 'AWS Production' : 'Custom Environment';
  
  // Get session info from token if available
  const sessionToken = localStorage.getItem('authToken');
  const sessionInfo = sessionToken ? (() => {
    try {
      const decoded = JSON.parse(atob(sessionToken));
      return decoded;
    } catch {
      return null;
    }
  })() : null;
  
  // AWS Settings
  const [awsProfile, setAwsProfile] = useState(
    localStorage.getItem('aws-profile') || 'default'
  );
  const [awsRegion, setAwsRegion] = useState(
    localStorage.getItem('aws-region') || config.AWS_REGION
  );
  
  
  // Display Settings
  const [autoRefresh, setAutoRefresh] = useState(
    localStorage.getItem('auto-refresh') === 'true'
  );
  const [refreshInterval, setRefreshInterval] = useState(
    parseInt(localStorage.getItem('refresh-interval') || '300')
  );

  // Fetch AWS identity on component mount
  useEffect(() => {
    fetchAWSIdentity();
  }, []);

  const fetchAWSIdentity = async () => {
    try {
      setIdentityLoading(true);
      setIdentityError(null);
      const response = await settingsApi.getAwsIdentity();
      if (response.success) {
        setAwsIdentity(response.data);
      }
    } catch (error: any) {
      setIdentityError(error.response?.status === 401 
        ? 'Authentication required' 
        : error.response?.data?.error || 'Failed to fetch AWS identity');
    } finally {
      setIdentityLoading(false);
    }
  };

  const handleSaveAWSSettings = () => {
    localStorage.setItem('aws-profile', awsProfile);
    localStorage.setItem('aws-region', awsRegion);
    
    // Update environment for API calls
    if (import.meta.env.DEV) {
      window.location.reload(); // Reload to pick up new settings
    }
    
    enqueueSnackbar('AWS settings saved', { variant: 'success' });
  };


  const handleSaveDisplaySettings = () => {
    localStorage.setItem('auto-refresh', autoRefresh.toString());
    localStorage.setItem('refresh-interval', refreshInterval.toString());
    enqueueSnackbar('Display settings saved', { variant: 'success' });
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {/* Environment Status Banner */}
      <Paper 
        sx={{ 
          p: 2, 
          mb: 3, 
          background: isAWSEnvironment 
            ? 'linear-gradient(135deg, #232F3E 0%, #FF9900 100%)' 
            : isLocalEnvironment 
            ? 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)'
            : 'linear-gradient(135deg, #616161 0%, #9e9e9e 100%)',
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isAWSEnvironment ? <CloudIcon sx={{ fontSize: 48 }} /> : <ComputerIcon sx={{ fontSize: 48 }} />}
          <Box flex={1}>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {environmentName}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              {isAWSEnvironment 
                ? `Running on AWS CloudFront • ${window.location.hostname}`
                : isLocalEnvironment 
                ? `Running locally • ${window.location.hostname}:${window.location.port || '80'}`
                : `Running on ${window.location.hostname}`}
            </Typography>
          </Box>
          <Chip 
            icon={<DnsIcon />}
            label={isAWSEnvironment ? 'Production' : isLocalEnvironment ? 'Development' : 'Custom'}
            sx={{ 
              backgroundColor: 'rgba(255,255,255,0.2)', 
              color: 'white',
              fontWeight: 'bold'
            }}
          />
        </Box>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              AWS Configuration
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="AWS Profile"
                value={awsProfile}
                onChange={(e) => setAwsProfile(e.target.value)}
                helperText="The AWS CLI profile to use for authentication"
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>AWS Region</InputLabel>
                <Select
                  value={awsRegion}
                  label="AWS Region"
                  onChange={(e) => setAwsRegion(e.target.value)}
                >
                  <MenuItem value="us-east-1">US East (N. Virginia)</MenuItem>
                  <MenuItem value="us-east-2">US East (Ohio)</MenuItem>
                  <MenuItem value="us-west-1">US West (N. California)</MenuItem>
                  <MenuItem value="us-west-2">US West (Oregon)</MenuItem>
                  <MenuItem value="eu-west-1">EU (Ireland)</MenuItem>
                  <MenuItem value="eu-central-1">EU (Frankfurt)</MenuItem>
                  <MenuItem value="ap-northeast-1">Asia Pacific (Tokyo)</MenuItem>
                  <MenuItem value="ap-southeast-1">Asia Pacific (Singapore)</MenuItem>
                  <MenuItem value="ap-southeast-2">Asia Pacific (Sydney)</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveAWSSettings}
                fullWidth
              >
                Save AWS Settings
              </Button>
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Display Settings
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                }
                label="Auto-refresh dashboards"
              />
              {autoRefresh && (
                <FormControl fullWidth>
                  <InputLabel>Refresh Interval</InputLabel>
                  <Select
                    value={refreshInterval}
                    label="Refresh Interval"
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  >
                    <MenuItem value={60}>1 minute</MenuItem>
                    <MenuItem value={300}>5 minutes</MenuItem>
                    <MenuItem value={600}>10 minutes</MenuItem>
                    <MenuItem value={1800}>30 minutes</MenuItem>
                    <MenuItem value={3600}>1 hour</MenuItem>
                  </Select>
                </FormControl>
              )}
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveDisplaySettings}
                fullWidth
              >
                Save Display Settings
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              AWS Identity
            </Typography>
            {identityLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress />
              </Box>
            ) : identityError ? (
              <Box>
                {isAWSEnvironment && sessionInfo ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Running with Cognito authentication. Using temporary AWS credentials from your session.
                    </Alert>
                    
                    {sessionInfo.user && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountIcon color="action" />
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            Cognito User
                          </Typography>
                          <Typography variant="body1">
                            {sessionInfo.user.email}
                          </Typography>
                          {sessionInfo.user.name && (
                            <Typography variant="caption" color="text.secondary">
                              {sessionInfo.user.name}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )}
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <KeyIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Authentication Method
                        </Typography>
                        <Chip 
                          label={sessionInfo.authMethod === 'cognito' ? 'AWS Cognito' : sessionInfo.authMethod}
                          size="small"
                          color="success"
                        />
                      </Box>
                    </Box>
                    
                    {sessionInfo.credentials && (
                      <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <BadgeIcon color="action" />
                          <Box flex={1}>
                            <Typography variant="body2" color="text.secondary">
                              IAM Role ARN
                            </Typography>
                            <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                              {/* Role ARN is dynamically determined by CDK deployment */}
                              QuicksightPortalStack-CognitoAuthRole-*
                            </Typography>
                          </Box>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CloudIcon color="action" />
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              Session Expiration
                            </Typography>
                            <Typography variant="body1">
                              {new Date(sessionInfo.expiresAt).toLocaleString()}
                            </Typography>
                          </Box>
                        </Box>
                      </>
                    )}
                  </Box>
                ) : (
                  <Alert severity="error">{identityError}</Alert>
                )}
              </Box>
            ) : awsIdentity ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountIcon color="action" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Account ID
                    </Typography>
                    <Typography variant="body1" fontFamily="monospace">
                      {awsIdentity.accountId}
                    </Typography>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BadgeIcon color="action" />
                  <Box flex={1}>
                    <Typography variant="body2" color="text.secondary">
                      Identity ARN
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                      {awsIdentity.arn}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KeyIcon color="action" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Authentication Method
                    </Typography>
                    <Chip 
                      label={
                        awsIdentity.authMethod === 'credentials' ? 'Access Key/Secret Key' :
                        awsIdentity.authMethod === 'profile' ? 'AWS Profile' :
                        awsIdentity.authMethod === 'role' ? 'IAM Role' :
                        awsIdentity.authMethod
                      }
                      size="small"
                      color={awsIdentity.authMethod === 'role' ? 'success' : 
                             awsIdentity.authMethod === 'profile' ? 'primary' : 
                             awsIdentity.authMethod === 'credentials' ? 'warning' : 'default'}
                    />
                    {awsIdentity.profileName && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        Profile: {awsIdentity.profileName}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudIcon color="action" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Region
                    </Typography>
                    <Typography variant="body1">
                      {awsIdentity.region}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ) : null}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Environment Details
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Frontend URL
                </Typography>
                <Typography variant="body1" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                  {window.location.origin}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" color="text.secondary">
                  API Endpoint
                </Typography>
                <Typography variant="body1" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                  {config.API_URL}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Configuration
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip 
                    size="small" 
                    label={`Environment: ${config.ENVIRONMENT}`}
                    color={config.ENVIRONMENT === 'production' ? 'success' : 'primary'}
                  />
                  <Chip 
                    size="small" 
                    label={`Region: ${config.AWS_REGION}`}
                  />
                  {isAWSEnvironment && (
                    <Chip 
                      size="small" 
                      label="CDK Deployed"
                      color="secondary"
                    />
                  )}
                  {isLocalEnvironment && (
                    <Chip 
                      size="small" 
                      label="Local Dev Server"
                      color="info"
                    />
                  )}
                </Box>
              </Box>
              
              {isAWSEnvironment && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  This instance is deployed on AWS using CDK. Authentication is handled by AWS Cognito.
                </Alert>
              )}
              
              {isLocalEnvironment && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Running in local development mode. Some features may behave differently than in production.
                </Alert>
              )}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              fullWidth
            >
              Reload Application
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}