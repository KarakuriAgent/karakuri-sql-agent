import 'dotenv/config'; // Auto-load .env file
import { MCPServer } from '@mastra/mcp';
import { sqlExecuteTool } from './tools/sql-execute-tool';
import { sqlAgentTool } from './tools/sql-agent-tool';
import http from 'http';

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
    [sqlAgentToolId]: sqlAgentTool,
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
  const sseServer = http.createServer(async (req, res) => {
    const host = process.env.HOST || 'localhost';
    const port = process.env.SSE_PORT || '4112';
    await server.startSSE({
      url: new URL(req.url || '', `http://${host}:${port}`),
      ssePath: '/sse',
      messagePath: '/message',
      req,
      res,
    });
  });

  const ssePort = process.env.SSE_PORT || '4112';
  sseServer.listen(parseInt(ssePort), () => {
    console.log(`SSE server listening on port ${ssePort}`);
  });
} else {
  console.log('SSE interface disabled');
}

// Start the MCP server using http transport
if (enableHTTP) {
  const httpServer = http.createServer(async (req, res) => {
    const host = process.env.HOST || 'localhost';
    const port = process.env.HTTP_PORT || '4113';
    await server.startHTTP({
      url: new URL(req.url || '', `http://${host}:${port}`),
      httpPath: `/mcp`,
      req,
      res,
      options: {
        sessionIdGenerator: undefined,
      },
    });
  });

  const httpPort = process.env.HTTP_PORT || '4113';
  httpServer.listen(parseInt(httpPort), () => {
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
