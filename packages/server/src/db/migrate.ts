import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Migrates the database by applying any pending SQL migration files found in the specified directory.
 * @param db The database connection object.
 * @param migrationsDir The directory containing SQL migration files.
 */
export function migrate(db: Database.Database, migrationsDir: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version         TEXT PRIMARY KEY,
    applied_at      TEXT NOT NULL
  )`);

  // Get the set of already applied migrations
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations')
      .pluck()
      .all() as string[]
  );

  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!applied.has(file))  {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Wrapping each migration in a db.transaction() call means a partially
      // applied migration will be rolled back rather than leaving the schema
      // in an inconsistent state.
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)')
          .run(file, new Date().toISOString());
      })();
    }
  }
}
