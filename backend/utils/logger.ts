import { Logger } from '@aws-lambda-powertools/logger';
import { createLocalLogger } from './localLogger';

// Export the Logger type for use in other files
export type { Logger } from '@aws-lambda-powertools/logger';

// Check if running locally
const isLocal = process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME;

// Create logger instance with service name from environment or default
const powertoolsLogger = new Logger({
  serviceName: process.env.SERVICE_NAME || 'quicksight-portal',
  logLevel: (process.env.LOG_LEVEL as 'ERROR' | 'WARN' | 'INFO' | 'DEBUG') || 'INFO',
  // Sample rate for debug logs in production (0-1, where 0.1 = 10%)
  sampleRateValue: process.env.LOG_SAMPLE_RATE ? parseFloat(process.env.LOG_SAMPLE_RATE) : 0.1,
});

// Add persistent attributes that will be included in all logs
powertoolsLogger.addPersistentLogAttributes({
  environment: process.env.NODE_ENV || 'development',
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Structured logger using AWS Lambda Powertools
 * In local development, wraps with human-readable formatting
 * In production/Lambda, uses structured JSON logs
 */
export const logger = isLocal ? createLocalLogger(powertoolsLogger) : {
  info: (message: string, meta?: any) => {
    powertoolsLogger.info(message, meta);
  },

  warn: (message: string, meta?: any) => {
    powertoolsLogger.warn(message, meta);
  },

  error: (message: string, error?: any, meta?: any) => {
    if (error instanceof Error) {
      powertoolsLogger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...meta,
      });
    } else {
      powertoolsLogger.error(message, { error, ...meta });
    }
  },

  debug: (message: string, meta?: any) => {
    powertoolsLogger.debug(message, meta);
  },

  // Additional Powertools-specific methods
  addContext: (attributes: Record<string, any>) => {
    powertoolsLogger.appendKeys(attributes);
  },
};