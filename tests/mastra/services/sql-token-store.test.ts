import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqlTokenStore } from '../../../src/mastra/services/sql-token-store';

describe('SqlTokenStore', () => {
  let tokenStore: SqlTokenStore;

  beforeEach(() => {
    tokenStore = new SqlTokenStore();
  });

  afterEach(() => {
    tokenStore.destroy();
  });

  describe('Token Generation', () => {
    it('should generate unique tokens', () => {
      const token1 = tokenStore.generateToken();
      const token2 = tokenStore.generateToken();

      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
    });
  });

  describe('Token Storage and Retrieval', () => {
    it('should store and retrieve tokens', () => {
      const query = 'UPDATE users SET active = true';
      const token = tokenStore.generateToken();

      tokenStore.store(token, query);

      const retrieved = tokenStore.getAndInvalidate(token);
      expect(retrieved).toBe(query);
    });

    it('should invalidate token after retrieval', () => {
      const query =
        'DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY';
      const token = tokenStore.generateToken();

      tokenStore.store(token, query);

      // First retrieval should work
      const retrieved1 = tokenStore.getAndInvalidate(token);
      expect(retrieved1).toBe(query);

      // Second retrieval should fail
      const retrieved2 = tokenStore.getAndInvalidate(token);
      expect(retrieved2).toBeNull();
    });

    it('should return null for non-existent token', () => {
      const result = tokenStore.getAndInvalidate('non-existent-token');
      expect(result).toBeNull();
    });
  });

  describe('Token Expiration', () => {
    it('should expire tokens after 5 minutes', () => {
      const query = 'INSERT INTO events (name) VALUES ("test")';
      const token = tokenStore.generateToken();

      tokenStore.store(token, query);

      // Manually set expiration to past
      const tokenData = (tokenStore as any).tokens.get(token);
      tokenData.expiresAt = new Date(Date.now() - 1000);

      const retrieved = tokenStore.getAndInvalidate(token);
      expect(retrieved).toBeNull();
    });

    it('should clean up expired tokens', () => {
      // Create some tokens
      const activeToken = tokenStore.generateToken();
      const expiredToken1 = tokenStore.generateToken();
      const expiredToken2 = tokenStore.generateToken();

      tokenStore.store(activeToken, 'SELECT 1');
      tokenStore.store(expiredToken1, 'SELECT 2');
      tokenStore.store(expiredToken2, 'SELECT 3');

      // Expire some tokens
      const tokens = (tokenStore as any).tokens;
      tokens.get(expiredToken1).expiresAt = new Date(Date.now() - 1000);
      tokens.get(expiredToken2).expiresAt = new Date(Date.now() - 2000);

      // Before cleanup, all tokens exist in the Map
      expect((tokenStore as any).tokens.size).toBe(3);

      tokenStore.cleanupExpired();

      // After cleanup, only active token remains
      expect((tokenStore as any).tokens.size).toBe(1);
      expect(tokens.has(activeToken)).toBe(true);
      expect(tokens.has(expiredToken1)).toBe(false);
      expect(tokens.has(expiredToken2)).toBe(false);
    });
  });

  describe('Token Management', () => {
    it('should track active token count', () => {
      expect(tokenStore.getActiveTokenCount()).toBe(0);

      const token1 = tokenStore.generateToken();
      const token2 = tokenStore.generateToken();

      tokenStore.store(token1, 'UPDATE users SET active = true');
      tokenStore.store(token2, 'DELETE FROM temp_data');

      expect(tokenStore.getActiveTokenCount()).toBe(2);

      tokenStore.getAndInvalidate(token1);

      expect(tokenStore.getActiveTokenCount()).toBe(1);
    });
  });
});
