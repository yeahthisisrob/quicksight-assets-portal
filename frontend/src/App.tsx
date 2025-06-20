import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout';
import { AuthGuard } from './components/auth/AuthGuard';
import { AuthenticatedApp } from './components/auth/AuthenticatedApp';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AwsCallbackPage } from './pages/AwsCallbackPage';
import { CognitoCallbackPage } from './pages/CognitoCallbackPage';
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
import MetadataSearchPage from './pages/MetadataSearchPage';

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/aws-callback" element={<AwsCallbackPage />} />
        <Route path="/auth/cognito/callback" element={<CognitoCallbackPage />} />
        <Route path="/auth/error" element={<LoginPage />} />
        <Route path="/" element={<AuthGuard><AuthenticatedApp><Layout /></AuthenticatedApp></AuthGuard>}>
          <Route index element={<Navigate to="/dashboards" replace />} />
          <Route path="dashboards" element={<DashboardsPage />} />
          <Route path="dashboards/:dashboardId" element={<DashboardDetailPage />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="datasets/:datasetId" element={<DatasetDetailPage />} />
          <Route path="analyses" element={<AnalysesPage />} />
          <Route path="datasources" element={<DatasourcesPage />} />
          <Route path="folders" element={<FoldersPage />} />
          <Route path="data-catalog" element={<DataCatalogPage />} />
          <Route path="metadata-search" element={<MetadataSearchPage />} />
          <Route path="assets" element={<AssetMetadataPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Box>
  );
}

export default App;