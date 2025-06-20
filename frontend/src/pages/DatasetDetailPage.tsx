import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Button,
  Tab,
  Tabs,
  Chip,
  Stack,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  ArrowBack as BackIcon,
  Info as InfoIcon,
  TableChart as FieldIcon,
  Functions as CalcFieldIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { assetsApi, tagsApi } from '@/services/api';
import TagsCell from '@/components/tags/TagsCell';
import FieldMetadataDialog from '@/components/fieldMetadata/FieldMetadataDialog';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dataset-tabpanel-${index}`}
      aria-labelledby={`dataset-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [selectedField, setSelectedField] = useState<any>(null);
  const [fieldMetadataDialog, setFieldMetadataDialog] = useState(false);
  const [fieldMetadata, setFieldMetadata] = useState<Record<string, any>>({});

  // Fetch dataset details
  const { data: dataset, isLoading: datasetLoading, error: datasetError } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => assetsApi.getAsset('datasets', datasetId!),
    enabled: !!datasetId,
  });

  // Parse dataset to get fields and calculated fields
  const { data: parsedData, isLoading: parsingLoading } = useQuery({
    queryKey: ['dataset-parsed', datasetId],
    queryFn: () => assetsApi.parseAsset('datasets', datasetId!),
    enabled: !!datasetId,
  });

  // Fetch all field metadata for this dataset
  const { data: allFieldMetadata, refetch: refetchFieldMetadata } = useQuery({
    queryKey: ['field-metadata-all', datasetId],
    queryFn: () => tagsApi.getAllFieldsMetadata(datasetId!),
    enabled: !!datasetId,
  });

  // Process field metadata into a map
  useEffect(() => {
    if (allFieldMetadata && Array.isArray(allFieldMetadata)) {
      const metadataMap: Record<string, any> = {};
      allFieldMetadata.forEach((metadata: any) => {
        metadataMap[metadata.fieldName] = metadata;
      });
      
      setFieldMetadata(metadataMap);
    }
  }, [allFieldMetadata]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleFieldClick = (field: any) => {
    setSelectedField(field);
    setFieldMetadataDialog(true);
  };

  const handleMetadataUpdate = async () => {
    await refetchFieldMetadata();
  };

  // Define columns for fields
  const fieldColumns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Field Name',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'type',
      headerName: 'Data Type',
      width: 150,
      renderCell: (params) => (
        <Chip
          label={params.value || 'Unknown'}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
      ),
    },
    {
      field: 'tags',
      headerName: 'Tags',
      width: 250,
      renderCell: (params) => {
        const metadata = fieldMetadata[params.row.name];
        const tags = metadata?.tags || [];
        
        return (
          <TagsCell
            tags={tags}
            onClick={() => handleFieldClick(params.row)}
          />
        );
      },
      valueGetter: (params) => {
        const metadata = fieldMetadata[params.row.name];
        const tags = metadata?.tags || [];
        return tags.map((tag: any) => `${tag.key}:${tag.value}`).join(' ');
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.5,
      renderCell: (params) => {
        const metadata = fieldMetadata[params.row.name];
        return (
          <Typography
            variant="body2"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: metadata?.description ? 'text.primary' : 'text.disabled',
            }}
          >
            {metadata?.description || 'No description'}
          </Typography>
        );
      },
      valueGetter: (params) => {
        const metadata = fieldMetadata[params.row.name];
        return metadata?.description || '';
      },
    },
    {
      field: 'dataQuality',
      headerName: 'Data Quality',
      width: 120,
      renderCell: (params) => {
        const metadata = fieldMetadata[params.row.name];
        const quality = metadata?.dataQuality;
        
        if (!quality) {
          return <Typography variant="body2" color="text.disabled">-</Typography>;
        }
        
        const score = quality.completeness || 0;
        const color = score >= 90 ? 'success' : score >= 70 ? 'warning' : 'error';
        
        return (
          <Chip
            label={`${score}%`}
            size="small"
            color={color}
            sx={{ fontSize: '0.75rem' }}
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          startIcon={<InfoIcon />}
          onClick={() => handleFieldClick(params.row)}
        >
          Edit
        </Button>
      ),
    },
  ];

  // Define columns for calculated fields
  const calcFieldColumns: GridColDef[] = [
    ...fieldColumns,
    {
      field: 'expression',
      headerName: 'Expression',
      flex: 2,
      renderCell: (params) => (
        <Tooltip title={params.value}>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
  ];

  if (datasetError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load dataset details. Please try again later.
        </Alert>
      </Box>
    );
  }

  if (datasetLoading || parsingLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  const fields = parsedData?.parsed?.fields || [];
  const calculatedFields = parsedData?.parsed?.calculatedFields || [];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/datasets')}>
          <BackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4">{dataset?.DataSet?.Name || 'Dataset'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {datasetId}
          </Typography>
        </Box>
      </Box>

      {/* Dataset Info */}
      <Paper sx={{ mb: 3, p: 2 }}>
        <Stack direction="row" spacing={3}>
          <Box>
            <Typography variant="caption" color="text.secondary">Import Mode</Typography>
            <Typography variant="body2">
              {dataset?.DataSet?.ImportMode || 'Unknown'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Last Updated</Typography>
            <Typography variant="body2">
              {dataset?.DataSet?.LastUpdatedTime 
                ? format(new Date(dataset.DataSet.LastUpdatedTime), 'PPpp')
                : 'Unknown'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Total Fields</Typography>
            <Typography variant="body2">
              {fields.length + calculatedFields.length}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Tabs */}
      <Paper>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab 
            label={`Fields (${fields.length})`} 
            icon={<FieldIcon />} 
            iconPosition="start"
          />
          <Tab 
            label={`Calculated Fields (${calculatedFields.length})`} 
            icon={<CalcFieldIcon />} 
            iconPosition="start"
          />
        </Tabs>

        {/* Fields Tab */}
        <TabPanel value={tabValue} index={0}>
          <DataGrid
            rows={fields.map((field: any, index: number) => ({
              id: index,
              name: field.name,
              type: field.type,
              ...field,
            }))}
            columns={fieldColumns}
            autoHeight
            disableRowSelectionOnClick
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            pageSizeOptions={[25, 50, 100]}
            slots={{
              toolbar: GridToolbar,
            }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 500 },
              },
            }}
          />
        </TabPanel>

        {/* Calculated Fields Tab */}
        <TabPanel value={tabValue} index={1}>
          <DataGrid
            rows={calculatedFields.map((field: any, index: number) => ({
              id: index,
              name: field.name,
              type: field.dataType,
              expression: field.expression,
              ...field,
            }))}
            columns={calcFieldColumns}
            autoHeight
            disableRowSelectionOnClick
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            pageSizeOptions={[25, 50, 100]}
            slots={{
              toolbar: GridToolbar,
            }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 500 },
              },
            }}
          />
        </TabPanel>
      </Paper>

      {/* Field Metadata Dialog */}
      {selectedField && (
        <FieldMetadataDialog
          open={fieldMetadataDialog}
          onClose={() => setFieldMetadataDialog(false)}
          datasetId={datasetId!}
          field={selectedField}
          metadata={fieldMetadata[selectedField.name]}
          onUpdate={handleMetadataUpdate}
        />
      )}
    </Box>
  );
}