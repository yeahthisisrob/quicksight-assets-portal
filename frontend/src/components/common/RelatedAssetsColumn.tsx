import { Box, Chip, Typography, Tooltip } from '@mui/material';

interface RelatedAssetsColumnProps {
  assetId: string;
  getRelatedAssetsForAsset?: (assetId: string) => any[];
  onClick: () => void;
}

export default function RelatedAssetsColumn({ 
  assetId, 
  getRelatedAssetsForAsset,
  onClick 
}: RelatedAssetsColumnProps) {
  // Get related assets using the helper function
  const relatedAssets = getRelatedAssetsForAsset ? getRelatedAssetsForAsset(assetId) : [];
  
  if (relatedAssets.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled">
        -
      </Typography>
    );
  }
  
  // Show first 2 items with +N
  const displayItems = relatedAssets.slice(0, 2);
  const remainingCount = relatedAssets.length - 2;
  
  return (
    <Box 
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
      onClick={onClick}
    >
      {displayItems.map((item) => {
        const itemName = item?.name || 'Unknown';
        return (
          <Tooltip key={item.id} title={itemName}>
            <Chip
              label={itemName.length > 12 ? `${itemName.substring(0, 12)}...` : itemName}
              size="small"
              variant="outlined"
              sx={{ 
                height: 20,
                fontSize: '0.75rem',
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Tooltip>
        );
      })}
      {remainingCount > 0 && (
        <Chip
          label={`+${remainingCount}`}
          size="small"
          variant="filled"
          sx={{ 
            height: 20,
            fontSize: '0.75rem',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      )}
    </Box>
  );
}