import { Router } from 'express';
import { AssetExportOrchestrator } from '../services/export/AssetExportOrchestrator';
import { AssetParserService } from '../services/assetParser.service';
import { DataCatalogService } from '../services/dataCatalog.service';
import { TagService } from '../services/tag.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const assetExportService = new AssetExportOrchestrator();
const assetParserService = new AssetParserService();
const dataCatalogService = new DataCatalogService();
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
  
  // Start export session first
  const sessionId = await assetExportService.startExportSession();
  
  // Start the export process asynchronously
  // exportAllAssets will use the existing session
  assetExportService.exportAllAssets(forceRefresh)
    .then(result => {
      logger.info('Export all completed', result);
    })
    .catch(error => {
      logger.error('Export all failed', error);
    });
  
  // Return immediately with session info
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      message: 'Export started. Use the session ID to track progress.',
    },
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

// GET /api/assets/export/sessions/recent - Get recent export sessions
router.get('/export/sessions/recent', asyncHandler(async (req, res) => {
  const sessions = await assetExportService.getRecentSessions();
  
  res.json({
    success: true,
    data: sessions,
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
  
  // Start a session first (only for dashboards)
  const sessionId = await assetExportService.startExportSession(['dashboards']);
  
  // Start the export asynchronously and return immediately
  assetExportService.exportDashboardsWithProgress(forceRefresh, sessionId)
    .then(async result => {
      logger.info('Dashboard export completed', result);
      // Skip index/catalog rebuilding for individual exports to reduce noise
      // These will be rebuilt when the session is completed via /export/complete endpoint
    })
    .catch(error => {
      logger.error('Dashboard export failed', error);
    });
  
  // Return immediately with the current session info
  const progress = assetExportService.getCurrentProgress();
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      progress: progress?.dashboards || { status: 'running', current: 0, total: 0 },
    },
  });
}));

// POST /api/assets/export/datasets - Export datasets only
router.post('/export/datasets', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting dataset export', { forceRefresh });
  
  // Start a session first (only for datasets)
  const sessionId = await assetExportService.startExportSession(['datasets']);
  
  // Start the export asynchronously and return immediately
  assetExportService.exportDatasetsWithProgress(forceRefresh, sessionId)
    .then(async result => {
      logger.info('Dataset export completed', result);
      // Skip index/catalog rebuilding for individual exports to reduce noise
      // These will be rebuilt when the session is completed via /export/complete endpoint
    })
    .catch(error => {
      logger.error('Dataset export failed', error);
    });
  
  // Return immediately with the current session info
  const progress = assetExportService.getCurrentProgress();
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      progress: progress?.datasets || { status: 'running', current: 0, total: 0 },
    },
  });
}));

// POST /api/assets/export/analyses - Export analyses only
router.post('/export/analyses', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting analysis export', { forceRefresh });
  
  // Start a session first (only for analyses)
  const sessionId = await assetExportService.startExportSession(['analyses']);
  
  // Start the export asynchronously and return immediately
  assetExportService.exportAnalysesWithProgress(forceRefresh, sessionId)
    .then(async result => {
      logger.info('Analysis export completed', result);
      // Skip index/catalog rebuilding for individual exports to reduce noise
      // These will be rebuilt when the session is completed via /export/complete endpoint
    })
    .catch(error => {
      logger.error('Analysis export failed', error);
    });
  
  // Return immediately with the current session info
  const progress = assetExportService.getCurrentProgress();
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      progress: progress?.analyses || { status: 'running', current: 0, total: 0 },
    },
  });
}));

// POST /api/assets/export/datasources - Export datasources only
router.post('/export/datasources', asyncHandler(async (req, res) => {
  const { forceRefresh = false } = req.body;
  
  logger.info('Starting datasource export', { forceRefresh });
  
  // Start a session first (only for datasources)
  const sessionId = await assetExportService.startExportSession(['datasources']);
  
  // Start the export asynchronously and return immediately
  assetExportService.exportDatasourcesWithProgress(forceRefresh, sessionId)
    .then(async result => {
      logger.info('Datasource export completed', result);
      // Skip index/catalog rebuilding for individual exports to reduce noise
      // These will be rebuilt when the session is completed via /export/complete endpoint
    })
    .catch(error => {
      logger.error('Datasource export failed', error);
    });
  
  // Return immediately with the current session info
  const progress = assetExportService.getCurrentProgress();
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      progress: progress?.datasources || { status: 'running', current: 0, total: 0 },
    },
  });
}));

