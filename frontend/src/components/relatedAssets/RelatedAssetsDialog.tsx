import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  IconButton,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Close as CloseIcon,
  Dashboard as DashboardIcon,
  Analytics as AnalysisIcon,
  Storage as DatasetIcon,
  Source as DatasourceIcon,
  Link as LinkIcon,
  ExpandMore as ExpandMoreIcon,
  ArrowForward as UsesIcon,
  ArrowBack as UsedByIcon,
} from '@mui/icons-material';
import { RelatedAsset } from '@/types/relatedAssets';
import { useNavigate } from 'react-router-dom';

interface RelatedAssetsDialogProps {
  open: boolean;
  onClose: () => void;
  assetName: string;
  assetType: string;
  relatedAssets: RelatedAsset[];
}

const assetTypeConfig = {
  dashboard: { 
    icon: DashboardIcon, 
    color: 'success',
    path: '/dashboards',
    label: 'Dashboard',
    pluralLabel: 'Dashboards'
  },
  analysis: { 
    icon: AnalysisIcon, 
    color: 'secondary',
    path: '/analyses',
    label: 'Analysis',
    pluralLabel: 'Analyses'
  },
  dataset: { 
    icon: DatasetIcon, 
    color: 'primary',
    path: '/datasets',
    label: 'Dataset',
    pluralLabel: 'Datasets'
  },
  datasource: { 
    icon: DatasourceIcon, 
    color: 'warning',
    path: '/datasources',
    label: 'Data Source',
    pluralLabel: 'Data Sources'
  },
} as const;

export default function RelatedAssetsDialog({
  open,
  onClose,
  assetName,
  assetType,
  relatedAssets = [],
}: RelatedAssetsDialogProps) {
  const navigate = useNavigate();

  // Group by relationship type first (Uses vs Used By)
  const groupedByRelationship = relatedAssets.reduce((acc, asset) => {
    const relationshipType = asset.relationship?.toLowerCase().includes('used by') ? 'used_by' : 'uses';
    if (!acc[relationshipType]) acc[relationshipType] = [];
    acc[relationshipType].push(asset);
    return acc;
  }, {} as Record<string, RelatedAsset[]>);

  // Further group each relationship type by asset type
  const usesAssets = (groupedByRelationship.uses || []).reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = [];
    acc[asset.type].push(asset);
    return acc;
  }, {} as Record<string, RelatedAsset[]>);

  const usedByAssets = (groupedByRelationship.used_by || []).reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = [];
    acc[asset.type].push(asset);
    return acc;
  }, {} as Record<string, RelatedAsset[]>);

  const handleAssetClick = (asset: RelatedAsset) => {
    const config = assetTypeConfig[asset.type];
    // Navigate to the list page with the asset name as a search query
    navigate(`${config.path}?search=${encodeURIComponent(asset.name)}`);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinkIcon />
            <Typography variant="h6">Related Assets</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {assetType}
          </Typography>
          <Typography variant="subtitle1" fontWeight={500}>
            {assetName}
          </Typography>
        </Box>

        {/* Uses Section */}
        {groupedByRelationship.uses && groupedByRelationship.uses.length > 0 && (
          <Accordion defaultExpanded sx={{ mb: 1 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                backgroundColor: 'action.hover',
                minHeight: 48,
                '&.Mui-expanded': { minHeight: 48 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <UsesIcon fontSize="small" />
                <Typography variant="subtitle2">
                  Uses ({groupedByRelationship.uses.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List sx={{ pt: 0 }}>
                {(['datasource', 'dataset', 'analysis'] as const).map((type) => {
                  const assets = usesAssets[type];
                  if (!assets || assets.length === 0) return null;

                  const config = assetTypeConfig[type];
                  const Icon = config.icon;

                  return (
                    <React.Fragment key={type}>
                      <Box sx={{ px: 1.5, py: 0.5, backgroundColor: 'background.default' }}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 0.5,
                            color: `${config.color}.main`,
                            fontWeight: 500
                          }}
                        >
                          <Icon sx={{ fontSize: 16 }} />
                          {config.pluralLabel} ({assets.length})
                        </Typography>
                      </Box>
                      {assets.map((asset) => (
                        <ListItem key={asset.id} disablePadding>
                          <ListItemButton 
                            onClick={() => handleAssetClick(asset)}
                            sx={{ py: 0.5, px: 1.5 }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <Icon sx={{ fontSize: 18 }} color={config.color as any} />
                            </ListItemIcon>
                            <ListItemText
                              primary={asset.name}
                              primaryTypographyProps={{ variant: 'body2' }}
                              secondary={
                                <Typography 
                                  variant="caption" 
                                  sx={{ fontSize: '0.7rem', fontFamily: 'monospace', display: 'block' }}
                                >
                                  {asset.id}
                                </Typography>
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Used By Section */}
        {groupedByRelationship.used_by && groupedByRelationship.used_by.length > 0 && (
          <Accordion defaultExpanded>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                backgroundColor: 'action.hover',
                minHeight: 48,
                '&.Mui-expanded': { minHeight: 48 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <UsedByIcon fontSize="small" />
                <Typography variant="subtitle2">
                  Used By ({groupedByRelationship.used_by.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List sx={{ pt: 0 }}>
                {(['dataset', 'analysis', 'dashboard'] as const).map((type) => {
                  const assets = usedByAssets[type];
                  if (!assets || assets.length === 0) return null;

                  const config = assetTypeConfig[type];
                  const Icon = config.icon;

                  return (
                    <React.Fragment key={type}>
                      <Box sx={{ px: 1.5, py: 0.5, backgroundColor: 'background.default' }}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 0.5,
                            color: `${config.color}.main`,
                            fontWeight: 500
                          }}
                        >
                          <Icon sx={{ fontSize: 16 }} />
                          {config.pluralLabel} ({assets.length})
                        </Typography>
                      </Box>
                      {assets.map((asset) => (
                        <ListItem key={asset.id} disablePadding>
                          <ListItemButton 
                            onClick={() => handleAssetClick(asset)}
                            sx={{ py: 0.5, px: 1.5 }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <Icon sx={{ fontSize: 18 }} color={config.color as any} />
                            </ListItemIcon>
                            <ListItemText
                              primary={asset.name}
                              primaryTypographyProps={{ variant: 'body2' }}
                              secondary={
                                <Typography 
                                  variant="caption" 
                                  sx={{ fontSize: '0.7rem', fontFamily: 'monospace', display: 'block' }}
                                >
                                  {asset.id}
                                </Typography>
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>
        )}

        {/* No Related Assets Message */}
        {(!groupedByRelationship.uses || groupedByRelationship.uses.length === 0) && 
         (!groupedByRelationship.used_by || groupedByRelationship.used_by.length === 0) && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No related assets found
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ py: 1 }}>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}