import { MCPServer } from '@mastra/mcp';
import { sqlExecuteTool } from './tools/sql-confirm-execute-tool';
import { sqlAgentTool } from './tools/sql-agent-tool';
import { mcpConfig, serverConfig, sqlAgentConfig } from '../config/env';
import http from 'http';

const server = new MCPServer({
  name: mcpConfig.serverName,
  description: mcpConfig.serverDescription,
  version: mcpConfig.serverVersion,
  tools: {
    // Dynamic key: sqlAgentTool can be customized for specific use cases
    // (e.g., "gym-sql-assistant", "restaurant-db-helper")
    [sqlAgentConfig.toolId]: sqlAgentTool,
    // Fixed key: sqlExecuteTool is an internal utility tool that doesn't need
    // customization and always has the same purpose (token-based SQL execution)
    sqlExecuteTool,
  },
});

// Check configuration for enabling/disabling interfaces
const enableStdio = mcpConfig.enableStdio;
const enableSSE = mcpConfig.enableSSE;
const enableHTTP = mcpConfig.enableHTTP;
const apiKey = mcpConfig.apiKey;

// Authentication middleware for HTTP/SSE
const authenticateRequest = (req: http.IncomingMessage): boolean => {
  // Skip authentication if no API key is configured
  if (!apiKey) {
    return true;
  }

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === apiKey;
  }

  // Check API key in query parameters
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const apiKeyParam = url.searchParams.get('api_key');
  if (apiKeyParam) {
    return apiKeyParam === apiKey;
  }

  return false;
};

// Start the MCP server using stdio transport
if (enableStdio) {
  server.startStdio();
  console.log('Stdio interface enabled');
} else {
  console.log('Stdio interface disabled');
}

// Log authentication status
if (apiKey) {
  console.log('🔐 API key authentication enabled for HTTP/SSE interfaces');
} else {
  console.log('⚠️ No API key configured - HTTP/SSE interfaces are public');
}

// Start the MCP server using sse transport
if (enableSSE) {
  const sseServer = http.createServer(async (req, res) => {
    // Authenticate request
    if (!authenticateRequest(req)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' })
      );
      return;
    }

    await server.startSSE({
      url: new URL(
        req.url || '',
        `http://${serverConfig.host}:${serverConfig.ssePort}`
      ),
      ssePath: '/sse',
      messagePath: '/message',
      req,
      res,
    });
  });

  sseServer.listen(serverConfig.ssePort, () => {
    console.log(`SSE server listening on port ${serverConfig.ssePort}`);
  });
} else {
  console.log('SSE interface disabled');
}

// Start the MCP server using http transport
if (enableHTTP) {
  const httpServer = http.createServer(async (req, res) => {
    // Authenticate request
    if (!authenticateRequest(req)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' })
      );
      return;
    }

    await server.startHTTP({
      url: new URL(
        req.url || '',
        `http://${serverConfig.host}:${serverConfig.httpPort}`
      ),
      httpPath: `/mcp`,
      req,
      res,
      options: {
        sessionIdGenerator: undefined,
      },
    });
  });

  httpServer.listen(serverConfig.httpPort, () => {
    console.log(`HTTP server listening on port ${serverConfig.httpPort}`);
  });
} else {
  console.log('HTTP interface disabled');
}

// Check if at least one interface is enabled
if (!enableStdio && !enableSSE && !enableHTTP) {
  console.warn(
    'Warning: No MCP interfaces are enabled. Please enable at least one interface in .env file.'
  );
}
