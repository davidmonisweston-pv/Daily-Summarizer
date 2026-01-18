import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();

    console.log('📝 Reading migration file...');
    const migrationPath = path.join(__dirname, '../migrations/0002_add_user_name_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🚀 Executing migration...');
    await client.query('BEGIN');

    try {
      await client.query(migrationSQL);
      await client.query('COMMIT');
      console.log('✅ Migration completed successfully!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
