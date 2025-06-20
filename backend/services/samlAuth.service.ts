import { STS } from '@aws-sdk/client-sts';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const parseXml = promisify(parseString);

export interface SamlConfig {
  roleArn: string;
  providerArn: string;
  sessionDuration?: number;
}

export interface SamlAssertion {
  SAMLResponse: string;
  RelayState?: string;
}

export interface AssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export class SamlAuthService {
  private sts: STS;
  private config: SamlConfig;

  constructor(config: SamlConfig) {
    this.sts = new STS({});
    this.config = config;
  }

  /**
   * Process SAML response from existing Okta flow
   * The user will have already authenticated with Okta and AWS
   * We just need to exchange the SAML assertion for temporary credentials
   */

  /**
   * Process SAML response and exchange for AWS credentials
   */
  async processSamlResponse(assertion: SamlAssertion): Promise<AssumeRoleResult> {
    try {
      // Decode and validate SAML response
      const decodedResponse = Buffer.from(assertion.SAMLResponse, 'base64').toString('utf-8');
      logger.info('Processing SAML response');

      // Parse SAML response to extract attributes
      const parsedResponse = await parseXml(decodedResponse);
      this.extractSamlAssertion(parsedResponse);

      // Assume role with SAML
      const assumeRoleResponse = await this.sts.assumeRoleWithSAML({
        RoleArn: this.config.roleArn,
        PrincipalArn: this.config.providerArn,
        SAMLAssertion: assertion.SAMLResponse,
        DurationSeconds: this.config.sessionDuration || 3600,
      });

      if (!assumeRoleResponse.Credentials) {
        throw new Error('Failed to obtain credentials from AssumeRoleWithSAML');
      }

      const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = assumeRoleResponse.Credentials;

      if (!AccessKeyId || !SecretAccessKey || !SessionToken || !Expiration) {
        throw new Error('Incomplete credentials received from AssumeRoleWithSAML');
      }

      logger.info('Successfully assumed role with SAML', {
        roleArn: this.config.roleArn,
        expiration: Expiration,
      });

      return {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
        expiration: Expiration,
      };
    } catch (error) {
      logger.error('Failed to process SAML response', { error });
      throw error;
    }
  }



  /**
   * Extract SAML assertion attributes
   */
  private extractSamlAssertion(parsedResponse: any): any {
    try {
      // Navigate through the SAML response structure
      const response = parsedResponse['samlp:Response'] || parsedResponse['Response'];
      const assertion = response?.['saml:Assertion']?.[0] || response?.['Assertion']?.[0];
      const subject = assertion?.['saml:Subject']?.[0] || assertion?.['Subject']?.[0];
      const attributes = assertion?.['saml:AttributeStatement']?.[0]?.['saml:Attribute'] || 
                        assertion?.['AttributeStatement']?.[0]?.['Attribute'] || [];

      return {
        nameId: subject?.['saml:NameID']?.[0]?._ || subject?.['NameID']?.[0]?._,
        attributes: attributes.reduce((acc: any, attr: any) => {
          const name = attr.$.Name;
          const value = attr['saml:AttributeValue']?.[0]?._ || attr['AttributeValue']?.[0]?._;
          acc[name] = value;
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error('Failed to extract SAML assertion', { error });
      return null;
    }
  }
}