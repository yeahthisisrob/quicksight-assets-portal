import { Router, Request, Response } from 'express';
import { SamlAuthService, SamlConfig } from '../services/samlAuth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();

// Helper to check which auth methods are configured
const getAvailableAuthMethods = () => {
  const methods = [];
  
  // Log environment for debugging
  logger.info('Checking auth methods configuration', {
    hasCognitoUserPoolId: !!process.env.COGNITO_USER_POOL_ID,
    hasCognitoClientId: !!process.env.COGNITO_CLIENT_ID,
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID?.substring(0, 10) + '...',
    cognitoClientId: process.env.COGNITO_CLIENT_ID?.substring(0, 10) + '...',
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Check Cognito
  if (process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID) {
    methods.push({
      id: 'cognito',
      name: 'Email & Password',
      description: 'Sign in with your email and password',
      configured: true,
    });
  }
  
  // Check AWS SSO (disabled for now)
  // if (process.env.AWS_SSO_START_URL && process.env.AWS_SSO_ROLE_NAME) {
  //   methods.push({
  //     id: 'sso',
  //     name: 'AWS SSO',
  //     description: 'Sign in with AWS IAM Identity Center',
  //     configured: true
  //   });
  // }
  
  // Check Okta SAML
  if (process.env.OKTA_SAML_APP_URL && process.env.OKTA_SAML_ROLE_ARN) {
    methods.push({
      id: 'okta',
      name: 'Okta SAML',
      description: 'Sign in with Okta',
      configured: true,
    });
  }
  
  // Check Generic SAML (disabled for now)
  // if (process.env.SAML_APP_URL && process.env.SAML_ROLE_ARN) {
  //   methods.push({
  //     id: 'saml',
  //     name: 'SAML Provider',
  //     description: 'Sign in with SAML',
  //     configured: true
  //   });
  // }
  
  // Local development with AWS CLI credentials
  if (process.env.NODE_ENV === 'development') {
    methods.push({
      id: 'local',
      name: 'Local AWS Credentials',
      description: 'Use AWS CLI credentials',
      configured: true,
    });
  }
  
  return methods;
};

/**
 * Get available authentication methods
 */
router.get('/methods', asyncHandler(async (req: Request, res: Response) => {
  const methods = getAvailableAuthMethods();
  res.json({ methods });
}));

/**
 * Initiate AWS SSO authentication
 */
router.get('/sso', asyncHandler(async (req: Request, res: Response) => {
  const ssoUrl = process.env.AWS_SSO_START_URL;
  
  if (!ssoUrl) {
    return res.status(500).json({ error: 'AWS SSO not configured' });
  }
  
  // For SSO, we need to direct users to use AWS CLI or SDK
  // since browser-based SSO requires the AWS SSO OAuth flow
  res.json({
    message: 'Please authenticate using AWS CLI: aws sso login',
    ssoUrl,
    instructions: [
      '1. Run: aws sso login --profile your-profile',
      '2. Complete authentication in your browser',
      '3. Return here and use the "Exchange Credentials" option',
    ],
  });
}));

/**
 * Initiate Okta SAML authentication
 */
router.get('/okta', asyncHandler(async (req: Request, res: Response) => {
  const oktaAppUrl = process.env.OKTA_SAML_APP_URL;
  
  if (!oktaAppUrl) {
    return res.status(500).json({ error: 'Okta SAML not configured' });
  }
  
  // For AWS standard SAML flow, pass our app URL as RelayState
  // This tells AWS where to redirect after authentication
  const frontendUrl = process.env.FRONTEND_URL || 'https://di96s87npzok7.cloudfront.net';
  const relayState = frontendUrl;
  
  // Add RelayState to the URL
  const separator = oktaAppUrl.includes('?') ? '&' : '?';
  const redirectUrl = `${oktaAppUrl}${separator}RelayState=${encodeURIComponent(relayState)}`;
  
  logger.info('Redirecting to Okta SAML app with RelayState', { oktaAppUrl, relayState, redirectUrl });
  res.redirect(redirectUrl);
}));

/**
 * Handle callback from AWS after SAML authentication
 */
router.get('/aws-callback', asyncHandler(async (req: Request, res: Response) => {
  try {
    // At this point, the user has authenticated with AWS via Okta
    // They have AWS console session cookies, but we need to get their credentials
    
    // Check if we have AWS session cookies or query params
    const awsSession = req.cookies['aws-userInfo'];
    const account = req.query.account;
    const role = req.query.role_name;
    
    logger.info('AWS callback received', { 
      hasCookies: !!awsSession,
      account,
      role,
      cookies: Object.keys(req.cookies),
      query: req.query, 
    });
    
    // For now, redirect to frontend with a flag indicating AWS auth
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?auth=aws&source=okta`);
  } catch (error) {
    logger.error('Failed to handle AWS callback', { error });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
  }
}));

/**
 * Initiate generic SAML authentication
 */
router.get('/saml', asyncHandler(async (req: Request, res: Response) => {
  const samlAppUrl = process.env.SAML_APP_URL;
  
  if (!samlAppUrl) {
    return res.status(500).json({ error: 'SAML not configured' });
  }
  
  const redirectPath = req.query.redirect as string || '/';
  const relayState = Buffer.from(JSON.stringify({
    redirect: redirectPath,
    authMethod: 'saml',
    timestamp: Date.now(),
  })).toString('base64');
  
  // Add RelayState as query parameter
  const separator = samlAppUrl.includes('?') ? '&' : '?';
  const redirectUrl = `${samlAppUrl}${separator}RelayState=${encodeURIComponent(relayState)}`;
  
  logger.info('Redirecting to SAML app', { samlAppUrl, redirectUrl });
  res.redirect(redirectUrl);
}));

/**
 * SAML callback endpoint - handles callbacks from any SAML provider
 */
router.post('/saml/callback', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { SAMLResponse, RelayState } = req.body;
    
    if (!SAMLResponse) {
      return res.status(400).json({ error: 'Missing SAML response' });
    }

    logger.info('Received SAML callback', { hasRelayState: !!RelayState });

    // Parse RelayState to determine which auth method was used
    let authMethod = 'saml';
    let redirectUrl = '/';
    
    if (RelayState) {
      try {
        const decoded = JSON.parse(Buffer.from(RelayState, 'base64').toString());
        authMethod = decoded.authMethod || 'saml';
        redirectUrl = decoded.redirect || '/';
      } catch (e) {
        logger.warn('Failed to decode RelayState', { error: e });
      }
    }

    // Get the appropriate SAML config based on auth method
    let samlConfig: SamlConfig;
    
    if (authMethod === 'okta') {
      samlConfig = {
        roleArn: process.env.OKTA_SAML_ROLE_ARN || '',
        providerArn: process.env.OKTA_SAML_PROVIDER_ARN || '',
        sessionDuration: parseInt(process.env.SESSION_DURATION || '3600'),
      };
    } else {
      samlConfig = {
        roleArn: process.env.SAML_ROLE_ARN || '',
        providerArn: process.env.SAML_PROVIDER_ARN || '',
        sessionDuration: parseInt(process.env.SESSION_DURATION || '3600'),
      };
    }

    const samlAuthService = new SamlAuthService(samlConfig);

    // Process SAML response and get AWS credentials
    const credentials = await samlAuthService.processSamlResponse({
      SAMLResponse,
      RelayState,
    });

    // Store credentials in session
    const sessionData = {
      credentials,
      authMethod,
      expiresAt: credentials.expiration,
    };

    // In production, use secure httpOnly cookies
    if (process.env.NODE_ENV === 'production') {
      res.cookie('session', Buffer.from(JSON.stringify(sessionData)).toString('base64'), {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 3600000, // 1 hour
      });
    }

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // For local development, pass session in URL
    if (process.env.NODE_ENV !== 'production') {
      const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');
      res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirectUrl)}`);
    } else {
      res.redirect(`${frontendUrl}${redirectUrl}`);
    }
  } catch (error) {
    logger.error('Failed to process SAML callback', { error });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
  }
}));

