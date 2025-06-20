#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { QuicksightPortalStack } from '../lib/quicksight-portal-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new QuicksightPortalStack(app, 'QuicksightPortalStack', {
  env,
  description: 'QuickSight Assets Portal with Okta SAML Authentication',
  existingSamlRoleArn: app.node.tryGetContext('existingSamlRoleArn') || process.env.CDK_SAML_ROLE_ARN || '',
  existingSamlProviderArn: app.node.tryGetContext('existingSamlProviderArn') || process.env.CDK_SAML_PROVIDER_ARN || '',
});