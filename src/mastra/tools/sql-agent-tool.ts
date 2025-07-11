import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sqlAgent } from '../agents/sql-agent';
import { sqlAgentConfig } from '../../config/env';

/**
 * Wrapper tool to expose the agent with a custom name
 */
export const sqlAgentTool = createTool({
  id: sqlAgentConfig.toolId,
  description: sqlAgentConfig.toolDescription,
  inputSchema: z.object({
    message: z.string().describe('The query or question for the SQL agent'),
  }),
  outputSchema: z.union([
    z
      .string()
      .describe(
        'Direct response text for successful queries or general information'
      ),
    z
      .object({
        description: z
          .string()
          .describe('Description of the operation that requires confirmation'),
        message: z
          .string()
          .describe('User-friendly message to display in confirmation dialog'),
        executeEndpoint: z
          .string()
          .describe('API endpoint to execute the confirmed operation'),
        expiresIn: z.string().describe('Token expiration information'),
        confirmationToken: z
          .string()
          .describe('Token required to execute the operation'),
      })
      .describe(
        'Confirmation object for operations that require user approval'
      ),
  ]),
  execute: async ({ context }) => {
    // Call the agent's generate() method
    const response = await sqlAgent.generate(context.message);
    return response.text;
  },
});
