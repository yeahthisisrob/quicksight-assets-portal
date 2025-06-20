import { Request, Response } from 'express';

/**
 * Sets CORS headers on a response
 */
export function setCorsHeaders(req: Request, res: Response): void {
  const origin = req.headers.origin;
  const frontendUrl = process.env.FRONTEND_URL;
  
  // In production, allow the configured frontend URL and common CloudFront patterns
  if (process.env.NODE_ENV === 'production' && frontendUrl) {
    // Allow exact match or CloudFront domains
    if (origin === frontendUrl || 
        (origin && origin.includes('.cloudfront.net')) ||
        (origin && origin.includes('.amplifyapp.com'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // Log unmatched origins for debugging
      console.log(`CORS: Origin ${origin} not allowed. Expected: ${frontendUrl}`);
    }
  } else {
    // In development, allow common origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:4000',
    ];
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // Allow requests with no origin (like curl)
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Requested-With');
}