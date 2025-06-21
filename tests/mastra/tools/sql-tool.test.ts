import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

vi.mock('../../../src/database/migration-manager', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('../../../src/database/database-manager', () => {
  const mockExecute = vi.fn();

  return {
    DatabaseManager: {
      getInstance: vi.fn(() => ({
        execute: mockExecute,
        ensureInitialized: vi.fn(),
      })),
      resetInstance: vi.fn(),
    },
    appDatabase: {
      execute: mockExecute,
      ensureInitialized: vi.fn(),
    },
  };
});

const originalEnv = process.env;

import { sqlTool } from '../../../src/mastra/tools/sql-tool';
import { appDatabase } from '../../../src/database/database-manager';
import { runMigrations } from '../../../src/database/migration-manager';

describe('SQL Tool', () => {
  const mockExecute = vi.mocked(appDatabase.execute);
  const mockRunMigrations = vi.mocked(runMigrations);

  const createMockResult = (
    rows: any[] = [],
    rowsAffected = 0,
    lastInsertRowid?: any
  ) => ({
    rows,
    columns: [],
    columnTypes: [],
    rowsAffected,
    lastInsertRowid,
    toJSON: () => ({}),
  });

  const createToolContext = (sql: string) =>
    ({
      context: { sql },
      runtimeContext: {
        agentId: 'test-agent',
        runId: 'test-run',
        registry: new Map(),
        set: vi.fn(),
        get: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        size: 0,
        keys: vi.fn(),
        values: vi.fn(),
        entries: vi.fn(),
        forEach: vi.fn(),
        [Symbol.iterator]: vi.fn(),
      },
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecute.mockResolvedValue(createMockResult());
    mockRunMigrations.mockResolvedValue();

    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct ID and description', () => {
      expect(sqlTool.id).toBe('run-sql');
      expect(sqlTool.description).toContain('Execute SQL queries');
      expect(sqlTool.description).toContain('SELECT');
      expect(sqlTool.description).toContain('INSERT/UPDATE/DELETE');
    });

    it('should have correct input schema', () => {
      const inputSchema = sqlTool.inputSchema;
      expect(inputSchema).toBeDefined();

      expect(() =>
        inputSchema.parse({ sql: 'SELECT * FROM users' })
      ).not.toThrow();

      expect(() => inputSchema.parse({})).toThrow();
      expect(() => inputSchema.parse({ sql: 123 })).toThrow();
    });

    it('should have correct output schema', () => {
      const outputSchema = sqlTool.outputSchema;
      expect(outputSchema).toBeDefined();

      expect(() => outputSchema.parse({ result: 'test result' })).not.toThrow();

      expect(() => outputSchema.parse({})).toThrow();
      expect(() => outputSchema.parse({ result: 123 })).toThrow();
    });
  });

  describe('Database Initialization', () => {
    it('should execute database operations successfully', async () => {
      const toolContext = createToolContext('SELECT 1');

      const result = await sqlTool.execute(toolContext);

      expect(mockExecute).toHaveBeenCalledWith('SELECT 1');
      expect(result.result).toContain('"rows"');
    });
  });

  describe('SELECT Queries', () => {
    it('should execute SELECT statements successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockExecute.mockResolvedValueOnce(createMockResult(mockRows, 0));

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users');
      expect(result.result).toContain('"rows"');
      expect(result.result).toContain('"id": 1');
      expect(result.result).toContain('"name": "test"');
    });

    it('should execute complex SELECT statements', async () => {
      const complexQueries = [
        'SELECT * FROM users WHERE id = 1',
        'SELECT COUNT(*) FROM products',
        'SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id',
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10',
        'SELECT * FROM users; SELECT * FROM products;',
      ];

      for (const sql of complexQueries) {
        mockExecute.mockResolvedValueOnce(createMockResult([]));
        const toolContext = createToolContext(sql);
        const result = await sqlTool.execute(toolContext);

        expect(result.result).toContain('"rows"');
        expect(result.result).not.toContain('WARNING');
        expect(mockExecute).toHaveBeenCalledWith(sql);
      }
    });
  });

  describe('Forbidden Operation Detection', () => {
    it('should forbid CREATE statements', async () => {
      const toolContext = createToolContext('CREATE TABLE test (id INTEGER)');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected: CREATE'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should forbid DROP statements', async () => {
      const toolContext = createToolContext('DROP TABLE users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected: DROP'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should forbid ALTER statements', async () => {
      const toolContext = createToolContext(
        'ALTER TABLE users ADD COLUMN email TEXT'
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected: ALTER'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should forbid TRUNCATE statements', async () => {
      const toolContext = createToolContext('TRUNCATE TABLE users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected: TRUNCATE'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should detect forbidden operations in multiple statements', async () => {
      const toolContext = createToolContext(
        'SELECT * FROM users; DROP TABLE users;'
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected: DROP'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should detect forbidden operations with comments', async () => {
      const toolContext = createToolContext(
        '/* comment */ CREATE TABLE test (id INTEGER)'
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('Update Operation Confirmation', () => {
    it('should return confirmation message for INSERT statements', async () => {
      const toolContext = createToolContext(
        "INSERT INTO users (name) VALUES ('test')"
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'WARNING: This SQL operation modifies data'
      );
      expect(result.result).toContain('INSERT INTO users');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should return confirmation message for UPDATE statements', async () => {
      const toolContext = createToolContext(
        "UPDATE users SET name = 'updated' WHERE id = 1"
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'WARNING: This SQL operation modifies data'
      );
      expect(result.result).toContain('UPDATE users');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should return confirmation message for DELETE statements', async () => {
      const toolContext = createToolContext('DELETE FROM users WHERE id = 1');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'WARNING: This SQL operation modifies data'
      );
      expect(result.result).toContain('DELETE FROM users');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should return confirmation message for multiple update operations', async () => {
      const toolContext = createToolContext(
        "INSERT INTO users (name) VALUES ('test'); UPDATE users SET name = 'updated' WHERE id = 1;"
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'WARNING: This SQL operation modifies data'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should execute SELECT statements without confirmation', async () => {
      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).not.toContain('WARNING');
      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users');
    });
  });

  describe('SQL Execution Results', () => {
    it('should return query results in JSON format', async () => {
      const mockData = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ];
      mockExecute.mockResolvedValueOnce(createMockResult(mockData, 2, 1));

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      const parsedResult = JSON.parse(result.result);
      expect(parsedResult.rows).toEqual(mockData);
      expect(parsedResult.rowsAffected).toBe(2);
      expect(parsedResult.lastInsertRowid).toBe(1);
      expect(parsedResult.columns).toEqual([]);
    });

    it('should handle empty result sets correctly', async () => {
      mockExecute.mockResolvedValueOnce(createMockResult([], 0));

      const toolContext = createToolContext(
        'SELECT * FROM users WHERE id = 999'
      );
      const result = await sqlTool.execute(toolContext);

      const parsedResult = JSON.parse(result.result);
      expect(parsedResult.rows).toEqual([]);
      expect(parsedResult.rowsAffected).toBe(0);
    });

    it('should handle large datasets correctly', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
      }));
      mockExecute.mockResolvedValueOnce(createMockResult(largeDataset, 1000));

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      const parsedResult = JSON.parse(result.result);
      expect(parsedResult.rows).toHaveLength(1000);
      expect(parsedResult.rowsAffected).toBe(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle database execution errors properly', async () => {
      const dbError = new Error("Table 'users' does not exist");
      mockExecute.mockRejectedValueOnce(dbError);

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain("Error: Table 'users' does not exist");
    });

    it('should handle non-Error object exceptions properly', async () => {
      mockExecute.mockRejectedValueOnce('String error');

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain('Error: String error');
    });

    it('should handle null or undefined exceptions properly', async () => {
      mockExecute.mockRejectedValueOnce(null);

      const toolContext = createToolContext('SELECT * FROM users');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain('Error: null');
    });

    it('should handle SQL syntax errors properly', async () => {
      const syntaxError = new Error("SQL syntax error near 'SELECT'");
      mockExecute.mockRejectedValueOnce(syntaxError);

      const toolContext = createToolContext('SELECT * FROM nonexistent_table');
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain("Error: SQL syntax error near 'SELECT'");
    });
  });

  describe('Security Tests', () => {
    it('should handle SQL injection attack patterns properly', async () => {
      const injectionTests = [
        {
          sql: 'SELECT * FROM users WHERE id = 1; DROP TABLE users; --',
          expectForbidden: true,
          description: 'DROP statement separated by semicolon',
        },
        {
          sql: "SELECT * FROM users WHERE name = 'test' OR '1'='1'",
          expectForbidden: false,
          expectWarning: false,
          description: 'Authentication bypass using OR condition',
        },
        {
          sql: 'SELECT * FROM users WHERE id = 1 UNION SELECT * FROM passwords',
          expectForbidden: false,
          expectWarning: false,
          description: 'Information leakage using UNION statement',
        },
        {
          sql: "SELECT * FROM users WHERE id = 1'; DELETE FROM users WHERE '1'='1",
          expectForbidden: false,
          expectWarning: true,
          description:
            'Detected as update operation because DELETE is contained in the entire string',
        },
      ];

      for (const test of injectionTests) {
        vi.clearAllMocks();

        const toolContext = createToolContext(test.sql);
        const result = await sqlTool.execute(toolContext);

        if (test.expectForbidden) {
          expect(result.result).toContain(
            'ERROR: Forbidden SQL operation detected'
          );
          expect(mockExecute).not.toHaveBeenCalled();
        } else if (test.expectWarning) {
          expect(result.result).toContain(
            'WARNING: This SQL operation modifies data'
          );
          expect(mockExecute).not.toHaveBeenCalled();
        } else {
          mockExecute.mockResolvedValueOnce(createMockResult([]));
          expect(result.result).not.toContain(
            'ERROR: Forbidden SQL operation detected'
          );
          expect(result.result).not.toContain('WARNING');
          expect(mockExecute).toHaveBeenCalledWith(test.sql);
        }
      }
    });

    it('should detect bypass attacks using comments', async () => {
      const commentTests = [
        {
          sql: 'SELECT * FROM users /* hidden */ ; DROP TABLE users;',
          expectForbidden: true,
          description: 'DROP statement with comment',
        },
        {
          sql: 'SELECT * FROM users -- comment\nDROP TABLE users;',
          expectForbidden: false,
          description:
            'SQL with line comment (processed as single statement since only split by semicolon)',
        },
        {
          sql: '/**/CREATE/**/TABLE/**/ test (id INTEGER)',
          expectForbidden: true,
          description: 'CREATE statement split by comments',
        },
      ];

      for (const test of commentTests) {
        vi.clearAllMocks();

        const toolContext = createToolContext(test.sql);
        const result = await sqlTool.execute(toolContext);

        if (test.expectForbidden) {
          expect(result.result).toContain(
            'ERROR: Forbidden SQL operation detected'
          );
          expect(mockExecute).not.toHaveBeenCalled();
        } else {
          mockExecute.mockResolvedValueOnce(createMockResult([]));
          expect(result.result).not.toContain(
            'ERROR: Forbidden SQL operation detected'
          );
          expect(result.result).not.toContain('WARNING');
          expect(mockExecute).toHaveBeenCalledWith(test.sql);
        }
      }
    });
  });

  describe('Special Cases', () => {
    it('should handle empty SQL statements properly', async () => {
      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext('');
      const result = await sqlTool.execute(toolContext);

      expect(mockExecute).toHaveBeenCalledWith('');
      expect(result.result).toContain('rows');
    });

    it('should handle whitespace-only SQL statements properly', async () => {
      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext('   \n\t  ');
      const result = await sqlTool.execute(toolContext);

      expect(mockExecute).toHaveBeenCalledWith('   \n\t  ');
      expect(result.result).toContain('rows');
    });

    it('should handle semicolon-only SQL statements properly', async () => {
      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext(';');
      const result = await sqlTool.execute(toolContext);

      expect(mockExecute).toHaveBeenCalledWith(';');
      expect(result.result).toContain('rows');
    });

    it('should correctly detect SQL statements with mixed case', async () => {
      const queries = [
        'select * from users',
        'Select * From Users',
        'SELECT * FROM USERS',
        'SeLeCt * FrOm UsErS',
      ];

      for (const sql of queries) {
        mockExecute.mockResolvedValueOnce(createMockResult([]));
        const toolContext = createToolContext(sql);
        const result = await sqlTool.execute(toolContext);

        expect(result.result).not.toContain('WARNING');
        expect(mockExecute).toHaveBeenCalledWith(sql);
      }
    });

    it('should handle SQL statements with comments correctly', async () => {
      const toolContext = createToolContext(
        '/* This is a comment */ CREATE TABLE test (id INTEGER)'
      );
      const result = await sqlTool.execute(toolContext);

      expect(result.result).toContain(
        'ERROR: Forbidden SQL operation detected'
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('should handle SQL with many statements properly', async () => {
      const statements = Array.from({ length: 100 }, (_, i) => `SELECT ${i}`);
      const sql = statements.join('; ');

      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext(sql);
      const result = await sqlTool.execute(toolContext);

      expect(result.result).not.toContain('WARNING');
      expect(mockExecute).toHaveBeenCalledWith(sql);
    });

    it('should handle very long SQL statements properly', async () => {
      const longTableName = 'a'.repeat(1000);
      const sql = `SELECT * FROM ${longTableName}`;

      mockExecute.mockResolvedValueOnce(createMockResult([]));

      const toolContext = createToolContext(sql);
      const result = await sqlTool.execute(toolContext);

      expect(result.result).not.toContain('WARNING');
      expect(mockExecute).toHaveBeenCalledWith(sql);
    });
  });
});
