import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromNodeProviderChain, fromEnv } from '@aws-sdk/credential-providers';
import { logger } from '../utils/logger';

export interface AWSIdentityInfo {
  accountId: string;
  userId: string;
  arn: string;
  authMethod: 'credentials' | 'profile' | 'role' | 'unknown';
  profileName?: string;
  region: string;
}

export class AWSIdentityService {
  private stsClient: STSClient;
  private identityInfo: AWSIdentityInfo | null = null;

  constructor() {
    // Configure AWS SDK with explicit credentials if provided
    const credentials = this.getCredentialsConfig();
    this.stsClient = new STSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...credentials,
    });
  }

  private getCredentialsConfig(): any {
    // Check if explicit credentials are provided
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      logger.info('Using explicit AWS credentials from environment variables');
      // Use fromEnv to ensure we only use environment variables, not profile
      return {
        credentials: fromEnv(),
      };
    }

    // Otherwise use default credential chain
    logger.info('Using AWS SDK default credential chain');
    return {
      credentials: fromNodeProviderChain(),
    };
  }

  private determineAuthMethod(): 'credentials' | 'profile' | 'role' | 'unknown' {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return 'credentials';
    }
    
    if (process.env.AWS_PROFILE) {
      return 'profile';
    }
    
    // Check if running on EC2/ECS/Lambda (has role)
    if (process.env.AWS_EXECUTION_ENV || process.env.ECS_CONTAINER_METADATA_URI) {
      return 'role';
    }
    
    return 'unknown';
  }

  async getIdentity(): Promise<AWSIdentityInfo> {
    if (this.identityInfo) {
      return this.identityInfo;
    }

    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.stsClient.send(command);

      this.identityInfo = {
        accountId: response.Account!,
        userId: response.UserId!,
        arn: response.Arn!,
        authMethod: this.determineAuthMethod(),
        profileName: process.env.AWS_PROFILE,
        region: process.env.AWS_REGION || 'us-east-1',
      };

      // Set AWS_ACCOUNT_ID if not already set
      if (!process.env.AWS_ACCOUNT_ID) {
        process.env.AWS_ACCOUNT_ID = response.Account!;
        logger.info(`Set AWS_ACCOUNT_ID from STS: ${response.Account}`);
      }

      logger.info('AWS Identity retrieved:', {
        accountId: this.identityInfo.accountId,
        arn: this.identityInfo.arn,
        authMethod: this.identityInfo.authMethod,
        profileName: this.identityInfo.profileName,
      });

      return this.identityInfo;
    } catch (error) {
      logger.error('Failed to get AWS identity:', error);
      throw new Error('Failed to authenticate with AWS. Please check your credentials.');
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.getIdentity();
      return true;
    } catch {
      return false;
    }
  }
}