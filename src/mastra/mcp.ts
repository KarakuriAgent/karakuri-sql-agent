import 'dotenv/config'; // Auto-load .env file
import { MCPServer } from '@mastra/mcp';
import { sqlExecuteTool } from './tools/sql-execute-tool';
import { sqlAgentTool } from './tools/sql-agent-tool';
import http from 'http';

// Helper function to safely parse port numbers
const parsePort = (
  portString: string | undefined,
  defaultPort: number,
  portName: string
): number => {
  if (!portString) {
    return defaultPort;
  }

  const parsed = parseInt(portString, 10);

  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.error(
      `❌ Invalid ${portName} port: "${portString}". Must be a number between 1-65535. Using default port ${defaultPort}.`
    );
    return defaultPort;
  }

  return parsed;
};

// Get configuration from environment variables
const mcpServerName = process.env.MCP_SERVER_NAME || 'SQL agent server';
const mcpServerDescription =
  process.env.MCP_SERVER_DESCRIPTION || 'SQL agent server';
const mcpServerVersion = process.env.MCP_SERVER_VERSION || '1.0.0';
const sqlAgentToolId = process.env.SQL_AGENT_TOOL_ID || 'sqlAgent';

const server = new MCPServer({
  name: mcpServerName,
  description: mcpServerDescription,
  version: mcpServerVersion,
  tools: {
    // Dynamic key: sqlAgentTool can be customized for specific use cases
    // (e.g., "gym-sql-assistant", "restaurant-db-helper")
    [sqlAgentToolId]: sqlAgentTool,
    // Fixed key: sqlExecuteTool is an internal utility tool that doesn't need
    // customization and always has the same purpose (token-based SQL execution)
    sqlExecuteTool,
  },
});

// Check environment variables for enabling/disabling interfaces
const enableStdio = process.env.MCP_ENABLE_STDIO === 'true';
const enableSSE = process.env.MCP_ENABLE_SSE === 'true';
const enableHTTP = process.env.MCP_ENABLE_HTTP === 'true';

// Start the MCP server using stdio transport
if (enableStdio) {
  server.startStdio();
  console.log('Stdio interface enabled');
} else {
  console.log('Stdio interface disabled');
}

// Start the MCP server using sse transport
if (enableSSE) {
  const ssePort = parsePort(process.env.SSE_PORT, 4112, 'SSE');
  const sseServer = http.createServer(async (req, res) => {
    const host = process.env.HOST || 'localhost';
    await server.startSSE({
      url: new URL(req.url || '', `http://${host}:${ssePort}`),
      ssePath: '/sse',
      messagePath: '/message',
      req,
      res,
    });
  });

  sseServer.listen(ssePort, () => {
    console.log(`SSE server listening on port ${ssePort}`);
  });
} else {
  console.log('SSE interface disabled');
}

// Start the MCP server using http transport
if (enableHTTP) {
  const httpPort = parsePort(process.env.HTTP_PORT, 4113, 'HTTP');
  const httpServer = http.createServer(async (req, res) => {
    const host = process.env.HOST || 'localhost';
    await server.startHTTP({
      url: new URL(req.url || '', `http://${host}:${httpPort}`),
      httpPath: `/mcp`,
      req,
      res,
      options: {
        sessionIdGenerator: undefined,
      },
    });
  });

  httpServer.listen(httpPort, () => {
    console.log(`HTTP server listening on port ${httpPort}`);
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
