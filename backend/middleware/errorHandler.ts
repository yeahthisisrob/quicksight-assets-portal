import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', err);

  // AWS SDK errors
  if (err.name === 'AccessDeniedException') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'You do not have permission to perform this action',
    });
  }

  if (err.name === 'ResourceNotFoundException') {
    return res.status(404).json({
      success: false,
      error: 'Resource not found',
      message: err.message,
    });
  }

  // Default error
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};