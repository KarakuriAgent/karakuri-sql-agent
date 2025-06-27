import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Ensure dotenv is loaded before any configuration access
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Type definitions for environment configuration
export interface ServerConfig {
  host: string;
  mastraPort: number;
  ssePort: number;
  httpPort: number;
}

export interface DatabaseConfig {
  url: string;
}

export interface MCPConfig {
  serverName: string;
  serverDescription: string;
  serverVersion: string;
  enableStdio: boolean;
  enableSSE: boolean;
  enableHTTP: boolean;
  apiKey?: string; // Optional API key for HTTP/SSE authentication
}

export interface SQLAgentConfig {
  toolId: string;
  toolDescription: string;
}

export interface SQLTokenConfig {
  cleanupIntervalMs: number;
  expirationMs: number;
}

export interface OpenAIConfig {
  apiKey: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  mcp: MCPConfig;
  sqlAgent: SQLAgentConfig;
  sqlToken: SQLTokenConfig;
  openai: OpenAIConfig;
}

// Helper function to parse and validate port numbers
const parsePort = (
  value: string | undefined,
  defaultPort: number,
  name: string
): number => {
  if (!value) {
    return defaultPort;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(
      `⚠️ Invalid ${name} port: "${value}". Must be a number between 1-65535. Using default port ${defaultPort}.`
    );
    return defaultPort;
  }

  return parsed;
};

// Helper function to parse boolean values
const parseBoolean = (
  value: string | undefined,
  defaultValue: boolean
): boolean => {
  if (!value) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true';
};

// Helper function to parse number values with validation
const parseNumber = (
  value: string | undefined,
  defaultValue: number,
  name: string
): number => {
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed < 0) {
    console.warn(
      `⚠️ Invalid ${name}: "${value}". Must be a positive number. Using default value ${defaultValue}.`
    );
    return defaultValue;
  }

  return parsed;
};

// Validation errors collection
const validationErrors: string[] = [];

// Helper function to require environment variable
const requireEnv = (key: string, description: string): string => {
  const value = process.env[key];
  if (!value) {
    // In test environment, provide a test placeholder instead of failing
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return `test-${key.toLowerCase()}`;
    }
    validationErrors.push(
      `❌ Missing required environment variable: ${key} (${description})`
    );
    return '';
  }
  return value;
};

// Create and validate configuration
const createConfig = (): AppConfig => {
  const config: AppConfig = {
    server: {
      host: process.env.HOST || 'localhost',
      mastraPort: parsePort(process.env.MASTRA_PORT, 4111, 'MASTRA_PORT'),
      ssePort: parsePort(process.env.SSE_PORT, 4112, 'SSE_PORT'),
      httpPort: parsePort(process.env.HTTP_PORT, 4113, 'HTTP_PORT'),
    },
    database: {
      url:
        process.env.DATABASE_URL ||
        `file:${resolve(__dirname, '../../example/database/app.db')}`,
    },
    mcp: {
      serverName: process.env.MCP_SERVER_NAME || 'SQL agent server',
      serverDescription:
        process.env.MCP_SERVER_DESCRIPTION || 'SQL agent server',
      serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
      enableStdio: parseBoolean(process.env.MCP_ENABLE_STDIO, true),
      enableSSE: parseBoolean(process.env.MCP_ENABLE_SSE, true),
      enableHTTP: parseBoolean(process.env.MCP_ENABLE_HTTP, true),
      apiKey: process.env.MCP_API_KEY, // Optional API key
    },
    sqlAgent: {
      toolId: process.env.SQL_AGENT_TOOL_ID || 'sqlAgent',
      toolDescription:
        process.env.SQL_AGENT_TOOL_DESCRIPTION ||
        'Perform database operations using natural language.',
    },
    sqlToken: {
      cleanupIntervalMs: parseNumber(
        process.env.SQL_TOKEN_CLEANUP_INTERVAL_MS,
        60000,
        'SQL_TOKEN_CLEANUP_INTERVAL_MS'
      ),
      expirationMs: parseNumber(
        process.env.SQL_TOKEN_EXPIRATION_MS,
        300000,
        'SQL_TOKEN_EXPIRATION_MS'
      ),
    },
    openai: {
      apiKey: requireEnv('OPENAI_API_KEY', 'OpenAI API key for the SQL agent'),
    },
  };

  // Validate that at least one MCP interface is enabled
  if (
    !config.mcp.enableStdio &&
    !config.mcp.enableSSE &&
    !config.mcp.enableHTTP
  ) {
    validationErrors.push(
      '❌ At least one MCP interface must be enabled (STDIO, SSE, or HTTP)'
    );
  }

  // Check for validation errors
  if (validationErrors.length > 0) {
    // In test environment, don't exit process - let tests handle validation
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      console.warn('⚠️ Configuration validation failed in test environment:');
      validationErrors.forEach(error => console.warn(error));
    } else {
      console.error('🚨 Configuration validation failed:');
      validationErrors.forEach(error => console.error(error));
      console.error(
        '\n💡 Please check your .env file and ensure all required environment variables are set.'
      );
      process.exit(1);
    }
  }

  return config;
};

