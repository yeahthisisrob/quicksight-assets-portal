import { MetadataService } from './metadata.service';
import { AWSIdentityService } from './awsIdentity.service';
import { logger } from '../utils/logger';

export class StartupService {
  private metadataService: MetadataService;
  private awsIdentityService: AWSIdentityService;

  constructor() {
    this.metadataService = new MetadataService();
    this.awsIdentityService = new AWSIdentityService();
  }

  async validateAndInitialize(): Promise<void> {
    logger.info('Starting application initialization...');

    try {
      // Validate AWS credentials and get identity
      logger.info('Validating AWS credentials...');
      const identity = await this.awsIdentityService.getIdentity();
      
      logger.info(`AWS Account ID: ${identity.accountId}`);
      logger.info(`AWS Region: ${identity.region}`);
      logger.info(`Authentication method: ${identity.authMethod}`);
      logger.info(`Identity ARN: ${identity.arn}`);

      // Initialize S3 bucket
      logger.info('Initializing S3 bucket...');
      await this.metadataService.initializeBucket();
      logger.info('S3 bucket initialization complete');

      logger.info('Application initialization complete');
    } catch (error) {
      logger.error('Application initialization failed:', error);
      throw error;
    }
  }
}