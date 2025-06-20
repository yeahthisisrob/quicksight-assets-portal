/**
 * Human-readable logger for local development
 * Wraps PowerTools logger with a more readable format
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatMessage(level: string, message: string, meta?: any): string {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  const levelColors: Record<string, string> = {
    ERROR: colors.red,
    WARN: colors.yellow,
    INFO: colors.green,
    DEBUG: colors.dim,
  };
  
  const levelColor = levelColors[level] || colors.reset;
  const levelText = level.padEnd(5);
  
  let output = `${colors.dim}[${timestamp}]${colors.reset} ${levelColor}${levelText}${colors.reset} ${message}`;
  
  if (meta && Object.keys(meta).length > 0) {
    // Only show important fields in dev
    const { error, assetType, assetId, duration, statusCode, ...rest } = meta;
    
    if (error) {
      output += `\n${colors.red}  └─ Error: ${error.message || error}${colors.reset}`;
      if (error.stack && level === 'ERROR') {
        output += `\n${colors.dim}     ${error.stack.split('\n').slice(1, 3).join('\n     ')}${colors.reset}`;
      }
    }
    
    const importantFields = [];
    if (assetType) importantFields.push(`type=${assetType}`);
    if (assetId) importantFields.push(`id=${assetId}`);
    if (duration) importantFields.push(`${duration}ms`);
    if (statusCode) importantFields.push(`status=${statusCode}`);
    
    if (importantFields.length > 0) {
      output += ` ${colors.dim}(${importantFields.join(', ')})${colors.reset}`;
    }
    
    // Show other fields if in debug mode
    if (process.env.LOG_LEVEL === 'DEBUG' && Object.keys(rest).length > 0) {
      output += `\n${colors.dim}  └─ ${JSON.stringify(rest, null, 2)}${colors.reset}`;
    }
  }
  
  return output;
}

// Store context for local logging
let localContext: Record<string, any> = {};

export const createLocalLogger = (powertoolsLogger: any) => {
  // In local dev, only use console.log with pretty formatting
  return {
    info: (message: string, meta?: any) => {
      console.log(formatMessage('INFO', message, { ...localContext, ...meta }));
    },
    
    warn: (message: string, meta?: any) => {
      console.log(formatMessage('WARN', message, { ...localContext, ...meta }));
    },
    
    error: (message: string, error?: any, meta?: any) => {
      if (error instanceof Error) {
        console.log(formatMessage('ERROR', message, {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          ...localContext,
          ...meta,
        }));
      } else {
        console.log(formatMessage('ERROR', message, { error, ...localContext, ...meta }));
      }
    },
    
    debug: (message: string, meta?: any) => {
      console.log(formatMessage('DEBUG', message, { ...localContext, ...meta }));
    },
    
    addContext: (attributes: Record<string, any>) => {
      // Store context locally for including in future logs
      localContext = { ...localContext, ...attributes };
      // Also update PowerTools for consistency
      powertoolsLogger.appendKeys(attributes);
    },
  };
};