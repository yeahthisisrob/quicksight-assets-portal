import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';
import { Construct } from 'constructs';

export interface QuicksightPortalStackProps extends cdk.StackProps {
  existingSamlRoleArn?: string;
  existingSamlProviderArn?: string;
  allowedIpRanges?: string[];
}

export class QuicksightPortalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: QuicksightPortalStackProps) {
    super(scope, id, props);

    // S3 bucket for static frontend
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `quicksight-portal-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3 bucket for metadata storage
    const metadataBucket = new s3.Bucket(this, 'MetadataBucket', {
      bucketName: `quicksight-metadata-bucket-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{
        id: 'cleanup-old-versions',
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
    });

    // Grant access to metadata bucket for both Lambda and Cognito roles (will be set up later)

    // CloudFront Origin Access Identity
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for QuickSight Portal',
    });

    // Grant CloudFront access to S3
    websiteBucket.grantRead(oai);

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(websiteBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      webAclId: props?.allowedIpRanges ? this.createWebAcl(props.allowedIpRanges) : undefined,
    });


    // Use existing SAML role and provider (optional)
    const existingSamlRoleArn = props?.existingSamlRoleArn || this.node.tryGetContext('existingSamlRoleArn');
    const existingSamlProviderArn = props?.existingSamlProviderArn || this.node.tryGetContext('existingSamlProviderArn');

    // Create Cognito User Pool
    const userPool = new cognito.UserPool(this, 'QuickSightPortalUserPool', {
      userPoolName: 'quicksight-portal-users',
      selfSignUpEnabled: false, // Disable self-registration
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test environments
      mfa: cognito.Mfa.OPTIONAL, // Enable MFA as optional
      mfaSecondFactor: {
        sms: false,
        otp: true, // Use authenticator apps
      },
    });

    // Create a group for QuickSight users
    new cognito.CfnUserPoolGroup(this, 'QuickSightUsersGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'QuickSightUsers',
      description: 'Users with access to QuickSight Portal',
      precedence: 1,
    });

    // Create an admin group
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Admins',
      description: 'Portal administrators',
      precedence: 0,
    });

    // Create User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'QuickSightPortalUserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // For web clients
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          `https://${distribution.domainName}/auth/cognito/callback`,
          'http://localhost:5173/auth/cognito/callback', // For local development
        ],
        logoutUrls: [
          `https://${distribution.domainName}`,
          'http://localhost:5173',
        ],
      },
    });

    // Create Cognito Domain
    const cognitoDomain = new cognito.UserPoolDomain(this, 'QuickSightPortalUserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `quicksight-portal-${this.account}`,
      },
    });

    // Create IAM Role for Cognito authenticated users
    const cognitoAuthRole = new iam.Role(this, 'CognitoAuthRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': userPool.userPoolId,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        )
      ),
      description: 'Role for Cognito authenticated users to access QuickSight',
    });

    // Add QuickSight permissions to Cognito role
    cognitoAuthRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'quicksight:Describe*',
        'quicksight:List*',
        'quicksight:Search*',
        'quicksight:Get*',
      ],
      resources: ['*'],
    }));

    // Add S3 permissions for metadata bucket
    cognitoAuthRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        `arn:aws:s3:::quicksight-metadata-bucket-${this.account}`,
        `arn:aws:s3:::quicksight-metadata-bucket-${this.account}/*`,
      ],
    }));

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add STS permissions to Lambda role
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRoleWithSAML',
        'sts:AssumeRole',
      ],
      resources: existingSamlRoleArn ? [existingSamlRoleArn, cognitoAuthRole.roleArn] : [cognitoAuthRole.roleArn],
    }));

    // Add Cognito permissions to Lambda role
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminListGroupsForUser',
      ],
      resources: [userPool.userPoolArn],
    }));

    // Add QuickSight permissions to Lambda role
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'quicksight:Describe*',
        'quicksight:List*',
        'quicksight:Search*',
        'quicksight:Get*',
        'quicksight:TagResource',
        'quicksight:UntagResource',
        'quicksight:UpdateDataSet',
        'quicksight:UpdateDashboard',
        'quicksight:UpdateAnalysis',
      ],
      resources: ['*'],
    }));

    // Add S3 permissions to Lambda role for metadata bucket
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:CreateBucket',
        's3:HeadBucket',
      ],
      resources: [
        `arn:aws:s3:::quicksight-metadata-bucket-${this.account}`,
        `arn:aws:s3:::quicksight-metadata-bucket-${this.account}/*`,
      ],
    }));

    // Lambda function - use pre-built code
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend')),
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15), // Maximum Lambda timeout for large accounts
      memorySize: 512,
      environment: {
        NODE_ENV: 'production',
        SAML_ROLE_ARN: existingSamlRoleArn || '',
        SAML_PROVIDER_ARN: existingSamlProviderArn || '',
        OKTA_SAML_ROLE_ARN: existingSamlRoleArn || '',
        OKTA_SAML_PROVIDER_ARN: existingSamlProviderArn || '',
        OKTA_SAML_APP_URL: this.node.tryGetContext('oktaAppUrl') || '',
        FRONTEND_URL: `https://${distribution.domainName}`,
        QUICKSIGHT_IDENTITY_REGION: this.region,
        BUCKET_NAME: `quicksight-metadata-bucket-${this.account}`,
        AWS_ACCOUNT_ID: this.account,
        OKTA_APP_URL: this.node.tryGetContext('oktaAppUrl') || '',
        DEPLOYMENT_TIME: new Date().toISOString(),
        // Cognito configuration
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_DOMAIN: `${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
        COGNITO_AUTH_ROLE_ARN: cognitoAuthRole.roleArn,
        // Logging configuration
        LOG_LEVEL: 'INFO',
        LOG_SAMPLE_RATE: '0.1',
        SERVICE_NAME: 'quicksight-portal-api',
      },
    });

    // Grant Lambda permission to assume the Cognito role
    cognitoAuthRole.grantAssumeRole(lambdaRole);
    
    // Add Lambda role to the trust policy
    cognitoAuthRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [lambdaRole],
        actions: ['sts:AssumeRole'],
      })
    );

    // Grant both roles access to the metadata bucket
    metadataBucket.grantReadWrite(lambdaRole);
    metadataBucket.grantReadWrite(cognitoAuthRole);

    // API Gateway
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'QuicksightPortalApi',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: false, // Disabled to save on X-Ray costs
        dataTraceEnabled: false,
        // loggingLevel: apigateway.MethodLoggingLevel.INFO, // Commented out to avoid CloudWatch Logs role requirement
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [`https://${distribution.domainName}`],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        allowCredentials: true,
      },
    });

    // Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda);

    // Public auth endpoints (no IAM auth)
    const authResource = api.root.addResource('auth');
    
    // Add proxy for all auth routes
    authResource.addProxy({
      defaultIntegration: lambdaIntegration,
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE,
      },
    });
    
    // Health check endpoint (no auth required)
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // Protected API endpoints (authentication handled by Lambda)
    const apiResource = api.root.addResource('api');
    
    // Add proxy resource for all API endpoints
    apiResource.addProxy({
      defaultIntegration: lambdaIntegration,
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE,
      },
    });

    // Create a config.js file with the API endpoint
    const configContent = `window.APP_CONFIG = {
  API_URL: '${api.url}api',
  AWS_REGION: '${this.region}',
  ENVIRONMENT: 'production'
};`;

    // Deploy frontend assets
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist')),
        s3deploy.Source.data('config.js', configContent)
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${distribution.domainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'SamlAcsUrl', {
      value: `${api.url}auth/saml/callback`,
      description: 'SAML ACS URL to configure in Okta',
    });

    if (existingSamlRoleArn) {
      new cdk.CfnOutput(this, 'ExistingSamlRoleArn', {
        value: existingSamlRoleArn,
        description: 'Existing SAML Role ARN being used',
      });
    }

    if (existingSamlProviderArn) {
      new cdk.CfnOutput(this, 'ExistingSamlProviderArn', {
        value: existingSamlProviderArn,
        description: 'Existing SAML Provider ARN being used',
      });
    }

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Domain URL',
    });

    new cdk.CfnOutput(this, 'UserManagementInstructions', {
      value: `To create users: AWS Console → Cognito → User pools → ${userPool.userPoolId} → Users → Create user. Add users to 'QuickSightUsers' group for access.`,
      description: 'How to create users',
    });
  }

  private createWebAcl(_allowedIpRanges: string[]): string {
    // This is a placeholder - you would need to create a WAF WebACL
    // For now, returning undefined to not use WAF
    return '';
  }
}