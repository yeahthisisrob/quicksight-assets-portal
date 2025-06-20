import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export function isThrottlingError(error: any): boolean {
  const errorCode = error.name || error.Code || '';
  const errorMessage = error.message || '';
  
  return (
    errorCode === 'ThrottlingException' ||
    errorCode === 'TooManyRequestsException' ||
    errorCode === 'RequestLimitExceeded' ||
    errorCode === 'RateLimitExceededException' ||
    errorMessage.includes('Rate exceeded') ||
    errorMessage.includes('too many requests') ||
    error.statusCode === 429
  );
}

export function isRetryableError(error: any): boolean {
  // AWS SDK retryable errors
  const retryableCodes = [
    'ServiceUnavailable',
    'RequestTimeout',
    'RequestTimeoutException',
    'InternalServerError',
    'InternalError',
  ];
  
  const errorCode = error.name || error.Code || '';
  
  return (
    isThrottlingError(error) ||
    retryableCodes.includes(errorCode) ||
    error.statusCode === 500 ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504
  );
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!isRetryableError(error) || attempt === opts.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay,
      );
      const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
      const delay = Math.floor(baseDelay + jitter);
      
      const errorName = (error as any).name || 'error';
      const errorMessage = (error as any).message || 'Unknown error';
      
      logger.warn(`${operationName} failed with ${errorName}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`, {
        error: errorMessage,
        attempt: attempt + 1,
        delay,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Helper to batch operations with delays to avoid throttling
export async function batchWithDelay<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    concurrency?: number;
  } = {},
): Promise<R[]> {
  const {
    batchSize = 10,
    delayBetweenBatches = 1000,
    concurrency = 5,
  } = options;
  
  const results: R[] = [];
  
  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch with concurrency limit
    const batchPromises = batch.map((item, index) => {
      // Add small delay between concurrent operations
      const delay = Math.floor(index * 100 / concurrency);
      return new Promise<R>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const result = await operation(item);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, delay);
      });
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      logger.debug(`Processed batch ${Math.floor(i / batchSize) + 1}, waiting ${delayBetweenBatches}ms before next batch`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}