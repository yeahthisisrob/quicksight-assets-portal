import { Box, Chip, Tooltip } from '@mui/material';
import { LocalOffer as TagIcon } from '@mui/icons-material';

interface Tag {
  key: string;
  value: string;
}

interface TagsCellProps {
  tags: Tag[];
  onClick?: () => void;
}

export default function TagsCell({ tags = [], onClick }: TagsCellProps) {
  if (!tags || tags.length === 0) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 0.5,
          cursor: onClick ? 'pointer' : 'default',
          color: 'text.disabled'
        }}
        onClick={onClick}
      >
        <TagIcon sx={{ fontSize: 14 }} />
        <span style={{ fontSize: '0.75rem' }}>No tags</span>
      </Box>
    );
  }

  const displayTags = tags.slice(0, 2);
  const remainingCount = tags.length - 2;

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 0.5,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      {displayTags.map((tag, index) => (
        <Tooltip key={index} title={`${tag.key}: ${tag.value}`}>
          <Chip
            icon={<TagIcon sx={{ fontSize: 14 }} />}
            label={tag.key.length > 10 ? `${tag.key.substring(0, 10)}...` : tag.key}
            size="small"
            variant="outlined"
            sx={{ 
              height: 20,
              fontSize: '0.7rem',
              '& .MuiChip-label': { px: 0.75 },
              '& .MuiChip-icon': { ml: 0.5, mr: -0.25 }
            }}
          />
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <Chip
          label={`+${remainingCount}`}
          size="small"
          variant="filled"
          sx={{ 
            height: 20,
            fontSize: '0.7rem',
            '& .MuiChip-label': { px: 0.5 },
            backgroundColor: 'grey.200',
            color: 'text.secondary'
          }}
        />
      )}
    </Box>
  );
}