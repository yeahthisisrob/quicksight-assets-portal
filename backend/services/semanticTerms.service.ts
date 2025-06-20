import { MetadataService } from './metadata.service';
import { logger } from '../utils/logger';

export interface SemanticTerm {
  id: string;
  term: string;
  businessName: string;
  description?: string;
  category?: string;
  dataType?: string;
  format?: string;
  example?: string;
  synonyms?: string[];
  tags?: string[];
  owner?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface SemanticCategory {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
  icon?: string;
}

export class SemanticTermsService {
  private metadataService: MetadataService;
  private readonly TERMS_PREFIX = 'semantic/terms';
  private readonly CATEGORIES_PREFIX = 'semantic/categories';

  constructor() {
    this.metadataService = new MetadataService();
  }

  // Terms Management
  async getAllTerms(): Promise<SemanticTerm[]> {
    try {
      const objects = await this.metadataService.listObjects(`${this.TERMS_PREFIX}/`);
      const terms: SemanticTerm[] = [];

      for (const obj of objects) {
        if (obj.key.endsWith('.json')) {
          try {
            const term = await this.metadataService.getMetadata(obj.key);
            if (term) {
              terms.push(term as SemanticTerm);
            }
          } catch (error) {
            logger.error(`Error loading semantic term from ${obj.key}:`, error);
          }
        }
      }

      return terms.sort((a, b) => a.term.localeCompare(b.term));
    } catch (error) {
      logger.error('Error getting all semantic terms:', error);
      return [];
    }
  }

  async getTerm(termId: string): Promise<SemanticTerm | null> {
    try {
      const key = `${this.TERMS_PREFIX}/${termId}.json`;
      const term = await this.metadataService.getMetadata(key);
      return term as SemanticTerm;
    } catch (error) {
      logger.error(`Error getting semantic term ${termId}:`, error);
      return null;
    }
  }

  async createTerm(term: Omit<SemanticTerm, 'id' | 'createdAt' | 'updatedAt'>): Promise<SemanticTerm> {
    const id = this.generateTermId(term.term);
    const now = new Date().toISOString();
    
    const newTerm: SemanticTerm = {
      ...term,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const key = `${this.TERMS_PREFIX}/${id}.json`;
    await this.metadataService.saveMetadata(key, newTerm);
    
    logger.info(`Created semantic term: ${term.term} (${id})`);
    return newTerm;
  }

  async updateTerm(termId: string, updates: Partial<SemanticTerm>): Promise<SemanticTerm | null> {
    const existingTerm = await this.getTerm(termId);
    if (!existingTerm) {
      return null;
    }

    const updatedTerm: SemanticTerm = {
      ...existingTerm,
      ...updates,
      id: termId, // Ensure ID cannot be changed
      createdAt: existingTerm.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    };

    const key = `${this.TERMS_PREFIX}/${termId}.json`;
    await this.metadataService.saveMetadata(key, updatedTerm);
    
    logger.info(`Updated semantic term: ${updatedTerm.term} (${termId})`);
    return updatedTerm;
  }

  async deleteTerm(termId: string): Promise<boolean> {
    try {
      const key = `${this.TERMS_PREFIX}/${termId}.json`;
      await this.metadataService.deleteMetadata(key);
      
      logger.info(`Deleted semantic term: ${termId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting semantic term ${termId}:`, error);
      return false;
    }
  }

  async searchTerms(query: string): Promise<SemanticTerm[]> {
    const allTerms = await this.getAllTerms();
    const lowerQuery = query.toLowerCase();

    return allTerms.filter(term => 
      term.term.toLowerCase().includes(lowerQuery) ||
      term.businessName.toLowerCase().includes(lowerQuery) ||
      term.description?.toLowerCase().includes(lowerQuery) ||
      term.synonyms?.some(s => s.toLowerCase().includes(lowerQuery)) ||
      term.tags?.some(t => t.toLowerCase().includes(lowerQuery)),
    );
  }

  // Categories Management
  async getAllCategories(): Promise<SemanticCategory[]> {
    try {
      const objects = await this.metadataService.listObjects(`${this.CATEGORIES_PREFIX}/`);
      const categories: SemanticCategory[] = [];

      for (const obj of objects) {
        if (obj.key.endsWith('.json')) {
          try {
            const category = await this.metadataService.getMetadata(obj.key);
            if (category) {
              categories.push(category as SemanticCategory);
            }
          } catch (error) {
            logger.error(`Error loading category from ${obj.key}:`, error);
          }
        }
      }

      return categories.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Error getting all categories:', error);
      return [];
    }
  }

  async createCategory(category: Omit<SemanticCategory, 'id'>): Promise<SemanticCategory> {
    const id = this.generateCategoryId(category.name);
    
    const newCategory: SemanticCategory = {
      ...category,
      id,
    };

    const key = `${this.CATEGORIES_PREFIX}/${id}.json`;
    await this.metadataService.saveMetadata(key, newCategory);
    
    logger.info(`Created semantic category: ${category.name} (${id})`);
    return newCategory;
  }

  async getTermsByCategory(categoryId: string): Promise<SemanticTerm[]> {
    const allTerms = await this.getAllTerms();
    return allTerms.filter(term => term.category === categoryId);
  }

  // Helper methods
  private generateTermId(term: string): string {
    return term
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateCategoryId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Bulk operations
  async importTerms(terms: Array<Omit<SemanticTerm, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SemanticTerm[]> {
    const importedTerms: SemanticTerm[] = [];
    
    for (const term of terms) {
      try {
        const imported = await this.createTerm(term);
        importedTerms.push(imported);
      } catch (error) {
        logger.error(`Error importing term ${term.term}:`, error);
      }
    }
    
    return importedTerms;
  }

  async exportTerms(): Promise<SemanticTerm[]> {
    return this.getAllTerms();
  }
}