// POST /api/assets/rebuild-index - Rebuild index and catalog from existing exported data
router.post('/rebuild-index', asyncHandler(async (req, res) => {
  logger.info('Starting index and catalog rebuild');
  
  // Start a session for the rebuild process (use empty array for non-asset exports)
  const sessionId = await assetExportService.startExportSession([]);
  
  // Start the rebuild process asynchronously
  (async () => {
    try {
      // Update session progress
      assetExportService.updateProgress('rebuild', {
        status: 'running',
        current: 0,
        total: 2,
        message: 'Starting index rebuild...',
      });
      
      // 1. Rebuild asset index
      logger.info('Rebuilding asset index...');
      assetExportService.updateProgress('rebuild', {
        status: 'running',
        current: 1,
        total: 2,
        message: 'Rebuilding asset index...',
      });
      
      const indexResult = await assetExportService.rebuildAssetIndex();
      logger.info('Asset index rebuilt successfully', {
        totalAssets: indexResult.totalAssets,
        assetTypes: indexResult.assetTypes,
      });
      
      // 2. Rebuild data catalog
      logger.info('Rebuilding data catalog...');
      assetExportService.updateProgress('rebuild', {
        status: 'running',
        current: 2,
        total: 2,
        message: 'Rebuilding data catalog...',
      });
      
      const catalogResult = await dataCatalogService.buildDataCatalog();
      logger.info('Data catalog rebuilt successfully', {
        fields: catalogResult.fields?.length || 0,
        calculatedFields: catalogResult.calculatedFields?.length || 0,
        totalDatasets: catalogResult.summary?.totalDatasets || 0,
      });
      
      // Mark session as completed
      await assetExportService.completeExportSession({
        dashboards: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
        datasets: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
        analyses: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
        datasources: { total: 0, updated: 0, cached: 0, errors: 0, errorDetails: [] },
        exportTime: new Date().toISOString(),
        duration: 0,
      });
      
      assetExportService.updateProgress('rebuild', {
        status: 'completed',
        current: 2,
        total: 2,
        message: 'Index and catalog rebuild completed',
        stats: {
          updated: 2,
          cached: 0,
          errors: 0,
        },
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Index rebuild failed', error);
      assetExportService.updateProgress('rebuild', {
        status: 'error',
        current: 0,
        total: 2,
        message: `Rebuild failed: ${errorMessage}`,
        stats: {
          updated: 0,
          cached: 0,
          errors: 1,
        },
      });
    }
  })();
  
  // Return immediately with session info
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'started',
      message: 'Index and catalog rebuild started',
    },
  });
}));

// POST /api/assets/refresh-tags - Refresh tags for multiple assets
router.post('/refresh-tags', asyncHandler(async (req, res) => {
  const { assetType, assetIds } = req.body;
  
  if (!assetType || !assetIds || !Array.isArray(assetIds)) {
    return res.status(400).json({
      success: false,
      error: 'assetType and assetIds array are required',
    });
  }
  
  if (!['dashboards', 'datasets', 'analyses', 'datasources'].includes(assetType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid asset type',
    });
  }
  
  logger.info(`Refreshing tags for ${assetIds.length} ${assetType}s`);
  
  const results = await Promise.allSettled(
    assetIds.map(assetId => 
      assetExportService.refreshAssetTags(
        assetType as 'dashboards' | 'datasets' | 'analyses' | 'datasources',
        assetId,
      ),
    ),
  );
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  res.json({
    success: true,
    data: {
      successful,
      failed,
      total: assetIds.length,
    },
  });
}));

// GET /api/assets/dashboards/paginated - Get paginated dashboards with full info
router.get('/dashboards/paginated', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
  } = req.query;
  
  logger.info('Fetching paginated dashboards', { page, pageSize, search });
  
  try {
    // Try to use optimized index first
    let dashboards: any[] = [];
    try {
      const index = await assetExportService.getMetadataService().getMetadata('assets/index/master-index.json');
      if (index && index.assetsByType?.dashboards) {
        dashboards = index.assetsByType.dashboards;
        logger.info(`Using optimized index with ${dashboards.length} dashboards`);
      }
    } catch (error) {
      logger.info('No optimized index found, falling back to getAllAssets');
      // Fall back to old method
      const allAssets = await assetExportService.getAllAssets();
      dashboards = allAssets.assets.filter(asset => asset.type === 'dashboard');
    }
    
    // Apply search filter
    if (search) {
      const searchLower = String(search).toLowerCase();
      dashboards = dashboards.filter(dashboard => 
        dashboard.name.toLowerCase().includes(searchLower) ||
        dashboard.id.toLowerCase().includes(searchLower),
      );
    }
    
    // Calculate pagination
    const totalItems = dashboards.length;
    const totalPages = Math.ceil(totalItems / Number(pageSize));
    const startIndex = (Number(page) - 1) * Number(pageSize);
    const endIndex = startIndex + Number(pageSize);
    
    // Get paginated items - already have all needed data from export
    const paginatedDashboards = dashboards.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        dashboards: paginatedDashboards,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalItems,
          totalPages,
          hasMore: endIndex < totalItems,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching paginated dashboards:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboards',
    });
  }
}));

