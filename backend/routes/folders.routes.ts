import { Router } from 'express';
import { FoldersService } from '../services/folders.service';
import { TagService } from '../services/tag.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const foldersService = new FoldersService();
const tagService = new TagService();

// GET /api/folders
router.get('/', asyncHandler(async (req, res) => {
  const folders = await foldersService.listFolders();
  
  res.json({
    success: true,
    data: folders,
  });
}));

// GET /api/folders/:folderId
router.get('/:folderId', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  
  const folder = await foldersService.getFolder(folderId);
  
  if (!folder) {
    return res.status(404).json({
      success: false,
      error: 'Folder not found',
    });
  }
  
  res.json({
    success: true,
    data: folder,
  });
}));

// GET /api/folders/:folderId/metadata
router.get('/:folderId/metadata', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  
  const metadata = await foldersService.getMetadata(folderId);
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// POST /api/folders/:folderId/metadata
router.post('/:folderId/metadata', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const metadata = req.body;
  
  logger.info(`Updating metadata for folder ${folderId}`, { metadata });
  
  const updatedMetadata = await foldersService.updateMetadata(folderId, metadata);
  
  res.json({
    success: true,
    data: updatedMetadata,
  });
}));

// GET /api/folders/:folderId/tags
router.get('/:folderId/tags', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  
  const tags = await tagService.getResourceTags('folder', folderId);
  
  res.json({
    success: true,
    data: tags,
  });
}));

// POST /api/folders/:folderId/tags
router.post('/:folderId/tags', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const { tags } = req.body;
  
  logger.info(`Updating tags for folder ${folderId}`, { tags });
  
  await tagService.updateResourceTags('folder', folderId, tags);
  
  res.json({
    success: true,
    data: tags,
  });
}));

// DELETE /api/folders/:folderId/tags
router.delete('/:folderId/tags', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const { tagKeys } = req.body;
  
  logger.info(`Removing tags from folder ${folderId}`, { tagKeys });
  
  await tagService.removeResourceTags('folder', folderId, tagKeys);
  
  res.json({
    success: true,
    message: 'Tags removed successfully',
  });
}));

export { router as foldersRoutes };