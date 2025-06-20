import { MetadataService } from './metadata.service';
import { SemanticTermsService, SemanticTerm } from './semanticTerms.service';
import { FieldMetadataService } from './fieldMetadata.service';
import { logger } from '../utils/logger';
import { differenceInDays } from 'date-fns';

export interface FieldMapping {
  id: string;
  fieldId: string; // Format: {sourceType}:{sourceId}:{fieldName}
  termId: string;
  confidence: number; // 0-100
  mappingType: 'manual' | 'auto' | 'suggested' | 'rejected';
  status: 'active' | 'pending' | 'rejected';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  reason?: string; // For auto-mapping: why this mapping was suggested
  metadata?: {
    dataType?: string;
    sampleValues?: string[];
    fieldStats?: any;
  };
}

export interface MappingSuggestion {
  fieldId: string;
  termId: string;
  confidence: number;
  reasons: string[];
  score: {
    nameMatch: number;
    descriptionMatch: number;
    dataTypeMatch: number;
    patternMatch: number;
    contextMatch: number;
  };
}

export interface UnmappedField {
  fieldId: string;
  fieldName: string;
  sourceType: 'dataset' | 'dashboard' | 'analysis';
  sourceId: string;
  sourceName: string;
  dataType?: string;
  description?: string;
  lastSeen: string;
  occurrences: number;
  suggestions?: MappingSuggestion[];
}

export class SemanticMappingService {
  private metadataService: MetadataService;
  private semanticTermsService: SemanticTermsService;
  private fieldMetadataService: FieldMetadataService;
  private readonly MAPPINGS_PREFIX = 'semantic/mappings';
  private readonly UNMAPPED_PREFIX = 'semantic/unmapped';
  private readonly MIN_CONFIDENCE_THRESHOLD = 70; // Minimum confidence for auto-mapping

  constructor() {
    this.metadataService = new MetadataService();
    this.semanticTermsService = new SemanticTermsService();
    this.fieldMetadataService = new FieldMetadataService();
  }

  // Mapping Management
  async getAllMappings(): Promise<FieldMapping[]> {
    try {
      const objects = await this.metadataService.listObjects(`${this.MAPPINGS_PREFIX}/`);
      const mappings: FieldMapping[] = [];

      for (const obj of objects) {
        if (obj.key.endsWith('.json')) {
          try {
            const mapping = await this.metadataService.getMetadata(obj.key);
            if (mapping) {
              mappings.push(mapping as FieldMapping);
            }
          } catch (error) {
            logger.error(`Error loading mapping from ${obj.key}:`, error);
          }
        }
      }

      return mappings;
    } catch (error) {
      logger.error('Error getting all mappings:', error);
      return [];
    }
  }

  async getFieldMapping(fieldId: string): Promise<FieldMapping | null> {
    const mappings = await this.getAllMappings();
    return mappings.find(m => m.fieldId === fieldId && m.status === 'active') || null;
  }

  async createMapping(
    fieldId: string,
    termId: string,
    confidence: number,
    mappingType: 'manual' | 'auto' | 'suggested' = 'manual',
    reason?: string,
  ): Promise<FieldMapping> {
    const id = `${fieldId}:${termId}`.replace(/:/g, '-');
    const now = new Date().toISOString();

    const mapping: FieldMapping = {
      id,
      fieldId,
      termId,
      confidence,
      mappingType,
      status: mappingType === 'suggested' ? 'pending' : 'active',
      createdAt: now,
      updatedAt: now,
      reason,
    };

    const key = `${this.MAPPINGS_PREFIX}/${id}.json`;
    await this.metadataService.saveMetadata(key, mapping);

    logger.info(`Created mapping: ${fieldId} -> ${termId} (confidence: ${confidence}%)`);
    return mapping;
  }

  async approveMapping(mappingId: string): Promise<FieldMapping | null> {
    const key = `${this.MAPPINGS_PREFIX}/${mappingId}.json`;
    const mapping = await this.metadataService.getMetadata(key) as FieldMapping;
    
    if (!mapping) {
      return null;
    }

    mapping.status = 'active';
    mapping.mappingType = 'manual'; // Approved suggestions become manual
    mapping.updatedAt = new Date().toISOString();

    await this.metadataService.saveMetadata(key, mapping);
    return mapping;
  }

  async rejectMapping(mappingId: string, reason?: string): Promise<FieldMapping | null> {
    const key = `${this.MAPPINGS_PREFIX}/${mappingId}.json`;
    const mapping = await this.metadataService.getMetadata(key) as FieldMapping;
    
    if (!mapping) {
      return null;
    }

    mapping.status = 'rejected';
    mapping.reason = reason;
    mapping.updatedAt = new Date().toISOString();

    await this.metadataService.saveMetadata(key, mapping);
    return mapping;
  }

