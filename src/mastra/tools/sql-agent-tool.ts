import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sqlAgent } from '../agents/sql-agent';

// Load configuration from environment variables
const toolId = process.env.SQL_AGENT_TOOL_ID || 'sql-query-analyzer';
const toolDescription =
  process.env.SQL_AGENT_TOOL_DESCRIPTION ||
  'Perform database operations using natural language.';

/**
 * Wrapper tool to expose the agent with a custom name
 */
export const sqlAgentTool = createTool({
  id: toolId,
  description: toolDescription,
  inputSchema: z.object({
    message: z.string().describe('The query or question for the SQL agent'),
  }),
  execute: async ({ context }) => {
    // Call the agent's generate() method
    const response = await sqlAgent.generate(context.message);
    return response.text;
  },
});
