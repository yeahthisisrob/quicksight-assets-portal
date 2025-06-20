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
    logger.info('Starting application initialization');

    try {
      // Validate AWS credentials and get identity
      logger.debug('Validating AWS credentials');
      const identity = await this.awsIdentityService.getIdentity();
      
      logger.info('AWS identity validated', {
        accountId: identity.accountId,
        region: identity.region,
        authMethod: identity.authMethod,
        identityArn: identity.arn,
      });

      // Initialize S3 bucket
      logger.debug('Initializing S3 bucket');
      await this.metadataService.initializeBucket();
      logger.debug('S3 bucket initialization complete');

      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Application initialization failed:', error);
      throw error;
    }
  }
}