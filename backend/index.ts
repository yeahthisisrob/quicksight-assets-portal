import serverlessExpress from '@vendia/serverless-express';
// import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { router } from './routes';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { requestContext } from './middleware/requestContext';

const app = express();

// CORS configuration
const getCorsOrigin = () => {
  // In production (Lambda), allow CloudFront and configured frontend URL
  if (process.env.NODE_ENV === 'production') {
    return (origin: string | undefined, callback: Function) => {
      // Allow requests with no origin
      if (!origin) return callback(null, true);
      
      // Allow exact match, CloudFront domains, and Amplify domains
      const frontendUrl = process.env.FRONTEND_URL;
      if (origin === frontendUrl || 
          origin.includes('.cloudfront.net') ||
          origin.includes('.amplifyapp.com')) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked origin', { origin, expected: frontendUrl });
        callback(new Error('Not allowed by CORS'));
      }
    };
  }
  
  // In development, allow multiple origins
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
};

// Middleware
app.use(cors({
  origin: getCorsOrigin(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Requested-With', 'X-Request-Id'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestContext);

// Routes - handle both direct and proxy paths
app.use('/auth', authRoutes);
app.use('/', authRoutes); // Also mount auth routes at root for API Gateway proxy
app.use('/api', router);
app.use('/', router); // Also mount API routes at root for API Gateway proxy

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Create serverless handler with response streaming disabled to ensure CORS headers
export const handler = serverlessExpress({ 
  app,
  resolutionMode: 'PROMISE',
});