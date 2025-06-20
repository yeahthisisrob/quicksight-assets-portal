import {
  Box,
  Button,
  Chip,
  Stack,
  Fade,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Tag as TagIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onAddToFolder: () => void;
  onBulkTag: () => void;
  onClearSelection: () => void;
}

export default function BulkActionsToolbar({
  selectedCount,
  onAddToFolder,
  onBulkTag,
  onClearSelection,
}: BulkActionsToolbarProps) {
  return (
    <Fade in={selectedCount > 0}>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          p: 2,
          borderRadius: 1,
          mb: 2,
          boxShadow: 2,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip
            label={`${selectedCount} selected`}
            color="primary"
            sx={{ 
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
              fontWeight: 'bold',
            }}
          />
          
          <Button
            variant="contained"
            startIcon={<FolderIcon />}
            onClick={onAddToFolder}
            sx={{
              bgcolor: 'primary.dark',
              '&:hover': {
                bgcolor: 'primary.darker',
              },
            }}
          >
            Add to Folder
          </Button>
          
          <Button
            variant="contained"
            startIcon={<TagIcon />}
            onClick={onBulkTag}
            sx={{
              bgcolor: 'primary.dark',
              '&:hover': {
                bgcolor: 'primary.darker',
              },
            }}
          >
            Bulk Tag
          </Button>
          
          <Box sx={{ flexGrow: 1 }} />
          
          <Tooltip title="Clear selection">
            <IconButton
              onClick={onClearSelection}
              sx={{ color: 'primary.contrastText' }}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Fade>
  );
}