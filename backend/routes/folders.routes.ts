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

// POST /api/folders/:folderId/members
router.post('/:folderId/members', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const { MemberType, MemberId } = req.body;
  
  logger.info(`Adding member to folder ${folderId}`, { MemberType, MemberId });
  
  // Validate input
  if (!MemberType || !MemberId) {
    return res.status(400).json({
      success: false,
      error: 'MemberType and MemberId are required',
    });
  }
  
  // Validate member type
  const validTypes = ['DASHBOARD', 'ANALYSIS', 'DATASET'];
  if (!validTypes.includes(MemberType.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid MemberType. Must be DASHBOARD, ANALYSIS, or DATASET',
    });
  }
  
  try {
    // Add the asset to the QuickSight folder
    await foldersService.addMemberToFolder(folderId, MemberType, MemberId);
    
    res.json({
      success: true,
      message: `Added ${MemberType} ${MemberId} to folder ${folderId}`,
    });
  } catch (error: any) {
    logger.error('Error adding member to folder:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add member to folder',
    });
  }
}));

// GET /api/folders/:folderId/members
router.get('/:folderId/members', asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  
  logger.info(`Getting members for folder ${folderId}`);
  
  try {
    // Get folder members from QuickSight
    const members = await foldersService.getFolderMembers(folderId);
    
    res.json({
      success: true,
      data: members,
    });
  } catch (error: any) {
    logger.error('Error getting folder members:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get folder members',
    });
  }
}));

// DELETE /api/folders/:folderId/members/:memberId
router.delete('/:folderId/members/:memberId', asyncHandler(async (req, res) => {
  const { folderId, memberId } = req.params;
  const { memberType } = req.query;
  
  logger.info(`Removing member ${memberId} from folder ${folderId}`, { memberType });
  
  if (!memberType) {
    return res.status(400).json({
      success: false,
      error: 'memberType query parameter is required',
    });
  }
  
  try {
    // Remove the asset from the QuickSight folder
    await foldersService.removeMemberFromFolder(folderId, memberId, memberType.toString());
    
    res.json({
      success: true,
      message: `Removed ${memberType} ${memberId} from folder ${folderId}`,
    });
  } catch (error: any) {
    logger.error('Error removing member from folder:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove member from folder',
    });
  }
}));

export { router as foldersRoutes };