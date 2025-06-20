# Folder Member Management - Implementation Guide

## Overview
The frontend has been prepared for folder member management functionality, but the backend endpoints need to be implemented.

## Required Backend Endpoints

### 1. Add Member to Folder
```
POST /api/folders/:folderId/members
Body: {
  MemberType: "DASHBOARD" | "ANALYSIS" | "DATASET",
  MemberId: string
}
```

Implementation steps:
- Use AWS SDK `UpdateFolderPermissionsCommand` to add the asset to the folder
- The principal would be the asset ARN
- Grant appropriate permissions (e.g., `quicksight:DescribeDashboard`, `quicksight:DescribeAnalysis`, etc.)

### 2. Get Folder Members
```
GET /api/folders/:folderId/members
Response: [{
  MemberType: string,
  MemberId: string,
  MemberName: string,
  AddedDate: string
}]
```

Implementation steps:
- Use AWS SDK `DescribeFolderPermissionsCommand` to get current permissions
- Parse the principals to identify QuickSight assets
- Return formatted member list

### 3. Remove Member from Folder
```
DELETE /api/folders/:folderId/members/:memberId
```

Implementation steps:
- Use AWS SDK `UpdateFolderPermissionsCommand` to revoke permissions
- Remove the asset's principal from the folder

## AWS SDK Commands Needed

```typescript
import { 
  UpdateFolderPermissionsCommand,
  DescribeFolderPermissionsCommand 
} from '@aws-sdk/client-quicksight';

// Example: Add dashboard to folder
const addMemberCommand = new UpdateFolderPermissionsCommand({
  AwsAccountId: accountId,
  FolderId: folderId,
  GrantPermissions: [{
    Principal: `arn:aws:quicksight:${region}:${accountId}:dashboard/${dashboardId}`,
    Actions: [
      'quicksight:DescribeFolder',
      'quicksight:ListFolderMembers'
    ]
  }]
});
```

## Notes
- QuickSight folders use a permission-based membership model
- Assets don't directly "belong" to folders; they have permissions to access folders
- The actual folder structure in QuickSight is more about organizing permissions than physical containment
- Consider implementing a metadata service to track folder memberships separately if needed