  // Auto-mapping Engine
  async suggestMappingsForField(
    fieldName: string,
    fieldMetadata?: {
      dataType?: string;
      description?: string;
      sampleValues?: string[];
      context?: string;
    },
  ): Promise<MappingSuggestion[]> {
    const terms = await this.semanticTermsService.getAllTerms();
    const suggestions: MappingSuggestion[] = [];

    for (const term of terms) {
      const score = this.calculateMappingScore(fieldName, term, fieldMetadata);
      
      if (score.total >= this.MIN_CONFIDENCE_THRESHOLD) {
        suggestions.push({
          fieldId: '', // Will be set by caller
          termId: term.id,
          confidence: Math.round(score.total),
          reasons: score.reasons,
          score: {
            nameMatch: score.nameMatch,
            descriptionMatch: score.descriptionMatch,
            dataTypeMatch: score.dataTypeMatch,
            patternMatch: score.patternMatch,
            contextMatch: score.contextMatch,
          },
        });
      }
    }

    // Sort by confidence descending
    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5); // Top 5 suggestions
  }

  private calculateMappingScore(
    fieldName: string,
    term: SemanticTerm,
    metadata?: {
      dataType?: string;
      description?: string;
      sampleValues?: string[];
      context?: string;
    },
  ): { total: number; reasons: string[]; nameMatch: number; descriptionMatch: number; dataTypeMatch: number; patternMatch: number; contextMatch: number } {
    const scores = {
      nameMatch: 0,
      descriptionMatch: 0,
      dataTypeMatch: 0,
      patternMatch: 0,
      contextMatch: 0,
    };
    const reasons: string[] = [];

    // 1. Name matching (40% weight)
    const nameScore = this.calculateStringSimiliarity(fieldName, term.term);
    const businessNameScore = this.calculateStringSimiliarity(fieldName, term.businessName);
    scores.nameMatch = Math.max(nameScore, businessNameScore) * 40;
    
    if (scores.nameMatch > 30) {
      reasons.push(`Strong name match with "${term.term}"`);
    }

    // Check synonyms
    if (term.synonyms) {
      for (const synonym of term.synonyms) {
        const synonymScore = this.calculateStringSimiliarity(fieldName, synonym) * 40;
        if (synonymScore > scores.nameMatch) {
          scores.nameMatch = synonymScore;
          reasons.push(`Matches synonym "${synonym}"`);
        }
      }
    }

    // 2. Description matching (20% weight)
    if (metadata?.description && term.description) {
      scores.descriptionMatch = this.calculateStringSimiliarity(metadata.description, term.description) * 20;
      if (scores.descriptionMatch > 15) {
        reasons.push('Description similarity');
      }
    }

    // 3. Data type matching (20% weight)
    if (metadata?.dataType && term.dataType) {
      if (this.areDataTypesCompatible(metadata.dataType, term.dataType)) {
        scores.dataTypeMatch = 20;
        reasons.push('Compatible data types');
      }
    }

    // 4. Pattern matching (10% weight)
    if (metadata?.sampleValues && term.format) {
      const patternMatch = this.checkPatternMatch(metadata.sampleValues, term.format);
      scores.patternMatch = patternMatch ? 10 : 0;
      if (patternMatch) {
        reasons.push('Value pattern matches');
      }
    }

    // 5. Context matching (10% weight)
    if (metadata?.context && term.tags) {
      const contextScore = this.calculateContextMatch(metadata.context, term.tags);
      scores.contextMatch = contextScore * 10;
      if (scores.contextMatch > 5) {
        reasons.push('Context similarity');
      }
    }

    const total = scores.nameMatch + scores.descriptionMatch + scores.dataTypeMatch + 
                  scores.patternMatch + scores.contextMatch;

    return { total, reasons, ...scores };
  }

  private calculateStringSimiliarity(str1: string, str2: string): number {
    // Normalize strings
    const s1 = str1.toLowerCase().replace(/[_-]/g, ' ').trim();
    const s2 = str2.toLowerCase().replace(/[_-]/g, ' ').trim();

    // Exact match
    if (s1 === s2) return 1;

    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Word-level matching
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w)).length;
    const wordScore = commonWords / Math.max(words1.length, words2.length);

    // Levenshtein distance for close matches
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    const distanceScore = 1 - (distance / maxLength);

    return Math.max(wordScore, distanceScore);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  private areDataTypesCompatible(type1: string, type2: string): boolean {
    const typeMap: Record<string, string[]> = {
      'string': ['string', 'text', 'varchar', 'char'],
      'number': ['number', 'integer', 'decimal', 'float', 'double', 'bigint'],
      'date': ['date', 'datetime', 'timestamp'],
      'boolean': ['boolean', 'bool', 'bit'],
    };

    const normalizedType1 = type1.toLowerCase();
    const normalizedType2 = type2.toLowerCase();

    for (const [category, types] of Object.entries(typeMap)) {
      if (types.includes(normalizedType1) && types.includes(normalizedType2)) {
        return true;
      }
    }

    return normalizedType1 === normalizedType2;
  }

  private checkPatternMatch(sampleValues: string[], pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return sampleValues.some(value => regex.test(value));
    } catch {
      return false;
    }
  }

  private calculateContextMatch(context: string, tags: string[]): number {
    const contextLower = context.toLowerCase();
    const matchingTags = tags.filter(tag => contextLower.includes(tag.toLowerCase()));
    return matchingTags.length / tags.length;
  }

  // Unmapped Fields Discovery
  async discoverUnmappedFields(): Promise<UnmappedField[]> {
    const unmappedFields: Map<string, UnmappedField> = new Map();
    const allMappings = await this.getAllMappings();
    const activeMappings = new Set(allMappings.filter(m => m.status === 'active').map(m => m.fieldId));

    // Scan all assets for fields
    const assets = await this.scanAllAssets();
    
    for (const asset of assets) {
      for (const field of asset.fields) {
        const fieldId = `${asset.type}:${asset.id}:${field.name}`;
        
        if (!activeMappings.has(fieldId)) {
          const existing = unmappedFields.get(fieldId);
          
          if (existing) {
            existing.occurrences++;
            existing.lastSeen = new Date().toISOString();
          } else {
            unmappedFields.set(fieldId, {
              fieldId,
              fieldName: field.name,
              sourceType: asset.type,
              sourceId: asset.id,
              sourceName: asset.name,
              dataType: field.dataType,
              description: field.description,
              lastSeen: new Date().toISOString(),
              occurrences: 1,
            });
          }
        }
      }
    }

    // Generate suggestions for unmapped fields
    const unmappedWithSuggestions: UnmappedField[] = [];
    
    for (const unmapped of unmappedFields.values()) {
      const suggestions = await this.suggestMappingsForField(unmapped.fieldName, {
        dataType: unmapped.dataType,
        description: unmapped.description,
      });
      
      unmappedWithSuggestions.push({
        ...unmapped,
        suggestions: suggestions.map(s => ({ ...s, fieldId: unmapped.fieldId })),
      });
    }

    // Sort by occurrences (most used fields first)
    return unmappedWithSuggestions.sort((a, b) => b.occurrences - a.occurrences);
  }

  private async scanAllAssets(): Promise<Array<{
    type: 'dataset' | 'dashboard' | 'analysis';
    id: string;
    name: string;
    fields: Array<{ name: string; dataType?: string; description?: string }>;
  }>> {
    // This would scan through all datasets, dashboards, and analyses
    // For now, returning a placeholder - would integrate with asset services
    return [];
  }

  // Bulk mapping operations
  async applyAutoMappings(minConfidence: number = 85): Promise<FieldMapping[]> {
    const unmappedFields = await this.discoverUnmappedFields();
    const createdMappings: FieldMapping[] = [];

    for (const field of unmappedFields) {
      if (field.suggestions && field.suggestions.length > 0) {
        const topSuggestion = field.suggestions[0];
        
        if (topSuggestion.confidence >= minConfidence) {
          const mapping = await this.createMapping(
            field.fieldId,
            topSuggestion.termId,
            topSuggestion.confidence,
            'auto',
            topSuggestion.reasons.join('; '),
          );
          createdMappings.push(mapping);
        }
      }
    }

    logger.info(`Auto-mapped ${createdMappings.length} fields with confidence >= ${minConfidence}%`);
    return createdMappings;
  }

  // Mapping statistics
  async getMappingStats(): Promise<{
    totalFields: number;
    mappedFields: number;
    unmappedFields: number;
    autoMappedFields: number;
    manualMappedFields: number;
    averageConfidence: number;
    coveragePercentage: number;
  }> {
    const mappings = await this.getAllMappings();
    const activeMappings = mappings.filter(m => m.status === 'active');
    const unmapped = await this.discoverUnmappedFields();

    const totalFields = activeMappings.length + unmapped.length;
    const autoMapped = activeMappings.filter(m => m.mappingType === 'auto').length;
    const manualMapped = activeMappings.filter(m => m.mappingType === 'manual').length;
    
    const avgConfidence = activeMappings.length > 0
      ? activeMappings.reduce((sum, m) => sum + m.confidence, 0) / activeMappings.length
      : 0;

    return {
      totalFields,
      mappedFields: activeMappings.length,
      unmappedFields: unmapped.length,
      autoMappedFields: autoMapped,
      manualMappedFields: manualMapped,
      averageConfidence: Math.round(avgConfidence),
      coveragePercentage: totalFields > 0 ? Math.round((activeMappings.length / totalFields) * 100) : 0,
    };
  }
}