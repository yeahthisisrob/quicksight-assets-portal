import { Router, Request, Response } from 'express';
import { SemanticTermsService } from '../services/semanticTerms.service';
import { SemanticMappingService } from '../services/semanticMapping.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const semanticTermsService = new SemanticTermsService();
const semanticMappingService = new SemanticMappingService();

// Semantic Terms endpoints
router.get('/terms', asyncHandler(async (req: Request, res: Response) => {
  const { search, category } = req.query;
  
  let terms = await semanticTermsService.getAllTerms();
  
  if (search) {
    terms = await semanticTermsService.searchTerms(search as string);
  }
  
  if (category) {
    terms = terms.filter(t => t.category === category);
  }
  
  res.json(terms);
}));

router.get('/terms/:termId', asyncHandler(async (req: Request, res: Response) => {
  const { termId } = req.params;
  const term = await semanticTermsService.getTerm(termId);
  
  if (!term) {
    return res.status(404).json({ error: 'Term not found' });
  }
  
  res.json(term);
}));

router.post('/terms', asyncHandler(async (req: Request, res: Response) => {
  const termData = req.body;
  const term = await semanticTermsService.createTerm(termData);
  res.status(201).json(term);
}));

router.put('/terms/:termId', asyncHandler(async (req: Request, res: Response) => {
  const { termId } = req.params;
  const updates = req.body;
  
  const term = await semanticTermsService.updateTerm(termId, updates);
  
  if (!term) {
    return res.status(404).json({ error: 'Term not found' });
  }
  
  res.json(term);
}));

router.delete('/terms/:termId', asyncHandler(async (req: Request, res: Response) => {
  const { termId } = req.params;
  const success = await semanticTermsService.deleteTerm(termId);
  
  if (!success) {
    return res.status(404).json({ error: 'Term not found' });
  }
  
  res.status(204).send();
}));

// Categories endpoints
router.get('/categories', asyncHandler(async (req: Request, res: Response) => {
  const categories = await semanticTermsService.getAllCategories();
  res.json(categories);
}));

router.post('/categories', asyncHandler(async (req: Request, res: Response) => {
  const categoryData = req.body;
  const category = await semanticTermsService.createCategory(categoryData);
  res.status(201).json(category);
}));

// Mapping endpoints
router.get('/mappings', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId, status, type } = req.query;
  
  let mappings = await semanticMappingService.getAllMappings();
  
  if (fieldId) {
    mappings = mappings.filter(m => m.fieldId === fieldId);
  }
  
  if (status) {
    mappings = mappings.filter(m => m.status === status);
  }
  
  if (type) {
    mappings = mappings.filter(m => m.mappingType === type);
  }
  
  res.json(mappings);
}));

router.get('/mappings/field/:fieldId', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;
  const mapping = await semanticMappingService.getFieldMapping(fieldId);
  
  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  
  res.json(mapping);
}));

router.post('/mappings', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId, termId, confidence, mappingType, reason } = req.body;
  
  const mapping = await semanticMappingService.createMapping(
    fieldId,
    termId,
    confidence || 100,
    mappingType || 'manual',
    reason,
  );
  
  res.status(201).json(mapping);
}));

router.post('/mappings/:mappingId/approve', asyncHandler(async (req: Request, res: Response) => {
  const { mappingId } = req.params;
  const mapping = await semanticMappingService.approveMapping(mappingId);
  
  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  
  res.json(mapping);
}));

router.post('/mappings/:mappingId/reject', asyncHandler(async (req: Request, res: Response) => {
  const { mappingId } = req.params;
  const { reason } = req.body;
  
  const mapping = await semanticMappingService.rejectMapping(mappingId, reason);
  
  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  
  res.json(mapping);
}));

// Suggestion endpoint
router.post('/mappings/suggest', asyncHandler(async (req: Request, res: Response) => {
  const { fieldName, dataType, description, sampleValues, context } = req.body;
  
  const suggestions = await semanticMappingService.suggestMappingsForField(fieldName, {
    dataType,
    description,
    sampleValues,
    context,
  });
  
  res.json(suggestions);
}));

// Auto-mapping endpoint
router.post('/mappings/auto-map', asyncHandler(async (req: Request, res: Response) => {
  const { minConfidence = 85 } = req.body;
  
  const mappings = await semanticMappingService.applyAutoMappings(minConfidence);
  
  res.json({
    message: `Created ${mappings.length} auto-mappings`,
    mappings,
  });
}));

// Unmapped fields endpoint
router.get('/unmapped', asyncHandler(async (req: Request, res: Response) => {
  const unmappedFields = await semanticMappingService.discoverUnmappedFields();
  res.json(unmappedFields);
}));

// Statistics endpoint
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await semanticMappingService.getMappingStats();
  res.json(stats);
}));

// Import/Export endpoints
router.post('/terms/import', asyncHandler(async (req: Request, res: Response) => {
  const { terms } = req.body;
  
  if (!Array.isArray(terms)) {
    return res.status(400).json({ error: 'Terms must be an array' });
  }
  
  const imported = await semanticTermsService.importTerms(terms);
  
  res.json({
    message: `Imported ${imported.length} terms`,
    terms: imported,
  });
}));

router.get('/terms/export', asyncHandler(async (req: Request, res: Response) => {
  const terms = await semanticTermsService.exportTerms();
  
  res.json({
    terms,
    exportDate: new Date().toISOString(),
    count: terms.length,
  });
}));

export { router as semanticRoutes };