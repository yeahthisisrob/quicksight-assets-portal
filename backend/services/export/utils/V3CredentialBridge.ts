import AWS from 'aws-sdk';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service';

/**
 * V3CredentialBridge - AWS SDK v3 to v2 Credential Bridge
 * 
 * This class provides a seamless way to use AWS SDK v3's modern credential
 * resolution (including SSO support) with AWS SDK v2 clients.
 * 
 * Why this exists:
 * - AWS SDK v2 has limited SSO support and complex credential handling
 * - AWS SDK v3 has excellent SSO support but some APIs have bugs
 * - This bridge allows you to use v3's credentials with v2's stable APIs
 * 
 * Usage:
 * ```typescript
 * const bridge = new V3CredentialBridge();
 * const s3 = new AWS.S3({ 
 *   region: 'us-east-1',
 *   credentials: await bridge.getV2Credentials()
 * });
 * 
 * // Or update existing client:
 * const quicksight = new AWS.QuickSight({ region: 'us-east-1' });
 * await bridge.updateV2Client(quicksight);
 * ```
 * 
 * Features:
 * - Supports all v3 credential sources (SSO, profiles, env vars, IAM roles)
 * - Handles credential refresh automatically
 * - Thread-safe initialization
 * - TypeScript support
 * 
 * @author QuickSight Assets Portal Contributors
 * @license MIT
 */
export class V3CredentialBridge {
  private credentialsPromise: Promise<AWS.Credentials> | null = null;
  private v3Provider = fromNodeProviderChain();

  /**
   * Get AWS SDK v2 Credentials object populated from v3 credential chain
   * @returns Promise<AWS.Credentials> - Ready-to-use v2 credentials
   */
  async getV2Credentials(): Promise<AWS.Credentials> {
    // Use cached promise if available to avoid multiple credential fetches
    if (!this.credentialsPromise) {
      this.credentialsPromise = this.fetchAndConvertCredentials();
    }
    
    return this.credentialsPromise;
  }

  /**
   * Update an existing AWS SDK v2 client with v3 credentials
   * @param v2Client - Any AWS SDK v2 service client
   */
  async updateV2Client(v2Client: AWS.Service): Promise<void> {
    const credentials = await this.getV2Credentials();
    v2Client.config.update({ credentials });
  }

  /**
   * Create a new AWS SDK v2 client with v3 credentials
   * @param ServiceClass - AWS SDK v2 service class (e.g., AWS.S3)
   * @param config - Additional configuration options
   * @returns Promise<T> - Configured service client
   */
  async createV2Client<T extends AWS.Service>(
    ServiceClass: new (config: ServiceConfigurationOptions) => T,
    config: ServiceConfigurationOptions = {}
  ): Promise<T> {
    const credentials = await this.getV2Credentials();
    return new ServiceClass({
      ...config,
      credentials,
    });
  }

  /**
   * Fetch credentials from v3 provider and convert to v2 format
   */
  private async fetchAndConvertCredentials(): Promise<AWS.Credentials> {
    try {
      // Get credentials from v3 provider chain
      const v3Creds = await this.v3Provider();
      
      // Create v2 Credentials object
      const v2Credentials = new AWS.Credentials({
        accessKeyId: v3Creds.accessKeyId,
        secretAccessKey: v3Creds.secretAccessKey,
        sessionToken: v3Creds.sessionToken,
      });

      // If v3 credentials have expiration, set it on v2 credentials
      if (v3Creds.expiration) {
        v2Credentials.expireTime = v3Creds.expiration;
      }

      // Set up refresh mechanism if credentials can expire
      if (v2Credentials.expireTime) {
        v2Credentials.refresh = (callback) => {
          this.refreshCredentials()
            .then(() => callback())
            .catch(callback);
        };
      }

      return v2Credentials;
    } catch (error) {
      // Clear the promise cache on error
      this.credentialsPromise = null;
      throw new Error(`Failed to bridge v3 credentials to v2: ${error}`);
    }
  }

  /**
   * Refresh credentials by fetching new ones from v3 provider
   */
  private async refreshCredentials(): Promise<void> {
    this.credentialsPromise = null;
    await this.getV2Credentials();
  }

  /**
   * Clear cached credentials (useful for testing or credential rotation)
   */
  clearCache(): void {
    this.credentialsPromise = null;
  }
}

// Export a singleton instance for convenience
export const v3CredentialBridge = new V3CredentialBridge();