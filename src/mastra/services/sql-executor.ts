import { DatabaseManager } from '../../database/database-manager';
import { sqlTokenStore } from './sql-token-store';

export interface SqlExecuteResult {
  success: boolean;
  query?: string;
  result?: {
    rowsAffected?: number;
    lastInsertRowid?: number | string | null;
    columns?: string[];
    rows?: Record<string, unknown>[];
  };
  error?: string;
  executedAt?: string;
}

export async function executeSqlWithToken(
  token: string
): Promise<SqlExecuteResult> {
  try {
    // Get and invalidate token
    const query = sqlTokenStore.getAndInvalidate(token);

    if (!query) {
      return {
        success: false,
        error: 'Invalid or expired confirmation token',
      };
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

      return {
        success: true,
        query,
        result: {
          rowsAffected: result.rowsAffected,
          lastInsertRowid: safeLastInsertRowid,
          columns: result.columns,
          rows: result.rows,
        },
        executedAt: new Date().toISOString(),
      };
    } catch (executionError) {
      // Database execution error
      return {
        success: false,
        query,
        error: `SQL execution failed: ${executionError instanceof Error ? executionError.message : String(executionError)}`,
      };
    }
  } catch (error) {
    // General error
    return {
      success: false,
      error: `Request processing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