// Lazy initialization to allow tests to set environment variables first
let _config: AppConfig | null = null;

const getConfigInternal = (): AppConfig => {
  if (!_config) {
    _config = createConfig();
  }
  return _config;
};

// Export individual config sections with lazy initialization
export const serverConfig = {
  get host() {
    return getConfigInternal().server.host;
  },
  get mastraPort() {
    return getConfigInternal().server.mastraPort;
  },
  get ssePort() {
    return getConfigInternal().server.ssePort;
  },
  get httpPort() {
    return getConfigInternal().server.httpPort;
  },
};

export const databaseConfig = {
  get url() {
    return getConfigInternal().database.url;
  },
};

export const mcpConfig = {
  get serverName() {
    return getConfigInternal().mcp.serverName;
  },
  get serverDescription() {
    return getConfigInternal().mcp.serverDescription;
  },
  get serverVersion() {
    return getConfigInternal().mcp.serverVersion;
  },
  get enableStdio() {
    return getConfigInternal().mcp.enableStdio;
  },
  get enableSSE() {
    return getConfigInternal().mcp.enableSSE;
  },
  get enableHTTP() {
    return getConfigInternal().mcp.enableHTTP;
  },
  get apiKey() {
    return getConfigInternal().mcp.apiKey;
  },
};

export const sqlAgentConfig = {
  get toolId() {
    return getConfigInternal().sqlAgent.toolId;
  },
  get toolDescription() {
    return getConfigInternal().sqlAgent.toolDescription;
  },
};

export const sqlTokenConfig = {
  get cleanupIntervalMs() {
    return getConfigInternal().sqlToken.cleanupIntervalMs;
  },
  get expirationMs() {
    return getConfigInternal().sqlToken.expirationMs;
  },
};

export const openaiConfig = {
  get apiKey() {
    return getConfigInternal().openai.apiKey;
  },
};

// Export a function to get the full config (useful for testing)
export const getConfig = (): AppConfig => getConfigInternal();

// Reset function for testing
export const resetConfig = (): void => {
  _config = null;
  validationErrors.length = 0;
};

// Export a function to validate config (useful for testing)
export const validateConfig = (): string[] => {
  const errors: string[] = [];
  const currentConfig = getConfigInternal();

  // Re-run validation logic for testing
  if (!process.env.OPENAI_API_KEY) {
    errors.push('Missing OPENAI_API_KEY');
  }

  if (
    !currentConfig.mcp.enableStdio &&
    !currentConfig.mcp.enableSSE &&
    !currentConfig.mcp.enableHTTP
  ) {
    errors.push('At least one MCP interface must be enabled');
  }

  return errors;
};