// GET /api/assets/analyses/paginated - Get paginated analyses with full info
router.get('/analyses/paginated', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
  } = req.query;
  
  logger.info('Fetching paginated analyses', { page, pageSize, search });
  
  try {
    // Try to use optimized index first
    let analyses: any[] = [];
    try {
      const index = await assetExportService.getMetadataService().getMetadata('assets/index/master-index.json');
      if (index && index.assetsByType?.analyses) {
        analyses = index.assetsByType.analyses;
        logger.info(`Using optimized index with ${analyses.length} analyses`);
      }
    } catch (error) {
      logger.info('No optimized index found, falling back to getAllAssets');
      // Fall back to old method
      const allAssets = await assetExportService.getAllAssets();
      analyses = allAssets.assets.filter(asset => asset.type === 'analysis');
    }
    
    // Apply search filter
    if (search) {
      const searchLower = String(search).toLowerCase();
      analyses = analyses.filter(analysis => 
        analysis.name.toLowerCase().includes(searchLower) ||
        analysis.id.toLowerCase().includes(searchLower),
      );
    }
    
    // Calculate pagination
    const totalItems = analyses.length;
    const totalPages = Math.ceil(totalItems / Number(pageSize));
    const startIndex = (Number(page) - 1) * Number(pageSize);
    const endIndex = startIndex + Number(pageSize);
    
    // Get paginated items - already have all needed data from export
    const paginatedAnalyses = analyses.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        analyses: paginatedAnalyses,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalItems,
          totalPages,
          hasMore: endIndex < totalItems,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching paginated analyses:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analyses',
    });
  }
}));

// GET /api/assets/datasources/paginated - Get paginated datasources with full info
router.get('/datasources/paginated', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
  } = req.query;
  
  logger.info('Fetching paginated datasources', { page, pageSize, search });
  
  try {
    // Try to use optimized index first
    let datasources: any[] = [];
    try {
      const index = await assetExportService.getMetadataService().getMetadata('assets/index/master-index.json');
      if (index && index.assetsByType?.datasources) {
        datasources = index.assetsByType.datasources;
        logger.info(`Using optimized index with ${datasources.length} datasources`);
      }
    } catch (error) {
      logger.info('No optimized index found, falling back to getAllAssets');
      // Fall back to old method
      const allAssets = await assetExportService.getAllAssets();
      datasources = allAssets.assets.filter(asset => asset.type === 'datasource');
    }
    
    // Apply search filter
    if (search) {
      const searchLower = String(search).toLowerCase();
      datasources = datasources.filter(datasource => 
        datasource.name.toLowerCase().includes(searchLower) ||
        datasource.id.toLowerCase().includes(searchLower),
      );
    }
    
    // Calculate pagination
    const totalItems = datasources.length;
    const totalPages = Math.ceil(totalItems / Number(pageSize));
    const startIndex = (Number(page) - 1) * Number(pageSize);
    const endIndex = startIndex + Number(pageSize);
    
    // Get paginated items - already have all needed data from export
    const paginatedDatasources = datasources.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        datasources: paginatedDatasources,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalItems,
          totalPages,
          hasMore: endIndex < totalItems,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching paginated datasources:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch datasources',
    });
  }
}));

// POST /api/assets/export/cancel - Cancel the export session
router.post('/export/cancel', asyncHandler(async (req, res) => {
  logger.info('Cancelling export session');
  
  try {
    await assetExportService.cancelExportSession();
    
    res.json({
      success: true,
      message: 'Export session cancelled',
    });
  } catch (error: any) {
    logger.error('Failed to cancel export session:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel export session',
    });
  }
}));

// POST /api/assets/index/rebuild - Rebuild the asset index
router.post('/index/rebuild', asyncHandler(async (req, res) => {
  logger.info('Manually triggering asset index rebuild');
  
  try {
    await assetExportService.rebuildAssetIndex();
    
    res.json({
      success: true,
      message: 'Asset index rebuilt successfully',
    });
  } catch (error: any) {
    logger.error('Failed to rebuild asset index:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to rebuild asset index',
    });
  }
}));

