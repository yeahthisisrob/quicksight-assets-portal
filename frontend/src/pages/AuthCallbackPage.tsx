import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { config } from '../config';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the token from URL parameters
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const redirect = params.get('redirect') || '/';

        if (!token) {
          console.error('No token received in callback');
          navigate('/login?error=no_token', { replace: true });
          return;
        }

        // Store the token in localStorage for subsequent API calls
        localStorage.setItem('authToken', token);

        // Verify the session is valid
        const apiUrl = config.API_URL.replace('/api', '');
        const response = await fetch(`${apiUrl}/auth/session`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) {
            // Authentication successful, redirect to the intended page
            navigate(redirect, { replace: true });
          } else {
            console.error('Session not authenticated:', data);
            navigate('/login?error=invalid_session', { replace: true });
          }
        } else {
          console.error('Failed to verify session');
          navigate('/login?error=session_check_failed', { replace: true });
        }
      } catch (error) {
        console.error('Error handling auth callback:', error);
        navigate('/login?error=callback_error', { replace: true });
      }
    };

    handleCallback();
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
      <Typography variant="h6">Completing authentication...</Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we set up your session.
      </Typography>
    </Box>
  );
}