import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { setCorsHeaders } from '../utils/cors';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      awsCredentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken: string;
        expiration: Date;
      };
      authMethod?: string;
    }
  }
}

/**
 * Authentication middleware that validates session tokens
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      // Set CORS headers before sending 401 response
      setCorsHeaders(req, res);
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      // Decode session data
      const sessionData = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Check if session is expired
      if (new Date(sessionData.expiresAt) < new Date()) {
        // Set CORS headers before sending 401 response
        setCorsHeaders(req, res);
        res.status(401).json({ error: 'Session expired' });
        return;
      }

      // Attach credentials and auth method to request
      req.awsCredentials = sessionData.credentials;
      req.authMethod = sessionData.authMethod;

      // Update AWS SDK config with temporary credentials
      // WARNING: This approach has a race condition in concurrent environments
      // TODO: Refactor services to accept credentials per-request instead of using global env vars
      process.env.AWS_ACCESS_KEY_ID = sessionData.credentials.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = sessionData.credentials.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = sessionData.credentials.sessionToken;

      next();
    } catch (_e) {
      logger.error('Invalid session token', { error: _e });
      
      // Set CORS headers before sending 401 response
      setCorsHeaders(req, res);
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
  } catch (error) {
    logger.error('Authentication error', { error });
    
    // Set CORS headers before sending 401 response
    setCorsHeaders(req, res);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional authentication middleware - allows unauthenticated requests
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      try {
        const sessionData = JSON.parse(Buffer.from(token, 'base64').toString());
        
        if (new Date(sessionData.expiresAt) >= new Date()) {
          req.awsCredentials = sessionData.credentials;
          req.authMethod = sessionData.authMethod;
          process.env.AWS_ACCESS_KEY_ID = sessionData.credentials.accessKeyId;
          process.env.AWS_SECRET_ACCESS_KEY = sessionData.credentials.secretAccessKey;
          process.env.AWS_SESSION_TOKEN = sessionData.credentials.sessionToken;
        }
      } catch {
        // Invalid token, continue without auth
      }
    }

    next();
  } catch (error) {
    // Log error but continue - this is optional auth
    logger.warn('Optional authentication failed', { error });
    next();
  }
};