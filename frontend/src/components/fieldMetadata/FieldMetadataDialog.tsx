import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Chip,
  Grid,
  CircularProgress,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider,
  IconButton,
  Switch,
  FormControlLabel,
  Slider,
} from '@mui/material';
import {
  Close as CloseIcon,
  LocalOffer as TagIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Security as SecurityIcon,
  Source as SourceIcon,
  Assessment as QualityIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { tagsApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';

interface Tag {
  key: string;
  value: string;
}

interface FieldMetadataDialogProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  field: {
    name: string;
    type?: string;
    expression?: string;
  };
  metadata?: any;
  onUpdate?: () => void;
}

// Common tag suggestions for fields based on data catalog best practices
const commonFieldTagKeys = [
  'PII',
  'Sensitive',
  'DataClassification',
  'BusinessUnit',
  'DataDomain',
  'DataOwner',
  'DataSteward',
  'RetentionPolicy',
  'UsageRestriction',
  'SourceSystem',
  'UpdateFrequency',
  'DataCategory',
  'ComplianceScope',
  'AnalyticsUse',
  'ReportingUse',
];

const dataClassificationOptions = [
  'Public',
  'Internal',
  'Confidential',
  'Restricted',
  'Highly Restricted',
];

const piiCategories = [
  'None',
  'Name',
  'Email',
  'Phone',
  'Address',
  'SSN',
  'Financial',
  'Medical',
  'Other',
];

export default function FieldMetadataDialog({
  open,
  onClose,
  datasetId,
  field,
  metadata,
  onUpdate,
}: FieldMetadataDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  
  // Field metadata state
  const [description, setDescription] = useState('');
  const [businessGlossary, setBusinessGlossary] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState({ key: '', value: '' });
  
  // Data classification
  const [dataClassification, setDataClassification] = useState('Internal');
  const [isPII, setIsPII] = useState(false);
  const [piiCategory, setPiiCategory] = useState('None');
  const [isSensitive, setIsSensitive] = useState(false);
  
  // Data quality
  const [completeness, setCompleteness] = useState(100);
  const [accuracy, setAccuracy] = useState(100);
  const [consistency, setConsistency] = useState(100);
  const [timeliness, setTimeliness] = useState(100);
  
  // Lineage
  const [sourceSystem, setSourceSystem] = useState('');
  const [sourceTable, setSourceTable] = useState('');
  const [sourceField, setSourceField] = useState('');
  const [transformationLogic, setTransformationLogic] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState('');
  
  // Validation rules
  const [validationRules, setValidationRules] = useState<string[]>([]);
  const [newValidationRule, setNewValidationRule] = useState('');

  useEffect(() => {
    if (metadata) {
      setDescription(metadata.description || '');
      setBusinessGlossary(metadata.businessGlossary || '');
      setTags(metadata.tags || []);
      setDataClassification(metadata.dataClassification || 'Internal');
      setIsPII(metadata.isPII || false);
      setPiiCategory(metadata.piiCategory || 'None');
      setIsSensitive(metadata.isSensitive || false);
      
      if (metadata.dataQuality) {
        setCompleteness(metadata.dataQuality.completeness || 100);
        setAccuracy(metadata.dataQuality.accuracy || 100);
        setConsistency(metadata.dataQuality.consistency || 100);
        setTimeliness(metadata.dataQuality.timeliness || 100);
      }
      
      if (metadata.lineage) {
        setSourceSystem(metadata.lineage.sourceSystem || '');
        setSourceTable(metadata.lineage.sourceTable || '');
        setSourceField(metadata.lineage.sourceField || '');
        setTransformationLogic(metadata.lineage.transformationLogic || '');
        setUpdateFrequency(metadata.lineage.updateFrequency || '');
      }
      
      setValidationRules(metadata.validationRules || []);
    }
  }, [metadata]);

  const handleAddTag = () => {
    if (!newTag.key || !newTag.value) {
      enqueueSnackbar('Both key and value are required', { variant: 'warning' });
      return;
    }

    if (tags.some(tag => tag.key === newTag.key)) {
      enqueueSnackbar('Tag key already exists', { variant: 'warning' });
      return;
    }

    setTags([...tags, newTag]);
    setNewTag({ key: '', value: '' });
  };

  const handleDeleteTag = (tagKey: string) => {
    setTags(tags.filter(tag => tag.key !== tagKey));
  };

  const handleAddValidationRule = () => {
    if (!newValidationRule.trim()) return;
    setValidationRules([...validationRules, newValidationRule]);
    setNewValidationRule('');
  };

  const handleDeleteValidationRule = (index: number) => {
    setValidationRules(validationRules.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const updatedMetadata = {
        fieldId: `${datasetId}#${field.name}`,
        datasetId,
        fieldName: field.name,
        tags,
        description,
        businessGlossary,
        dataClassification,
        isPII,
        piiCategory: isPII ? piiCategory : 'None',
        isSensitive,
        dataQuality: {
          completeness,
          accuracy,
          consistency,
          timeliness,
          lastAssessed: new Date().toISOString(),
        },
        lineage: {
          sourceSystem,
          sourceTable,
          sourceField,
          transformationLogic,
          updateFrequency,
        },
        validationRules,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'current-user', // In real app, get from auth context
      };
      
      await tagsApi.updateFieldMetadata(datasetId, field.name, updatedMetadata);
      
      // Invalidate the data catalog cache to trigger refresh
      queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['data-catalog-paginated'] });
      
      enqueueSnackbar('Field metadata updated successfully', { variant: 'success' });
      if (onUpdate) {
        onUpdate();
      }
      onClose();
    } catch (error) {
      console.error('Error saving field metadata:', error);
      enqueueSnackbar('Failed to save field metadata', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon />
            <Typography variant="h6">Field Metadata</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={500}>
            {field.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Type: {field.type || 'Unknown'}
            {field.expression && ` | Calculated Field`}
          </Typography>
        </Box>

        <Stack spacing={3}>
          {/* Basic Information */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <InfoIcon fontSize="small" /> Basic Information
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this field represents and how it should be used"
              />
              <TextField
                label="Business Glossary"
                fullWidth
                multiline
                rows={2}
                value={businessGlossary}
                onChange={(e) => setBusinessGlossary(e.target.value)}
                placeholder="Business context and terminology"
              />
            </Stack>
          </Box>

          <Divider />

          {/* Tags */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TagIcon fontSize="small" /> Tags
            </Typography>
            <Box sx={{ mb: 2 }}>
              {tags.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No tags defined
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {tags.map((tag, index) => (
                    <Chip
                      key={index}
                      icon={<TagIcon sx={{ fontSize: 16 }} />}
                      label={`${tag.key}: ${tag.value}`}
                      variant="outlined"
                      onDelete={() => handleDeleteTag(tag.key)}
                      size="small"
                    />
                  ))}
                </Box>
              )}
            </Box>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={5}>
                <Autocomplete
                  freeSolo
                  options={commonFieldTagKeys}
                  value={newTag.key}
                  onChange={(_, value) => setNewTag({ ...newTag, key: value || '' })}
                  onInputChange={(_, value) => setNewTag({ ...newTag, key: value })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tag Key"
                      size="small"
                      fullWidth
                    />
                  )}
                />
              </Grid>
              <Grid item xs={5}>
                <TextField
                  label="Tag Value"
                  size="small"
                  fullWidth
                  value={newTag.value}
                  onChange={(e) => setNewTag({ ...newTag, value: e.target.value })}
                />
              </Grid>
              <Grid item xs={2}>
                <IconButton
                  color="primary"
                  onClick={handleAddTag}
                  disabled={!newTag.key || !newTag.value}
                >
                  <AddIcon />
                </IconButton>
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Data Classification */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SecurityIcon fontSize="small" /> Data Classification
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Classification</InputLabel>
                  <Select
                    value={dataClassification}
                    onChange={(e) => setDataClassification(e.target.value)}
                    label="Classification"
                  >
                    {dataClassificationOptions.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>PII Category</InputLabel>
                  <Select
                    value={piiCategory}
                    onChange={(e) => {
                      setPiiCategory(e.target.value);
                      setIsPII(e.target.value !== 'None');
                    }}
                    label="PII Category"
                  >
                    {piiCategories.map((category) => (
                      <MenuItem key={category} value={category}>{category}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isSensitive}
                      onChange={(e) => setIsSensitive(e.target.checked)}
                    />
                  }
                  label="Mark as Sensitive Data"
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Data Quality */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <QualityIcon fontSize="small" /> Data Quality
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>Completeness: {completeness}%</Typography>
                <Slider
                  value={completeness}
                  onChange={(_, value) => setCompleteness(value as number)}
                  valueLabelDisplay="auto"
                  min={0}
                  max={100}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>Accuracy: {accuracy}%</Typography>
                <Slider
                  value={accuracy}
                  onChange={(_, value) => setAccuracy(value as number)}
                  valueLabelDisplay="auto"
                  min={0}
                  max={100}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>Consistency: {consistency}%</Typography>
                <Slider
                  value={consistency}
                  onChange={(_, value) => setConsistency(value as number)}
                  valueLabelDisplay="auto"
                  min={0}
                  max={100}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>Timeliness: {timeliness}%</Typography>
                <Slider
                  value={timeliness}
                  onChange={(_, value) => setTimeliness(value as number)}
                  valueLabelDisplay="auto"
                  min={0}
                  max={100}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Lineage */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SourceIcon fontSize="small" /> Data Lineage
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Source System"
                  size="small"
                  fullWidth
                  value={sourceSystem}
                  onChange={(e) => setSourceSystem(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Source Table"
                  size="small"
                  fullWidth
                  value={sourceTable}
                  onChange={(e) => setSourceTable(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Source Field"
                  size="small"
                  fullWidth
                  value={sourceField}
                  onChange={(e) => setSourceField(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Transformation Logic"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={transformationLogic}
                  onChange={(e) => setTransformationLogic(e.target.value)}
                  placeholder="Describe any transformations applied to this field"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Update Frequency"
                  size="small"
                  fullWidth
                  value={updateFrequency}
                  onChange={(e) => setUpdateFrequency(e.target.value)}
                  placeholder="e.g., Daily, Weekly, Real-time"
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Validation Rules */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Validation Rules
            </Typography>
            <Box sx={{ mb: 2 }}>
              {validationRules.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No validation rules defined
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {validationRules.map((rule, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {rule}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteValidationRule(index)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Add Validation Rule"
                size="small"
                fullWidth
                value={newValidationRule}
                onChange={(e) => setNewValidationRule(e.target.value)}
                placeholder="e.g., Must be between 0 and 100"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddValidationRule();
                  }
                }}
              />
              <IconButton
                color="primary"
                onClick={handleAddValidationRule}
                disabled={!newValidationRule.trim()}
              >
                <AddIcon />
              </IconButton>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          size="small"
          disabled={saving}
          startIcon={saving && <CircularProgress size={16} />}
        >
          Save Metadata
        </Button>
      </DialogActions>
    </Dialog>
  );
}