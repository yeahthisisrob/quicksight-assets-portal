import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { DashboardMetadata } from '../types';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';

export class MetadataService {
  private s3Client: S3Client;
  private bucketName: string;
  private bucketInitialized: boolean = false;

  constructor() {
    this.s3Client = new S3Client(getAwsConfig());
    this.bucketName = process.env.BUCKET_NAME || 'quicksight-metadata-bucket';
    logger.debug('MetadataService initialized', { bucket: this.bucketName });
  }

  async initializeBucket(): Promise<void> {
    if (this.bucketInitialized) {
      return;
    }

    try {
      // Check if bucket exists
      const headCommand = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.s3Client.send(headCommand);
      logger.debug('S3 bucket exists', { bucket: this.bucketName });
      this.bucketInitialized = true;
      return;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        logger.info('Creating S3 bucket', { bucket: this.bucketName });
        
        try {
          // Create bucket
          const region = process.env.AWS_REGION || 'us-east-1';
          const createBucketConfig: any = {
            Bucket: this.bucketName,
          };
          
          // For regions other than us-east-1, we need to specify the location constraint
          if (region !== 'us-east-1') {
            createBucketConfig.CreateBucketConfiguration = {
              LocationConstraint: region,
            };
          }
          
          const createCommand = new CreateBucketCommand(createBucketConfig);
          await this.s3Client.send(createCommand);
          logger.info('S3 bucket created', { bucket: this.bucketName });

          // Enable versioning
          const versioningCommand = new PutBucketVersioningCommand({
            Bucket: this.bucketName,
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          });
          await this.s3Client.send(versioningCommand);
          logger.debug('Bucket versioning enabled', { bucket: this.bucketName });

          // Set CORS configuration
          const corsCommand = new PutBucketCorsCommand({
            Bucket: this.bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ['*'],
                  AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                  AllowedOrigins: ['http://localhost:3000'],
                  ExposeHeaders: ['ETag'],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          });
          await this.s3Client.send(corsCommand);
          logger.debug('Bucket CORS configured', { bucket: this.bucketName });

          // Set lifecycle policy to delete old versions after 30 days
          const lifecycleCommand = new PutBucketLifecycleConfigurationCommand({
            Bucket: this.bucketName,
            LifecycleConfiguration: {
              Rules: [
                {
                  ID: 'delete-old-versions',
                  Status: 'Enabled',
                  NoncurrentVersionExpiration: {
                    NoncurrentDays: 30,
                  },
                  AbortIncompleteMultipartUpload: {
                    DaysAfterInitiation: 7,
                  },
                },
              ],
            },
          });
          await this.s3Client.send(lifecycleCommand);
          logger.debug('Bucket lifecycle policy set', { bucket: this.bucketName });

          this.bucketInitialized = true;
        } catch (createError: any) {
          logger.error('Failed to create S3 bucket', { bucket: this.bucketName, error: createError.message });
          throw new Error(`Cannot create S3 bucket '${this.bucketName}': ${createError.message}. Please create the bucket manually or ensure you have the necessary permissions.`);
        }
      } else if (error.name === 'AccessDenied' || error.name === 'Forbidden') {
        logger.error('Access denied to S3 bucket', { bucket: this.bucketName });
        throw new Error(`Access denied to S3 bucket '${this.bucketName}'. Please check your AWS credentials and permissions.`);
      } else {
        logger.error('Error checking S3 bucket', { 
          bucket: this.bucketName, 
          errorCode: error.name, 
          httpStatus: error.$metadata?.httpStatusCode,
          error: error.message,
        });
        
        // If it's a 403, it might be due to permissions or the bucket existing in another account
        if (error.$metadata?.httpStatusCode === 403 || error.name === '403') {
          throw new Error(`Access forbidden to S3 bucket '${this.bucketName}'. This could mean:\n` +
            '1. The bucket exists but is owned by another AWS account\n' +
            '2. Your AWS credentials lack s3:HeadBucket permissions\n' +
            '3. The bucket has a bucket policy that denies access\n\n' +
            'Please either:\n' +
            '- Choose a different bucket name in your .env file\n' +
            '- Ensure you have proper S3 permissions\n' +
            `- Create the bucket manually with: aws s3 mb s3://${this.bucketName}`);
        }
        
        throw new Error(`Error checking S3 bucket '${this.bucketName}': ${error.message}`);
      }
    }
  }

  async getMetadata(key: string): Promise<any> {
    await this.initializeBucket();
    // If key already has a path (contains /), use it as-is
    // Otherwise, it's a dashboard ID for backward compatibility
    const fullKey = key.includes('/') ? key : `metadata/${key}.json`;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
      });

      const response = await this.s3Client.send(command);
      const body = await response.Body?.transformToString();
      
      if (!body) {
        return {};
      }
      
      return JSON.parse(body);
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.name === 'AccessDenied') {
        logger.info(`Cannot access metadata for ${fullKey}: ${error.message}`);
        return {};
      }
      
      logger.error(`Error fetching metadata for ${fullKey}:`, error);
      return {};
    }
  }

  async saveMetadata(key: string, metadata: any): Promise<void> {
    await this.initializeBucket();
    // If key already has a path (contains /), use it as-is
    // Otherwise, it's a dashboard ID for backward compatibility
    const fullKey = key.includes('/') ? key : `metadata/${key}.json`;
    
    try {
      // Add lastUpdated timestamp
      const enrichedMetadata: DashboardMetadata = {
        ...metadata,
        lastUpdated: new Date().toISOString(),
      };
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
        Body: JSON.stringify(enrichedMetadata, null, 2),
        ContentType: 'application/json',
      });

      await this.s3Client.send(command);
      logger.info(`Metadata saved for ${fullKey}`);
    } catch (error) {
      logger.error(`Error saving metadata for ${fullKey}:`, error);
      throw error;
    }
  }

  async checkMetadataExists(key: string): Promise<boolean> {
    await this.initializeBucket();
    // If key already has a path (contains /), use it as-is
    // Otherwise, it's a dashboard ID for backward compatibility
    const fullKey = key.includes('/') ? key : `metadata/${key}.json`;
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      
      logger.error(`Error checking metadata existence for ${fullKey}:`, error);
      throw error;
    }
  }

  async getObjectMetadata(key: string): Promise<{ size: number; lastModified: Date } | null> {
    await this.initializeBucket();
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      
      logger.error(`Error getting object metadata for ${key}:`, error);
      throw error;
    }
  }

  async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    await this.initializeBucket();
    const objects: Array<{ key: string; size: number; lastModified: Date }> = [];
    let continuationToken: string | undefined;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const response = await this.s3Client.send(command);
        
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key && obj.Size !== undefined && obj.LastModified) {
              objects.push({
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
              });
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return objects;
    } catch (error) {
      logger.error(`Error listing objects with prefix ${prefix}:`, error);
      return [];
    }
  }

  async deleteMetadata(key: string): Promise<void> {
    await this.initializeBucket();
    // If key already has a path (contains /), use it as-is
    // Otherwise, it's a dashboard ID for backward compatibility
    const fullKey = key.includes('/') ? key : `metadata/${key}.json`;
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
      });

      await this.s3Client.send(command);
      logger.info(`Metadata deleted for ${fullKey}`);
    } catch (error) {
      logger.error(`Error deleting metadata for ${fullKey}:`, error);
      throw error;
    }
  }
}