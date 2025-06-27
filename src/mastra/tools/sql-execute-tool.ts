import { createTool } from '@mastra/core';
import { z } from 'zod';
import { executeSqlWithToken } from '../services/sql-executor';

export const sqlExecuteTool = createTool({
  id: 'sql_execute',
  description: 'Execute SQL query with confirmation token',
  inputSchema: z.object({
    token: z.string().min(1).describe('Confirmation token from SQL agent'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    query: z.string().optional(),
    result: z
      .object({
        rowsAffected: z.number().optional(),
        lastInsertRowid: z.union([z.number(), z.string(), z.null()]).optional(),
        columns: z.array(z.string()).optional(),
        rows: z.array(z.record(z.unknown())).optional(),
      })
      .optional(),
    error: z.string().optional(),
    executedAt: z.string().optional(),
  }),
  execute: async ({ context }) => {
    return await executeSqlWithToken(context.token);
  },
});
