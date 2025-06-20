import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Login as LoginIcon,
  CloudOutlined,
  VpnKey,
} from '@mui/icons-material';
import { config } from '../config';

interface AuthMethod {
  id: string;
  name: string;
  description: string;
  configured: boolean;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    fetchAuthMethods();
  }, []);

  const fetchAuthMethods = async () => {
    try {
      const apiUrl = config.API_URL.replace('/api', '');
      const response = await fetch(`${apiUrl}/auth/methods`);
      if (response.ok) {
        const data = await response.json();
        setAuthMethods(data.methods);
      } else {
        setError('Failed to load authentication methods');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = (method: string) => {
    const redirectParam = `?redirect=${encodeURIComponent(redirect)}`;
    const apiUrl = config.API_URL.replace('/api', '');
    
    switch (method) {
      case 'cognito':
        window.location.href = `${apiUrl}/auth/cognito${redirectParam}`;
        break;
      case 'okta':
        window.location.href = `${apiUrl}/auth/okta${redirectParam}`;
        break;
      case 'saml':
        window.location.href = `${apiUrl}/auth/saml${redirectParam}`;
        break;
      case 'sso':
        navigate('/login/sso-instructions');
        break;
      case 'local':
        window.location.href = `${apiUrl}/auth/local${redirectParam}`;
        break;
    }
  };

  const getIcon = (methodId: string) => {
    switch (methodId) {
      case 'cognito':
        return <LoginIcon />;
      case 'okta':
        return <VpnKey />;
      case 'sso':
        return <CloudOutlined />;
      case 'local':
        return <LoginIcon />;
      default:
        return <VpnKey />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
      >
        <Card sx={{ width: '100%', maxWidth: 500 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom align="center">
              QuickSight Assets Portal
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
              Sign in to access your QuickSight resources
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Stack spacing={2}>
              {authMethods.map((method) => (
                <Button
                  key={method.id}
                  variant="outlined"
                  size="large"
                  fullWidth
                  startIcon={getIcon(method.id)}
                  onClick={() => handleAuth(method.id)}
                  disabled={!method.configured}
                >
                  <Box sx={{ textAlign: 'left', flex: 1 }}>
                    <Typography variant="subtitle1">{method.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {method.description}
                    </Typography>
                  </Box>
                </Button>
              ))}
            </Stack>

            {authMethods.length === 0 && (
              <Alert severity="warning">
                No authentication methods are configured. Please check your environment configuration.
              </Alert>
            )}

            <Divider sx={{ my: 3 }} />

            <Typography variant="caption" color="text.secondary" align="center" display="block">
              Having trouble signing in? Contact your administrator.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};