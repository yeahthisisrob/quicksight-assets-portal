import {
  QuickSightClient,
  ListFoldersCommand,
  DescribeFolderCommand,
  DescribeFolderPermissionsCommand,
  Folder,
  FolderSummary,
} from '@aws-sdk/client-quicksight';
import { MetadataService } from './metadata.service';
import { TagService } from './tag.service';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';

export interface FolderMetadata {
  description?: string;
  owner?: string;
  category?: string;
  notes?: string;
  lastReviewed?: string;
  reviewedBy?: string;
  businessUnit?: string;
  dataClassification?: string;
  [key: string]: any;
}

export interface FolderInfo extends FolderSummary {
  metadata: FolderMetadata;
  permissions?: any[];
  tags?: Array<{ key: string; value: string }>;
  displayPath?: string[];
}

export class FoldersService {
  private client: QuickSightClient;
  private metadataService: MetadataService;
  private tagService: TagService;
  private awsAccountId: string;

  constructor() {
    this.client = new QuickSightClient(getAwsConfig());
    this.metadataService = new MetadataService();
    this.tagService = new TagService();
    this.awsAccountId = process.env.AWS_ACCOUNT_ID || '';
  }

  async listFolders(): Promise<FolderInfo[]> {
    try {
      logger.info('Fetching QuickSight folders');
      
      // List all folders
      const folders: FolderSummary[] = [];
      let nextToken: string | undefined;

      do {
        const command = new ListFoldersCommand({
          AwsAccountId: this.awsAccountId,
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.client.send(command);
        
        if (response.FolderSummaryList) {
          folders.push(...response.FolderSummaryList);
        }

        nextToken = response.NextToken;
      } while (nextToken);
      
      // Build a map for folder ARN to Name mapping
      const folderArnToName = new Map<string, string>();
      folders.forEach(folder => {
        if (folder.Arn && folder.Name) {
          folderArnToName.set(folder.Arn, folder.Name);
        }
      });

      // Enhance with metadata and permissions
      const folderInfoPromises = folders.map(async (folder) => {
        if (!folder.FolderId) {
          return null;
        }

        try {
          // Get folder details to get the FolderPath
          let folderPath: string[] = [];
          try {
            const describeCommand = new DescribeFolderCommand({
              AwsAccountId: this.awsAccountId,
              FolderId: folder.FolderId,
            });
            const describeResponse = await this.client.send(describeCommand);
            
            if (describeResponse.Folder?.FolderPath) {
              // FolderPath is an array of parent folder ARNs
              folderPath = describeResponse.Folder.FolderPath;
            }
          } catch (error) {
            logger.debug(`Could not describe folder ${folder.FolderId}:`, error);
          }
          
          // Get custom metadata
          const metadata = await this.getMetadata(folder.FolderId);
          
          // Get permissions
          let permissions: any[] = [];
          try {
            const permCommand = new DescribeFolderPermissionsCommand({
              AwsAccountId: this.awsAccountId,
              FolderId: folder.FolderId,
            });
            const permResponse = await this.client.send(permCommand);
            permissions = permResponse.Permissions || [];
          } catch (error) {
            logger.debug(`Could not fetch permissions for folder ${folder.FolderId}:`, error);
          }

          // Get tags - will be fetched live from frontend
          const tags: Array<{ key: string; value: string }> = [];

          // Build display path from folder hierarchy
          let displayPath: string[] = [];
          
          // Convert ARNs in FolderPath to names
          for (const parentArn of folderPath) {
            const parentName = folderArnToName.get(parentArn);
            if (parentName) {
              displayPath.push(parentName);
            }
          }
          
          // Add the current folder name to the path
          if (folder.Name) {
            displayPath.push(folder.Name);
          }
          
          logger.debug(`Folder ${folder.FolderId} path: ${displayPath.join('/')}`);
          
          return {
            ...folder,
            metadata,
            permissions,
            tags,
            displayPath, // This is now the full hierarchy
          } as FolderInfo & { displayPath: string[] };
        } catch (error) {
          logger.error(`Error processing folder ${folder.FolderId}:`, error);
          return {
            ...folder,
            metadata: {},
            permissions: [],
            tags: [],
            displayPath: folder.Name ? [folder.Name] : [],
          } as FolderInfo;
        }
      });

      const folderInfos = await Promise.all(folderInfoPromises);
      
      // Filter out any null results
      const validFolders = folderInfos.filter((f): f is FolderInfo => f !== null);
      
      logger.info(`Successfully fetched ${validFolders.length} folders`);
      return validFolders;
    } catch (error) {
      logger.error('Error listing folders:', error);
      throw error;
    }
  }

  async getFolder(folderId: string): Promise<FolderInfo | null> {
    try {
      // Get folder details
      const command = new DescribeFolderCommand({
        AwsAccountId: this.awsAccountId,
        FolderId: folderId,
      });

      const response = await this.client.send(command);
      
      if (!response.Folder) {
        return null;
      }

      // Get custom metadata
      const metadata = await this.getMetadata(folderId);
      
      // Get permissions
      let permissions: any[] = [];
      try {
        const permCommand = new DescribeFolderPermissionsCommand({
          AwsAccountId: this.awsAccountId,
          FolderId: folderId,
        });
        const permResponse = await this.client.send(permCommand);
        permissions = permResponse.Permissions || [];
      } catch (error) {
        logger.debug(`Could not fetch permissions for folder ${folderId}:`, error);
      }

      // Get tags
      const tags = await this.tagService.getResourceTags('folder', folderId);

      return {
        FolderId: response.Folder.FolderId,
        Arn: response.Folder.Arn,
        Name: response.Folder.Name,
        FolderType: response.Folder.FolderType,
        FolderPath: response.Folder.FolderPath,
        CreatedTime: response.Folder.CreatedTime,
        LastUpdatedTime: response.Folder.LastUpdatedTime,
        metadata,
        permissions,
        tags,
      } as FolderInfo;
    } catch (error) {
      logger.error(`Error getting folder ${folderId}:`, error);
      throw error;
    }
  }

  async getMetadata(folderId: string): Promise<FolderMetadata> {
    try {
      const data = await this.metadataService.getMetadata(`folders/${folderId}.json`);
      return data || {};
    } catch (error) {
      // If metadata doesn't exist, return empty object
      return {};
    }
  }

  async updateMetadata(folderId: string, metadata: FolderMetadata): Promise<FolderMetadata> {
    try {
      await this.metadataService.saveMetadata(`folders/${folderId}.json`, metadata);
      logger.info(`Updated metadata for folder ${folderId}`);
      return metadata;
    } catch (error) {
      logger.error(`Error updating metadata for folder ${folderId}:`, error);
      throw error;
    }
  }
}