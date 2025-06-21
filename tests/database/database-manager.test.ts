import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/database/migration-manager', () => ({
  runMigrations: vi.fn(),
}));

// Mock environment variables
const originalEnv = process.env;

// Import after mocking
import { DatabaseManager } from '../../src/database/database-manager';
import { runMigrations } from '../../src/database/migration-manager';
import { createClient } from '@libsql/client';

describe('DatabaseManager', () => {
  const mockExecute = vi.fn();
  const mockCreateClient = vi.mocked(createClient);
  const mockRunMigrations = vi.mocked(runMigrations);

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset singleton instance
    await DatabaseManager.resetInstance();

    // Setup mock client with SQLite PRAGMA support
    mockExecute
      .mockResolvedValueOnce({
        rows: [{ journal_mode: 'wal' }],
        columns: ['journal_mode'],
      }) // PRAGMA journal_mode = WAL
      .mockResolvedValueOnce({
        rows: [{ synchronous: 1 }],
        columns: ['synchronous'],
      }) // PRAGMA synchronous = NORMAL
      .mockResolvedValueOnce({
        rows: [{ cache_size: -64000 }],
        columns: ['cache_size'],
      }) // PRAGMA cache_size = -64000
      .mockResolvedValueOnce({
        rows: [{ temp_store: 2 }],
        columns: ['temp_store'],
      }) // PRAGMA temp_store = MEMORY
      .mockResolvedValueOnce({ rows: [{ '1': 1 }], columns: ['1'] }); // SELECT 1 (verifyConnection)

    mockCreateClient.mockReturnValue({ execute: mockExecute, close: vi.fn() });
    mockRunMigrations.mockResolvedValue();

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    // Restore environment variables
    process.env = originalEnv;
    vi.restoreAllMocks();

    // Reset singleton instance
    await DatabaseManager.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should always return the same instance from getInstance()', () => {
      const instance1 = DatabaseManager.getInstance();
      const instance2 = DatabaseManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance when resetInstance() is called', async () => {
      const instance1 = DatabaseManager.getInstance();
      await DatabaseManager.resetInstance();
      const instance2 = DatabaseManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Database Connection', () => {
    it('should use DATABASE_URL environment variable when set', () => {
      process.env.DATABASE_URL = 'file:test.db';

      DatabaseManager.getInstance();

      expect(mockCreateClient).toHaveBeenCalledWith({
        url: 'file:test.db',
      });
    });

    it('should use default value when DATABASE_URL environment variable is not set', () => {
      DatabaseManager.getInstance();

      expect(mockCreateClient).toHaveBeenCalledWith({
        url: 'file:app.db',
      });
    });
  });

  describe('Database Initialization', () => {
    it('should run migrations on first ensureInitialized() call', async () => {
      // Setup fresh mocks for this test
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ journal_mode: 'wal' }],
          columns: ['journal_mode'],
        }) // PRAGMA journal_mode = WAL
        .mockResolvedValueOnce({
          rows: [{ synchronous: 1 }],
          columns: ['synchronous'],
        }) // PRAGMA synchronous = NORMAL
        .mockResolvedValueOnce({
          rows: [{ cache_size: -64000 }],
          columns: ['cache_size'],
        }) // PRAGMA cache_size = -64000
        .mockResolvedValueOnce({
          rows: [{ temp_store: 2 }],
          columns: ['temp_store'],
        }) // PRAGMA temp_store = MEMORY
        .mockResolvedValueOnce({ rows: [{ '1': 1 }], columns: ['1'] }); // SELECT 1 (verifyConnection)

      const manager = DatabaseManager.getInstance();

      await manager.ensureInitialized();

      expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    });

    it('should not run migrations on subsequent ensureInitialized() calls', async () => {
      const manager = DatabaseManager.getInstance();

      await manager.ensureInitialized();
      await manager.ensureInitialized();
      await manager.ensureInitialized();

      expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    });

    it('should output appropriate error message when migration fails', async () => {
      const error = new Error('Migration failed');
      mockRunMigrations.mockRejectedValueOnce(error);

      const manager = DatabaseManager.getInstance();

      await expect(manager.ensureInitialized()).rejects.toThrow(
        'Database initialization failed: Migration failed'
      );
      expect(console.error).toHaveBeenCalledWith(
        '❌ Database initialization failed: Migration failed'
      );
    });

    it('should handle non-Error objects appropriately', async () => {
      mockRunMigrations.mockRejectedValueOnce('String error');

      const manager = DatabaseManager.getInstance();

      await expect(manager.ensureInitialized()).rejects.toThrow(
        'Database initialization failed: String error'
      );
    });

    it('should handle null or undefined exceptions appropriately', async () => {
      mockRunMigrations.mockRejectedValueOnce(null);

      const manager = DatabaseManager.getInstance();

      await expect(manager.ensureInitialized()).rejects.toThrow(
        'Database initialization failed: null'
      );
    });
  });

  describe('SQL Execution', () => {
    it('should automatically call ensureInitialized() when execute() is called', async () => {
      // Setup fresh mocks for this test
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ journal_mode: 'wal' }],
          columns: ['journal_mode'],
        }) // PRAGMA journal_mode = WAL
        .mockResolvedValueOnce({
          rows: [{ synchronous: 1 }],
          columns: ['synchronous'],
        }) // PRAGMA synchronous = NORMAL
        .mockResolvedValueOnce({
          rows: [{ cache_size: -64000 }],
          columns: ['cache_size'],
        }) // PRAGMA cache_size = -64000
        .mockResolvedValueOnce({
          rows: [{ temp_store: 2 }],
          columns: ['temp_store'],
        }) // PRAGMA temp_store = MEMORY
        .mockResolvedValueOnce({ rows: [{ '1': 1 }], columns: ['1'] }) // SELECT 1 (verifyConnection)
        .mockResolvedValueOnce({ rows: [], columns: [] }); // The actual execute call

      const manager = DatabaseManager.getInstance();
      const spy = vi.spyOn(manager, 'ensureInitialized');

      await manager.execute('SELECT 1');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenLastCalledWith('SELECT 1');
    });

    it('should return correct results from execute()', async () => {
      // Ensure fresh instance and reset mocks
      await DatabaseManager.resetInstance();
      vi.clearAllMocks();

      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        columns: ['id', 'name'],
        rowsAffected: 1,
        lastInsertRowid: 1,
      };

      // Mock all initialization calls
      mockExecute.mockImplementation(async (sql: string) => {
        if (sql.includes('PRAGMA journal_mode')) {
          return { rows: [{ journal_mode: 'wal' }], columns: ['journal_mode'] };
        }
        if (sql.includes('PRAGMA synchronous')) {
          return { rows: [{ synchronous: 1 }], columns: ['synchronous'] };
        }
        if (sql.includes('PRAGMA cache_size')) {
          return { rows: [{ cache_size: -64000 }], columns: ['cache_size'] };
        }
        if (sql.includes('PRAGMA temp_store')) {
          return { rows: [{ temp_store: 2 }], columns: ['temp_store'] };
        }
        if (sql === 'SELECT 1') {
          return { rows: [{ '1': 1 }], columns: ['1'] };
        }
        // Return the actual result for the test query
        return mockResult;
      });

      const manager = DatabaseManager.getInstance();

      const result = await manager.execute('SELECT * FROM users');

      expect(result).toEqual(mockResult);
    });

    it('should properly propagate errors from execute()', async () => {
      const manager = DatabaseManager.getInstance();
      const dbError = new Error('SQL execution failed');

      mockExecute.mockRejectedValueOnce(dbError);

      await expect(manager.execute('INVALID SQL')).rejects.toThrow(
        'SQL execution failed'
      );
    });
  });

  describe('Client Access', () => {
    it('should return client instance from getClient()', () => {
      const manager = DatabaseManager.getInstance();
      const client = manager.getClient();

      expect(client).toBeDefined();
      expect(client.execute).toBe(mockExecute);
    });
  });

  describe('Multiple Instance Behavior', () => {
    it('should share initialization state across different instances', async () => {
      const manager1 = DatabaseManager.getInstance();
      const manager2 = DatabaseManager.getInstance();

      // Initialize with first instance
      await manager1.ensureInitialized();

      // Second instance should skip initialization
      await manager2.ensureInitialized();

      expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry After Initialization Failure', () => {
    it('should be able to retry initialization after failure', async () => {
      const manager = DatabaseManager.getInstance();

      // First attempt fails
      mockRunMigrations.mockRejectedValueOnce(new Error('First failure'));
      await expect(manager.ensureInitialized()).rejects.toThrow();

      // Second attempt succeeds
      mockRunMigrations.mockResolvedValueOnce();
      await expect(manager.ensureInitialized()).resolves.not.toThrow();

      expect(mockRunMigrations).toHaveBeenCalledTimes(2);
    });
  });

  describe('SQLite Specific Settings Verification', () => {
    it('should correctly set WAL mode', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.ensureInitialized();

      // Check if PRAGMA journal_mode = WAL was executed
      expect(mockExecute).toHaveBeenCalledWith('PRAGMA journal_mode = WAL;');
    });

    it('should correctly set synchronous mode', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.ensureInitialized();

      // Check if PRAGMA synchronous = NORMAL was executed
      expect(mockExecute).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL;');
    });

    it('should correctly set cache size', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.ensureInitialized();

      // Check if PRAGMA cache_size = -64000 was executed
      expect(mockExecute).toHaveBeenCalledWith('PRAGMA cache_size = -64000;');
    });

    it('should set temporary storage to memory', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.ensureInitialized();

      // Check if PRAGMA temp_store = MEMORY was executed
      expect(mockExecute).toHaveBeenCalledWith('PRAGMA temp_store = MEMORY;');
    });

    it('should execute connection verification query', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.ensureInitialized();

      // Check if SELECT 1 was executed
      expect(mockExecute).toHaveBeenCalledWith('SELECT 1');
    });
  });
});
