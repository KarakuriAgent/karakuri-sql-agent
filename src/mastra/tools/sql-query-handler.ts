import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DatabaseManager } from '../../database/database-manager';
import { sqlTokenStore } from '../services/sql-token-store';

export const sqlTool = createTool({
  id: 'run-sql',
  description:
    'Execute SQL queries against the database. Supports SELECT queries for data retrieval and INSERT/UPDATE/DELETE operations for data manipulation. Update operations require user confirmation before execution, and DDL operations (CREATE, DROP, etc.) are prohibited.',
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        'SQL query to execute. Supports SELECT, INSERT, UPDATE, and DELETE statements.'
      ),
  }),
  outputSchema: z.object({
    result: z
      .string()
      .describe(
        'Query execution result. Returns JSON-formatted data on success, error messages on failure, or confirmation messages for update operations.'
      ),
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
        status: 'error',
        result: `ERROR: Forbidden SQL operation detected: ${forbiddenOperation}\nOnly SELECT and allowed update operations are permitted.`,
      };
    }

    // Detect update operations
    const needsConfirmation = isUpdateOperation(sql);

    if (needsConfirmation) {
      // Generate token for update operation
      const token = sqlTokenStore.generateToken();
      sqlTokenStore.store(token, sql);

      // Estimate impact (basic estimation based on query type)
      const queryType = getQueryType(sql);
      const tables = extractTableNames(sql);

      return {
        result: JSON.stringify(
          {
            status: 'needsConfirmation',
            warning:
              'This SQL operation modifies data and requires confirmation',
            query: sql,
            confirmationToken: token,
            executeEndpoint: '/sql/execute',
            expiresIn: '5 minutes',
            estimatedImpact: {
              queryType,
              tables,
            },
          },
          null,
          2
        ),
      };
    }

    const result = await DatabaseManager.getInstance().execute(sql);

    return {
      result: JSON.stringify(
        {
          status: 'success',
          rows: result.rows,
          columns: result.columns,
          rowsAffected: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid,
        },
        null,
        2
      ),
    };
  } catch (error) {
    return {
      result: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Regular expression patterns for allowed operations
const ALLOWED_SQL_PATTERNS = [
  /^\s*SELECT\b/, // SELECT
  /^\s*INSERT\s+INTO\b/, // INSERT INTO
  /^\s*UPDATE\s+.*\bSET\b/, // UPDATE ... SET
  /^\s*DELETE\s+FROM\b/, // DELETE FROM
];

// Regular expression pattern for SELECT operations
const SELECT_PATTERN = /^\s*SELECT\b/;

// Common function to split and process SQL statements
const normalizeSql = (sql: string): string => {
  // First, remove comments
  let normalized = sql
    // Remove single-line comments (-- style)
    .replace(/--.*$/gm, '')
    // Remove multi-line comments (/* */ style)
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Replace multiple consecutive whitespace (including newlines) with single space
  // but preserve statement boundaries by converting newlines to semicolons where appropriate
  normalized = normalized
    // Replace newlines between potential statements with semicolons
    .replace(/([^;\s])\s*\n\s*([A-Z])/g, '$1; $2')
    // Collapse multiple whitespace characters into single spaces
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
};

const splitSqlStatements = (sql: string): string[] => {
  const normalizedSql = normalizeSql(sql);
  return normalizedSql
    .toUpperCase()
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const getForbiddenOperation = (sql: string): string | null => {
  const statements = splitSqlStatements(sql);

  // Check each statement
  for (const statement of statements) {
    // Ignore empty statements
    if (!statement.trim()) continue;

    // Prohibit operations other than allowed ones
    const isAllowed = ALLOWED_SQL_PATTERNS.some(pattern =>
      pattern.test(statement)
    );
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

const getQueryType = (sql: string): 'INSERT' | 'UPDATE' | 'DELETE' => {
  const normalized = normalizeSql(sql).toUpperCase();

  // Use more precise pattern matching to avoid false positives
  if (/\bINSERT\s+INTO\b/.test(normalized)) return 'INSERT';
  if (/\bUPDATE\s+\w+\s+SET\b/.test(normalized)) return 'UPDATE';
  if (/\bDELETE\s+FROM\b/.test(normalized)) return 'DELETE';

  // Default to UPDATE if uncertain
  return 'UPDATE';
};

const extractTableNames = (sql: string): string[] => {
  const normalized = normalizeSql(sql).toUpperCase();
  const tables: string[] = [];

  // Helper function to normalize table name (remove quotes and handle schema)
  const normalizeTableName = (tableName: string): string => {
    // Remove quotes (backticks, double quotes, square brackets)
    const cleaned = tableName.replace(/[`"[\]]/g, '');
    // If schema.table format, take only the table name
    const parts = cleaned.split('.');
    return parts[parts.length - 1].toLowerCase();
  };

  // Extract table names from INSERT INTO - supports quoted identifiers and schema.table
  const insertMatch = normalized.match(
    /INSERT\s+INTO\s+(?:([`"[]?\w+(?:\.\w+)?[`"\]]?)|(\w+(?:\.\w+)?))/
  );
  if (insertMatch) {
    const tableName = insertMatch[1] || insertMatch[2];
    tables.push(normalizeTableName(tableName));
  }

  // Extract table names from UPDATE - supports quoted identifiers and schema.table
  const updateMatch = normalized.match(
    /UPDATE\s+(?:([`"[]?\w+(?:\.\w+)?[`"\]]?)|(\w+(?:\.\w+)?))/
  );
  if (updateMatch) {
    const tableName = updateMatch[1] || updateMatch[2];
    tables.push(normalizeTableName(tableName));
  }

  // Extract table names from DELETE FROM - supports quoted identifiers and schema.table
  const deleteMatch = normalized.match(
    /DELETE\s+FROM\s+(?:([`"[]?\w+(?:\.\w+)?[`"\]]?)|(\w+(?:\.\w+)?))/
  );
  if (deleteMatch) {
    const tableName = deleteMatch[1] || deleteMatch[2];
    tables.push(normalizeTableName(tableName));
  }

  return [...new Set(tables)]; // Remove duplicates
};
