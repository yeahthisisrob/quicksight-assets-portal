import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  Chip,
  TextField,
  InputAdornment,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  TrendingUp as ConfidenceIcon,
  Calculate as CalculatedIcon,
  Storage as DatasetIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

interface MappedFieldsDialogProps {
  open: boolean;
  onClose: () => void;
  term: any;
  mappings: any[];
  fields: any[];
}

export default function MappedFieldsDialog({
  open,
  onClose,
  term,
  mappings,
  fields,
}: MappedFieldsDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!term) return null;

  // Get mappings for this term
  const termMappings = mappings.filter(m => m.termId === term.id && m.status === 'active');

  // Get field details for each mapping
  const mappedFieldsData = termMappings.map(mapping => {
    const field = fields.find(f => {
      const fieldId = f.semanticFieldId || (f.sources?.[0] 
        ? `${f.sources[0].assetType}:${f.sources[0].assetId}:${f.fieldName}`
        : `unknown:unknown:${f.fieldName}`);
      return fieldId === mapping.fieldId;
    });
    
    return {
      ...mapping,
      field,
    };
  });

  // Filter by search
  const filteredMappings = mappedFieldsData.filter(item =>
    item.field?.fieldName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.field?.sources?.[0]?.assetName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'success';
    if (confidence >= 70) return 'warning';
    return 'error';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6">
              Mapped Fields for "{term.businessName}"
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {termMappings.length} physical field{termMappings.length !== 1 ? 's' : ''} mapped to this semantic term
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            placeholder="Search mapped fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {filteredMappings.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
            No mapped fields found
          </Typography>
        ) : (
          <List>
            {filteredMappings.map((item, index) => (
              <ListItem
                key={`${item.id}-${index}`}
                sx={{ 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1, 
                  mb: 1,
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {item.field?.isCalculated && (
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <Tooltip title="Calculated field">
                          <CalculatedIcon 
                            color="primary"
                            fontSize="small" 
                          />
                        </Tooltip>
                        {(item.field?.hasVariants || (item.field?.expressions && item.field.expressions.length > 1)) && (
                          <Tooltip title="Has different expressions across assets">
                            <WarningIcon 
                              sx={{ 
                                position: 'absolute', 
                                fontSize: 12, 
                                right: -6, 
                                top: -6, 
                                bgcolor: 'background.paper',
                                borderRadius: '50%',
                                color: 'warning.main'
                              }} 
                            />
                          </Tooltip>
                        )}
                      </Box>
                    )}
                    <Typography variant="subtitle2">
                      {item.field?.fieldName || 'Unknown Field'}
                    </Typography>
                    {item.field?.dataType && (
                      <Chip label={item.field.dataType} size="small" variant="outlined" />
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ConfidenceIcon fontSize="small" color="action" />
                      <LinearProgress
                        variant="determinate"
                        value={item.confidence}
                        sx={{ width: 80, height: 6, borderRadius: 3 }}
                        color={getConfidenceColor(item.confidence)}
                      />
                      <Typography variant="caption">{item.confidence}%</Typography>
                    </Box>
                    
                    <Chip
                      label={item.mappingType}
                      size="small"
                      color={item.mappingType === 'manual' ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                  </Box>
                </Box>
                
                <Box sx={{ mt: 1, width: '100%' }}>
                  <Typography variant="caption" color="text.secondary">
                    <DatasetIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    From: {item.field?.sources?.[0]?.assetName || 'Unknown source'}
                    {item.field?.sources?.[0]?.assetType && ` (${item.field.sources[0].assetType})`}
                  </Typography>
                  {item.reason && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                      Mapping reason: {item.reason}
                    </Typography>
                  )}
                  {item.field?.usageCount !== undefined && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                      Usage count: {item.field.usageCount} time{item.field.usageCount !== 1 ? 's' : ''}
                    </Typography>
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}