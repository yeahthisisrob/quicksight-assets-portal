import { Router } from 'express';
import { LineageService } from '../services/lineage.service';
import { AssetExportOrchestrator } from '../services/export/AssetExportOrchestrator';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const lineageService = new LineageService();
const assetExportService = new AssetExportOrchestrator();

// GET /api/lineage/all
router.get('/all', asyncHandler(async (req, res) => {
  logger.info('Getting all asset lineage');
  
  const lineage = await lineageService.getAllLineage();
  
  res.json({
    success: true,
    data: lineage,
  });
}));

// GET /api/lineage/:assetId
router.get('/:assetId', asyncHandler(async (req, res) => {
  const { assetId } = req.params;
  
  logger.info(`Getting lineage for asset ${assetId}`);
  
  const lineage = await lineageService.getAssetLineage(assetId);
  
  if (!lineage) {
    return res.status(404).json({
      success: false,
      error: 'Asset lineage not found',
    });
  }
  
  res.json({
    success: true,
    data: lineage,
  });
}));

// GET /api/lineage/debug - Debug endpoint to check asset structures
router.get('/debug', asyncHandler(async (req, res) => {
  logger.info('Debug: Getting sample asset structures');
  
  try {
    const allAssets = await assetExportService.getAllAssets();
    const debugInfo: any = {
      assetsCount: allAssets.assets.length,
      assetTypes: {},
      sampleStructures: {},
    };
    
    // Count asset types
    for (const asset of allAssets.assets) {
      debugInfo.assetTypes[asset.type] = (debugInfo.assetTypes[asset.type] || 0) + 1;
    }
    
    // Get sample structures for each type
    for (const assetType of ['dashboard', 'analysis', 'dataset', 'datasource']) {
      const sampleAsset = allAssets.assets.find((a: any) => a.type === assetType);
      if (sampleAsset) {
        const assetData = await assetExportService.getAsset(`${assetType}s` as any, sampleAsset.id);
        if (assetData) {
          debugInfo.sampleStructures[assetType] = {
            id: sampleAsset.id,
            name: sampleAsset.name,
            hasDefinition: !!assetData.Definition,
            hasDataSetIdentifierMap: !!assetData.Definition?.DataSetIdentifierMap,
            dataSetIdentifierMap: assetData.Definition?.DataSetIdentifierMap ? Object.keys(assetData.Definition.DataSetIdentifierMap) : [],
            dashboardSourceEntity: assetData.Dashboard?.SourceEntity,
            datasetPhysicalTableMap: assetData.DataSet?.PhysicalTableMap ? Object.keys(assetData.DataSet.PhysicalTableMap) : [],
            structure: {
              topLevelKeys: Object.keys(assetData),
              definitionKeys: assetData.Definition ? Object.keys(assetData.Definition) : [],
              dashboardKeys: assetData.Dashboard ? Object.keys(assetData.Dashboard) : [],
              datasetKeys: assetData.DataSet ? Object.keys(assetData.DataSet) : [],
              analysisKeys: assetData.Analysis ? Object.keys(assetData.Analysis) : [],
              datasourceKeys: assetData.DataSource ? Object.keys(assetData.DataSource) : [],
            },
          };
        }
      }
    }
    
    res.json({
      success: true,
      data: debugInfo,
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));

export { router as lineageRoutes };