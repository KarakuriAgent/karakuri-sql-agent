import { readFileSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseManager } from './database-manager';
import { databaseConfig } from '../config/env';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to extract directory path from DATABASE_URL
const getDatabaseDirectoryFromUrl = (): string => {
  const databaseUrl = databaseConfig.url;

  if (databaseUrl.startsWith('file:')) {
    // Remove 'file:' prefix and get directory path
    const filePath = databaseUrl.replace(/^file:/, '');
    return dirname(resolve(filePath));
  }

  // For other database types, fallback to project database directory
  return resolve(__dirname, '../../example/database');
};

// Table to manage migration status
const createMigrationTable = async (database: DatabaseManager) => {
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Failed to create schema_migrations table:', error);
    throw error;
  }
};

// Table to manage seed application status
const createSeedTrackingTable = async (database: DatabaseManager) => {
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS seed_applications (
        filename TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Failed to create seed_applications table:', error);
    throw error;
  }
};

// Get applied seed files
const getAppliedSeeds = async (
  database: DatabaseManager
): Promise<string[]> => {
  const result = await database.execute(
    'SELECT filename FROM seed_applications ORDER BY filename'
  );
  return result.rows.map(row => row.filename as string);
};

// Mark seed as applied
const markSeedAsApplied = async (
  database: DatabaseManager,
  filename: string
) => {
  await database.execute(
    `INSERT OR IGNORE INTO seed_applications (filename) VALUES ('${filename.replace(/'/g, "''")}')`
  );
};

// Get applied migrations
const getAppliedMigrations = async (
  database: DatabaseManager
): Promise<string[]> => {
  const result = await database.execute(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return result.rows.map(row => row.version as string);
};

// Get migration files
const getMigrationFiles = (): string[] => {
  const databaseDir = getDatabaseDirectoryFromUrl();
  const migrationsDir = join(databaseDir, 'migrations');

  try {
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files;
  } catch {
    console.warn(`⚠️ Migrations directory not found: ${migrationsDir}`);
    return [];
  }
};

// Execute migration
const runMigration = async (database: DatabaseManager, filename: string) => {
  const databaseDir = getDatabaseDirectoryFromUrl();
  const migrationsDir = join(databaseDir, 'migrations');
  const migrationPath = join(migrationsDir, filename);
  const sql = readFileSync(migrationPath, 'utf-8');

  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const statement of statements) {
    await database.execute(statement);
  }

  // Record migration
  const version = filename.replace('.sql', '');
  await database.execute(
    `INSERT INTO schema_migrations (version) VALUES ('${version}')`
  );

  console.log(`✅ Applied migration: ${filename}`);
};

// Execute seed data
const runSeeds = async (database: DatabaseManager) => {
  const databaseDir = getDatabaseDirectoryFromUrl();
  const seedsDir = join(databaseDir, 'seeds');
  try {
    const seedFiles = readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Create seed tracking table if it doesn't exist
    await createSeedTrackingTable(database);

    // Get already applied seeds
    const appliedSeeds = await getAppliedSeeds(database);
    const pendingSeeds = seedFiles.filter(file => !appliedSeeds.includes(file));

    if (pendingSeeds.length === 0) {
      console.log('🌱 All seeds already applied, skipping seed execution');
      return;
    }

    console.log(`🌱 Applying ${pendingSeeds.length} seed files...`);
    for (const seedFile of pendingSeeds) {
      const seedPath = join(seedsDir, seedFile);
      const sql = readFileSync(seedPath, 'utf-8');

      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        try {
          await database.execute(statement);
        } catch {
          console.warn(
            `⚠️ Seed statement failed (may be expected for existing data): ${statement}`
          );
        }
      }

      await markSeedAsApplied(database, seedFile);
      console.log(`🌱 Applied seed: ${seedFile}`);
    }
  } catch {
    console.log('Seeds directory not found, skipping seeds');
  }
};

// Main migration execution function
export const runMigrations = async (database: DatabaseManager) => {
  try {
    // Create migration management table
    await createMigrationTable(database);

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(database);

    // Execute pending migrations
    const migrationFiles = getMigrationFiles();
    const pendingMigrations = migrationFiles.filter(file => {
      const version = file.replace('.sql', '');
      return !appliedMigrations.includes(version);
    });

    if (pendingMigrations.length > 0) {
      console.log(
        `📊 Running ${pendingMigrations.length} pending migrations...`
      );
      for (const migration of pendingMigrations) {
        await runMigration(database, migration);
      }
      console.log('✅ Migrations completed');
    }

    // Execute seed data
    await runSeeds(database);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Rollback functionality (basic version)
export const rollbackMigration = async (
  database: DatabaseManager,
  targetVersion?: string
) => {
  // Proper rollback requires Down migration
  // This is a simple example that removes the latest migration from records
  try {
    if (targetVersion) {
      await database.execute(
        `DELETE FROM schema_migrations WHERE version = '${targetVersion}'`
      );
      console.log(`🔄 Rolled back migration: ${targetVersion}`);
    } else {
      // Rollback the latest migration
      await database.execute(`
        DELETE FROM schema_migrations 
        WHERE version = (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1)
      `);
      console.log('🔄 Rolled back latest migration');
    }
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};
