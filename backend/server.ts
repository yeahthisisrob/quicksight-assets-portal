import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { StartupService } from './services/startup.service';
import { requestContext } from './middleware/requestContext';

// Load environment variables
import path from 'path';
// When running with ts-node (dev), __dirname is backend/
// When running compiled JS (prod), __dirname is backend/dist/
const envPath = __dirname.includes('dist') 
  ? path.resolve(__dirname, '../../.env')
  : path.resolve(__dirname, '../.env');
// Use logger instead of console.log
const result = dotenv.config({ path: envPath });
if (result.error) {
  logger.error('Error loading .env file', { error: result.error });
} else {
  logger.debug('Environment variables loaded', {
    bucketName: process.env.BUCKET_NAME,
    accountId: process.env.AWS_ACCOUNT_ID,
  });
}

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration - same as index.ts
const getCorsOrigin = () => {
  // In production, use the specific frontend URL
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  
  // In development, allow multiple origins
  if (process.env.NODE_ENV === 'development') {
    return (origin: string | undefined, callback: Function) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:4000',
      ];
      
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    };
  }
  
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

// Middleware
app.use(cors({
  origin: getCorsOrigin(),
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Requested-With', 'X-Request-Id'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestContext);

// Routes
app.use('/auth', authRoutes);
app.use('/api', router);

// Health check
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Initialize and start server
const startServer = async () => {
  try {
    // Run startup checks
    const startupService = new StartupService();
    await startupService.validateAndInitialize();

    // Start server
    app.listen(PORT, () => {
      logger.info('Backend server started', {
        port: PORT,
        environment: process.env.NODE_ENV,
        awsProfile: process.env.AWS_PROFILE || 'default',
        awsAccount: process.env.AWS_ACCOUNT_ID,
        awsRegion: process.env.AWS_REGION,
        s3Bucket: process.env.BUCKET_NAME || 'quicksight-metadata-bucket',
        frontendUrl: process.env.FRONTEND_URL,
      });
      
      // Log available auth methods
      const hasOktaSaml = !!(process.env.OKTA_SAML_APP_URL && process.env.OKTA_SAML_ROLE_ARN);
      const hasCognito = !!(process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID);
      const isDevMode = process.env.NODE_ENV === 'development';
      
      const authMethods = [];
      if (hasOktaSaml) authMethods.push('okta-saml');
      if (hasCognito) authMethods.push('cognito');
      if (isDevMode) authMethods.push('local-aws-dev');
      
      if (authMethods.length > 0) {
        logger.info('Auth methods configured', { methods: authMethods });
      } else {
        logger.warn('No auth methods configured');
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();