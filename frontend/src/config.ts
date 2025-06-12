// Configuration from environment variables or defaults
export const config = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  AWS_REGION: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  AWS_ACCOUNT_ID: import.meta.env.VITE_AWS_ACCOUNT_ID || '',
  ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT || 'development',
};