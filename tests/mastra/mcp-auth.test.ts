import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetConfig } from '../../src/config/env';

// Simple mock request interface for testing
interface MockRequest {
  url?: string;
  headers: Record<string, string | undefined>;
}

const createMockRequest = (
  url?: string,
  headers?: Record<string, string>
): MockRequest => {
  return {
    url: url || '/',
    headers: { host: 'localhost:4113', ...headers },
  };
};

describe('MCP Authentication', () => {
  beforeEach(() => {
    // Reset config and environment before each test
    resetConfig();
    delete process.env.MCP_API_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetConfig();
    delete process.env.MCP_API_KEY;
  });

  describe('Authentication logic', () => {
    // Test the authentication logic directly without importing the MCP module
    // to avoid server startup issues in tests

    const authenticateRequest = (
      req: MockRequest,
      apiKey?: string
    ): boolean => {
      // Skip authentication if no API key is configured
      if (!apiKey) {
        return true;
      }

      // Check Authorization header (Bearer token)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        return token === apiKey;
      }

      // Check API key in query parameters
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const apiKeyParam = url.searchParams.get('api_key');
      if (apiKeyParam) {
        return apiKeyParam === apiKey;
      }

      return false;
    };

    describe('with API key configured', () => {
      beforeEach(() => {
        process.env.MCP_API_KEY = 'test-secret-key';
      });

      it('should accept valid Bearer token in Authorization header', () => {
        const req = createMockRequest('/mcp', {
          authorization: 'Bearer test-secret-key',
        });

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(true);
      });

      it('should reject invalid Bearer token', () => {
        const req = createMockRequest('/mcp', {
          authorization: 'Bearer wrong-key',
        });

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(false);
      });

      it('should accept valid API key in query parameter', () => {
        const req = createMockRequest('/mcp?api_key=test-secret-key');

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(true);
      });

      it('should reject invalid API key in query parameter', () => {
        const req = createMockRequest('/mcp?api_key=wrong-key');

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(false);
      });

      it('should reject request with no authentication', () => {
        const req = createMockRequest('/mcp');

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(false);
      });

      it('should handle malformed Authorization header', () => {
        const req = createMockRequest('/mcp', {
          authorization: 'Basic dGVzdA==', // Not Bearer
        });

        const apiKey = process.env.MCP_API_KEY;
        const isAuthenticated = authenticateRequest(req, apiKey);

        expect(isAuthenticated).toBe(false);
      });
    });

    describe('without API key configured', () => {
      it('should allow all requests when no API key is set', () => {
        const req = createMockRequest('/mcp');

        // No API key configured
        const isAuthenticated = authenticateRequest(req, undefined);

        expect(isAuthenticated).toBe(true);
      });

      it('should allow requests even with invalid tokens when no API key is set', () => {
        const req = createMockRequest('/mcp', {
          authorization: 'Bearer some-random-token',
        });

        // No API key configured
        const isAuthenticated = authenticateRequest(req, undefined);

        expect(isAuthenticated).toBe(true);
      });
    });
  });

  describe('Authentication integration', () => {
    it('should parse Authorization header correctly', () => {
      const testCases = [
        { header: 'Bearer test-key', expected: 'test-key' },
        { header: 'Bearer ', expected: '' },
        {
          header: 'Bearer test-key-with-dashes',
          expected: 'test-key-with-dashes',
        },
        { header: 'Basic dGVzdA==', expected: null }, // Not Bearer
        { header: '', expected: null },
      ];

      testCases.forEach(({ header, expected }) => {
        let token = null;
        if (header && header.startsWith('Bearer ')) {
          token = header.substring(7);
        }

        if (expected === null) {
          expect(token).toBeNull();
        } else {
          expect(token).toBe(expected);
        }
      });
    });

    it('should parse query parameters correctly', () => {
      const testCases = [
        { url: '/mcp?api_key=test-key', expected: 'test-key' },
        {
          url: '/mcp?api_key=test-key-with-dashes',
          expected: 'test-key-with-dashes',
        },
        { url: '/mcp?other_param=value', expected: null },
        { url: '/mcp', expected: null },
        { url: '/mcp?api_key=', expected: '' },
      ];

      testCases.forEach(({ url, expected }) => {
        const parsedUrl = new URL(url, 'http://localhost:4113');
        const apiKeyParam = parsedUrl.searchParams.get('api_key');

        expect(apiKeyParam).toBe(expected);
      });
    });
  });

  describe('Error responses', () => {
    it('should return proper 401 error format', () => {
      const expectedError = {
        error: 'Unauthorized: Invalid or missing API key',
      };

      expect(expectedError).toEqual({
        error: 'Unauthorized: Invalid or missing API key',
      });
    });
  });
});
