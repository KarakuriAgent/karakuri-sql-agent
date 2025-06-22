import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DatabaseManager } from './database-manager';

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
  const migrationsDir =
    process.env.DATABASE_MIGRATIONS_PATH ||
    join(process.cwd(), 'database', 'migrations');

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
  const migrationsDir =
    process.env.DATABASE_MIGRATIONS_PATH ||
    join(process.cwd(), 'database', 'migrations');
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
  const seedsDir =
    process.env.DATABASE_SEEDS_PATH || join(process.cwd(), 'database', 'seeds');
  try {
    const seedFiles = readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Check if seeds have already been applied by looking for data in tables
    try {
      const result = await database.execute(
        'SELECT COUNT(*) as count FROM users'
      );
      const userCount = result.rows[0]?.count as number;
      if (userCount > 0) {
        console.log('🌱 Seeds already applied, skipping seed execution');
        return;
      }
    } catch {
      console.log('🌱 Could not check existing data, proceeding with seeds');
    }

    console.log(`🌱 Applying ${seedFiles.length} seed files...`);
    for (const seedFile of seedFiles) {
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
