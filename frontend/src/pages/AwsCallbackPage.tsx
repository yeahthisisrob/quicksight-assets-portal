import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { authService } from '../services/auth.service';

export function AwsCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAwsCallback = async () => {
      try {
        // Parse query parameters
        const params = new URLSearchParams(location.search);
        const auth = params.get('auth');
        const source = params.get('source');

        console.log('AWS callback received:', { auth, source });

        // At this point, the user has authenticated with AWS
        // They should have AWS session cookies
        // We need to establish a session in our app

        // For now, we'll need the user to use the AWS CLI to get credentials
        // and exchange them with our app
        
        // Check if we're authenticated
        await authService.checkAuth();
        
        // Redirect to the main app
        navigate('/dashboards', { replace: true });
      } catch (error) {
        console.error('Error handling AWS callback:', error);
        navigate('/login?error=aws_callback_failed', { replace: true });
      }
    };

    handleAwsCallback();
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
      <Typography variant="h6">Completing AWS authentication...</Typography>
      <Typography variant="body2" color="text.secondary">
        You've been authenticated with AWS. Setting up your session...
      </Typography>
    </Box>
  );
}