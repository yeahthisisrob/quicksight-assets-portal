import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { config } from '../config';

export function CognitoCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Get the authorization code from URL
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      console.error('Cognito error:', error);
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (!code) {
      console.error('No authorization code received');
      navigate('/login?error=no_code', { replace: true });
      return;
    }

    console.log('Received authorization code, redirecting to backend...');
    // Redirect to backend to handle the code exchange
    const apiUrl = config.API_URL.replace('/api', '');
    const backendUrl = `${apiUrl}/auth/cognito/callback?code=${code}`;
    console.log('Redirecting to:', backendUrl);
    window.location.href = backendUrl;
  }, [navigate, location]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography variant="h6">Completing sign-in...</Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we set up your session.
      </Typography>
    </Box>
  );
}