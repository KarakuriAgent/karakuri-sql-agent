import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sqlTokenStore } from '../../../src/mastra/services/sql-token-store';
import { sqlExecuteRoute } from '../../../src/mastra/api/sql-execute';

// Mock the DatabaseManager
vi.mock('../../../src/database/database-manager', () => ({
  DatabaseManager: {
    getInstance: vi.fn(() => ({
      execute: vi.fn(),
    })),
  },
}));

import { DatabaseManager } from '../../../src/database/database-manager';

describe('SQL Execute API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any existing tokens
    sqlTokenStore.cleanupExpired();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('should reject request with missing token', async () => {
      const mockContext = createMockContext({});

      await sqlExecuteRoute.handler(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid request'),
        }),
        400
      );
    });

    it('should reject request with invalid token', async () => {
      const mockContext = createMockContext({ token: 'invalid-token' });

      await sqlExecuteRoute.handler(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid or expired confirmation token',
        }),
        401
      );
    });

    it('should reject request with expired token', async () => {
      const query = 'UPDATE users SET active = true';
      const token = sqlTokenStore.generateToken();
      sqlTokenStore.store(token, query);

      // Manually expire the token
      const tokenData = (sqlTokenStore as any).tokens.get(token);
      if (tokenData) {
        tokenData.expiresAt = new Date(Date.now() - 1000);
      }

      const mockContext = createMockContext({ token });

      await sqlExecuteRoute.handler(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid or expired confirmation token',
        }),
        401
      );
    });
  });

  describe('SQL Execution', () => {
    it('should execute SQL with valid token', async () => {
      const query = 'UPDATE users SET active = true WHERE id = 1';
      const token = sqlTokenStore.generateToken();
      sqlTokenStore.store(token, query);

      const mockResult = {
        rowsAffected: 1,
        lastInsertRowid: null,
        columns: [],
        rows: [],
      };

      const mockExecute = vi.fn().mockResolvedValue(mockResult);
      vi.mocked(DatabaseManager.getInstance).mockReturnValue({
        execute: mockExecute,
      } as any);

      const mockContext = createMockContext({ token });

      await sqlExecuteRoute.handler(mockContext as any);

      expect(mockExecute).toHaveBeenCalledWith(query);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          query,
          result: mockResult,
          executedAt: expect.any(String),
        })
      );
    });

    it('should handle SQL execution errors', async () => {
      const query = 'UPDATE non_existent_table SET value = 1';
      const token = sqlTokenStore.generateToken();
      sqlTokenStore.store(token, query);

      const mockExecute = vi
        .fn()
        .mockRejectedValue(new Error('Table not found'));
      vi.mocked(DatabaseManager.getInstance).mockReturnValue({
        execute: mockExecute,
      } as any);

      const mockContext = createMockContext({ token });

      await sqlExecuteRoute.handler(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          query,
          error: 'SQL execution failed: Table not found',
        }),
        500
      );
    });

    it('should invalidate token after use', async () => {
      const query = 'INSERT INTO logs (message) VALUES ("test")';
      const token = sqlTokenStore.generateToken();
      sqlTokenStore.store(token, query);

      const mockExecute = vi.fn().mockResolvedValue({
        rowsAffected: 1,
        lastInsertRowid: 123n,
        columns: [],
        rows: [],
      });
      vi.mocked(DatabaseManager.getInstance).mockReturnValue({
        execute: mockExecute,
      } as any);

      const mockContext = createMockContext({ token });

      // First execution should succeed
      await sqlExecuteRoute.handler(mockContext as any);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );

      // Reset mock
      mockContext.json.mockClear();

      // Second execution with same token should fail
      await sqlExecuteRoute.handler(mockContext as any);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid or expired confirmation token',
        }),
        401
      );
    });
  });
});

// Helper function to create mock Hono context
function createMockContext(body: any) {
  return {
    req: {
      json: vi.fn().mockResolvedValue(body),
    },
    json: vi.fn(),
  };
}
