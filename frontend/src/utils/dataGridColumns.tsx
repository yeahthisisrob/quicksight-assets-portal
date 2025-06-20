import { GridColDef } from '@mui/x-data-grid';
import { IconButton, Tooltip } from '@mui/material';
import { Visibility as ViewIcon } from '@mui/icons-material';
import { 
  createDateRenderer, 
  createPermissionsValueGetter, 
  createTagsValueGetter 
} from './dataGridHelpers';
import PermissionsCell from '@/components/permissions/PermissionsCell';
import TagsCell from '@/components/tags/TagsCell';
import RelatedAssetsColumn from '@/components/common/RelatedAssetsColumn';

/**
 * Common column configurations for asset data grids
 */

export const createLastUpdatedColumn = (
  field: string = 'lastExported',
  headerName: string = 'Last Updated',
  width: number = 180
): GridColDef => ({
  field,
  headerName,
  width,
  renderCell: createDateRenderer(),
});

export const createPermissionsColumn = (
  onCellClick: (row: any) => void,
  width: number = 140
): GridColDef => ({
  field: 'permissions',
  headerName: 'Permissions',
  width,
  renderCell: (params) => {
    const permissions = (params.row.permissions || []).map((p: any) => ({
      principal: p.principal || p.Principal,
      principalType: p.principalType || p.PrincipalType,
      actions: p.actions || p.Actions || (p.permission ? [p.permission] : []),
    }));
    
    return (
      <PermissionsCell
        permissions={permissions}
        onClick={() => onCellClick(params.row)}
      />
    );
  },
  valueGetter: createPermissionsValueGetter(),
});

export const createTagsColumn = (
  onCellClick: (row: any) => void,
  width: number = 180
): GridColDef => ({
  field: 'tags',
  headerName: 'Tags',
  width,
  renderCell: (params) => {
    const tags = params.row.tags || [];
    
    return (
      <TagsCell
        tags={tags}
        onClick={() => onCellClick(params.row)}
      />
    );
  },
  valueGetter: createTagsValueGetter(),
});

export const createRelatedAssetsColumn = (
  onCellClick: (row: any, relatedAssets: any[]) => void,
  flex: number = 0.8,
  minWidth: number = 200
): GridColDef => ({
  field: 'relatedAssets',
  headerName: 'Related Assets',
  flex,
  minWidth,
  renderCell: (params) => (
    <RelatedAssetsColumn
      assetId={params.row.id}
      getRelatedAssetsForAsset={(params as any).getRelatedAssetsForAsset}
      onClick={() => {
        const relatedAssets = (params as any).getRelatedAssetsForAsset?.(params.row.id) || [];
        onCellClick(params.row, relatedAssets);
      }}
    />
  ),
  valueGetter: (params) => {
    const getRelatedAssetsForAsset = (params as any).getRelatedAssetsForAsset;
    const relatedAssets = getRelatedAssetsForAsset?.(params.row.id) || [];
    
    if (!relatedAssets || relatedAssets.length === 0) {
      return '';
    }
    
    return relatedAssets.join(' ');
  },
});

export const createActionsColumn = (
  onView: (row: any) => void,
  headerName: string = 'Actions',
  width: number = 100,
  tooltipTitle: string = 'View Details'
): GridColDef => ({
  field: 'actions',
  headerName,
  width,
  sortable: false,
  renderCell: (params) => (
    <Tooltip title={tooltipTitle}>
      <IconButton
        size="small"
        onClick={() => onView(params.row)}
      >
        <ViewIcon />
      </IconButton>
    </Tooltip>
  ),
});

/**
 * Create a date column with custom formatting
 */
export const createDateColumn = (
  field: string,
  headerName: string,
  dateFormat: string = 'PPpp',
  showRelative: boolean = true,
  width: number = 180
): GridColDef => ({
  field,
  headerName,
  width,
  renderCell: createDateRenderer(dateFormat, showRelative),
});