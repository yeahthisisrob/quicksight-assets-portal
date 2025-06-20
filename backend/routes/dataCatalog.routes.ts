import { Router } from 'express';
import { DataCatalogService } from '../services/dataCatalog.service';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
const dataCatalogService = new DataCatalogService();

// GET /api/data-catalog
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 50, 
    search = '',
    viewMode = 'all', // all, fields, calculated
    sortBy = 'fieldName', // fieldName, usageCount, isCalculated, sources
    sortOrder = 'asc', // asc, desc
  } = req.query;
  
  logger.info('Building data catalog', { page, pageSize, search, viewMode, sortBy, sortOrder });
  
  const catalog = await dataCatalogService.buildDataCatalog();
  logger.info('Catalog built', { 
    fieldsCount: catalog?.fields?.length || 0, 
    calculatedFieldsCount: catalog?.calculatedFields?.length || 0,
    hasFields: !!catalog?.fields,
    hasCatalog: !!catalog,
  });
  
  // Check if catalog exists and has data
  if (!catalog || !catalog.fields || !catalog.calculatedFields) {
    logger.info('No catalog data available - no assets have been exported yet');
    return res.json({
      success: true,
      data: {
        items: [],
        summary: {
          totalFields: 0,
          totalCalculatedFields: 0,
          totalDatasets: 0,
          totalAnalyses: 0,
          totalDashboards: 0,
          lastUpdated: new Date(),
        },
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalItems: 0,
          totalPages: 0,
          hasMore: false,
        },
      },
    });
  }
  
  // Filter based on viewMode and search
  let allItems = [...catalog.fields, ...catalog.calculatedFields];
  
  if (viewMode === 'fields') {
    allItems = catalog.fields;
  } else if (viewMode === 'calculated') {
    allItems = catalog.calculatedFields;
  }
  
  // Apply search filter
  if (search) {
    const searchLower = String(search).toLowerCase();
    allItems = allItems.filter(field => 
      field.fieldName.toLowerCase().includes(searchLower) ||
      field.fieldId.toLowerCase().includes(searchLower) ||
      (field.expression && field.expression.toLowerCase().includes(searchLower)),
    );
  }
  
  // Apply sorting across full dataset (before pagination)
  logger.info(`Applying sorting: ${sortBy} ${sortOrder} on ${allItems.length} items`);
  allItems.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortBy) {
      case 'fieldName':
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
        break;
      case 'usageCount':
        aValue = a.usageCount || 0;
        bValue = b.usageCount || 0;
        break;
      case 'isCalculated':
        aValue = a.isCalculated ? 1 : 0;
        bValue = b.isCalculated ? 1 : 0;
        break;
      case 'sources':
        aValue = a.sources?.length || 0;
        bValue = b.sources?.length || 0;
        break;
      case 'analysesCount':
        // Count analyses in sources
        aValue = a.sources?.filter(s => s.assetType === 'analysis')?.length || 0;
        bValue = b.sources?.filter(s => s.assetType === 'analysis')?.length || 0;
        break;
      case 'dashboardsCount':
        // Count dashboards in sources
        aValue = a.sources?.filter(s => s.assetType === 'dashboard')?.length || 0;
        bValue = b.sources?.filter(s => s.assetType === 'dashboard')?.length || 0;
        break;
      case 'datasetsCount':
        // Count datasets in sources
        aValue = a.sources?.filter(s => s.assetType === 'dataset')?.length || 0;
        bValue = b.sources?.filter(s => s.assetType === 'dataset')?.length || 0;
        break;
      case 'dataType':
        aValue = (a.dataType || '').toLowerCase();
        bValue = (b.dataType || '').toLowerCase();
        break;
      case 'semanticTerm':
        // This would need semantic mapping data - for now just sort by field name
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
        break;
      case 'businessName':
        // This would need semantic mapping data - for now just sort by field name  
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
        break;
      case 'category':
        // This would need semantic mapping data - for now just sort by field name
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
        break;
      case 'mappedFieldsCount':
        // This would need semantic mapping data - for now sort by 0
        aValue = 0;
        bValue = 0;
        break;
      case 'description':
        // This would need semantic mapping data - for now just sort by field name
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
        break;
      default:
        aValue = a.fieldName.toLowerCase();
        bValue = b.fieldName.toLowerCase();
    }
    
    // Handle string vs number comparison
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      if (sortOrder === 'desc') {
        return bValue.localeCompare(aValue);
      }
      return aValue.localeCompare(bValue);
    } else {
      if (sortOrder === 'desc') {
        return bValue - aValue;
      }
      return aValue - bValue;
    }
  });
  
  logger.info(`Sorting completed. First few items: ${allItems.slice(0, 3).map(item => ({ 
    fieldName: item.fieldName, 
    sortValue: sortBy === 'analysesCount' ? item.sources?.filter(s => s.assetType === 'analysis')?.length || 0 :
              sortBy === 'dashboardsCount' ? item.sources?.filter(s => s.assetType === 'dashboard')?.length || 0 :
              sortBy === 'usageCount' ? item.usageCount || 0 : 'N/A',
  })).map(item => `${item.fieldName}(${item.sortValue})`).join(', ')}`);
  
  // Calculate pagination
  const totalItems = allItems.length;
  const totalPages = Math.ceil(totalItems / Number(pageSize));
  const startIndex = (Number(page) - 1) * Number(pageSize);
  const endIndex = startIndex + Number(pageSize);
  
  // Get paginated items
  const paginatedItems = allItems.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: {
      items: paginatedItems,
      summary: catalog.summary,
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

// GET /api/data-catalog/full - Get full catalog without pagination
router.get('/full', asyncHandler(async (req, res) => {
  logger.info('Getting full data catalog');
  
  const catalog = await dataCatalogService.buildDataCatalog();
  
  if (!catalog || !catalog.fields || !catalog.calculatedFields) {
    return res.json({
      success: true,
      data: {
        fields: [],
        calculatedFields: [],
        summary: {
          totalFields: 0,
          totalCalculatedFields: 0,
          totalDatasets: 0,
          totalAnalyses: 0,
          totalDashboards: 0,
          lastUpdated: new Date(),
        },
      },
    });
  }
  
  res.json({
    success: true,
    data: catalog,
  });
}));

// POST /api/data-catalog/rebuild - Force rebuild catalog
router.post('/rebuild', asyncHandler(async (req, res) => {
  logger.info('Force rebuilding data catalog');
  
  // Clear any cache if exists and rebuild
  const catalog = await dataCatalogService.buildDataCatalog();
  
  res.json({
    success: true,
    data: {
      message: 'Catalog rebuilt successfully',
      summary: catalog.summary,
    },
  });
}));

export { router as dataCatalogRoutes };