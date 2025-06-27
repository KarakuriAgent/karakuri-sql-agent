import { randomBytes } from 'crypto';
import { sqlTokenConfig } from '../../config/env';

export interface SqlToken {
  query: string;
  createdAt: Date;
  expiresAt: Date;
}

export class SqlTokenStore {
  private tokens = new Map<string, SqlToken>();
  private cleanupInterval: NodeJS.Timeout | undefined;
  private readonly tokenExpirationMs: number;

  constructor() {
    // Use centralized configuration
    this.tokenExpirationMs = sqlTokenConfig.expirationMs;

    // Start cleanup interval to remove expired tokens
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, sqlTokenConfig.cleanupIntervalMs);
  }

  /**
   * Generate a secure random token
   */
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Store a token with its associated SQL query
   */
  store(token: string, query: string): void {
    const now = new Date();
    this.tokens.set(token, {
      query,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.tokenExpirationMs),
    });
  }

  /**
   * Get and invalidate a token (single use)
   * Returns the associated query if valid, null otherwise
   */
  getAndInvalidate(token: string): string | null {
    const data = this.tokens.get(token);

    if (!data) {
      return null;
    }

    // Check if expired
    if (data.expiresAt < new Date()) {
      this.tokens.delete(token);
      return null;
    }

    // Delete token (single use)
    this.tokens.delete(token);
    return data.query;
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpired(): void {
    const now = new Date();
    for (const [token, data] of this.tokens.entries()) {
      if (data.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }

  /**
   * Stop the cleanup interval (for cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval != null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get the number of active tokens (for monitoring/testing)
   */
  getActiveTokenCount(): number {
    this.cleanupExpired();
    return this.tokens.size;
  }
}

// Export singleton instance
export const sqlTokenStore = new SqlTokenStore();
