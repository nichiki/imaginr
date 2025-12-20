// Database schema definition and migration
import type Database from 'better-sqlite3';

const SCHEMA_VERSION = 1;

export function initializeSchema(db: Database.Database): void {
  // Create metadata table for tracking schema version
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Check current schema version
  const versionRow = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    runMigrations(db, currentVersion);
  }
}

function runMigrations(db: Database.Database, fromVersion: number): void {
  // Run all migrations in a transaction
  db.transaction(() => {
    if (fromVersion < 1) {
      migrateToV1(db);
    }

    // Update schema version
    db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('schema_version', SCHEMA_VERSION.toString());
  })();
}

function migrateToV1(db: Database.Database): void {
  // Main images table
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      prompt_yaml TEXT NOT NULL,
      workflow_id TEXT,
      seed INTEGER,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      favorite INTEGER DEFAULT 0,
      rating INTEGER,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_deleted ON images(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(favorite) WHERE favorite = 1;
  `);

  // Attributes table (normalized YAML key-value pairs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(image_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_attr_image ON image_attributes(image_id);
    CREATE INDEX IF NOT EXISTS idx_attr_key ON image_attributes(key);
    CREATE INDEX IF NOT EXISTS idx_attr_value ON image_attributes(value);
    CREATE INDEX IF NOT EXISTS idx_attr_key_value ON image_attributes(key, value);
  `);

  // Full-text search virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
      id,
      prompt_yaml,
      content='images',
      content_rowid='rowid'
    );
  `);

  // FTS sync triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS images_ai AFTER INSERT ON images BEGIN
      INSERT INTO images_fts(rowid, id, prompt_yaml)
      VALUES (new.rowid, new.id, new.prompt_yaml);
    END;

    CREATE TRIGGER IF NOT EXISTS images_ad AFTER DELETE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt_yaml)
      VALUES('delete', old.rowid, old.id, old.prompt_yaml);
    END;

    CREATE TRIGGER IF NOT EXISTS images_au AFTER UPDATE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt_yaml)
      VALUES('delete', old.rowid, old.id, old.prompt_yaml);
      INSERT INTO images_fts(rowid, id, prompt_yaml)
      VALUES (new.rowid, new.id, new.prompt_yaml);
    END;
  `);

  // Migration status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    );
  `);
}

export function isMigrationCompleted(db: Database.Database, migrationId: string): boolean {
  const row = db.prepare('SELECT id FROM _migrations WHERE id = ?').get(migrationId);
  return !!row;
}

export function markMigrationCompleted(db: Database.Database, migrationId: string): void {
  db.prepare('INSERT OR REPLACE INTO _migrations (id, completed_at) VALUES (?, ?)').run(
    migrationId,
    new Date().toISOString()
  );
}
