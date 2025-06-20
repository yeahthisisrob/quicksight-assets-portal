// Configuration from runtime config or environment variables
declare global {
  interface Window {
    APP_CONFIG?: {
      API_URL: string;
      AWS_REGION: string;
      ENVIRONMENT: string;
    };
  }
}

export const config = {
  API_URL: window.APP_CONFIG?.API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  AWS_REGION: window.APP_CONFIG?.AWS_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1',
  AWS_ACCOUNT_ID: import.meta.env.VITE_AWS_ACCOUNT_ID || '',
  ENVIRONMENT: window.APP_CONFIG?.ENVIRONMENT || import.meta.env.VITE_ENVIRONMENT || 'development',
};