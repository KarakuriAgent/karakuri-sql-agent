import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import { DatabaseManager } from '../../database/database-manager';
import { sqlTokenStore } from '../services/sql-token-store';

// Request schema
const executeRequestSchema = z.object({
  token: z.string().min(1).describe('Confirmation token from SQL agent'),
});

// Response schema
const _executeResponseSchema = z.object({
  success: z.boolean(),
  query: z.string().optional(),
  result: z
    .object({
      rowsAffected: z.number().optional(),
      lastInsertRowid: z.union([z.number(), z.string(), z.null()]).optional(),
      columns: z.array(z.any()).optional(),
      rows: z.array(z.any()).optional(),
    })
    .optional(),
  error: z.string().optional(),
  executedAt: z.string().optional(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;
export type ExecuteResponse = z.infer<typeof _executeResponseSchema>;

export const sqlExecuteRoute = registerApiRoute('/sql/execute', {
  method: 'POST',
  openapi: {
    summary: 'Execute SQL query with confirmation token',
    description:
      'Executes a SQL query using a confirmation token obtained from the SQL agent. The token is validated and invalidated after use.',
    tags: ['SQL'],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                minLength: 1,
                description: 'Confirmation token from SQL agent',
              },
            },
            required: ['token'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'SQL query executed successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                query: {
                  type: 'string',
                  description: 'The executed SQL query',
                },
                result: {
                  type: 'object',
                  properties: {
                    rowsAffected: { type: 'number' },
                    lastInsertRowid: {
                      oneOf: [{ type: 'number' }, { type: 'string' }],
                      nullable: true,
                      description:
                        'Last insert row ID - number for small values, string for large values to preserve precision',
                    },
                    columns: { type: 'array', items: { type: 'string' } },
                    rows: {
                      type: 'array',
                      items: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
                executedAt: { type: 'string', format: 'date-time' },
              },
              required: ['success'],
            },
          },
        },
      },
      '400': {
        description: 'Invalid request body',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', enum: [false] },
                error: { type: 'string' },
              },
              required: ['success', 'error'],
            },
          },
        },
      },
      '401': {
        description: 'Invalid or expired confirmation token',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', enum: [false] },
                error: { type: 'string' },
              },
              required: ['success', 'error'],
            },
          },
        },
      },
      '500': {
        description: 'SQL execution or server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', enum: [false] },
                query: { type: 'string' },
                error: { type: 'string' },
              },
              required: ['success', 'error'],
            },
          },
        },
      },
    },
  },
  handler: async c => {
    try {
      // Parse and validate request body
      const body = await c.req.json();
      const validationResult = executeRequestSchema.safeParse(body);

      if (!validationResult.success) {
        return c.json<ExecuteResponse>(
          {
            success: false,
            error: 'Invalid request: ' + validationResult.error.message,
          },
          400
        );
      }

      const { token } = validationResult.data;

      // Get and invalidate token
      const query = sqlTokenStore.getAndInvalidate(token);

      if (!query) {
        return c.json<ExecuteResponse>(
          {
            success: false,
            error: 'Invalid or expired confirmation token',
          },
          401
        );
      }

      // Execute the SQL query
      try {
        const result = await DatabaseManager.getInstance().execute(query);

        // Safely convert bigint to avoid precision loss
        const safeLastInsertRowid = (() => {
          if (typeof result.lastInsertRowid === 'bigint') {
            // Check if the bigint value is within safe integer range
            if (result.lastInsertRowid <= Number.MAX_SAFE_INTEGER) {
              return Number(result.lastInsertRowid);
            } else {
              // Return as string to preserve precision for large values
              return result.lastInsertRowid.toString();
            }
          }
          return result.lastInsertRowid;
        })();

        return c.json<ExecuteResponse>({
          success: true,
          query,
          result: {
            rowsAffected: result.rowsAffected,
            lastInsertRowid: safeLastInsertRowid,
            columns: result.columns,
            rows: result.rows,
          },
          executedAt: new Date().toISOString(),
        });
      } catch (executionError) {
        // Database execution error
        return c.json<ExecuteResponse>(
          {
            success: false,
            query,
            error: `SQL execution failed: ${executionError instanceof Error ? executionError.message : String(executionError)}`,
          },
          500
        );
      }
    } catch (error) {
      // General error (e.g., JSON parsing)
      return c.json<ExecuteResponse>(
        {
          success: false,
          error: `Request processing failed: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  },
});
