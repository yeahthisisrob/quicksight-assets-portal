import AWS from 'aws-sdk';
import { V3CredentialBridge } from './V3CredentialBridge';
import { logger } from '../../../utils/logger';

export interface DataSourceSummary {
  DataSourceId?: string;
  Arn?: string;
  Name?: string;
  Type?: string;
  Status?: string;
  CreatedTime?: Date;
  LastUpdatedTime?: Date;
}

/**
 * AWS SDK v2 Compatibility Layer for ListDataSources
 * 
 * This module exists solely to work around a critical bug in AWS SDK v3 where
 * the ListDataSources API fails with:
 * "TypeError: Unions must have exactly one non-null member. None were found."
 * 
 * The Issue:
 * - QuickSight data sources can have empty or null DataSourceParameters
 * - This is common for S3 data sources and uploaded CSV files
 * - AWS SDK v3 (all versions after 3.30.0) cannot deserialize these responses
 * - The SDK expects union types to have exactly one non-null member, but
 *   DataSourceParameters can be completely empty in valid API responses
 * 
 * Why SDK v2:
 * - AWS SDK v2 handles these empty unions gracefully
 * - As of v2.1050.0+, SDK v2 supports SSO/AWS Identity Center profiles natively
 * - Using v2 just for this one operation is the least intrusive solution
 * 
 * When to Remove:
 * - Monitor https://github.com/aws/aws-sdk-js-v3/issues/3029
 * - Once AWS fixes the union deserialization bug in SDK v3, this entire
 *   module can be deleted and we can use ListDataSourcesCommand from v3
 * 
 * @see https://stackoverflow.com/questions/69993882/getentitlementscommand-fails-with-typeerror-unions-must-have-exactly-one-non-nu
 */
export class V2DataSourceLister {
  private quicksight: AWS.QuickSight;
  private bridge: V3CredentialBridge;
  private credentialsInitialized: Promise<void>;

  constructor(private awsAccountId: string, region: string) {
    // Initialize QuickSight client
    this.quicksight = new AWS.QuickSight({ region });
    
    // Create credential bridge
    this.bridge = new V3CredentialBridge();
    
    // Initialize credentials and store the promise
    this.credentialsInitialized = this.initializeCredentials();
  }
  
  private async initializeCredentials(): Promise<void> {
    try {
      // Use the V3CredentialBridge to update our v2 client
      await this.bridge.updateV2Client(this.quicksight);
      logger.debug('SDK v2: Successfully initialized with v3 credentials via bridge');
    } catch (error) {
      logger.error('SDK v2: Failed to initialize credentials', error);
      throw error;
    }
  }

  async listAllDataSources(): Promise<DataSourceSummary[]> {
    // Ensure credentials are initialized before making API calls
    await this.credentialsInitialized;
    const dataSources: DataSourceSummary[] = [];
    let nextToken: string | undefined;
    let pageCount = 0;

    try {
      do {
        pageCount++;
        logger.debug(`Fetching data sources page ${pageCount} using SDK v2`);

        const params: AWS.QuickSight.ListDataSourcesRequest = {
          AwsAccountId: this.awsAccountId,
          MaxResults: 100,
          ...(nextToken && { NextToken: nextToken })
        };

        const response = await this.quicksight.listDataSources(params).promise();
        
        if (response.DataSources) {
          dataSources.push(...response.DataSources);
          logger.info(`SDK v2: Fetched ${response.DataSources.length} data sources on page ${pageCount}`);
        }

        nextToken = response.NextToken;
      } while (nextToken);

      logger.info(`SDK v2: Successfully listed all ${dataSources.length} data sources`);
      return dataSources;
    } catch (error: any) {
      logger.error('SDK v2: Failed to list data sources:', error);
      throw error;
    }
  }
}