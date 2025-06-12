import { Router } from 'express';
import { dashboardRoutes } from './dashboards.routes';
import { metadataRoutes } from './metadata.routes';
import { tagRoutes } from './tags.routes';
import { assetsRoutes } from './assets.routes';
import { dataCatalogRoutes } from './dataCatalog.routes';
import { lineageRoutes } from './lineage.routes';
import { foldersRoutes } from './folders.routes';
import { settingsRoutes } from './settings.routes';

export const router = Router();

// Mount routes
router.use('/dashboards', dashboardRoutes);
router.use('/metadata', metadataRoutes);
router.use('/tags', tagRoutes);
router.use('/assets', assetsRoutes);
router.use('/data-catalog', dataCatalogRoutes);
router.use('/lineage', lineageRoutes);
router.use('/folders', foldersRoutes);
router.use('/settings', settingsRoutes);

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'QuickSight Assets Portal API',
    endpoints: {
      dashboards: '/api/dashboards',
      metadata: '/api/metadata/:dashboardId',
      tags: '/api/tags/:dashboardId',
      assets: '/api/assets',
      dataCatalog: '/api/data-catalog',
      lineage: '/api/lineage',
      folders: '/api/folders',
    },
  });
});