import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware to add request context and correlation IDs
 */
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique request ID
  const requestId = req.headers['x-request-id'] as string || randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-Id', requestId);

  // Add request context to logger for this request
  logger.addContext({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  // Log request completion on response finish
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    
    // Only log non-health check requests
    if (req.path !== '/health') {
      logger.info('Request completed', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('content-length'),
      });
    }
  });

  next();
};