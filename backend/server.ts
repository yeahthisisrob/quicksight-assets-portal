import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { StartupService } from './services/startup.service';

// Load environment variables
import path from 'path';
// When running with ts-node (dev), __dirname is backend/
// When running compiled JS (prod), __dirname is backend/dist/
const envPath = __dirname.includes('dist') 
  ? path.resolve(__dirname, '../../.env')
  : path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('Environment variables loaded successfully');
  console.log('BUCKET_NAME:', process.env.BUCKET_NAME);
  console.log('AWS_ACCOUNT_ID:', process.env.AWS_ACCOUNT_ID);
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.body,
  });
  next();
});

// Routes
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
      logger.info(`🚀 Backend server running at http://localhost:${PORT}`);
      logger.info(`📍 API endpoints at http://localhost:${PORT}/api`);
      logger.info(`🔑 Using AWS profile: ${process.env.AWS_PROFILE || 'default'}`);
      logger.info(`📍 AWS Account: ${process.env.AWS_ACCOUNT_ID || 'Not set'}`);
      logger.info(`📍 AWS Region: ${process.env.AWS_REGION || 'Not set'}`);
      logger.info(`🪣 S3 Bucket: ${process.env.BUCKET_NAME || 'quicksight-metadata-bucket (default)'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();