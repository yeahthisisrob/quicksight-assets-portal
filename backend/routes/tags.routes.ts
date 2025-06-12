import { Router } from 'express';
import { TagService } from '../services/tag.service';
import { FieldMetadataService } from '../services/fieldMetadata.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const tagService = new TagService();
const fieldMetadataService = new FieldMetadataService();

// IMPORTANT: Specific routes must come before generic parameter routes

// POST /api/tags/field/search - Search fields by tags (must come before generic routes)
router.post('/field/search', asyncHandler(async (req, res) => {
  const { tags } = req.body;
  
  if (!Array.isArray(tags)) {
    return res.status(400).json({
      success: false,
      error: 'Tags must be an array',
    });
  }
  
  logger.info(`Searching fields by ${tags.length} tags`);
  
  const fields = await fieldMetadataService.searchFieldsByTags(tags);
  
  res.json({
    success: true,
    data: fields,
  });
}));

// AWS Resource Tags

// GET /api/tags/:resourceType/:resourceId
router.get('/:resourceType/:resourceId', asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  
  // Legacy route support for dashboards
  if (!['dashboard', 'analysis', 'dataset', 'datasource', 'folder'].includes(resourceType)) {
    // Assume it's a dashboard ID for backward compatibility
    const tags = await tagService.getDashboardTags(resourceType);
    return res.json({
      success: true,
      data: tags,
    });
  }
  
  logger.info(`Getting tags for ${resourceType} ${resourceId}`);
  
  const tags = await tagService.getResourceTags(
    resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId
  );
  
  res.json({
    success: true,
    data: tags,
  });
}));

// POST /api/tags/:resourceType/:resourceId
router.post('/:resourceType/:resourceId', asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const { tags } = req.body;
  
  // Legacy route support for dashboards
  if (!['dashboard', 'analysis', 'dataset', 'datasource', 'folder'].includes(resourceType)) {
    // Assume it's a dashboard ID for backward compatibility
    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags array is required',
      });
    }
    
    // Validate that all tags have both key and value
    const invalidTags = tags.filter(tag => !tag.key || !tag.value);
    if (invalidTags.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All tags must have both key and value',
        invalidTags,
      });
    }
    
    await tagService.tagDashboard(resourceType, tags);
    return res.json({
      success: true,
      data: tags,
      message: 'Dashboard tagged successfully',
    });
  }
  
  if (!Array.isArray(tags)) {
    return res.status(400).json({
      success: false,
      error: 'Tags must be an array',
    });
  }
  
  // Validate that all tags have both key and value
  const invalidTags = tags.filter(tag => !tag.key || !tag.value);
  if (invalidTags.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'All tags must have both key and value',
      invalidTags,
    });
  }
  
  logger.info(`Updating ${tags.length} tags for ${resourceType} ${resourceId}`);
  
  // Get current tags
  const currentTags = await tagService.getResourceTags(
    resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId
  );
  
  // Find tags to remove (in current but not in new)
  const currentTagKeys = currentTags.map(t => t.key);
  const newTagKeys = tags.map((t: any) => t.key);
  const tagsToRemove = currentTagKeys.filter(key => !newTagKeys.includes(key));
  
  // Remove old tags if any
  if (tagsToRemove.length > 0) {
    await tagService.removeResourceTags(
      resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
      resourceId,
      tagsToRemove
    );
  }
  
  // Add/update tags
  if (tags.length > 0) {
    await tagService.tagResource(
      resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
      resourceId,
      tags
    );
  }
  
  res.json({
    success: true,
    message: `Updated tags for ${resourceType}`,
  });
}));

// DELETE /api/tags/:resourceType/:resourceId
router.delete('/:resourceType/:resourceId', asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const { tagKeys } = req.body;
  
  if (!['dashboard', 'analysis', 'dataset', 'datasource', 'folder'].includes(resourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid resource type',
    });
  }
  
  if (!Array.isArray(tagKeys)) {
    return res.status(400).json({
      success: false,
      error: 'Tag keys must be an array',
    });
  }
  
  logger.info(`Removing ${tagKeys.length} tags from ${resourceType} ${resourceId}`);
  
  await tagService.removeResourceTags(
    resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
    resourceId,
    tagKeys
  );
  
  res.json({
    success: true,
    message: `Removed ${tagKeys.length} tags from ${resourceType}`,
  });
}));

