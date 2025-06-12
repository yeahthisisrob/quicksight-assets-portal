import { Box, Chip, Tooltip } from '@mui/material';
import { People as PeopleIcon, Person as PersonIcon } from '@mui/icons-material';
import { Permission } from '@/types/permissions';

interface PermissionsCellProps {
  permissions?: Permission[];
  onClick?: () => void;
}

export default function PermissionsCell({ permissions = [], onClick }: PermissionsCellProps) {
  const userCount = permissions.filter(p => p.principalType === 'USER').length;
  const groupCount = permissions.filter(p => p.principalType === 'GROUP').length;
  const totalCount = permissions.length;

  if (totalCount === 0) {
    return <Box sx={{ color: 'text.disabled' }}>-</Box>;
  }

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        gap: 0.5, 
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { opacity: 0.8 } : {}
      }}
      onClick={onClick}
    >
      {userCount > 0 && (
        <Tooltip title={`${userCount} user${userCount > 1 ? 's' : ''}`}>
          <Chip
            icon={<PersonIcon sx={{ fontSize: 16 }} />}
            label={userCount}
            size="small"
            variant="outlined"
            sx={{ 
              height: 24,
              '& .MuiChip-label': { px: 0.5 },
              borderColor: 'primary.main',
              color: 'primary.main'
            }}
          />
        </Tooltip>
      )}
      {groupCount > 0 && (
        <Tooltip title={`${groupCount} group${groupCount > 1 ? 's' : ''}`}>
          <Chip
            icon={<PeopleIcon sx={{ fontSize: 16 }} />}
            label={groupCount}
            size="small"
            variant="outlined"
            sx={{ 
              height: 24,
              '& .MuiChip-label': { px: 0.5 },
              borderColor: 'secondary.main',
              color: 'secondary.main'
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
}