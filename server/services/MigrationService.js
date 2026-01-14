/**
 * MigrationService - Auto-apply database migrations on startup
 * 
 * Simple approach for single-server deployment:
 * - Tracks versions in schema_migrations table
 * - Runs pending migrations in order
 * - Idempotent DDL (IF NOT EXISTS, IF EXISTS)
 * 
 * ⚠️ SYNC: When adding migrations, also update /db/*.sql files
 *    - .sql files = fresh DB schema (source of truth)
 *    - migrations = patches for existing DBs
 */

const migrations = [
  {
    version: 1,
    description: 'Baseline - existing schema',
    up: async (pool) => {
      // Existing schema, just mark as v1
      console.log('Migration 1: Baseline schema marked');
    }
  },
  {
    version: 2,
    description: 'Add tier and expiry to galleries',
    up: async (pool) => {
      await pool.query(`
        ALTER TABLE galleries 
        ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free'
      `);
      await pool.query(`
        ALTER TABLE galleries 
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
      `);
      await pool.query(`
        ALTER TABLE galleries 
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
      `);
      console.log('Migration 2: Added tier, expires_at, paid_at columns');
    }
  }
  // Future migrations go here - just add to the array!
];

/**
 * Run all pending migrations
 * Call this on server startup after pool is connected
 */
async function runMigrations(pool) {
  // Ensure migration tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version
  const result = await pool.query('SELECT MAX(version) as version FROM schema_migrations');
  const currentVersion = result.rows[0]?.version || 0;

  // Find pending migrations
  const pending = migrations.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    console.log('Database schema is up to date (v' + currentVersion + ')');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s)`);

  // Run each pending migration
  for (const migration of pending) {
    console.log(`Applying migration ${migration.version}: ${migration.description}`);
    
    try {
      await migration.up(pool);
      
      await pool.query(
        'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
        [migration.version, migration.description]
      );
      
      console.log(`✅ Migration ${migration.version} completed`);
    } catch (error) {
      console.error(`❌ Migration ${migration.version} failed:`, error.message);
      throw error; // Stop server if migration fails
    }
  }

  console.log('All migrations completed successfully');
}

module.exports = { runMigrations, migrations };
