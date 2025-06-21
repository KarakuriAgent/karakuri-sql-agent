import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { appDatabase } from './database-manager';

// Table to manage migration status
const createMigrationTable = async () => {
  await appDatabase.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

// Get applied migrations
const getAppliedMigrations = async (): Promise<string[]> => {
  const result = await appDatabase.execute('SELECT version FROM schema_migrations ORDER BY version');
  return result.rows.map(row => row.version as string);
};

// Get migration files
const getMigrationFiles = (): string[] => {
  const migrationsDir = join(process.cwd(), 'src', 'database', 'migrations');
  try {
    return readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
  } catch (error) {
    console.log('Migrations directory not found, skipping migrations');
    return [];
  }
};

// Execute migration
const runMigration = async (filename: string) => {
  const migrationPath = join(process.cwd(), 'src', 'database', 'migrations', filename);
  const sql = readFileSync(migrationPath, 'utf-8');
  
  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const statement of statements) {
    await appDatabase.execute(statement);
  }

  // Record migration
  const version = filename.replace('.sql', '');
  await appDatabase.execute(`INSERT INTO schema_migrations (version) VALUES (${version})`);
  
  console.log(`✅ Applied migration: ${filename}`);
};

// Execute seed data
const runSeeds = async () => {
  const seedsDir = join(process.cwd(), 'src', 'database', 'seeds');
  try {
    const seedFiles = readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const seedFile of seedFiles) {
      const seedPath = join(seedsDir, seedFile);
      const sql = readFileSync(seedPath, 'utf-8');
      
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        await appDatabase.execute(statement);
      }
      
      console.log(`🌱 Applied seed: ${seedFile}`);
    }
  } catch (error) {
    console.log('Seeds directory not found, skipping seeds');
  }
};

// Main migration execution function
export const runMigrations = async () => {
  try {
    // Create migration management table
    await createMigrationTable();
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    
    // Execute pending migrations
    const migrationFiles = getMigrationFiles();
    const pendingMigrations = migrationFiles.filter(file => {
      const version = file.replace('.sql', '');
      return !appliedMigrations.includes(version);
    });

    if (pendingMigrations.length === 0) {
      console.log('📊 All migrations are up to date');
    } else {
      console.log(`📊 Running ${pendingMigrations.length} pending migrations...`);
      
      for (const migration of pendingMigrations) {
        await runMigration(migration);
      }
    }

    // Execute seed data
    await runSeeds();
    
    console.log('🎉 Database initialization completed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Rollback functionality (basic version)
export const rollbackMigration = async (targetVersion?: string) => {
  // Proper rollback requires Down migration
  // This is a simple example that removes the latest migration from records
  try {
    if (targetVersion) {
      await appDatabase.execute(`DELETE FROM schema_migrations WHERE version = ${targetVersion}`);
      console.log(`🔄 Rolled back migration: ${targetVersion}`);
    } else {
      // Rollback the latest migration
      await appDatabase.execute(`
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