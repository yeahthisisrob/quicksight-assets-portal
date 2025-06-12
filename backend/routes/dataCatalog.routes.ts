import { Router } from 'express';
import { DataCatalogService } from '../services/dataCatalog.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const dataCatalogService = new DataCatalogService();

// GET /api/data-catalog
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Building data catalog');
  
  const catalog = await dataCatalogService.buildDataCatalog();
  
  res.json({
    success: true,
    data: catalog,
  });
}));

export { router as dataCatalogRoutes };