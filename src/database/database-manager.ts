import { createClient, Client, ResultSet } from '@libsql/client';
import { runMigrations } from './migration-manager';

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private client: Client | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private isConnected = false;
  private isInitializing = false;

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private getDatabaseUrl(): string {
    return process.env.DATABASE_URL || 'file:../../database/app.db';
  }

  private createClientIfNeeded(): Client {
    if (!this.client) {
      this.client = createClient({
        url: this.getDatabaseUrl(),
      });
    }
    return this.client;
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
    this.isInitializing = true;
    try {
      const client = this.createClientIfNeeded();
      // Enable SQLite WAL mode for performance improvement
      await client.execute('PRAGMA journal_mode = WAL;');
      await client.execute('PRAGMA synchronous = NORMAL;');
      await client.execute('PRAGMA cache_size = -64000;'); // 64MB cache
      await client.execute('PRAGMA temp_store = MEMORY;');

      // Verify connection status
      await this.verifyConnection();

      await runMigrations(this);

      this.isInitialized = true;
      this.isConnected = true;
      console.log('📊 Database initialized successfully with WAL mode');
    } catch (error) {
      this.initializationPromise = null;
      this.isConnected = false;
      const errorMessage = `❌ Database initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      this.isInitializing = false;
    }
  }

  getClient(): Client {
    return this.createClientIfNeeded();
  }

  async close(): Promise<void> {
    try {
      if (this.client) {
        this.client.close();
      }
      this.isConnected = false;
      console.log('📊 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }

  async execute(sql: string): Promise<ResultSet> {
    try {
      // Skip initialization check if we're already initializing
      if (!this.isInitializing) {
        await this.ensureInitialized();
      }
      return await this.createClientIfNeeded().execute(sql);
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
      await this.createClientIfNeeded().execute('SELECT 1');
    } catch (error) {
      throw new Error(
        `Database connection verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Execute transaction
  async executeTransaction(queries: string[]): Promise<ResultSet[]> {
    await this.ensureInitialized();

    const client = this.createClientIfNeeded();
    try {
      await client.execute('BEGIN TRANSACTION');
      const results: ResultSet[] = [];

      for (const query of queries) {
        const result = await client.execute(query);
        results.push(result);
      }

      await client.execute('COMMIT');
      return results;
    } catch (error) {
      try {
        await client.execute('ROLLBACK');
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
    const client = this.createClientIfNeeded();
    try {
      await client.execute('PRAGMA optimize');
      await client.execute('VACUUM');
      console.log('📊 Database optimized successfully');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      throw error;
    }
  }

  // Get database schema
  async getSchema(): Promise<string> {
    await this.ensureInitialized();

    const result = await this.createClientIfNeeded().execute(`
      SELECT sql FROM sqlite_master 
      WHERE type IN ('table', 'index') 
      AND name NOT LIKE 'sqlite_%' 
      AND name != 'schema_migrations'
      ORDER BY type, name
    `);

    const schemas = result.rows.map(row => row.sql).filter(sql => sql);
    return schemas.join(';\n\n') + ';';
  }

  // Reset function for testing
  static async resetInstance(): Promise<void> {
    if (DatabaseManager.instance) {
      await DatabaseManager.instance.close();
      DatabaseManager.instance.isInitialized = false;
      DatabaseManager.instance.initializationPromise = null;
      DatabaseManager.instance.isConnected = false;
      DatabaseManager.instance.client = null;
      // Explicitly reset singleton instance for testing
      (
        DatabaseManager as unknown as { instance: DatabaseManager | null }
      ).instance = null;
    }
  }
}
