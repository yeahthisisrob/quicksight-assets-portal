import { Router } from 'express';
import { AssetExportService } from '../services/assetExport.service';
import { AssetParserService } from '../services/assetParser.service';
import { TagService } from '../services/tag.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const assetExportService = new AssetExportService();
const assetParserService = new AssetParserService();
const tagService = new TagService();

// GET /api/assets/export-summary
router.get('/export-summary', asyncHandler(async (req, res) => {
  const summary = await assetExportService.getExportSummary();
  
  res.json({
    success: true,
    data: summary,
  });
}));

// POST /api/assets/export
router.post('/export', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting asset export', { forceRefresh });
  
  // Start the export process
  const result = await assetExportService.exportAllAssets(forceRefresh);
  
  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/assets/export/start - Start a new export session
router.post('/export/start', asyncHandler(async (req, res) => {
  const sessionId = await assetExportService.startExportSession();
  
  res.json({
    success: true,
    data: { sessionId },
  });
}));

// GET /api/assets/export/session/:sessionId - Get export session status
router.get('/export/session/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const session = await assetExportService.getExportSession(sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }
  
  res.json({
    success: true,
    data: session,
  });
}));

// GET /api/assets/export/progress - Get current export progress
router.get('/export/progress', asyncHandler(async (req, res) => {
  const progress = await assetExportService.getCurrentProgress();
  
  res.json({
    success: true,
    data: progress,
  });
}));

// POST /api/assets/export/dashboards - Export dashboards only
router.post('/export/dashboards', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting dashboard export', { forceRefresh });
  
  const result = await assetExportService.exportDashboardsWithProgress(forceRefresh);
  
  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/assets/export/datasets - Export datasets only
router.post('/export/datasets', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting dataset export', { forceRefresh });
  
  const result = await assetExportService.exportDatasetsWithProgress(forceRefresh);
  
  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/assets/export/analyses - Export analyses only
router.post('/export/analyses', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting analysis export', { forceRefresh });
  
  const result = await assetExportService.exportAnalysesWithProgress(forceRefresh);
  
  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/assets/export/datasources - Export datasources only
router.post('/export/datasources', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting datasource export', { forceRefresh });
  
  const result = await assetExportService.exportDatasourcesWithProgress(forceRefresh);
  
  res.json({
    success: true,
    data: result,
  });
}));

// POST /api/assets/export/complete - Complete the export session
router.post('/export/complete', asyncHandler(async (req, res) => {
  const { summary } = req.body;
  
  await assetExportService.completeExportSession(summary);
  
  res.json({
    success: true,
    message: 'Export session completed',
  });
}));

// GET /api/assets/all
router.get('/all', asyncHandler(async (req, res) => {
  const assets = await assetExportService.getAllAssets();
  
  res.json({
    success: true,
    data: assets,
  });
}));

// POST /api/assets/tags/batch - Get live tags for multiple assets
router.post('/tags/batch', asyncHandler(async (req, res) => {
  const { assets } = req.body;
  
  if (!Array.isArray(assets)) {
    return res.status(400).json({
      success: false,
      error: 'Assets must be an array of { type, id } objects',
    });
  }
  
  logger.info(`Fetching live tags for ${assets.length} assets`);
  
  // Fetch tags for all assets in parallel
  const tagPromises = assets.map(async (asset: { type: string; id: string }) => {
    try {
      const tags = await tagService.getResourceTags(
        asset.type as 'dashboard' | 'analysis' | 'dataset' | 'datasource' | 'folder',
        asset.id
      );
      return {
        assetId: asset.id,
        assetType: asset.type,
        tags,
        error: null,
      };
    } catch (error: any) {
      logger.error(`Error fetching tags for ${asset.type} ${asset.id}:`, error.message);
      return {
        assetId: asset.id,
        assetType: asset.type,
        tags: [],
        error: error.message,
      };
    }
  });
  
  const results = await Promise.all(tagPromises);
  
  res.json({
    success: true,
    data: results,
  });
}));

// GET /api/assets/:assetType/:assetId
router.get('/:assetType/:assetId', asyncHandler(async (req, res) => {
  const { assetType, assetId } = req.params;
  
  if (!['dashboards', 'datasets', 'analyses', 'datasources'].includes(assetType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid asset type. Must be dashboards, datasets, analyses, or datasources.',
    });
  }
  
  const asset = await assetExportService.getAsset(
    assetType as 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    assetId
  );
  
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: 'Asset not found',
    });
  }
  
  res.json({
    success: true,
    data: asset,
  });
}));

// GET /api/assets/:assetType/:assetId/parse
router.get('/:assetType/:assetId/parse', asyncHandler(async (req, res) => {
  const { assetType, assetId } = req.params;
  
  if (!['dashboards', 'datasets', 'analyses', 'datasources'].includes(assetType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid asset type. Must be dashboards, datasets, analyses, or datasources.',
    });
  }
  
  // Get the asset data
  const asset = await assetExportService.getAsset(
    assetType as 'dashboards' | 'datasets' | 'analyses' | 'datasources',
    assetId
  );
  
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: 'Asset not found',
    });
  }
  
  // Parse based on type
  let parsedInfo;
  if (assetType === 'dashboards') {
    parsedInfo = assetParserService.parseDashboard(asset);
  } else if (assetType === 'analyses') {
    parsedInfo = assetParserService.parseAnalysis(asset);
  } else if (assetType === 'datasets') {
    parsedInfo = assetParserService.parseDataset(asset);
  } else if (assetType === 'datasources') {
    parsedInfo = assetParserService.parseDatasource(asset);
  }
  
  res.json({
    success: true,
    data: {
      assetType: assetType.slice(0, -1), // Remove 's'
      assetId,
      assetName: asset['@metadata']?.name || asset.Dashboard?.Name || asset.DataSet?.Name || asset.Analysis?.Name || asset.DataSource?.Name,
      parsed: parsedInfo,
    },
  });
}));

export { router as assetsRoutes };