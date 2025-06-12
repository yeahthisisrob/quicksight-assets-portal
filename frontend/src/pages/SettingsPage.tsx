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
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { config } from '@/config';
import axios from 'axios';

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
      const response = await axios.get(`${config.API_URL}/settings/aws-identity`);
      if (response.data.success) {
        setAwsIdentity(response.data.data);
      }
    } catch (error: any) {
      setIdentityError(error.response?.data?.error || 'Failed to fetch AWS identity');
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
              <Alert severity="error">{identityError}</Alert>
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
              API Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <strong>API URL:</strong> {config.API_URL}
              </Typography>
              <Typography variant="body2">
                <strong>Environment:</strong> {config.ENVIRONMENT}
              </Typography>
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