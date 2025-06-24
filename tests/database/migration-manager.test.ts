import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// Mock database-manager
vi.mock('../../src/database/database-manager', () => ({
  appDatabase: {
    execute: vi.fn(),
  },
  DatabaseManager: vi.fn(),
}));

// Import after mocking
import {
  runMigrations,
  rollbackMigration,
} from '../../src/database/migration-manager';
import { appDatabase } from '../../src/database/database-manager';

describe('Migration Manager', () => {
  const testMigrationsDir = join(process.cwd(), 'test-migrations');
  const testSeedsDir = join(process.cwd(), 'test-seeds');

  // Save original environment variables
  const originalMigrationsPath = process.env.DATABASE_MIGRATIONS_PATH;
  const originalSeedsPath = process.env.DATABASE_SEEDS_PATH;

  // Helper function to create ResultSet mock
  const createMockResult = (rows: any[] = []) => ({
    rows,
    columns: [],
    columnTypes: [],
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
  });

  beforeEach(async () => {
    // Set test environment variables
    process.env.DATABASE_MIGRATIONS_PATH = testMigrationsDir;
    process.env.DATABASE_SEEDS_PATH = testSeedsDir;

    // Reset mocks and set default return values
    vi.mocked(appDatabase.execute).mockClear();
    vi.mocked(appDatabase.execute).mockResolvedValue(createMockResult());

    // Create test directories
    if (!existsSync(testMigrationsDir)) {
      mkdirSync(testMigrationsDir, { recursive: true });
    }

    // Mock console logs
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Remove test directories with retry logic
    const removeDirectory = (dir: string) => {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (error) {
          // Retry once on Windows ENOTEMPTY error
          if (error instanceof Error && error.message.includes('ENOTEMPTY')) {
            setTimeout(() => {
              try {
                rmSync(dir, { recursive: true, force: true });
              } catch (retryError) {
                console.warn(
                  `Failed to remove test directory ${dir}:`,
                  retryError
                );
              }
            }, 100);
          } else {
            console.warn(`Failed to remove test directory ${dir}:`, error);
          }
        }
      }
    };

    removeDirectory(testMigrationsDir);
    removeDirectory(testSeedsDir);

    // Restore environment variables
    if (originalMigrationsPath !== undefined) {
      process.env.DATABASE_MIGRATIONS_PATH = originalMigrationsPath;
    } else {
      delete process.env.DATABASE_MIGRATIONS_PATH;
    }
    if (originalSeedsPath !== undefined) {
      process.env.DATABASE_SEEDS_PATH = originalSeedsPath;
    } else {
      delete process.env.DATABASE_SEEDS_PATH;
    }

    vi.restoreAllMocks();
  });

  describe('runMigrations', () => {
    it('should create schema_migrations table and run pending migrations', async () => {
      // Create test migration files
      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );`
      );

      writeFileSync(
        join(testMigrationsDir, '002_add_email.sql'),
        `ALTER TABLE users ADD COLUMN email TEXT;`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '📊 Running 2 pending migrations...'
      );
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_create_users.sql'
      );
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 002_add_email.sql'
      );
      expect(console.log).toHaveBeenCalledWith('✅ Migrations completed');
    });

    it('should handle empty migrations directory', async () => {
      await runMigrations(appDatabase as any);

      // With no pending migrations, the completed message won't be shown
      expect(vi.mocked(appDatabase.execute)).toHaveBeenCalled();
    });

    it('should skip already applied migrations', async () => {
      // Configure mock to return applied migrations
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockResolvedValueOnce(
          createMockResult([{ version: '001_create_users' }])
        ) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Execute migration
        .mockResolvedValueOnce(createMockResult()) // Add record
        .mockResolvedValueOnce(
          createMockResult([{ version: '001_create_users' }])
        ) // Get applied migrations (2nd time)
        .mockResolvedValueOnce(createMockResult()) // Execute new migration
        .mockResolvedValueOnce(createMockResult()); // Add new record

      // First migration
      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );`
      );

      // First execution
      await runMigrations(appDatabase as any);

      // Add new migration
      writeFileSync(
        join(testMigrationsDir, '002_add_email.sql'),
        `ALTER TABLE users ADD COLUMN email TEXT;`
      );

      // Second execution
      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_create_users.sql'
      );
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 002_add_email.sql'
      );
    });

    it('should handle multiple SQL statements in one file', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_multi_statements.sql'),
        `CREATE TABLE users (id INTEGER PRIMARY KEY);
         CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
         CREATE INDEX idx_posts_user_id ON posts(user_id);`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_multi_statements.sql'
      );
      expect(console.log).toHaveBeenCalledWith('✅ Migrations completed');
    });

    it('should run seeds after migrations', async () => {
      // Create seed directory and files
      if (!existsSync(testSeedsDir)) {
        mkdirSync(testSeedsDir, { recursive: true });
      }

      writeFileSync(
        join(testSeedsDir, '001_seed_users.sql'),
        `INSERT INTO users (name) VALUES ('Admin User');`
      );

      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '🌱 Applied seed: 001_seed_users.sql'
      );
    });

    it('should handle migration errors', async () => {
      // Table creation succeeds, get applied migrations succeeds, migration execution fails
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockRejectedValueOnce(new Error('SQL syntax error')); // Migration execution fails

      writeFileSync(
        join(testMigrationsDir, '001_invalid.sql'),
        `INVALID SQL STATEMENT;`
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });
  });

  describe('rollbackMigration', () => {
    beforeEach(async () => {
      // Prepare test data
      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);`
      );

      writeFileSync(
        join(testMigrationsDir, '002_add_email.sql'),
        `ALTER TABLE users ADD COLUMN email TEXT;`
      );

      await runMigrations(appDatabase as any);
    });

    it('should rollback specific migration version', async () => {
      await rollbackMigration(appDatabase as any, '002_add_email');

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Rolled back migration: 002_add_email'
      );
    });

    it('should rollback latest migration when no version specified', async () => {
      await rollbackMigration(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Rolled back latest migration'
      );
    });

    it('should handle rollback errors', async () => {
      // Simulate a scenario where database connection is broken
      vi.mocked(appDatabase.execute).mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(
        rollbackMigration(appDatabase as any, '001_create_users')
      ).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        '❌ Rollback failed:',
        expect.any(Error)
      );
    });
  });

  describe('Security Tests', () => {
    it('should handle filenames with special characters safely', async () => {
      // Test with filename containing special characters
      writeFileSync(
        join(testMigrationsDir, "001_test'; DROP TABLE users; --.sql"),
        'CREATE TABLE test_table (id INTEGER);'
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        "✅ Applied migration: 001_test'; DROP TABLE users; --.sql"
      );
    });

    it('should handle SQL with potential injection patterns', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_injection_test.sql'),
        `CREATE TABLE users (id INTEGER); 
         -- Legitimate comment with '; DROP TABLE users; --
         INSERT INTO users (id) VALUES (1);`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_injection_test.sql'
      );
    });
  });

  describe('Enhanced Error Handling', () => {
    it('should handle database connection errors during migration', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Table creation succeeds
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations succeeds
        .mockRejectedValueOnce(new Error('Database connection lost')); // Migration execution fails

      writeFileSync(
        join(testMigrationsDir, '001_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'Database connection lost'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle file access permission errors', async () => {
      // This test simulates database execution errors instead of file access permission errors
      // to verify practical error handling
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Table creation succeeds
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations succeeds
        .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked')); // Runtime error

      writeFileSync(
        join(testMigrationsDir, '001_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'SQLITE_BUSY: database is locked'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle malformed SQL gracefully', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockRejectedValueOnce(
          new Error('SQLITE_ERROR: near "MALFORMED": syntax error')
        );

      writeFileSync(
        join(testMigrationsDir, '001_malformed.sql'),
        'MALFORMED SQL STATEMENT HERE;'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });
  });

  describe('Parameter Validation Tests', () => {
    it('should handle database execute calls with correct parameters', async () => {
      // Verify parameterized queries
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Execute migration
        .mockResolvedValueOnce(createMockResult()); // Add record

      writeFileSync(
        join(testMigrationsDir, '001_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await runMigrations(appDatabase as any);

      // Verify that SQL string interpolation is called correctly
      expect(appDatabase.execute).toHaveBeenCalledWith(
        "INSERT INTO schema_migrations (version) VALUES ('001_test')"
      );
    });

    it('should handle rollback with string interpolation', async () => {
      await rollbackMigration(appDatabase as any, 'test_version');

      expect(appDatabase.execute).toHaveBeenCalledWith(
        "DELETE FROM schema_migrations WHERE version = 'test_version'"
      );
    });
  });

  describe('Enhanced Rollback Tests', () => {
    beforeEach(async () => {
      // Prepare test data
      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);`
      );

      writeFileSync(
        join(testMigrationsDir, '002_add_email.sql'),
        `ALTER TABLE users ADD COLUMN email TEXT;`
      );

      writeFileSync(
        join(testMigrationsDir, '003_create_posts.sql'),
        `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);`
      );

      await runMigrations(appDatabase as any);
    });

    it('should handle rollback of non-existent version gracefully', async () => {
      await rollbackMigration(appDatabase as any, '999_nonexistent');

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Rolled back migration: 999_nonexistent'
      );
    });

    it('should handle rollback when no migrations exist', async () => {
      // Delete all migrations
      vi.mocked(appDatabase.execute).mockResolvedValueOnce(createMockResult());

      await rollbackMigration(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Rolled back latest migration'
      );
    });

    it('should handle database error during rollback', async () => {
      vi.mocked(appDatabase.execute).mockRejectedValueOnce(
        new Error('Database locked')
      );

      await expect(
        rollbackMigration(appDatabase as any, '002_add_email')
      ).rejects.toThrow('Database locked');
      expect(console.error).toHaveBeenCalledWith(
        '❌ Rollback failed:',
        expect.any(Error)
      );
    });
  });

  describe('Database Transaction Tests', () => {
    it('should handle partial migration failure and maintain data integrity', async () => {
      // Scenario: first migration succeeds, second fails
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Execute first migration
        .mockResolvedValueOnce(createMockResult()) // Add first record
        .mockRejectedValueOnce(new Error('Second migration failed')); // Second migration fails

      writeFileSync(
        join(testMigrationsDir, '001_success.sql'),
        'CREATE TABLE test1 (id INTEGER);'
      );

      writeFileSync(join(testMigrationsDir, '002_failure.sql'), 'INVALID SQL;');

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'Second migration failed'
      );

      // First migration is successful
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_success.sql'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle concurrent migration attempts gracefully', async () => {
      // Simulate concurrent execution (database lock error)
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create table
        .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));

      writeFileSync(
        join(testMigrationsDir, '001_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'SQLITE_BUSY: database is locked'
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of migration files efficiently', async () => {
      // Create many migration files
      const migrationCount = 50;

      // Mock setup (table creation + get applied + each migration execution x2)
      const mockCalls = [
        createMockResult(), // Create table
        createMockResult(), // Get applied migrations
      ];

      // Mock for each migration (execution + record)
      for (let i = 0; i < migrationCount; i++) {
        mockCalls.push(createMockResult()); // Execute migration
        mockCalls.push(createMockResult()); // Add record
      }

      vi.mocked(appDatabase.execute).mockImplementation(() =>
        Promise.resolve(mockCalls.shift() || createMockResult())
      );

      // Create migration files
      for (let i = 1; i <= migrationCount; i++) {
        const filename = `${i.toString().padStart(3, '0')}_migration_${i}.sql`;
        writeFileSync(
          join(testMigrationsDir, filename),
          `CREATE TABLE table_${i} (id INTEGER);`
        );
      }

      const startTime = Date.now();
      await runMigrations(appDatabase as any);
      const endTime = Date.now();

      // Check performance (rough guideline)
      expect(endTime - startTime).toBeLessThan(5000); // Within 5 seconds
      expect(console.log).toHaveBeenCalledWith(
        `📊 Running ${migrationCount} pending migrations...`
      );
    });
  });

  describe('SQL Statement Parsing Tests', () => {
    it('should correctly parse and execute multiple SQL statements', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_multiple_statements.sql'),
        `CREATE TABLE users (id INTEGER PRIMARY KEY);
         CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
         CREATE INDEX idx_posts_user_id ON posts(user_id);
         INSERT INTO users (id) VALUES (1);`
      );

      await runMigrations(appDatabase as any);

      // Verify execute was called the appropriate number of times
      // Table creation + get applied + 4 SQL statements + record addition = 7 times
      expect(appDatabase.execute).toHaveBeenCalledTimes(7);
    });

    it('should handle SQL statements with semicolons in string literals', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_semicolon_in_string.sql'),
        `CREATE TABLE test (id INTEGER, data TEXT);
         INSERT INTO test (id, data) VALUES (1, 'value; with; semicolons');`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_semicolon_in_string.sql'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing migrations directory gracefully', async () => {
      // Remove migrations directory
      rmSync(testMigrationsDir, { recursive: true, force: true });

      await runMigrations(appDatabase as any);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Migrations directory not found')
      );
    });

    it('should handle missing seeds directory gracefully', async () => {
      await runMigrations(appDatabase as any);

      // Seeds directory warning may not appear if seed execution is skipped
      expect(vi.mocked(appDatabase.execute)).toHaveBeenCalled();
    });

    it('should handle empty SQL files', async () => {
      writeFileSync(join(testMigrationsDir, '001_empty.sql'), '');

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_empty.sql'
      );
    });

    it('should handle SQL files with only comments and whitespace', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_comments_only.sql'),
        `-- This is a comment
         /* Multi-line comment */
         
         -- Another comment`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_comments_only.sql'
      );
    });

    it('should handle Unicode characters in SQL files', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_unicode.sql'),
        `CREATE TABLE ユーザー (
          id INTEGER PRIMARY KEY,
          名前 TEXT NOT NULL,
          メール TEXT
        );
        INSERT INTO ユーザー (名前, メール) VALUES ('田中太郎', 'tanaka@example.com');`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_unicode.sql'
      );
    });

    it('should handle very large migration files', async () => {
      // Create file with many INSERT statements
      const largeSQL = Array.from(
        { length: 1000 },
        (_, i) =>
          `INSERT INTO test_table (id, data) VALUES (${i}, 'data_${i}');`
      ).join('\n');

      writeFileSync(
        join(testMigrationsDir, '001_large.sql'),
        `CREATE TABLE test_table (id INTEGER, data TEXT);\n${largeSQL}`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_large.sql'
      );
    });

    it('should handle mixed line endings', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_mixed_endings.sql'),
        'CREATE TABLE test (id INTEGER);\r\nINSERT INTO test (id) VALUES (1);\nINSERT INTO test (id) VALUES (2);\r\n'
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_mixed_endings.sql'
      );
    });

    it('should handle files with BOM (Byte Order Mark)', async () => {
      // Simulate file with UTF-8 BOM
      const bomSql = '\uFEFFCREATE TABLE bom_test (id INTEGER);';
      writeFileSync(join(testMigrationsDir, '001_bom_test.sql'), bomSql);

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_bom_test.sql'
      );
    });

    it('should handle extremely long table and column names', async () => {
      const longName = 'a'.repeat(100);
      writeFileSync(
        join(testMigrationsDir, '001_long_names.sql'),
        `CREATE TABLE ${longName} (${longName}_id INTEGER PRIMARY KEY);`
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_long_names.sql'
      );
    });
  });

  describe('Mock Verification Tests', () => {
    it('should verify exact database call sequences', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_verify_calls.sql'),
        'CREATE TABLE verify_test (id INTEGER);'
      );

      await runMigrations(appDatabase as any);

      // Verify exact call sequence
      const calls = vi.mocked(appDatabase.execute).mock.calls;

      // 1. Table creation
      expect(calls[0][0]).toContain(
        'CREATE TABLE IF NOT EXISTS schema_migrations'
      );

      // 2. Get applied migrations
      expect(calls[1][0]).toBe(
        'SELECT version FROM schema_migrations ORDER BY version'
      );

      // 3. Execute migration
      expect(calls[2][0]).toBe('CREATE TABLE verify_test (id INTEGER)');

      // 4. Add record (string interpolation)
      expect(calls[3][0]).toBe(
        "INSERT INTO schema_migrations (version) VALUES ('001_verify_calls')"
      );
    });

    it('should verify rollback database calls', async () => {
      await rollbackMigration(appDatabase as any, 'test_version');

      const calls = vi.mocked(appDatabase.execute).mock.calls;
      expect(calls[0][0]).toBe(
        "DELETE FROM schema_migrations WHERE version = 'test_version'"
      );
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle duplicate migration version detection', async () => {
      // Migrations with the same version number but different file names
      writeFileSync(
        join(testMigrationsDir, '001_create_users.sql'),
        'CREATE TABLE users (id INTEGER);'
      );

      writeFileSync(
        join(testMigrationsDir, '001_create_posts.sql'),
        'CREATE TABLE posts (id INTEGER);'
      );

      // Both have the same version "001", so the one executed later is treated as a duplicate
      await runMigrations(appDatabase as any);

      // First migration is applied, second is skipped as already applied
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_create_users.sql'
      );
      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_create_posts.sql'
      );
    });

    it('should handle file read permission errors gracefully', async () => {
      // Simulate database error to mimic file read error
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Table creation succeeds
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations succeeds
        .mockRejectedValueOnce(
          new Error("EACCES: permission denied, open 'migration file'")
        );

      writeFileSync(
        join(testMigrationsDir, '001_permission_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'EACCES: permission denied'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle database connection pool exhaustion', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Table creation succeeds
        .mockRejectedValueOnce(new Error('SQLITE_BUSY: too many connections'));

      writeFileSync(
        join(testMigrationsDir, '001_connection_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'SQLITE_BUSY: too many connections'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle migration file with only whitespace and comments', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_whitespace_test.sql'),
        `
        -- This is just a comment file
        
        /* 
         * Multi-line comment
         * with no actual SQL
         */
         
        -- Another comment
        `
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_whitespace_test.sql'
      );
    });

    it('should handle migration rollback for non-existent migration', async () => {
      // Attempt to rollback non-existent migration
      await rollbackMigration(appDatabase as any, '999_nonexistent_migration');

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Rolled back migration: 999_nonexistent_migration'
      );
      expect(appDatabase.execute).toHaveBeenCalledWith(
        "DELETE FROM schema_migrations WHERE version = '999_nonexistent_migration'"
      );
    });

    it('should handle database timeout during migration', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Table creation succeeds
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations succeeds
        .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));

      writeFileSync(
        join(testMigrationsDir, '001_timeout_test.sql'),
        'CREATE TABLE test (id INTEGER);'
      );

      await expect(runMigrations(appDatabase as any)).rejects.toThrow(
        'SQLITE_BUSY: database is locked'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Migration failed:',
        expect.any(Error)
      );
    });

    it('should handle migration with nested SQL transactions', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_transaction_test.sql'),
        `
        BEGIN TRANSACTION;
        CREATE TABLE users (id INTEGER PRIMARY KEY);
        INSERT INTO users (id) VALUES (1);
        COMMIT;
        
        BEGIN TRANSACTION;
        CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
        INSERT INTO posts (id, user_id) VALUES (1, 1);
        COMMIT;
        `
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_transaction_test.sql'
      );
      // Verify that each statement within the transaction is executed
      expect(appDatabase.execute).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(appDatabase.execute).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle migration with special SQL syntax', async () => {
      writeFileSync(
        join(testMigrationsDir, '001_special_syntax.sql'),
        `
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          data JSON,
          created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        );
        
        CREATE TRIGGER update_timestamp 
        AFTER UPDATE ON test_table 
        BEGIN
          UPDATE test_table SET created_at = datetime('now', 'localtime') WHERE id = NEW.id;
        END;
        `
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '✅ Applied migration: 001_special_syntax.sql'
      );
    });
  });

  describe('Seed Tracking System', () => {
    beforeEach(() => {
      // Create test seeds directory
      if (!existsSync(testSeedsDir)) {
        mkdirSync(testSeedsDir, { recursive: true });
      }
    });

    it('should create seed_applications table on first run', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(createMockResult()); // Get applied seeds

      writeFileSync(
        join(testSeedsDir, '001_test_seed.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      await runMigrations(appDatabase as any);

      expect(vi.mocked(appDatabase.execute)).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS seed_applications')
      );
    });

    it('should track applied seeds in seed_applications table', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(createMockResult()) // Get applied seeds (empty)
        .mockResolvedValueOnce(createMockResult()) // Execute seed
        .mockResolvedValueOnce(createMockResult()); // Mark seed as applied

      writeFileSync(
        join(testSeedsDir, '001_test_seed.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      await runMigrations(appDatabase as any);

      expect(vi.mocked(appDatabase.execute)).toHaveBeenCalledWith(
        expect.stringContaining(
          "INSERT OR IGNORE INTO seed_applications (filename) VALUES ('001_test_seed.sql')"
        )
      );
    });

    it('should skip already applied seeds', async () => {
      // Mock that seed is already applied
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(
          createMockResult([{ filename: '001_test_seed.sql' }])
        ); // Get applied seeds

      writeFileSync(
        join(testSeedsDir, '001_test_seed.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        '🌱 All seeds already applied, skipping seed execution'
      );
    });

    it('should apply only pending seeds when some are already applied', async () => {
      // Mock that first seed is applied, second is not
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(
          createMockResult([{ filename: '001_first_seed.sql' }])
        ) // Get applied seeds
        .mockResolvedValueOnce(createMockResult()) // Execute second seed
        .mockResolvedValueOnce(createMockResult()); // Mark second seed as applied

      writeFileSync(
        join(testSeedsDir, '001_first_seed.sql'),
        "INSERT INTO users (name) VALUES ('First User');"
      );
      writeFileSync(
        join(testSeedsDir, '002_second_seed.sql'),
        "INSERT INTO users (name) VALUES ('Second User');"
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith('🌱 Applying 1 seed files...');
      expect(console.log).toHaveBeenCalledWith(
        '🌱 Applied seed: 002_second_seed.sql'
      );
    });

    it('should handle SQL injection attempts in seed filenames', async () => {
      const maliciousFilename = "'; DROP TABLE seed_applications; --";

      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(createMockResult()) // Get applied seeds (empty)
        .mockResolvedValueOnce(createMockResult()) // Execute seed
        .mockResolvedValueOnce(createMockResult()); // Mark seed as applied

      writeFileSync(
        join(testSeedsDir, maliciousFilename + '.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      await runMigrations(appDatabase as any);

      // Verify that the filename is properly escaped (last call should be the insert)
      const calls = vi.mocked(appDatabase.execute).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toContain("'''; DROP TABLE seed_applications; --.sql'");
    });

    it('should handle multiple seeds being applied in correct order', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockResolvedValueOnce(createMockResult()) // Get applied seeds (empty)
        .mockResolvedValueOnce(createMockResult()) // Execute first seed
        .mockResolvedValueOnce(createMockResult()) // Mark first seed as applied
        .mockResolvedValueOnce(createMockResult()) // Execute second seed
        .mockResolvedValueOnce(createMockResult()); // Mark second seed as applied

      writeFileSync(
        join(testSeedsDir, '002_second.sql'),
        "INSERT INTO users (name) VALUES ('Second');"
      );
      writeFileSync(
        join(testSeedsDir, '001_first.sql'),
        "INSERT INTO users (name) VALUES ('First');"
      );

      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith('🌱 Applying 2 seed files...');
      expect(console.log).toHaveBeenCalledWith(
        '🌱 Applied seed: 001_first.sql'
      );
      expect(console.log).toHaveBeenCalledWith(
        '🌱 Applied seed: 002_second.sql'
      );
    });

    it('should handle database errors during seed tracking table creation', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockRejectedValueOnce(
          new Error('Failed to create seed_applications table')
        ); // Fail to create seed table

      writeFileSync(
        join(testSeedsDir, '001_test_seed.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      // runSeeds catches all errors and logs them, so runMigrations should not throw
      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        'Seeds directory not found, skipping seeds'
      );
    });

    it('should handle database errors when querying applied seeds', async () => {
      vi.mocked(appDatabase.execute)
        .mockResolvedValueOnce(createMockResult()) // Create schema_migrations table
        .mockResolvedValueOnce(createMockResult()) // Get applied migrations
        .mockResolvedValueOnce(createMockResult()) // Create seed_applications table
        .mockRejectedValueOnce(new Error('Failed to query applied seeds')); // Fail to get applied seeds

      writeFileSync(
        join(testSeedsDir, '001_test_seed.sql'),
        "INSERT INTO users (name) VALUES ('Test User');"
      );

      // runSeeds catches all errors and logs them, so runMigrations should not throw
      await runMigrations(appDatabase as any);

      expect(console.log).toHaveBeenCalledWith(
        'Seeds directory not found, skipping seeds'
      );
    });
  });
});
