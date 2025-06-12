import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Close as CloseIcon,
  Person as PersonIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { Permission } from '@/types/permissions';

interface PermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  assetName: string;
  assetType: string;
  permissions: Permission[];
}

export default function PermissionsDialog({
  open,
  onClose,
  assetName,
  assetType,
  permissions = [],
}: PermissionsDialogProps) {
  const users = permissions.filter(p => p.principalType === 'USER');
  const groups = permissions.filter(p => p.principalType === 'GROUP');

  const getActionChips = (actions: string[]) => {
    return actions.map((action) => (
      <Chip
        key={action}
        label={action}
        size="small"
        variant="outlined"
        sx={{ height: 20, fontSize: '0.75rem' }}
      />
    ));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon />
            <Typography variant="h6">Permissions</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {assetType}
          </Typography>
          <Typography variant="subtitle1" fontWeight={500}>
            {assetName}
          </Typography>
        </Box>

        <Stack spacing={3}>
          {users.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon fontSize="small" />
                Users ({users.length})
              </Typography>
              <List dense disablePadding>
                {users.map((permission, idx) => (
                  <ListItem key={idx} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <PersonIcon fontSize="small" color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={permission.principal.split('/').pop() || permission.principal}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {getActionChips(permission.actions)}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {users.length > 0 && groups.length > 0 && <Divider />}

          {groups.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PeopleIcon fontSize="small" />
                Groups ({groups.length})
              </Typography>
              <List dense disablePadding>
                {groups.map((permission, idx) => (
                  <ListItem key={idx} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <PeopleIcon fontSize="small" color="secondary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={permission.principal.split('/').pop() || permission.principal}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {getActionChips(permission.actions)}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}