# Deployment Guide

This guide covers deploying the QuickSight Assets Portal to AWS using CDK.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js 18+ and npm installed
3. AWS CDK CLI installed (`npm install -g aws-cdk`)
4. An AWS account with QuickSight activated

## Quick Start (Cognito Authentication)

The simplest deployment uses AWS Cognito for authentication:

```bash
# Clone the repository
git clone <repository-url>
cd quicksight-assets-portal

# Install dependencies
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
cd infrastructure/cdk && npm install && cd ../..

# Build the application
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Deploy to AWS
cd infrastructure/cdk
npm run deploy
```

## Configuration Options

### 1. Cognito Authentication (Default)

The stack automatically creates:
- AWS Cognito User Pool with self-registration disabled
- User groups (QuickSightUsers, Admins)
- IAM roles with appropriate permissions
- S3 bucket for metadata storage

### 2. SAML/Okta Authentication

To use existing SAML provider:

1. Create `infrastructure/cdk/cdk.context.json`:
```json
{
  "existingSamlRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_ROLE_NAME",
  "existingSamlProviderArn": "arn:aws:iam::YOUR_ACCOUNT_ID:saml-provider/YOUR_PROVIDER_NAME",
  "oktaAppUrl": "https://YOUR_OKTA_DOMAIN/app/YOUR_APP_ID/YOUR_SSO_ID/sso/saml"
}
```

2. Deploy:
```bash
cd infrastructure/cdk
npm run deploy
```

## Post-Deployment Steps

### 1. Create Users (Cognito)

After deployment, create users in the AWS Console:

1. Go to AWS Console → Cognito → User pools
2. Select the created user pool (check CDK outputs for ID)
3. Create users and add them to the 'QuickSightUsers' group

### 2. Configure Frontend

Create `frontend/.env.production` with the API Gateway URL from CDK outputs:

```bash
VITE_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod/api
```

### 3. Access the Portal

The portal URL is provided in the CDK outputs as `WebsiteURL`.

## Environment Variables

### Backend (.env)

See `.env.example` for all available options. Key variables:

- `AWS_REGION`: AWS region for QuickSight
- `BUCKET_NAME`: S3 bucket for metadata (created by CDK)
- `FRONTEND_URL`: Used for CORS configuration

### Frontend (.env.production)

- `VITE_API_URL`: API Gateway endpoint URL

## Updating the Deployment

To update an existing deployment:

```bash
# Rebuild the application
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Update the stack
cd infrastructure/cdk
npm run deploy
```

## Troubleshooting

### CORS Errors
- Ensure the `FRONTEND_URL` in Lambda environment matches your CloudFront URL
- Check API Gateway CORS configuration

### Authentication Issues
- Verify users are in the correct Cognito group
- Check Lambda logs in CloudWatch for detailed errors

### Missing Resources
- Ensure QuickSight is activated in your AWS account
- Verify IAM permissions for the Lambda execution role

## Cleanup

To remove all resources:

```bash
cd infrastructure/cdk
cdk destroy
```

Note: S3 buckets are retained by default. Delete them manually if needed.