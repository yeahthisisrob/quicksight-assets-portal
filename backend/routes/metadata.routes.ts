import { Router } from 'express';
import { MetadataService } from '../services/metadata.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const metadataService = new MetadataService();

// GET /api/metadata/:dashboardId
router.get('/:dashboardId', asyncHandler(async (req, res) => {
  const { dashboardId } = req.params;
  
  const metadata = await metadataService.getMetadata(dashboardId);
  
  res.json({
    success: true,
    data: metadata,
  });
}));

// POST /api/metadata/:dashboardId
router.post('/:dashboardId', asyncHandler(async (req, res) => {
  const { dashboardId } = req.params;
  const metadata = req.body;
  
  await metadataService.saveMetadata(dashboardId, metadata);
  
  res.json({
    success: true,
    data: metadata,
    message: 'Metadata updated successfully',
  });
}));

export { router as metadataRoutes };