/**
 * Exchange existing AWS credentials for a session
 */
router.post('/exchange', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { accessKeyId, secretAccessKey, sessionToken, authMethod = 'cli' } = req.body;
    
    if (!accessKeyId || !secretAccessKey || !sessionToken) {
      return res.status(400).json({ error: 'Missing AWS credentials' });
    }

    // Create session data
    const sessionData = {
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiration: new Date(Date.now() + 3600000), // 1 hour from now
      },
      authMethod,
      expiresAt: new Date(Date.now() + 3600000),
    };

    const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // Set cookie in production
    if (process.env.NODE_ENV === 'production') {
      res.cookie('session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 3600000, // 1 hour
      });
    }

    res.json({
      success: true,
      token,
      expiresAt: sessionData.expiresAt,
      authMethod,
    });
  } catch (error) {
    logger.error('Failed to exchange credentials', { error });
    res.status(500).json({ error: 'Failed to exchange credentials' });
  }
}));

/**
 * Get current session info
 */
router.get('/session', asyncHandler(async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ authenticated: false });
    }

    try {
      const sessionData = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Check if session is expired
      if (new Date(sessionData.expiresAt) < new Date()) {
        return res.status(401).json({ authenticated: false, reason: 'Session expired' });
      }

      res.json({
        authenticated: true,
        authMethod: sessionData.authMethod,
        expiresAt: sessionData.expiresAt,
        roleArn: sessionData.authMethod === 'cognito' 
          ? process.env.COGNITO_AUTH_ROLE_ARN 
          : process.env.SAML_ROLE_ARN,
        user: sessionData.user,
      });
    } catch {
      return res.status(401).json({ authenticated: false, reason: 'Invalid session' });
    }
  } catch (error) {
    logger.error('Failed to get session info', { error });
    res.status(500).json({ error: 'Failed to get session info' });
  }
}));

