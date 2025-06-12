import { Box, Chip, Tooltip } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Analytics as AnalysisIcon,
  Storage as DatasetIcon,
  Source as DatasourceIcon,
} from '@mui/icons-material';
import { RelatedAsset } from '@/types/relatedAssets';

interface RelatedAssetsCellProps {
  relatedAssets?: RelatedAsset[];
  onClick?: () => void;
}

const assetTypeConfig = {
  dashboard: { icon: DashboardIcon, color: 'success' },
  analysis: { icon: AnalysisIcon, color: 'secondary' },
  dataset: { icon: DatasetIcon, color: 'primary' },
  datasource: { icon: DatasourceIcon, color: 'warning' },
} as const;

export default function RelatedAssetsCell({ relatedAssets = [], onClick }: RelatedAssetsCellProps) {
  if (relatedAssets.length === 0) {
    return <Box sx={{ color: 'text.disabled' }}>-</Box>;
  }

  // Group by type
  const grouped = relatedAssets.reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = [];
    acc[asset.type].push(asset);
    return acc;
  }, {} as Record<string, RelatedAsset[]>);

  // Order: datasets, analyses, dashboards, datasources
  const orderedTypes = ['dataset', 'analysis', 'dashboard', 'datasource'] as const;
  const displayItems: { asset: RelatedAsset; isLast: boolean }[] = [];
  let remaining = 0;

  for (const type of orderedTypes) {
    const assets = grouped[type] || [];
    for (const asset of assets) {
      if (displayItems.length < 2) {
        displayItems.push({ asset, isLast: false });
      } else {
        remaining++;
      }
    }
  }

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        gap: 0.5, 
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { opacity: 0.8 } : {}
      }}
      onClick={onClick}
    >
      {displayItems.map(({ asset }) => {
        const config = assetTypeConfig[asset.type];
        const Icon = config.icon;
        
        return (
          <Tooltip key={asset.id} title={`${asset.type}: ${asset.name}`}>
            <Chip
              icon={<Icon sx={{ fontSize: 16 }} />}
              label={asset.name.length > 10 ? `${asset.name.substring(0, 10)}...` : asset.name}
              size="small"
              variant="outlined"
              color={config.color as any}
              sx={{ 
                height: 24,
                fontSize: '0.75rem',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          </Tooltip>
        );
      })}
      {remaining > 0 && (
        <Chip
          label={`+${remaining}`}
          size="small"
          sx={{ 
            height: 24,
            fontSize: '0.75rem',
            backgroundColor: 'grey.200',
            color: 'text.secondary',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      )}
    </Box>
  );
}