// Field Tags (Pseudo-tags stored in S3)

// IMPORTANT: More specific routes must come before generic parameter routes

// GET /api/tags/field/dataset/:datasetId/all (legacy route for getting all fields metadata)
router.get('/field/dataset/:datasetId/all', asyncHandler(async (req, res) => {
  const { datasetId } = req.params;
  
  logger.info(`Getting all field metadata for dataset ${datasetId}`);
  
  const metadata = await fieldMetadataService.getAllFieldsMetadata(datasetId);
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// GET /api/tags/field/:sourceType/:sourceId/all (new flexible route for getting all fields metadata)
router.get('/field/:sourceType/:sourceId/all', asyncHandler(async (req, res) => {
  const { sourceType, sourceId } = req.params;
  
  // Validate source type
  if (!['dataset', 'analysis', 'dashboard'].includes(sourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid source type. Must be dataset, analysis, or dashboard',
    });
  }
  
  logger.info(`Getting all field metadata for ${sourceType} ${sourceId}`);
  
  const metadata = await fieldMetadataService.getAllFieldsMetadata(
    sourceType as 'dataset' | 'analysis' | 'dashboard',
    sourceId
  );
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// GET /api/tags/field/:datasetId/:fieldName (legacy route for datasets)
router.get('/field/:datasetId/:fieldName', asyncHandler(async (req, res) => {
  const { datasetId, fieldName } = req.params;
  
  logger.info(`Getting field metadata for ${fieldName} in dataset ${datasetId}`);
  
  const metadata = await fieldMetadataService.getFieldMetadata(datasetId, fieldName);
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// GET /api/tags/field/:sourceType/:sourceId/:fieldName (new flexible route)
router.get('/field/:sourceType/:sourceId/:fieldName', asyncHandler(async (req, res) => {
  const { sourceType, sourceId, fieldName } = req.params;
  
  // Validate source type
  if (!['dataset', 'analysis', 'dashboard'].includes(sourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid source type. Must be dataset, analysis, or dashboard',
    });
  }
  
  logger.info(`Getting field metadata for ${fieldName} in ${sourceType} ${sourceId}`);
  
  const metadata = await fieldMetadataService.getFieldMetadata(
    sourceType as 'dataset' | 'analysis' | 'dashboard',
    sourceId,
    fieldName
  );
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// PUT /api/tags/field/:datasetId/:fieldName (legacy route for datasets)
router.put('/field/:datasetId/:fieldName', asyncHandler(async (req, res) => {
  const { datasetId, fieldName } = req.params;
  const updates = req.body;
  
  logger.info(`Updating field metadata for ${fieldName} in dataset ${datasetId}`);
  
  const metadata = await fieldMetadataService.updateFieldMetadata(
    datasetId,
    fieldName,
    updates
  );
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// PUT /api/tags/field/:sourceType/:sourceId/:fieldName (new flexible route)
router.put('/field/:sourceType/:sourceId/:fieldName', asyncHandler(async (req, res) => {
  const { sourceType, sourceId, fieldName } = req.params;
  const updates = req.body;
  
  // Validate source type
  if (!['dataset', 'analysis', 'dashboard'].includes(sourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid source type. Must be dataset, analysis, or dashboard',
    });
  }
  
  logger.info(`Updating field metadata for ${fieldName} in ${sourceType} ${sourceId}`);
  
  const metadata = await fieldMetadataService.updateFieldMetadata(
    sourceType as 'dataset' | 'analysis' | 'dashboard',
    sourceId,
    fieldName,
    updates
  );
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// POST /api/tags/field/:datasetId/:fieldName/tags (legacy route for datasets)
router.post('/field/:datasetId/:fieldName/tags', asyncHandler(async (req, res) => {
  const { datasetId, fieldName } = req.params;
  const { tags } = req.body;
  
  if (!Array.isArray(tags)) {
    return res.status(400).json({
      success: false,
      error: 'Tags must be an array',
    });
  }
  
  logger.info(`Adding ${tags.length} tags to field ${fieldName} in dataset ${datasetId}`);
  
  await fieldMetadataService.addFieldTags(datasetId, fieldName, tags);
  
  res.json({
    success: true,
    message: `Added ${tags.length} tags to field`,
  });
}));

// POST /api/tags/field/:sourceType/:sourceId/:fieldName/tags (new flexible route)
router.post('/field/:sourceType/:sourceId/:fieldName/tags', asyncHandler(async (req, res) => {
  const { sourceType, sourceId, fieldName } = req.params;
  const { tags } = req.body;
  
  // Validate source type
  if (!['dataset', 'analysis', 'dashboard'].includes(sourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid source type. Must be dataset, analysis, or dashboard',
    });
  }
  
  if (!Array.isArray(tags)) {
    return res.status(400).json({
      success: false,
      error: 'Tags must be an array',
    });
  }
  
  logger.info(`Adding ${tags.length} tags to field ${fieldName} in ${sourceType} ${sourceId}`);
  
  await fieldMetadataService.addFieldTags(
    sourceType as 'dataset' | 'analysis' | 'dashboard',
    sourceId,
    fieldName,
    tags
  );
  
  res.json({
    success: true,
    message: `Added ${tags.length} tags to field`,
  });
}));

// DELETE /api/tags/field/:datasetId/:fieldName/tags (legacy route for datasets)
router.delete('/field/:datasetId/:fieldName/tags', asyncHandler(async (req, res) => {
  const { datasetId, fieldName } = req.params;
  const { tagKeys } = req.body;
  
  if (!Array.isArray(tagKeys)) {
    return res.status(400).json({
      success: false,
      error: 'Tag keys must be an array',
    });
  }
  
  logger.info(`Removing ${tagKeys.length} tags from field ${fieldName} in dataset ${datasetId}`);
  
  await fieldMetadataService.removeFieldTags(datasetId, fieldName, tagKeys);
  
  res.json({
    success: true,
    message: `Removed ${tagKeys.length} tags from field`,
  });
}));

// DELETE /api/tags/field/:sourceType/:sourceId/:fieldName/tags (new flexible route)
router.delete('/field/:sourceType/:sourceId/:fieldName/tags', asyncHandler(async (req, res) => {
  const { sourceType, sourceId, fieldName } = req.params;
  const { tagKeys } = req.body;
  
  // Validate source type
  if (!['dataset', 'analysis', 'dashboard'].includes(sourceType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid source type. Must be dataset, analysis, or dashboard',
    });
  }
  
  if (!Array.isArray(tagKeys)) {
    return res.status(400).json({
      success: false,
      error: 'Tag keys must be an array',
    });
  }
  
  logger.info(`Removing ${tagKeys.length} tags from field ${fieldName} in ${sourceType} ${sourceId}`);
  
  await fieldMetadataService.removeFieldTags(
    sourceType as 'dataset' | 'analysis' | 'dashboard',
    sourceId,
    fieldName,
    tagKeys
  );
  
  res.json({
    success: true,
    message: `Removed ${tagKeys.length} tags from field`,
  });
}));

// GET /api/tags/field/dataset/:datasetId (legacy route for datasets)
router.get('/field/dataset/:datasetId', asyncHandler(async (req, res) => {
  const { datasetId } = req.params;
  
  logger.info(`Getting all field metadata for dataset ${datasetId}`);
  
  const metadata = await fieldMetadataService.getAllFieldsMetadata(datasetId);
  
  res.json({
    success: true,
    data: metadata,
  });
}));



// Test endpoint for debugging
router.get('/test/:resourceType/:resourceId', asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  
  try {
    // Test getting tags
    const tags = await tagService.getResourceTags(
      resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource',
      resourceId
    );
    
    // Test adding a tag
    const testTag = { key: 'TestKey', value: 'TestValue' };
    await tagService.tagResource(
      resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource',
      resourceId,
      [testTag]
    );
    
    // Get tags again
    const updatedTags = await tagService.getResourceTags(
      resourceType as 'dashboard' | 'analysis' | 'dataset' | 'datasource',
      resourceId
    );
    
    res.json({
      success: true,
      data: {
        originalTags: tags,
        addedTag: testTag,
        updatedTags: updatedTags,
        accountId: process.env.AWS_ACCOUNT_ID,
        region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error
    });
  }
}));

export { router as tagRoutes };