/**
 * Logout endpoint
 */
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  try {
    res.clearCookie('session');
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to logout', { error });
    res.status(500).json({ error: 'Failed to logout' });
  }
}));

/**
 * Cognito sign-in endpoint
 */
router.post('/cognito/signin', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // For Cognito authentication, we'll use the hosted UI
    // This endpoint can be used for custom UI if needed
    const cognitoDomain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const redirectUri = `${process.env.FRONTEND_URL}/auth/cognito/callback`;
    
    // Return the Cognito hosted UI URL
    const authUrl = `https://${cognitoDomain}/login?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    res.json({ authUrl });
  } catch (error) {
    logger.error('Failed to initiate Cognito sign-in', { error });
    res.status(500).json({ error: 'Failed to sign in' });
  }
}));

/**
 * Cognito callback endpoint - handles the authorization code
 */
router.get('/cognito/callback', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    // Exchange authorization code for tokens
    const cognitoDomain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const redirectUri = `${process.env.FRONTEND_URL}/auth/cognito/callback`;
    
    const tokenUrl = `https://${cognitoDomain}/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId || '',
      code: code as string,
      redirect_uri: redirectUri,
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error('Failed to exchange code for tokens', { error });
      return res.status(400).json({ error: 'Failed to authenticate' });
    }
    
    const tokens = await tokenResponse.json() as any;
    
    // Decode the ID token to get user info
    const idToken = tokens.id_token;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    
    // Check if user is in the QuickSightUsers group
    const groups = payload['cognito:groups'] || [];
    if (!groups.includes('QuickSightUsers') && !groups.includes('Admins')) {
      logger.warn('User not in authorized groups', { email: payload.email, groups });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Access denied. Please contact your administrator.')}`);
    }
    
    // Assume the Cognito role to get AWS credentials
    const sts = new (await import('@aws-sdk/client-sts')).STSClient({});
    const assumeRoleCommand = new (await import('@aws-sdk/client-sts')).AssumeRoleCommand({
      RoleArn: process.env.COGNITO_AUTH_ROLE_ARN,
      RoleSessionName: payload.email || 'cognito-user',
      DurationSeconds: 3600,
    });
    
    const stsResponse = await sts.send(assumeRoleCommand);
    
    // Create session data
    const sessionData = {
      credentials: {
        accessKeyId: stsResponse.Credentials!.AccessKeyId!,
        secretAccessKey: stsResponse.Credentials!.SecretAccessKey!,
        sessionToken: stsResponse.Credentials!.SessionToken!,
        expiration: stsResponse.Credentials!.Expiration!,
      },
      authMethod: 'cognito',
      user: {
        email: payload.email,
        name: payload.name,
        sub: payload.sub,
      },
      expiresAt: stsResponse.Credentials!.Expiration!,
    };
    
    const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    
    // Set cookie and redirect
    if (process.env.NODE_ENV === 'production') {
      res.cookie('session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 3600000, // 1 hour
      });
    }
    
    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (error) {
    logger.error('Failed to handle Cognito callback', { error });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
  }
}));

/**
 * Initiate Cognito sign-in flow
 */
router.get('/cognito', asyncHandler(async (req: Request, res: Response) => {
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const redirectUri = `${process.env.FRONTEND_URL}/auth/cognito/callback`;
  
  if (!cognitoDomain || !clientId) {
    return res.status(500).json({ error: 'Cognito not configured' });
  }
  
  // Redirect to Cognito hosted UI
  const authUrl = `https://${cognitoDomain}/login?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  logger.info('Redirecting to Cognito hosted UI', { authUrl });
  res.redirect(authUrl);
}));

/**
 * Local development authentication
 */
router.get('/local', asyncHandler(async (req: Request, res: Response) => {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Local authentication is only available in development mode' });
  }

  const redirect = req.query.redirect as string || '/';

  try {
    // Get credentials from default AWS profile
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    const { getAwsConfig } = await import('../utils/awsConfig');
    const sts = new STSClient(getAwsConfig());
    const command = new GetCallerIdentityCommand({});
    const identity = await sts.send(command);

    // Create session data using local AWS credentials
    const sessionData = {
      credentials: {
        // These are placeholders - the actual credentials come from AWS SDK config
        accessKeyId: 'LOCAL_DEV',
        secretAccessKey: 'LOCAL_DEV',
        sessionToken: 'LOCAL_DEV',
        expiration: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      },
      authMethod: 'local',
      user: {
        email: 'local-dev@example.com',
        name: 'Local Developer',
        accountId: identity.Account,
        userId: identity.UserId,
        arn: identity.Arn,
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    // Create session token
    const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // Set cookie
    res.cookie('session', token, {
      httpOnly: true,
      secure: false, // Always false in local dev
      sameSite: 'lax' as const,
      maxAge: 3600000, // 1 hour
    });

    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}${redirect}`);
  } catch (error) {
    logger.error('Failed to authenticate with local credentials', { error });
    res.redirect(`${process.env.FRONTEND_URL}/login?error=local_auth_failed`);
  }
}));

export default router;