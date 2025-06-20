import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import {
  ContentCopy as CopyIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useAssets } from '@/contexts/AssetsContext';
import AssetListPage from '@/components/assets/AssetListPage';
import DatasourceTypeBadge from '@/components/dataCatalog/DatasourceTypeBadge';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import RelatedAssetsColumn from '@/components/common/RelatedAssetsColumn';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';
import { 
  createDateRenderer, 
  createPermissionsValueGetter, 
  createTagsValueGetter,
} from '@/utils/dataGridHelpers';

export default function DatasetsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { 
    datasets, 
    datasetsLoading, 
    datasetsPagination,
    fetchDatasets,
    refreshAssetType,
    updateAssetTags
  } = useAssets();
  
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; dataset?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; dataset?: any; relatedAssets?: any[] }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; dataset?: any }>({ open: false });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Dataset Name',
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
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' }
            }}
            onClick={() => navigate(`/datasets/${params.row.id}`)}
          >
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'id',
      headerName: 'Dataset ID',
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
            onClick={() => copyToClipboard(params.value)}
            sx={{ padding: '2px' }}
          >
            <CopyIcon sx={{ fontSize: '16px' }} />
          </IconButton>
        </Box>
      ),
    },
    {
      field: 'datasourceInfo',
      headerName: 'Source Type',
      width: 200,
      renderCell: (params) => (
        <DatasourceTypeBadge
          datasourceType={params.row.datasourceType}
          importMode={params.row.importMode as 'SPICE' | 'DIRECT_QUERY' | undefined}
        />
      ),
    },
    {
      field: 'fieldCount',
      headerName: 'Fields',
      width: 100,
      align: 'center',
      renderCell: (params) => {
        const fieldCount = params.row.fieldCount || 0;
        const calculatedFieldCount = params.row.calculatedFieldCount || 0;
        const totalFields = fieldCount + calculatedFieldCount;
        
        return (
          <Tooltip title={`${fieldCount} fields + ${calculatedFieldCount} calculated fields`}>
            <Typography variant="body2">
              {totalFields}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'lastExported',
      headerName: 'Last Updated',
      width: 180,
      renderCell: createDateRenderer(),
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      width: 140,
      renderCell: (params) => {
        const permissions: Permission[] = (params.row.permissions || []).map((p: any) => ({
          principal: p.principal,
          principalType: p.principalType,
          actions: p.actions,
        }));
        
        return (
          <PermissionsCell
            permissions={permissions}
            onClick={() => setPermissionsDialog({ open: true, dataset: params.row })}
          />
        );
      },
      valueGetter: createPermissionsValueGetter(),
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 180,
      renderCell: (params) => {
        const tags = params.row.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => setTagsDialog({ open: true, dataset: params.row })}
          />
        );
      },
      valueGetter: createTagsValueGetter(),
    },
    {
      field: 'relatedAssets',
      headerName: 'Related Assets',
      flex: 0.8,
      minWidth: 200,
      renderCell: (params) => (
        <RelatedAssetsColumn
          assetId={params.row.id}
          getRelatedAssetsForAsset={(params as any).getRelatedAssetsForAsset}
          onClick={() => {
            const relatedAssets = (params as any).getRelatedAssetsForAsset?.(params.row.id) || [];
            setRelatedAssetsDialog({ open: true, dataset: params.row, relatedAssets });
          }}
        />
      ),
      valueGetter: (params) => {
        const datasetId = params.row.id;
        const relatedAssets: string[] = [];
        
        if ((params as any).lineageData) {
          const datasetLineage = (params as any).lineageData.find((l: any) => l.assetId === datasetId);
          if (datasetLineage) {
            datasetLineage.relationships.forEach((rel: any) => {
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
        <Tooltip title="View Dataset">
          <IconButton
            size="small"
            onClick={() => navigate(`/datasets/${params.row.id}`)}
          >
            <ViewIcon />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <AssetListPage
      title="Datasets"
      subtitle="Manage and explore your QuickSight datasets"
      assetType="dataset"
      columns={columns}
      assets={datasets}
      loading={datasetsLoading}
      totalRows={datasetsPagination?.totalItems || 0}
      onFetchAssets={fetchDatasets}
      onRefreshAssets={() => refreshAssetType('dataset')}
      dialogComponents={{
        permissions: permissionsDialog.dataset && (
          <PermissionsDialog
            open={permissionsDialog.open}
            onClose={() => setPermissionsDialog({ open: false })}
            assetName={permissionsDialog.dataset.name}
            assetType="Dataset"
            permissions={(permissionsDialog.dataset?.permissions || []).map((p: any) => ({
              principal: p.principal,
              principalType: p.principalType,
              actions: p.actions,
            }))}
          />
        ),
        relatedAssets: relatedAssetsDialog.dataset && (
          <RelatedAssetsDialog
            open={relatedAssetsDialog.open}
            onClose={() => setRelatedAssetsDialog({ open: false })}
            assetName={relatedAssetsDialog.dataset.name}
            assetType="Dataset"
            relatedAssets={relatedAssetsDialog.relatedAssets || []}
          />
        ),
        tags: tagsDialog.dataset && (
          <TagsDialog
            open={tagsDialog.open}
            onClose={() => setTagsDialog({ open: false })}
            assetName={tagsDialog.dataset.name}
            assetType="Dataset"
            assetId={tagsDialog.dataset.id}
            resourceType="dataset"
            initialTags={tagsDialog.dataset.tags || []}
            onTagsUpdate={(updatedTags) => {
              updateAssetTags('dataset', tagsDialog.dataset.id, updatedTags);
              refreshAssetType('dataset');
            }}
          />
        ),
      }}
    />
  );
}