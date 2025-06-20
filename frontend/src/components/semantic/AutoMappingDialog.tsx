import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Slider,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  AutoAwesome as AutoMapIcon,
} from '@mui/icons-material';

interface AutoMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (minConfidence: number) => void;
}

export default function AutoMappingDialog({
  open,
  onClose,
  onConfirm,
}: AutoMappingDialogProps) {
  const [minConfidence, setMinConfidence] = useState(85);

  const handleConfirm = () => {
    onConfirm(minConfidence);
  };

  const getConfidenceColor = (value: number) => {
    if (value >= 85) return 'success';
    if (value >= 70) return 'warning';
    return 'error';
  };

  const getConfidenceLabel = (value: number) => {
    if (value >= 90) return 'Very High';
    if (value >= 85) return 'High';
    if (value >= 75) return 'Medium';
    if (value >= 70) return 'Low';
    return 'Very Low';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoMapIcon color="primary" />
            <Typography variant="h6">Auto-Map Fields</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Auto-mapping uses AI to analyze field names, data types, and patterns to suggest semantic term mappings.
            Only mappings above the selected confidence threshold will be created.
          </Typography>
        </Alert>

        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Minimum Confidence Level
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set the minimum confidence score required for automatic mapping
          </Typography>
          
          <Box sx={{ px: 2 }}>
            <Slider
              value={minConfidence}
              onChange={(_, value) => setMinConfidence(value as number)}
              valueLabelDisplay="on"
              marks={[
                { value: 70, label: '70%' },
                { value: 80, label: '80%' },
                { value: 90, label: '90%' },
                { value: 100, label: '100%' },
              ]}
              min={70}
              max={100}
              step={5}
              color={getConfidenceColor(minConfidence) as any}
            />
          </Box>
          
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Chip
              label={getConfidenceLabel(minConfidence)}
              color={getConfidenceColor(minConfidence) as any}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              confidence threshold
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Typography variant="subtitle1" gutterBottom>
            How Auto-Mapping Works
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemText
                primary="Name Matching (40%)"
                secondary="Compares field names with semantic terms and synonyms"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Description Analysis (20%)"
                secondary="Analyzes field descriptions for semantic similarity"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Data Type Compatibility (20%)"
                secondary="Ensures data types are compatible between fields and terms"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Pattern Recognition (10%)"
                secondary="Identifies patterns in sample values"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Context Matching (10%)"
                secondary="Considers the source context and related metadata"
              />
            </ListItem>
          </List>
        </Box>

        <Alert severity="warning" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Note:</strong> Auto-mapped fields can be reviewed and adjusted later.
            All auto-mappings are clearly marked in the mappings view.
          </Typography>
        </Alert>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          startIcon={<AutoMapIcon />}
        >
          Start Auto-Mapping
        </Button>
      </DialogActions>
    </Dialog>
  );
}