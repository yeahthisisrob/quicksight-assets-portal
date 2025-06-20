import { MetadataService } from './metadata.service';
import { logger } from '../utils/logger';

export interface FieldMetadata {
  fieldId: string; // Composite identifier for the field
  // Source identification - one of these must be provided
  datasetId?: string; // For dataset fields
  analysisId?: string; // For analysis-specific calculated fields
  dashboardId?: string; // For dashboard-specific calculated fields
  sourceType: 'dataset' | 'analysis' | 'dashboard'; // Type of source
  fieldName: string;
  displayName?: string;
  description?: string;
  tags: Array<{ key: string; value: string }>;
  businessGlossary?: string;
  dataType?: string;
  semanticType?: 'DIMENSION' | 'MEASURE' | 'DATE' | 'GEOGRAPHIC' | 'IDENTIFIER' | 'CURRENCY' | 'PERCENTAGE';
  unit?: string;
  format?: string;
  example?: string;
  
  // Data Classification
  dataClassification?: 'Public' | 'Internal' | 'Confidential' | 'Restricted' | 'Highly Restricted';
  isPII?: boolean;
  piiCategory?: 'None' | 'Name' | 'Email' | 'Phone' | 'Address' | 'SSN' | 'Financial' | 'Medical' | 'Other';
  isSensitive?: boolean;
  
  // Data Quality
  dataQuality?: {
    completeness?: number; // Percentage of non-null values
    accuracy?: number; // Percentage of accurate values
    consistency?: number; // Percentage of consistent values
    timeliness?: number; // How current the data is
    uniqueness?: number; // Percentage of unique values
    validity?: number; // Percentage of valid values
    lastAssessed?: string;
    lastProfiled?: Date;
  };
  
  // Lineage
  lineage?: {
    sourceSystem?: string;
    sourceTable?: string;
    sourceField?: string;
    transformationLogic?: string;
    transformations?: string[];
    updateFrequency?: string;
  };
  
  // Usage
  usage?: {
    frequency?: number; // Number of times used in analyses/dashboards
    lastUsed?: Date;
    popularValues?: Array<{ value: string; count: number }>;
  };
  
  // Validation Rules
  validationRules?: string[];
  
  // Governance
  owner?: string;
  steward?: string;
  sensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  pii?: boolean;
  lastUpdated?: Date;
  updatedBy?: string;
}

export class FieldMetadataService {
  private metadataService: MetadataService;
  private readonly METADATA_PREFIX = 'field-metadata/';

  constructor() {
    this.metadataService = new MetadataService();
  }

  private getFieldId(sourceType: 'dataset' | 'analysis' | 'dashboard', sourceId: string, fieldName: string): string {
    return `${sourceType}::${sourceId}::${fieldName}`;
  }

  private getMetadataKey(sourceType: 'dataset' | 'analysis' | 'dashboard', sourceId: string, fieldName: string): string {
    return `${this.METADATA_PREFIX}${sourceType}/${sourceId}/${fieldName}.json`;
  }

  // Legacy support for dataset-only calls
  private getFieldIdLegacy(datasetId: string, fieldName: string): string {
    return this.getFieldId('dataset', datasetId, fieldName);
  }

  private getMetadataKeyLegacy(datasetId: string, fieldName: string): string {
    return this.getMetadataKey('dataset', datasetId, fieldName);
  }

