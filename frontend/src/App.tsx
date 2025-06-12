import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout';
import DashboardsPage from './pages/DashboardsPage';
import DashboardDetailPage from './pages/DashboardDetailPage';
import DatasetsPage from './pages/DatasetsPage';
import DatasetDetailPage from './pages/DatasetDetailPage';
import AnalysesPage from './pages/AnalysesPage';
import DatasourcesPage from './pages/DatasourcesPage';
import FoldersPage from './pages/FoldersPage';
import SettingsPage from './pages/SettingsPage';
import AssetMetadataPage from './pages/AssetMetadataPage';
import DataCatalogPage from './pages/DataCatalogPage';

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboards" replace />} />
          <Route path="dashboards" element={<DashboardsPage />} />
          <Route path="dashboards/:dashboardId" element={<DashboardDetailPage />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="datasets/:datasetId" element={<DatasetDetailPage />} />
          <Route path="analyses" element={<AnalysesPage />} />
          <Route path="datasources" element={<DatasourcesPage />} />
          <Route path="folders" element={<FoldersPage />} />
          <Route path="data-catalog" element={<DataCatalogPage />} />
          <Route path="assets" element={<AssetMetadataPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Box>
  );
}

export default App;