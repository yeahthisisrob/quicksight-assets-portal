# User Management Guide for QuickSight Assets Portal

## Overview
The portal uses AWS Cognito for authentication with self-registration disabled. Only administrators can create user accounts.

## Creating Users

### Method 1: AWS Console (Recommended)
1. Go to AWS Console → Cognito → User pools
2. Select `quicksight-portal-users`
3. Click on "Users" tab
4. Click "Create user"
5. Enter:
   - Email address (required)
   - Full name (required)
   - Temporary password (user will be forced to change on first login)
6. Click "Create user"

### Method 2: AWS CLI
```bash
# Create a user
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=name,Value="User Name" \
  --temporary-password "TempPassword123!" \
  --message-action SUPPRESS

# Add user to QuickSightUsers group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <USER_POOL_ID> \
  --username user@example.com \
  --group-name QuickSightUsers
```

## User Groups

### QuickSightUsers
- Regular users with access to view and interact with QuickSight resources
- Cannot manage other users

### Admins
- Full access to QuickSight resources
- Can manage portal settings (if implemented)

## Adding Users to Groups
1. In Cognito console, go to "Groups"
2. Click on "QuickSightUsers" or "Admins"
3. Click "Add users"
4. Select the users to add
5. Click "Add"

## Security Features
- Self-registration is disabled
- Strong password policy enforced
- MFA (Multi-Factor Authentication) available
- Users must be in QuickSightUsers or Admins group to access the portal

## First-Time Login
1. User receives temporary password from administrator
2. User goes to https://your-portal-url
3. Clicks "Sign in with Email & Password"
4. Enters email and temporary password
5. Must change password on first login
6. Can optionally set up MFA

## Password Reset
Users can reset their own passwords:
1. Click "Forgot password?" on the login page
2. Enter email address
3. Receive reset code via email
4. Enter new password

## Removing Access
1. Go to Cognito console
2. Select the user
3. Either:
   - Remove from QuickSightUsers group (temporary removal)
   - Disable the user account (prevents login)
   - Delete the user (permanent removal)