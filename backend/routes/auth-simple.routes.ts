import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Simple authentication check for users already authenticated via AWS Console/CLI
 * This endpoint assumes the user has valid AWS credentials in their environment
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    // Check if AWS credentials are available in the environment
    const hasCredentials = !!(
      process.env.AWS_ACCESS_KEY_ID && 
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SESSION_TOKEN
    );

    if (hasCredentials) {
      res.json({
        authenticated: true,
        method: 'environment',
        message: 'Using AWS credentials from environment',
      });
    } else {
      res.json({
        authenticated: false,
        message: 'No AWS credentials found. Please authenticate via Okta or AWS CLI.',
      });
    }
  } catch (error) {
    logger.error('Failed to check authentication', { error });
    res.status(500).json({ error: 'Failed to check authentication' });
  }
});

export default router;