  async getFieldMetadata(datasetId: string, fieldName: string): Promise<FieldMetadata | null>;
  async getFieldMetadata(sourceType: 'dataset' | 'analysis' | 'dashboard', sourceId: string, fieldName: string): Promise<FieldMetadata | null>;
  async getFieldMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrUndefined?: string,
  ): Promise<FieldMetadata | null> {
    try {
      let sourceType: 'dataset' | 'analysis' | 'dashboard';
      let sourceId: string;
      let fieldName: string;

      // Handle overloaded parameters
      if (fieldNameOrUndefined === undefined) {
        // Legacy call: getFieldMetadata(datasetId, fieldName)
        sourceType = 'dataset';
        sourceId = sourceTypeOrDatasetId as string;
        fieldName = sourceIdOrFieldName;
      } else {
        // New call: getFieldMetadata(sourceType, sourceId, fieldName)
        sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
        sourceId = sourceIdOrFieldName;
        fieldName = fieldNameOrUndefined;
      }

      const key = this.getMetadataKey(sourceType, sourceId, fieldName);
      const metadata = await this.metadataService.getMetadata(key);
      return metadata as FieldMetadata;
    } catch {
      // Return default metadata if none exists
      let sourceType: 'dataset' | 'analysis' | 'dashboard';
      let sourceId: string;
      let fieldName: string;

      if (fieldNameOrUndefined === undefined) {
        sourceType = 'dataset';
        sourceId = sourceTypeOrDatasetId as string;
        fieldName = sourceIdOrFieldName;
      } else {
        sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
        sourceId = sourceIdOrFieldName;
        fieldName = fieldNameOrUndefined;
      }

      const defaultMetadata: FieldMetadata = {
        fieldId: this.getFieldId(sourceType, sourceId, fieldName),
        sourceType,
        fieldName,
        tags: [],
      };

      // Add the appropriate source ID
      if (sourceType === 'dataset') {
        defaultMetadata.datasetId = sourceId;
      } else if (sourceType === 'analysis') {
        defaultMetadata.analysisId = sourceId;
      } else if (sourceType === 'dashboard') {
        defaultMetadata.dashboardId = sourceId;
      }

      return defaultMetadata;
    }
  }

  async updateFieldMetadata(
    datasetId: string,
    fieldName: string,
    updates: Partial<FieldMetadata>
  ): Promise<FieldMetadata>;
  async updateFieldMetadata(
    sourceType: 'dataset' | 'analysis' | 'dashboard',
    sourceId: string,
    fieldName: string,
    updates: Partial<FieldMetadata>
  ): Promise<FieldMetadata>;
  async updateFieldMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrUpdates: string | Partial<FieldMetadata>,
    updatesOrUndefined?: Partial<FieldMetadata>,
  ): Promise<FieldMetadata> {
    try {
      let sourceType: 'dataset' | 'analysis' | 'dashboard';
      let sourceId: string;
      let fieldName: string;
      let updates: Partial<FieldMetadata>;

      // Handle overloaded parameters
      if (typeof fieldNameOrUpdates === 'string') {
        // New call: updateFieldMetadata(sourceType, sourceId, fieldName, updates)
        sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
        sourceId = sourceIdOrFieldName;
        fieldName = fieldNameOrUpdates;
        updates = updatesOrUndefined!;
      } else {
        // Legacy call: updateFieldMetadata(datasetId, fieldName, updates)
        sourceType = 'dataset';
        sourceId = sourceTypeOrDatasetId as string;
        fieldName = sourceIdOrFieldName;
        updates = fieldNameOrUpdates;
      }

      const existing = await this.getFieldMetadata(sourceType, sourceId, fieldName);
      
      const updated: FieldMetadata = {
        ...existing,
        ...updates,
        fieldId: this.getFieldId(sourceType, sourceId, fieldName),
        sourceType,
        fieldName,
        tags: updates.tags || existing?.tags || [],
        lastUpdated: new Date(),
        updatedBy: updates.updatedBy || 'system',
      };

      // Ensure the correct source ID is set
      if (sourceType === 'dataset') {
        updated.datasetId = sourceId;
        delete updated.analysisId;
        delete updated.dashboardId;
      } else if (sourceType === 'analysis') {
        updated.analysisId = sourceId;
        delete updated.datasetId;
        delete updated.dashboardId;
      } else if (sourceType === 'dashboard') {
        updated.dashboardId = sourceId;
        delete updated.datasetId;
        delete updated.analysisId;
      }

      const key = this.getMetadataKey(sourceType, sourceId, fieldName);
      await this.metadataService.saveMetadata(key, updated);
      
      logger.info(`Updated metadata for field ${fieldName} in ${sourceType} ${sourceId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating field metadata:', error);
      throw error;
    }
  }

  async addFieldTags(
    datasetId: string,
    fieldName: string,
    tags: Array<{ key: string; value: string }>
  ): Promise<void>;
  async addFieldTags(
    sourceType: 'dataset' | 'analysis' | 'dashboard',
    sourceId: string,
    fieldName: string,
    tags: Array<{ key: string; value: string }>
  ): Promise<void>;
  async addFieldTags(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrTags: string | Array<{ key: string; value: string }>,
    tagsOrUndefined?: Array<{ key: string; value: string }>,
  ): Promise<void> {
    let sourceType: 'dataset' | 'analysis' | 'dashboard';
    let sourceId: string;
    let fieldName: string;
    let tags: Array<{ key: string; value: string }>;

    if (Array.isArray(fieldNameOrTags)) {
      // Legacy call
      sourceType = 'dataset';
      sourceId = sourceTypeOrDatasetId as string;
      fieldName = sourceIdOrFieldName;
      tags = fieldNameOrTags;
    } else {
      // New call
      sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
      sourceId = sourceIdOrFieldName;
      fieldName = fieldNameOrTags;
      tags = tagsOrUndefined!;
    }

    const metadata = await this.getFieldMetadata(sourceType, sourceId, fieldName);
    const existingTags = metadata?.tags || [];
    
    // Merge tags, avoiding duplicates
    const tagMap = new Map<string, string>();
    [...existingTags, ...tags].forEach(tag => {
      tagMap.set(tag.key, tag.value);
    });
    
    const mergedTags = Array.from(tagMap.entries()).map(([key, value]) => ({ key, value }));
    
    await this.updateFieldMetadata(sourceType, sourceId, fieldName, { tags: mergedTags });
  }

  async removeFieldTags(
    datasetId: string,
    fieldName: string,
    tagKeys: string[]
  ): Promise<void>;
  async removeFieldTags(
    sourceType: 'dataset' | 'analysis' | 'dashboard',
    sourceId: string,
    fieldName: string,
    tagKeys: string[]
  ): Promise<void>;
  async removeFieldTags(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrTagKeys: string | string[],
    tagKeysOrUndefined?: string[],
  ): Promise<void> {
    let sourceType: 'dataset' | 'analysis' | 'dashboard';
    let sourceId: string;
    let fieldName: string;
    let tagKeys: string[];

    if (Array.isArray(fieldNameOrTagKeys)) {
      // Legacy call
      sourceType = 'dataset';
      sourceId = sourceTypeOrDatasetId as string;
      fieldName = sourceIdOrFieldName;
      tagKeys = fieldNameOrTagKeys;
    } else {
      // New call
      sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
      sourceId = sourceIdOrFieldName;
      fieldName = fieldNameOrTagKeys;
      tagKeys = tagKeysOrUndefined!;
    }

    const metadata = await this.getFieldMetadata(sourceType, sourceId, fieldName);
    if (!metadata?.tags) return;
    
    const filteredTags = metadata.tags.filter(tag => !tagKeys.includes(tag.key));
    await this.updateFieldMetadata(sourceType, sourceId, fieldName, { tags: filteredTags });
  }

  async getFieldTags(
    datasetId: string,
    fieldName: string
  ): Promise<Array<{ key: string; value: string }>>;
  async getFieldTags(
    sourceType: 'dataset' | 'analysis' | 'dashboard',
    sourceId: string,
    fieldName: string
  ): Promise<Array<{ key: string; value: string }>>;
  async getFieldTags(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrFieldName: string,
    fieldNameOrUndefined?: string,
  ): Promise<Array<{ key: string; value: string }>> {
    let sourceType: 'dataset' | 'analysis' | 'dashboard';
    let sourceId: string;
    let fieldName: string;

    if (fieldNameOrUndefined === undefined) {
      // Legacy call
      sourceType = 'dataset';
      sourceId = sourceTypeOrDatasetId as string;
      fieldName = sourceIdOrFieldName;
    } else {
      // New call
      sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
      sourceId = sourceIdOrFieldName;
      fieldName = fieldNameOrUndefined;
    }

    const metadata = await this.getFieldMetadata(sourceType, sourceId, fieldName);
    return metadata?.tags || [];
  }

  async getAllFieldsMetadata(datasetId: string): Promise<FieldMetadata[]>;
  async getAllFieldsMetadata(
    sourceType: 'dataset' | 'analysis' | 'dashboard',
    sourceId: string
  ): Promise<FieldMetadata[]>;
  async getAllFieldsMetadata(
    sourceTypeOrDatasetId: string | 'dataset' | 'analysis' | 'dashboard',
    sourceIdOrUndefined?: string,
  ): Promise<FieldMetadata[]> {
    try {
      let sourceType: 'dataset' | 'analysis' | 'dashboard';
      let sourceId: string;

      if (sourceIdOrUndefined === undefined) {
        // Legacy call
        sourceType = 'dataset';
        sourceId = sourceTypeOrDatasetId as string;
      } else {
        // New call
        sourceType = sourceTypeOrDatasetId as 'dataset' | 'analysis' | 'dashboard';
        sourceId = sourceIdOrUndefined;
      }

      const prefix = `${this.METADATA_PREFIX}${sourceType}/${sourceId}/`;
      const objects = await this.metadataService.listObjects(prefix);
      
      const metadataPromises = objects.map(async (obj) => {
        try {
          const metadata = await this.metadataService.getMetadata(obj.key);
          return metadata as FieldMetadata;
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(metadataPromises);
      return results.filter((m): m is FieldMetadata => m !== null);
    } catch (error) {
      logger.error(`Error getting all fields metadata for ${sourceTypeOrDatasetId} ${sourceIdOrUndefined || sourceTypeOrDatasetId}:`, error);
      return [];
    }
  }

  async searchFieldsByTags(tags: Array<{ key: string; value?: string }>): Promise<FieldMetadata[]> {
    try {
      logger.info(`Searching for fields with tags: ${JSON.stringify(tags)}`);
      
      // Get all field metadata files from all source types
      const objects = await this.metadataService.listObjects(this.METADATA_PREFIX);
      logger.info(`Found ${objects.length} field metadata objects to search`);
      
      const metadataPromises = objects.map(async (obj) => {
        try {
          const metadata = await this.metadataService.getMetadata(obj.key) as FieldMetadata;
          
          // Log first few metadata objects for debugging
          if (objects.indexOf(obj) < 3) {
            logger.debug(`Sample metadata from ${obj.key}:`, {
              fieldId: metadata.fieldId,
              fieldName: metadata.fieldName,
              tags: metadata.tags,
            });
          }
          
          // Check if field has matching tags
          const hasMatchingTags = tags.every(searchTag => {
            const hasMatch = metadata.tags?.some(fieldTag => {
              const keyMatches = fieldTag.key === searchTag.key;
              const valueMatches = !searchTag.value || fieldTag.value === searchTag.value;
              return keyMatches && valueMatches;
            }) || false;
            
            if (hasMatch && objects.indexOf(obj) < 3) {
              logger.debug(`Found match for ${searchTag.key} in field ${metadata.fieldName}`);
            }
            
            return hasMatch;
          });
          
          return hasMatchingTags ? metadata : null;
        } catch (error) {
          logger.error(`Error reading metadata from ${obj.key}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(metadataPromises);
      const filteredResults = results.filter((m): m is FieldMetadata => m !== null);
      logger.info(`Search found ${filteredResults.length} matching fields`);
      
      return filteredResults;
    } catch (error) {
      logger.error('Error searching fields by tags:', error);
      return [];
    }
  }

  // Batch operations for performance
  async batchUpdateFieldsMetadata(
    updates: Array<{ datasetId: string; fieldName: string; metadata: Partial<FieldMetadata> }>,
  ): Promise<void> {
    const updatePromises = updates.map(({ datasetId, fieldName, metadata }) =>
      this.updateFieldMetadata(datasetId, fieldName, metadata),
    );
    
    await Promise.all(updatePromises);
    logger.info(`Batch updated metadata for ${updates.length} fields`);
  }
}