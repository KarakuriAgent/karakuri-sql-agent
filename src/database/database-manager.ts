import { createClient, Client, ResultSet } from '@libsql/client';
import { runMigrations } from './migration-manager';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private client: Client;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private isConnected = false;

  private constructor() {
    this.client = createClient({
      url: this.getDatabaseUrl(),
    });
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private getDatabaseUrl(): string {
    return process.env.DATABASE_URL || 'file:app.db';
  }

  async ensureInitialized() {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      // Enable SQLite WAL mode for performance improvement
      await this.client.execute('PRAGMA journal_mode = WAL;');
      await this.client.execute('PRAGMA synchronous = NORMAL;');
      await this.client.execute('PRAGMA cache_size = -64000;'); // 64MB cache
      await this.client.execute('PRAGMA temp_store = MEMORY;');

      // Verify connection status
      await this.verifyConnection();

      await runMigrations();
      this.isInitialized = true;
      this.isConnected = true;
      console.log('📊 Database initialized successfully with WAL mode');
    } catch (error) {
      this.initializationPromise = null;
      this.isConnected = false;
      const errorMessage = `❌ Database initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  getClient(): Client {
    return this.client;
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      console.log('📊 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }

  async execute(sql: string): Promise<ResultSet> {
    try {
      await this.ensureInitialized();
      return await this.client.execute(sql);
    } catch (error) {
      console.error('❌ SQL execution failed:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.isConnected;
  }

  getConnectionStatus(): { initialized: boolean; connected: boolean } {
    return {
      initialized: this.isInitialized,
      connected: this.isConnected,
    };
  }

  // Verify connection status
  private async verifyConnection(): Promise<void> {
    try {
      await this.client.execute('SELECT 1');
    } catch (error) {
      throw new Error(
        `Database connection verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Execute transaction
  async executeTransaction(queries: string[]): Promise<ResultSet[]> {
    await this.ensureInitialized();

    try {
      await this.client.execute('BEGIN TRANSACTION');
      const results: ResultSet[] = [];

      for (const query of queries) {
        const result = await this.client.execute(query);
        results.push(result);
      }

      await this.client.execute('COMMIT');
      return results;
    } catch (error) {
      try {
        await this.client.execute('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
      }
      console.error('❌ Transaction failed:', error);
      throw error;
    }
  }

  // Optimize database
  async optimize(): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.client.execute('PRAGMA optimize');
      await this.client.execute('VACUUM');
      console.log('📊 Database optimized successfully');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      throw error;
    }
  }

  // Reset function for testing
  static async resetInstance(): Promise<void> {
    if (DatabaseManager.instance) {
      await DatabaseManager.instance.close();
      DatabaseManager.instance.isInitialized = false;
      DatabaseManager.instance.initializationPromise = null;
      DatabaseManager.instance.isConnected = false;
      // @ts-expect-error - Needed for testing to reset singleton instance
      DatabaseManager.instance = undefined;
    }
  }
}

export const appDatabase = DatabaseManager.getInstance();
