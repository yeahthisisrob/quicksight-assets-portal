/**
 * Structured logger for CloudWatch
 * Uses console methods which are automatically captured by CloudWatch Logs
 */
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(JSON.stringify({
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    }));
  },

  warn: (message: string, meta?: any) => {
    console.warn(JSON.stringify({
      level: 'WARN',
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    }));
  },

  error: (message: string, error?: any, meta?: any) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      message,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      ...meta,
    }));
  },

  debug: (message: string, meta?: any) => {
    if (process.env.LOG_LEVEL === 'DEBUG') {
      console.debug(JSON.stringify({
        level: 'DEBUG',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      }));
    }
  },
};