import {
  QuickSightClient,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
  Tag as QuickSightTag,
} from '@aws-sdk/client-quicksight';
import { logger } from '../utils/logger';
import { getAwsConfig } from '../utils/awsConfig';

export class TagService {
  private client: QuickSightClient;
  private awsAccountId: string;
  private awsRegion: string;

  constructor() {
    this.client = new QuickSightClient(getAwsConfig());
    this.awsAccountId = process.env.AWS_ACCOUNT_ID!;
    this.awsRegion = process.env.AWS_REGION || 'us-east-1';
    
    if (!this.awsAccountId) {
      logger.error('AWS_ACCOUNT_ID environment variable is not set!');
    }
    logger.info(`TagService initialized with account: ${this.awsAccountId}, region: ${this.awsRegion}`);
  }

  // Generic tag operations for any QuickSight resource
  async tagResource(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder', 
    resourceId: string, 
    tags: Array<{ key: string; value: string }>,
  ): Promise<void> {
    const resourceArn = this.buildResourceArn(resourceType, resourceId);
    logger.info(`Attempting to tag resource: ${resourceArn}`);
    
    try {
      const quickSightTags: QuickSightTag[] = tags.map(tag => ({
        Key: tag.key,
        Value: tag.value,
      }));
      
      logger.debug('Tags to apply:', quickSightTags);

      const command = new TagResourceCommand({
        ResourceArn: resourceArn,
        Tags: quickSightTags,
      });

      await this.client.send(command);
      logger.info(`Successfully tagged ${resourceType} ${resourceId} with ${tags.length} tags`);
    } catch (error: any) {
      logger.error(`Error tagging ${resourceType} ${resourceId}:`, error);
      if (error.name === 'AccessDeniedException') {
        throw new Error(`No permission to tag ${resourceType}. Please ensure your IAM role has quicksight:TagResource permission.`);
      }
      if (error.name === 'InvalidParameterValueException') {
        throw new Error('Invalid tag format. Keys and values must follow AWS tagging rules.');
      }
      throw error;
    }
  }

  async getResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string,
  ): Promise<Array<{ key: string; value: string }>> {
    const resourceArn = this.buildResourceArn(resourceType, resourceId);
    
    try {
      const command = new ListTagsForResourceCommand({
        ResourceArn: resourceArn,
      });

      const response = await this.client.send(command);
      
      if (!response.Tags) {
        return [];
      }

      return response.Tags.map(tag => ({
        key: tag.Key!,
        value: tag.Value!,
      }));
    } catch (error: any) {
      logger.error(`Error getting tags for ${resourceType} ${resourceId}:`, error);
      // Return empty array instead of throwing to avoid breaking the UI during exports
      // But log the actual error for debugging
      if (error.name === 'AccessDeniedException') {
        logger.warn(`No permission to read tags for ${resourceType} ${resourceId}`);
      }
      return [];
    }
  }

  async removeResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string,
    tagKeys: string[],
  ): Promise<void> {
    const resourceArn = this.buildResourceArn(resourceType, resourceId);
    
    try {
      const command = new UntagResourceCommand({
        ResourceArn: resourceArn,
        TagKeys: tagKeys,
      });

      await this.client.send(command);
      logger.info(`Successfully removed ${tagKeys.length} tags from ${resourceType} ${resourceId}`);
    } catch (error) {
      logger.error(`Error removing tags from ${resourceType} ${resourceId}:`, error);
      throw error;
    }
  }

  // Helper method to update tags (replace all existing tags)
  async updateResourceTags(
    resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId: string,
    tags: Array<{ key: string; value: string }>,
  ): Promise<void> {
    // Get current tags
    const currentTags = await this.getResourceTags(resourceType, resourceId);
    
    // Find tags to remove (in current but not in new)
    const currentTagKeys = currentTags.map(t => t.key);
    const newTagKeys = tags.map(t => t.key);
    const tagsToRemove = currentTagKeys.filter(key => !newTagKeys.includes(key));
    
    // Remove old tags if any
    if (tagsToRemove.length > 0) {
      await this.removeResourceTags(resourceType, resourceId, tagsToRemove);
    }
    
    // Add/update tags
    if (tags.length > 0) {
      await this.tagResource(resourceType, resourceId, tags);
    }
  }

  // Legacy methods for backward compatibility
  async tagDashboard(dashboardId: string, tags: Array<{ key: string; value: string }>): Promise<void> {
    return this.tagResource('dashboard', dashboardId, tags);
  }

  async getDashboardTags(dashboardId: string): Promise<Array<{ key: string; value: string }>> {
    return this.getResourceTags('dashboard', dashboardId);
  }

  async removeTags(dashboardId: string, tagKeys: string[]): Promise<void> {
    return this.removeResourceTags('dashboard', dashboardId, tagKeys);
  }

  private buildResourceArn(resourceType: 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder', resourceId: string): string {
    // Map to correct AWS resource type names
    const arnResourceType = resourceType === 'datasource' ? 'datasource' : resourceType;
    return `arn:aws:quicksight:${this.awsRegion}:${this.awsAccountId}:${arnResourceType}/${resourceId}`;
  }

  private buildDashboardArn(dashboardId: string): string {
    return this.buildResourceArn('dashboard', dashboardId);
  }
}