// POST /api/assets/export/complete - Complete the export session
router.post('/export/complete', asyncHandler(async (req, res) => {
  const { summary } = req.body;
  
  // Complete the session with the provided summary (or null to use existing)
  await assetExportService.completeExportSession(summary);
  
  // If no summary was provided (progressive export), rebuild export summary
  if (!summary) {
    logger.info('No summary provided, rebuilding export summary for progressive export...');
    try {
      await assetExportService.rebuildExportSummary();
      logger.info('Export summary rebuilt after progressive export completion');
    } catch (error) {
      logger.error('Failed to rebuild export summary:', error);
    }
  }
  
  // Build data catalog after export completes
  logger.info('Building data catalog after export completion...');
  try {
    await dataCatalogService.buildDataCatalog();
    logger.info('Data catalog built successfully');
  } catch (error) {
    logger.error('Failed to build data catalog after export:', error);
    // Don't fail the export completion if catalog build fails
  }
  
  res.json({
    success: true,
    message: 'Export session completed',
  });
}));

// GET /api/assets/datasets/paginated - Get paginated datasets with full info
router.get('/datasets/paginated', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
  } = req.query;
  
  logger.info('Fetching paginated datasets', { page, pageSize, search });
  
  try {
    // Try to use optimized index first
    let datasets: any[] = [];
    try {
      const index = await assetExportService.getMetadataService().getMetadata('assets/index/master-index.json');
      if (index && index.assetsByType?.datasets) {
        datasets = index.assetsByType.datasets;
        logger.info(`Using optimized index with ${datasets.length} datasets`);
      }
    } catch (error) {
      logger.info('No optimized index found, falling back to getAllAssets');
      // Fall back to old method
      const allAssets = await assetExportService.getAllAssets();
      datasets = allAssets.assets.filter(asset => asset.type === 'dataset');
    }
    
    // Apply search filter
    if (search) {
      const searchLower = String(search).toLowerCase();
      datasets = datasets.filter(dataset => 
        dataset.name.toLowerCase().includes(searchLower) ||
        dataset.id.toLowerCase().includes(searchLower),
      );
    }
    
    // Calculate pagination
    const totalItems = datasets.length;
    const totalPages = Math.ceil(totalItems / Number(pageSize));
    const startIndex = (Number(page) - 1) * Number(pageSize);
    const endIndex = startIndex + Number(pageSize);
    
    // Get paginated items
    const paginatedDatasets = datasets.slice(startIndex, endIndex);
    
    // Return datasets as-is from cache - they should already have all needed data
    // This avoids making individual parse requests for each dataset
    const enrichedDatasets = paginatedDatasets.map(dataset => ({
      ...dataset,
      // Ensure these fields exist with defaults
      datasourceType: dataset.datasourceType || 'Unknown',
      importMode: dataset.importMode || undefined,
      tags: dataset.tags || [],
      fields: dataset.fieldCount || 0,
      calculatedFields: dataset.calculatedFieldCount || 0,
      permissions: dataset.permissions || [],
    }));
    
    res.json({
      success: true,
      data: {
        datasets: enrichedDatasets,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalItems,
          totalPages,
          hasMore: endIndex < totalItems,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching paginated datasets:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch datasets',
    });
  }
}));

// GET /api/assets/all
router.get('/all', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
    assetType = '', // Filter by asset type
  } = req.query;
  
  const allAssets = await assetExportService.getAllAssets();
  let assets = allAssets.assets;
  
  // Filter by asset type if specified
  if (assetType) {
    assets = assets.filter(asset => asset.type === assetType);
  }
  
  // Apply search filter
  if (search) {
    const searchLower = String(search).toLowerCase();
    assets = assets.filter(asset => 
      asset.name.toLowerCase().includes(searchLower) ||
      asset.id.toLowerCase().includes(searchLower) ||
      asset.type.toLowerCase().includes(searchLower),
    );
  }
  
  // Calculate pagination
  const totalItems = assets.length;
  const totalPages = Math.ceil(totalItems / Number(pageSize));
  const startIndex = (Number(page) - 1) * Number(pageSize);
  const endIndex = startIndex + Number(pageSize);
  
  // Get paginated items
  const paginatedAssets = assets.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: {
      assets: paginatedAssets,
      summary: allAssets.summary,
      totalSize: allAssets.totalSize,
      assetCounts: allAssets.summary?.types || {
        dashboards: 0,
        datasets: 0,
        analyses: 0,
        datasources: 0,
      },
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalItems,
        totalPages,
        hasMore: endIndex < totalItems,
      },
    },
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
        asset.id,
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
    assetId,
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
    assetId,
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