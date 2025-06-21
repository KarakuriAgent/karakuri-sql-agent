import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { appDatabase } from '../../database/database-manager';

export const sqlTool = createTool({
  id: 'run-sql',
  description: 'Execute SQL queries against the database. Supports SELECT queries for data retrieval and INSERT/UPDATE/DELETE operations for data manipulation. Update operations require user confirmation before execution, and DDL operations (CREATE, DROP, etc.) are prohibited.',
  inputSchema: z.object({
    sql: z.string().describe('SQL query to execute. Supports SELECT, INSERT, UPDATE, and DELETE statements.'),
  }),
  outputSchema: z.object({
    result: z.string().describe('Query execution result. Returns JSON-formatted data on success, error messages on failure, or confirmation messages for update operations.'),
  }),
  execute: async ({ context }: { context: { sql: string } }) => {
    return await runSQL(context.sql);
  },
});

const runSQL = async (sql: string) => {
  try {
    // Detect forbidden operations
    const forbiddenOperation = getForbiddenOperation(sql);
    if (forbiddenOperation) {
      return {
        result: `ERROR: Forbidden SQL operation detected: ${forbiddenOperation}\nOnly SELECT and allowed update operations are permitted.`,
      };
    }
    
    // Detect update operations
    const needsConfirmation = isUpdateOperation(sql);
    
    if (needsConfirmation) {
      return {
        result: `WARNING: This SQL operation modifies data and needs user confirmation before execution:\n${sql}`,
      };
    }
    
    const result = await appDatabase.execute(sql);
    
    return {
      result: JSON.stringify({
        rows: result.rows,
        columns: result.columns,
        rowsAffected: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid
      }, null, 2)
    };
  } catch (error) {
    return {
      result: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

// Regular expression patterns for allowed operations
const ALLOWED_SQL_PATTERNS = [
  /^\s*SELECT\b/,           // SELECT
  /^\s*INSERT\s+INTO\b/,    // INSERT INTO
  /^\s*UPDATE\s+.*\bSET\b/, // UPDATE ... SET
  /^\s*DELETE\s+FROM\b/,    // DELETE FROM
];

// Regular expression pattern for SELECT operations
const SELECT_PATTERN = /^\s*SELECT\b/;

// Common function to split and process SQL statements
const splitSqlStatements = (sql: string): string[] => {
  return sql.trim().toUpperCase().split(';').map(s => s.trim()).filter(s => s.length > 0);
};

const getForbiddenOperation = (sql: string): string | null => {
  const statements = splitSqlStatements(sql);
  
  
  // Check each statement
  for (const statement of statements) {
    // Ignore empty statements
    if (!statement.trim()) continue;
    
    // Prohibit operations other than allowed ones
    const isAllowed = ALLOWED_SQL_PATTERNS.some(pattern => pattern.test(statement));
    if (!isAllowed) {
      // Get the first word and return it as a forbidden operation
      const firstWord = statement.trim().split(/\s+/)[0];
      return firstWord;
    }
  }
  
  return null;
};

const isUpdateOperation = (sql: string): boolean => {
  const statements = splitSqlStatements(sql);
  
  // All operations other than SELECT require confirmation
  for (const statement of statements) {
    // Ignore empty statements
    if (!statement.trim()) continue;
    
    // Confirmation required if not SELECT
    if (!SELECT_PATTERN.test(statement)) {
      return true;
    }
  }
  
  return false;
};
