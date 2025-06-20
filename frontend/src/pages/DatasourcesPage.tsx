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
import { format, formatDistanceToNow } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useAssets } from '@/contexts/AssetsContext';
import AssetListPage from '@/components/assets/AssetListPage';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import PermissionsDialog from '@/components/permissions/PermissionsDialog';
import RelatedAssetsDialog from '@/components/relatedAssets/RelatedAssetsDialog';
import RelatedAssetsColumn from '@/components/common/RelatedAssetsColumn';
import TagsCell from '@/components/tags/TagsCell';
import TagsDialog from '@/components/tags/TagsDialog';
import { Permission } from '@/types/permissions';

export default function DatasourcesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { 
    datasources, 
    datasourcesLoading, 
    datasourcesPagination,
    fetchDatasources,
    refreshAssetType,
    updateAssetTags
  } = useAssets();
  
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; datasource?: any }>({ open: false });
  const [relatedAssetsDialog, setRelatedAssetsDialog] = useState<{ open: boolean; datasource?: any; relatedAssets?: any[] }>({ open: false });
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; datasource?: any }>({ open: false });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    enqueueSnackbar('Copied to clipboard', { variant: 'info' });
  };

  const getDatasourceTypeLabel = (datasource: any) => {
    const type = datasource.datasourceType || 'Unknown';
    // Map QuickSight datasource types to friendly names
    const typeMap: Record<string, string> = {
      'AMAZONELASTICSEARCH': 'Amazon Elasticsearch',
      'ATHENA': 'Athena',
      'AURORA': 'Aurora',
      'AURORA_POSTGRESQL': 'Aurora PostgreSQL',
      'MARIADB': 'MariaDB',
      'MYSQL': 'MySQL',
      'POSTGRESQL': 'PostgreSQL',
      'PRESTO': 'Presto',
      'REDSHIFT': 'Redshift',
      'S3': 'S3',
      'SNOWFLAKE': 'Snowflake',
      'SPARK': 'Spark',
      'SQLSERVER': 'SQL Server',
      'TERADATA': 'Teradata',
      'TIMESTREAM': 'Timestream',
      'TWITTER': 'Twitter',
      'BIGQUERY': 'BigQuery',
      'DATABRICKS': 'Databricks',
    };
    return typeMap[type] || type;
  };

  const getConnectionStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'UPDATE_SUCCESSFUL':
        return 'success';
      case 'UPDATE_FAILED':
        return 'error';
      case 'UPDATE_IN_PROGRESS':
        return 'warning';
      default:
        return 'default';
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Datasource Name',
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
      headerName: 'Datasource ID',
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
      field: 'datasourceType',
      headerName: 'Type',
      width: 150,
      renderCell: (params) => (
        <Chip
          label={getDatasourceTypeLabel(params.row)}
          size="small"
          color="primary"
          variant="outlined"
        />
      ),
    },
    {
      field: 'connectionStatus',
      headerName: 'Connection',
      width: 150,
      renderCell: (params) => {
        const status = params.row.connectionStatus || 'Unknown';
        return (
          <Chip
            label={status.replace(/_/g, ' ').replace(/UPDATE /i, '')}
            size="small"
            color={getConnectionStatusColor(status)}
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'lastExported',
      headerName: 'Last Updated',
      width: 180,
      renderCell: (params) => {
        if (!params.value) {
          return <Typography variant="body2" color="text.disabled">-</Typography>;
        }
        try {
          const date = new Date(params.value);
          if (isNaN(date.getTime())) {
            return <Typography variant="body2" color="text.disabled">Invalid date</Typography>;
          }
          return (
            <Tooltip title={format(date, 'PPpp')}>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                {formatDistanceToNow(date, { addSuffix: true })}
              </Typography>
            </Tooltip>
          );
        } catch (error) {
          console.error('Date formatting error:', error);
          return <Typography variant="body2" color="text.disabled">-</Typography>;
        }
      },
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
            onClick={() => setPermissionsDialog({ open: true, datasource: params.row })}
          />
        );
      },
      valueGetter: (params) => {
        const permissions = params.row.permissions || [];
        return permissions.map((p: any) => {
          const principal = p.principal || 'Unknown';
          const actions = Array.isArray(p.actions) ? p.actions.join(' ') : '';
          return `${principal} ${actions}`;
        }).join(' ');
      },
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
            onClick={() => setTagsDialog({ open: true, datasource: params.row })}
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
      flex: 0.8,
      minWidth: 200,
      renderCell: (params) => (
        <RelatedAssetsColumn
          assetId={params.row.id}
          getRelatedAssetsForAsset={(params as any).getRelatedAssetsForAsset}
          onClick={() => {
            const relatedAssets = (params as any).getRelatedAssetsForAsset?.(params.row.id) || [];
            setRelatedAssetsDialog({ open: true, datasource: params.row, relatedAssets });
          }}
        />
      ),
      valueGetter: (params) => {
        const datasourceId = params.row.id;
        const relatedAssets: string[] = [];
        
        if ((params as any).lineageData) {
          const datasourceLineage = (params as any).lineageData.find((l: any) => l.assetId === datasourceId);
          if (datasourceLineage) {
            datasourceLineage.relationships.forEach((rel: any) => {
              relatedAssets.push(rel.targetAssetName);
            });
          }
        }
        
        return relatedAssets.join(' ');
      },
    },
  ];

  return (
    <AssetListPage
      title="Datasources"
      subtitle="Manage and explore your QuickSight datasources"
      assetType="datasource"
      columns={columns}
      assets={datasources}
      loading={datasourcesLoading}
      totalRows={datasourcesPagination?.totalItems || 0}
      onFetchAssets={fetchDatasources}
      onRefreshAssets={() => refreshAssetType('datasource')}
      enableBulkActions={true}
      dialogComponents={{
        permissions: permissionsDialog.datasource && (
          <PermissionsDialog
            open={permissionsDialog.open}
            onClose={() => setPermissionsDialog({ open: false })}
            assetName={permissionsDialog.datasource.name}
            assetType="Datasource"
            permissions={(permissionsDialog.datasource?.permissions || []).map((p: any) => ({
              principal: p.principal,
              principalType: p.principalType,
              actions: p.actions,
            }))}
          />
        ),
        relatedAssets: relatedAssetsDialog.datasource && (
          <RelatedAssetsDialog
            open={relatedAssetsDialog.open}
            onClose={() => setRelatedAssetsDialog({ open: false })}
            assetName={relatedAssetsDialog.datasource.name}
            assetType="Datasource"
            relatedAssets={relatedAssetsDialog.relatedAssets || []}
          />
        ),
        tags: tagsDialog.datasource && (
          <TagsDialog
            open={tagsDialog.open}
            onClose={() => setTagsDialog({ open: false })}
            assetName={tagsDialog.datasource.name}
            assetType="Datasource"
            assetId={tagsDialog.datasource.id}
            resourceType="datasource"
            initialTags={tagsDialog.datasource.tags || []}
            onTagsUpdate={(updatedTags) => {
              updateAssetTags('datasource', tagsDialog.datasource.id, updatedTags);
              refreshAssetType('datasource');
            }}
          />
        ),
      }}
    />
  );
}