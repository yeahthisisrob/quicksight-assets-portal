import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Grid,
  Typography,
  Paper,
  Chip,
  Stack,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Calculate as CalculateIcon,
  TableChart as FieldIcon,
  Info as InfoIcon,
  LocalOffer as TagIcon,
} from '@mui/icons-material';
import MultipleExpressionsDisplay from './MultipleExpressionsDisplay';
import FieldUsageBadges from './FieldUsageBadges';
import DatasourceTypeBadge from './DatasourceTypeBadge';
import ExpressionGraphDialog from './ExpressionGraphDialog';
import FieldMetadataContent from '@/components/fieldMetadata/FieldMetadataContent';

interface FieldDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  field: any;
  allCalculatedFields?: any[];
  onFieldUpdate?: (fieldName: string, metadata: any) => void;
}


export default function FieldDetailsDialog({ open, onClose, field, allCalculatedFields = [], onFieldUpdate }: FieldDetailsDialogProps) {
  const [tabValue, setTabValue] = useState(0);
  const [showExpressionGraph, setShowExpressionGraph] = useState(false);
  const [selectedExpression, setSelectedExpression] = useState<string>('');
  
  if (!field) return null;
  
  // Determine the source for metadata operations
  let sourceType: 'dataset' | 'analysis' | 'dashboard' = 'dataset';
  let sourceId: string | undefined;
  
  // For calculated fields, check if they belong to an analysis or dashboard
  if (field?.isCalculated) {
    // Check if this field is defined in an analysis
    const analysisSource = field.sources?.find((s: any) => s.assetType === 'analysis');
    if (analysisSource && !field.sources?.some((s: any) => s.assetType === 'dataset')) {
      sourceType = 'analysis';
      sourceId = analysisSource.assetId;
    } else {
      // Check if this field is defined in a dashboard
      const dashboardSource = field.sources?.find((s: any) => s.assetType === 'dashboard');
      if (dashboardSource && !field.sources?.some((s: any) => s.assetType === 'dataset')) {
        sourceType = 'dashboard';
        sourceId = dashboardSource.assetId;
      }
    }
  }
  
  // If not a calculated field or calculated field belongs to a dataset, use dataset
  if (!sourceId) {
    const firstDataset = field?.sources?.find((s: any) => s.assetType === 'dataset');
    if (firstDataset) {
      sourceType = 'dataset';
      sourceId = firstDataset.assetId;
    }
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { 
          height: '90vh',
          maxHeight: '90vh',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ py: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {field.isCalculated ? (
            <CalculateIcon color="primary" sx={{ fontSize: 20 }} />
          ) : (
            <FieldIcon color="action" sx={{ fontSize: 20 }} />
          )}
          <Typography variant="body1" fontWeight={500}>{field.fieldName}</Typography>
          {field.isCalculated && (
            <Chip label="Calculated" size="small" color="primary" sx={{ height: 20 }} />
          )}
        </Stack>
        <IconButton
          aria-label="close"
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 4, top: 4 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ minHeight: 36 }}>
          <Tab label="Details" icon={<InfoIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 36, py: 0, px: 2, fontSize: '0.813rem' }} />
          <Tab label="Metadata" icon={<TagIcon sx={{ fontSize: 16 }} />} iconPosition="start" disabled={!sourceId} sx={{ minHeight: 36, py: 0, px: 2, fontSize: '0.813rem' }} />
        </Tabs>
      </Box>
      <DialogContent dividers sx={{ p: 1.5 }}>
        {tabValue === 0 ? (
          <FieldDetailsContent 
            field={field} 
            allCalculatedFields={allCalculatedFields}
            showExpressionGraph={showExpressionGraph}
            setShowExpressionGraph={setShowExpressionGraph}
            selectedExpression={selectedExpression}
            setSelectedExpression={setSelectedExpression}
          />
        ) : (
          sourceId && (
            <FieldMetadataContent
              sourceType={sourceType}
              sourceId={sourceId}
              field={{
                name: field.fieldName,
                type: field.dataType,
                expression: field.expression,
              }}
              onUpdate={(metadata) => {
                if (onFieldUpdate) {
                  onFieldUpdate(field.fieldName, metadata);
                }
              }}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

// Details Tab Content
function FieldDetailsContent({ field, allCalculatedFields, showExpressionGraph, setShowExpressionGraph, selectedExpression, setSelectedExpression }: { 
  field: any; 
  allCalculatedFields: any[];
  showExpressionGraph: boolean;
  setShowExpressionGraph: (show: boolean) => void;
  selectedExpression: string;
  setSelectedExpression: (expr: string) => void;
}) {
  return (
    <Box>
      {/* Basic Information */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid item xs={6}>
          <Typography variant="caption" color="text.secondary">
            Field ID
          </Typography>
          <Typography variant="body2">{field.fieldId}</Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="caption" color="text.secondary">
            Data Type
          </Typography>
          <Typography variant="body2">{field.dataType || 'Unknown'}</Typography>
        </Grid>
      </Grid>


      {/* Expressions for calculated fields */}
      {field.isCalculated && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
            Expression{field.expressions && field.expressions.length > 1 ? 's' : ''}
          </Typography>
          <MultipleExpressionsDisplay
            expressions={field.expressions}
            primaryExpression={field.expression}
            onShowGraph={(expr) => {
              setSelectedExpression(expr);
              setShowExpressionGraph(true);
            }}
          />
        </Box>
      )}

      {/* Usage */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
          Used In
        </Typography>
        <FieldUsageBadges sources={field.sources} />
        <Divider sx={{ my: 1 }} />
        <Stack spacing={0.5}>
          {field.sources.map((source: any, index: number) => (
            <Paper key={index} variant="outlined" sx={{ p: 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.813rem' }}>{source.assetName}</Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.7rem' }}
                  >
                    {source.assetId}
                  </Typography>
                </Box>
                <Chip
                  label={source.assetType}
                  size="small"
                  variant="outlined"
                  color={
                    source.assetType === 'dashboard'
                      ? 'success'
                      : source.assetType === 'analysis'
                      ? 'secondary'
                      : 'primary'
                  }
                />
              </Stack>
              {source.datasetName && source.assetType !== 'dataset' && (
                <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    Dataset: {source.datasetName}
                  </Typography>
                  {(source.datasourceType || source.importMode) && (
                    <DatasourceTypeBadge
                      datasourceType={source.datasourceType}
                      importMode={source.importMode}
                      compact
                    />
                  )}
                </Box>
              )}
            </Paper>
          ))}
        </Stack>
      </Box>

      {/* Lineage Summary */}
      {field.lineage && (
        <Box>
          <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
            Lineage Summary
          </Typography>
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Grid container spacing={1}>
              {field.lineage.datasetIds && field.lineage.datasetIds.length > 0 && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Datasets
                  </Typography>
                  <Typography variant="body2">
                    {field.lineage.datasetIds.length}
                  </Typography>
                </Grid>
              )}
              {field.lineage.analysisIds && field.lineage.analysisIds.length > 0 && (
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Analyses
                  </Typography>
                  <Typography variant="body1">
                    {field.lineage.analysisIds.length}
                  </Typography>
                </Grid>
              )}
              {field.lineage.dashboardIds && field.lineage.dashboardIds.length > 0 && (
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Dashboards
                  </Typography>
                  <Typography variant="body1">
                    {field.lineage.dashboardIds.length}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Box>
      )}

      {/* Expression Graph Dialog */}
      {field.isCalculated && (
        <ExpressionGraphDialog
          field={{
            fieldName: field.fieldName,
            expression: selectedExpression || field.expression || field.expressions?.[0] || '',
            dataSetIdentifier: field.sources?.[0]?.assetId
          }}
          allFields={allCalculatedFields.map((f: any) => ({
            fieldName: f.fieldName,
            expression: f.expression || f.expressions?.[0] || '',
            dataSetIdentifier: f.sources?.[0]?.assetId
          }))}
          open={showExpressionGraph}
          onClose={() => {
            setShowExpressionGraph(false);
            setSelectedExpression('');
          }}
        />
      )}
    </Box>
  );
}

