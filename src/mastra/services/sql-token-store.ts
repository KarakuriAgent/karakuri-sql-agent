import { randomBytes } from 'crypto';

export interface SqlToken {
  query: string;
  createdAt: Date;
  expiresAt: Date;
}

export class SqlTokenStore {
  private tokens = new Map<string, SqlToken>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly tokenExpirationMs: number;

  /**
   * Safely parse integer from environment variable with validation and fallback
   */
  private static parseEnvInt(
    envValue: string | undefined,
    defaultValue: number
  ): number {
    if (!envValue) {
      return defaultValue;
    }

    const parsed = parseInt(envValue, 10);
    if (isNaN(parsed) || parsed < 0) {
      return defaultValue;
    }

    return parsed;
  }

  constructor() {
    // Get cleanup interval from environment variable, default to 1 minute
    const cleanupIntervalMs = SqlTokenStore.parseEnvInt(
      process.env.SQL_TOKEN_CLEANUP_INTERVAL_MS,
      60000
    );

    // Get token expiration from environment variable, default to 5 minutes
    this.tokenExpirationMs = SqlTokenStore.parseEnvInt(
      process.env.SQL_TOKEN_EXPIRATION_MS,
      300000
    );

    // Start cleanup interval to remove expired tokens
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, cleanupIntervalMs);
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
      this.cleanupInterval = null as any;
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
