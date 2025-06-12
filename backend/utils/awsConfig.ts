import { fromEnv } from '@aws-sdk/credential-providers';

/**
 * Shared AWS configuration utility for all AWS SDK clients
 */
export function getAwsConfig(): any {
  const config: any = {
    region: process.env.AWS_REGION || 'us-east-1',
  };

  // Use explicit credentials if provided - these take priority over profile
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    // Use fromEnv to ensure we only use environment variables, not profile
    config.credentials = fromEnv();
    
    // Log that we're using explicit credentials
    console.log('Using explicit AWS credentials from environment variables (access key/secret key)');
  }
  // If no explicit credentials, the SDK will use the default credential chain
  // which includes profile, IAM roles, etc.

  return config;
}