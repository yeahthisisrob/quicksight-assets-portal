import { useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import {
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import {
  createLastUpdatedColumn,
  createPermissionsColumn,
  createTagsColumn,
  createRelatedAssetsColumn,
  createActionsColumn
} from '@/utils/dataGridColumns';
import { useSnackbar } from 'notistack';
import { useAssets } from '@/contexts/AssetsContext';
import AssetListPage from '@/components/assets/AssetListPage';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import TagsDialog from '@/components/tags/TagsDialog';

export default function AnalysesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { 
    analyses, 
    analysesLoading, 
    analysesPagination,
    fetchAnalyses,
    refreshAssetType,
    updateAssetTags
  } = useAssets();
  
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; analysis?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; analysis?: any; relatedAssets?: any[] }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; analysis?: any }>({ open: false });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Analysis Name',
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
      headerName: 'Analysis ID',
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
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => {
        const status = params.row.status || 'PUBLISHED';
        const color = status === 'PUBLISHED' ? 'success' : 'warning';
        return (
          <Chip
            label={status}
            size="small"
            color={color}
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'sheets',
      headerName: 'Sheets',
      width: 100,
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2">
          {params.row.sheetCount || 0}
        </Typography>
      ),
    },
    {
      field: 'visuals',
      headerName: 'Visuals',
      width: 100,
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2">
          {params.row.visualCount || 0}
        </Typography>
      ),
    },
    createLastUpdatedColumn(),
    createPermissionsColumn((row) => setPermissionsDialog({ open: true, analysis: row })),
    createTagsColumn((row) => setTagsDialog({ open: true, analysis: row })),
    createRelatedAssetsColumn((row, relatedAssets) => 
      setRelatedAssetsDialog({ open: true, analysis: row, relatedAssets })
    ),
    createActionsColumn(
      (row) => window.open(`https://quicksight.aws.amazon.com/sn/analyses/${row.id}`, '_blank'),
      'Actions',
      100,
      'View Analysis'
    ),
  ];

  return (
    <AssetListPage
      title="Analyses"
      subtitle="Manage and explore your QuickSight analyses"
      assetType="analysis"
      columns={columns}
      assets={analyses}
      loading={analysesLoading}
      totalRows={analysesPagination?.totalItems || 0}
      onFetchAssets={fetchAnalyses}
      onRefreshAssets={() => refreshAssetType('analysis')}
      dialogComponents={{
        permissions: permissionsDialog.analysis && (
          <PermissionsDialog
            open={permissionsDialog.open}
            onClose={() => setPermissionsDialog({ open: false })}
            assetName={permissionsDialog.analysis.name}
            assetType="Analysis"
            permissions={(permissionsDialog.analysis?.permissions || []).map((p: any) => ({
              principal: p.principal,
              principalType: p.principalType,
              actions: p.actions,
            }))}
          />
        ),
        relatedAssets: relatedAssetsDialog.analysis && (
          <RelatedAssetsDialog
            open={relatedAssetsDialog.open}
            onClose={() => setRelatedAssetsDialog({ open: false })}
            assetName={relatedAssetsDialog.analysis.name}
            assetType="Analysis"
            relatedAssets={relatedAssetsDialog.relatedAssets || []}
          />
        ),
        tags: tagsDialog.analysis && (
          <TagsDialog
            open={tagsDialog.open}
            onClose={() => setTagsDialog({ open: false })}
            assetName={tagsDialog.analysis.name}
            assetType="Analysis"
            assetId={tagsDialog.analysis.id}
            resourceType="analysis"
            initialTags={tagsDialog.analysis.tags || []}
            onTagsUpdate={(updatedTags) => {
              updateAssetTags('analysis', tagsDialog.analysis.id, updatedTags);
              refreshAssetType('analysis');
            }}
          />
        ),
      }}
    />
  );
}