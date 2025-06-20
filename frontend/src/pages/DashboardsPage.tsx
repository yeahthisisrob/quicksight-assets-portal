import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import {
  Visibility as ViewIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import {
  createLastUpdatedColumn,
  createPermissionsColumn,
} from '@/utils/dataGridColumns';
import { useAssets } from '@/contexts/AssetsContext';
import AssetListPage from '@/components/assets/AssetListPage';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import RelatedAssetsColumn from '@/components/common/RelatedAssetsColumn';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';

export default function DashboardsPage() {
  const navigate = useNavigate();
  const { 
    dashboards, 
    dashboardsLoading, 
    dashboardsPagination,
    fetchDashboards,
    refreshAssetType,
    updateAssetTags
  } = useAssets();
  
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; dashboard?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; dashboard?: any; relatedAssets?: any[] }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; dashboard?: any }>({ open: false });

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Dashboard Name',
      flex: 1.5,
      minWidth: 200,
      renderCell: (params) => (
        <Tooltip title={params.value}>
          <Typography 
            variant="body2" 
            sx={{ 
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'id',
      headerName: 'Dashboard ID',
      flex: 1,
      minWidth: 300,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={params.value}>
            <Typography 
              variant="body2" 
              sx={{ 
                fontFamily: 'monospace', 
                fontSize: '0.875rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '250px',
              }}
            >
              {params.value}
            </Typography>
          </Tooltip>
          <IconButton
            size="small"
            onClick={() => navigate(`/dashboards/${params.value}`)}
            sx={{ padding: '2px' }}
          >
            <EditIcon sx={{ fontSize: '16px' }} />
          </IconButton>
        </Box>
      ),
    },
    {
      field: 'version',
      headerName: 'Version',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={`v${params.value?.VersionNumber || 1}`}
          size="small"
          color="primary"
          variant="outlined"
        />
      ),
    },
    createLastUpdatedColumn('lastExported', 'Last Updated', 150),
    createPermissionsColumn((row) => setPermissionsDialog({ open: true, dashboard: row })),
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params) => {
        const tags = params.row.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => setTagsDialog({ open: true, dashboard: params.row })}
          />
        );
      },
      valueGetter: (params) => {
        const tags = params.row.tags || [];
        return tags.map((tag: any) => `${tag.key}:${tag.value}`).join(' ');
      },
    },
    {
      field: 'relatedAssets',
      headerName: 'Related Assets',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <RelatedAssetsColumn
          assetId={params.row.id}
          getRelatedAssetsForAsset={(params as any).getRelatedAssetsForAsset}
          onClick={() => {
            const relatedAssets = (params as any).getRelatedAssetsForAsset?.(params.row.id) || [];
            setRelatedAssetsDialog({ open: true, dashboard: params.row, relatedAssets });
          }}
        />
      ),
      valueGetter: (params) => {
        const dashboardId = params.row.id;
        const relatedAssets: string[] = [];
        
        if ((params as any).lineageData) {
          const dashboardLineage = (params as any).lineageData.find((l: any) => l.assetId === dashboardId);
          if (dashboardLineage) {
            dashboardLineage.relationships.forEach((rel: any) => {
              relatedAssets.push(rel.targetAssetName);
            });
          }
        }
        
        return relatedAssets.join(' ');
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title="View Dashboard">
          <IconButton
            size="small"
            onClick={() => window.open(`https://quicksight.aws.amazon.com/sn/dashboards/${params.row.id}`, '_blank')}
          >
            <ViewIcon />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <AssetListPage
      title="Dashboards"
      subtitle="Manage and explore your QuickSight dashboards"
      assetType="dashboard"
      columns={columns}
      assets={dashboards}
      loading={dashboardsLoading}
      totalRows={dashboardsPagination?.totalItems || 0}
      onFetchAssets={fetchDashboards}
      onRefreshAssets={() => refreshAssetType('dashboard')}
      dialogComponents={{
        permissions: permissionsDialog.dashboard && (
          <PermissionsDialog
            open={permissionsDialog.open}
            onClose={() => setPermissionsDialog({ open: false })}
            assetName={permissionsDialog.dashboard.name}
            assetType="Dashboard"
            permissions={(permissionsDialog.dashboard?.permissions || []).map((p: any) => ({
              principal: p.principal,
              principalType: p.principalType,
              actions: p.actions || (p.permission ? [p.permission] : []),
            }))}
          />
        ),
        relatedAssets: relatedAssetsDialog.dashboard && (
          <RelatedAssetsDialog
            open={relatedAssetsDialog.open}
            onClose={() => setRelatedAssetsDialog({ open: false })}
            assetName={relatedAssetsDialog.dashboard.name}
            assetType="Dashboard"
            relatedAssets={relatedAssetsDialog.relatedAssets || []}
          />
        ),
        tags: tagsDialog.dashboard && (
          <TagsDialog
            open={tagsDialog.open}
            onClose={() => setTagsDialog({ open: false })}
            assetName={tagsDialog.dashboard.name}
            assetType="Dashboard"
            assetId={tagsDialog.dashboard.id}
            resourceType="dashboard"
            initialTags={tagsDialog.dashboard.tags || []}
            onTagsUpdate={(updatedTags) => {
              updateAssetTags('dashboard', tagsDialog.dashboard.id, updatedTags);
              refreshAssetType('dashboard');
            }}
          />
        ),
      }}
    />
  );
}