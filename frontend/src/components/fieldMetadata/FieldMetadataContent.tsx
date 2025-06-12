import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Switch,
  FormControlLabel,
  Slider,
  Stack,
  Divider,
  Chip,
  IconButton,
  Button,
} from '@mui/material';
import {
  Info as InfoIcon,
  LocalOffer as TagIcon,
  Add as AddIcon,
  Security as SecurityIcon,
  Assessment as QualityIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '@/services/api';

interface FieldMetadataContentProps {
  sourceType: 'dataset' | 'analysis' | 'dashboard';
  sourceId: string;
  field: {
    name: string;
    type?: string;
    expression?: string;
  };
}

interface Tag {
  key: string;
  value: string;
}

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

export default function FieldMetadataContent({ sourceType, sourceId, field }: FieldMetadataContentProps) {
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

  // Fetch existing metadata
  const { data: metadata, isLoading } = useQuery({
    queryKey: ['field-metadata', sourceType, sourceId, field.name],
    queryFn: () => tagsApi.getFieldMetadata(sourceType, sourceId, field.name),
    enabled: !!sourceId && !!field.name,
  });

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

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const updatedMetadata = {
        fieldId: `${sourceType}::${sourceId}::${field.name}`,
        sourceType,
        [sourceType === 'dataset' ? 'datasetId' : sourceType === 'analysis' ? 'analysisId' : 'dashboardId']: sourceId,
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
      
      console.log('Saving field metadata:', {
        sourceType,
        sourceId,
        fieldName: field.name,
        fieldId: updatedMetadata.fieldId,
        tags: updatedMetadata.tags
      });
      
      await tagsApi.updateFieldMetadata(sourceType, sourceId, field.name, updatedMetadata);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['field-metadata', sourceType, sourceId, field.name] });
      queryClient.invalidateQueries({ queryKey: ['field-tag-search'] });
      // Also invalidate the data catalog to refresh tags display
      queryClient.invalidateQueries({ queryKey: ['data-catalog'] });
      
      enqueueSnackbar('Field metadata updated successfully', { variant: 'success' });
    } catch (error) {
      console.error('Error saving field metadata:', error);
      enqueueSnackbar('Failed to save field metadata', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 1, maxWidth: '800px', mx: 'auto' }}>
      <Stack spacing={2}>
        {/* Basic Information */}
        <Box>
          <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
            <InfoIcon sx={{ fontSize: 16 }} /> Basic Information
          </Typography>
          <Stack spacing={1}>
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              size="small"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this field represents and how it should be used"
            />
            <TextField
              label="Business Glossary"
              fullWidth
              multiline
              rows={2}
              size="small"
              value={businessGlossary}
              onChange={(e) => setBusinessGlossary(e.target.value)}
              placeholder="Business context and terminology"
            />
          </Stack>
        </Box>

        <Divider />

        {/* Tags */}
        <Box>
          <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
            <TagIcon sx={{ fontSize: 16 }} /> Tags
          </Typography>
          <Box sx={{ mb: 1 }}>
            {tags.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No tags defined
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {tags.map((tag, index) => (
                  <Chip
                    key={index}
                    icon={<TagIcon sx={{ fontSize: 14 }} />}
                    label={`${tag.key}: ${tag.value}`}
                    variant="outlined"
                    onDelete={() => handleDeleteTag(tag.key)}
                    size="small"
                    sx={{ height: 24 }}
                  />
                ))}
              </Box>
            )}
          </Box>
          <Grid container spacing={1} alignItems="flex-end">
            <Grid item xs={12} sm={5}>
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
            <Grid item xs={12} sm={5}>
              <TextField
                label="Tag Value"
                size="small"
                fullWidth
                value={newTag.value}
                onChange={(e) => setNewTag({ ...newTag, value: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={2}>
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
          <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
            <SecurityIcon sx={{ fontSize: 16 }} /> Data Classification
          </Typography>
          <Grid container spacing={1}>
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
                    size="small"
                  />
                }
                label="Mark as Sensitive Data"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            </Grid>
          </Grid>
        </Box>

        <Divider />

        {/* Data Quality */}
        <Box>
          <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
            <QualityIcon sx={{ fontSize: 16 }} /> Data Quality
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1 }}>
            <Box>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>Completeness: {completeness}%</Typography>
              <Slider
                value={completeness}
                onChange={(_, value) => setCompleteness(value as number)}
                valueLabelDisplay="auto"
                min={0}
                max={100}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>Accuracy: {accuracy}%</Typography>
              <Slider
                value={accuracy}
                onChange={(_, value) => setAccuracy(value as number)}
                valueLabelDisplay="auto"
                min={0}
                max={100}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>Consistency: {consistency}%</Typography>
              <Slider
                value={consistency}
                onChange={(_, value) => setConsistency(value as number)}
                valueLabelDisplay="auto"
                min={0}
                max={100}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>Timeliness: {timeliness}%</Typography>
              <Slider
                value={timeliness}
                onChange={(_, value) => setTimeliness(value as number)}
                valueLabelDisplay="auto"
                min={0}
                max={100}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, mb: 1 }}>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            size="small"
            disabled={saving}
            startIcon={saving && <CircularProgress size={14} />}
          >
            Save Metadata
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}