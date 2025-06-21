import { AssetExportOrchestrator } from './services/export/AssetExportOrchestrator';
import { LineageService } from './services/lineage.service';
import { logger } from './utils/logger';

async function debugLineage() {
  try {
    const assetExporter = new AssetExportOrchestrator();
    const lineageService = new LineageService();
    
    // Get all assets
    const allAssets = await assetExporter.getAllAssets();
    console.log(`Found ${allAssets.assets.length} total assets`);
    
    // Find a dashboard
    const dashboard = allAssets.assets.find(a => a.type === 'dashboard');
    if (dashboard) {
      console.log(`\nChecking dashboard: ${dashboard.id} - ${dashboard.name}`);
      
      // Get the full dashboard data
      const dashboardData = await assetExporter.getAsset('dashboards', dashboard.id);
      console.log('\nDashboard data structure:');
      console.log('- Keys:', Object.keys(dashboardData || {}));
      
      if (dashboardData) {
        console.log('- Has Definition?', !!dashboardData.Definition);
        console.log('- Has DataSetIdentifierDeclarations?', !!dashboardData.Definition?.DataSetIdentifierDeclarations);
        console.log('- Has DataSetIdentifierMap?', !!dashboardData.Definition?.DataSetIdentifierMap);
        
        if (dashboardData.Definition?.DataSetIdentifierDeclarations) {
          console.log('- DataSetIdentifierDeclarations count:', dashboardData.Definition.DataSetIdentifierDeclarations.length);
          console.log('- First declaration:', JSON.stringify(dashboardData.Definition.DataSetIdentifierDeclarations[0], null, 2));
        }
        
        if (dashboardData.Definition?.DataSetIdentifierMap) {
          console.log('- DataSetIdentifierMap keys:', Object.keys(dashboardData.Definition.DataSetIdentifierMap));
        }
      }
    }
    
    // Find an analysis
    const analysis = allAssets.assets.find(a => a.type === 'analysis');
    if (analysis) {
      console.log(`\n\nChecking analysis: ${analysis.id} - ${analysis.name}`);
      
      // Get the full analysis data
      const analysisData = await assetExporter.getAsset('analyses', analysis.id);
      console.log('\nAnalysis data structure:');
      console.log('- Keys:', Object.keys(analysisData || {}));
      
      if (analysisData) {
        console.log('- Has Definition?', !!analysisData.Definition);
        console.log('- Has DataSetIdentifierDeclarations?', !!analysisData.Definition?.DataSetIdentifierDeclarations);
        console.log('- Has DataSetIdentifierMap?', !!analysisData.Definition?.DataSetIdentifierMap);
      }
    }
    
    // Test lineage extraction
    console.log('\n\nTesting lineage extraction...');
    const lineageMap = await lineageService.buildLineageMap();
    
    // Count relationships
    let totalRelationships = 0;
    let dashboardsWithDatasets = 0;
    let analysesWithDatasets = 0;
    
    lineageMap.forEach((lineage) => {
      totalRelationships += lineage.relationships.length;
      
      if (lineage.assetType === 'dashboard' && lineage.relationships.some(r => r.targetAssetType === 'dataset')) {
        dashboardsWithDatasets++;
      }
      if (lineage.assetType === 'analysis' && lineage.relationships.some(r => r.targetAssetType === 'dataset')) {
        analysesWithDatasets++;
      }
    });
    
    console.log(`\nLineage summary:`);
    console.log(`- Total relationships: ${totalRelationships}`);
    console.log(`- Dashboards with dataset relationships: ${dashboardsWithDatasets}`);
    console.log(`- Analyses with dataset relationships: ${analysesWithDatasets}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the debug script
debugLineage().catch(console.error);