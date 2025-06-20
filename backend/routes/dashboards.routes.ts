import { Router } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { MetricsService } from '../services/metrics.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const dashboardService = new DashboardService();
const metricsService = new MetricsService();

// GET /api/dashboards
router.get('/', asyncHandler(async (req, res) => {
  const includeMetrics = req.query.includeMetrics !== 'false';
  
  console.log('Fetching dashboards...');
  
  try {
    const dashboards = await dashboardService.listAllDashboards();
  
    if (includeMetrics) {
      const dashboardsWithMetrics = await Promise.all(
        dashboards.map(async (dashboard) => {
          const usage = await metricsService.getDashboardUsage(dashboard.dashboardArn);
          return { ...dashboard, usage };
        }),
      );
      
      res.json({
        success: true,
        data: dashboardsWithMetrics,
      });
    } else {
      res.json({
        success: true,
        data: dashboards,
      });
    }
  } catch (error) {
    console.error('Error in dashboards route:', error);
    throw error;
  }
}));

// GET /api/dashboards/:dashboardId
router.get('/:dashboardId', asyncHandler(async (req, res) => {
  const { dashboardId } = req.params;
  
  const dashboard = await dashboardService.getDashboard(dashboardId);
  
  if (!dashboard) {
    return res.status(404).json({
      success: false,
      error: 'Dashboard not found',
    });
  }
  
  const usage = await metricsService.getDashboardUsage(dashboard.dashboardArn);
  
  res.json({
    success: true,
    data: { ...dashboard, usage },
  });
}));

export { router as dashboardRoutes };