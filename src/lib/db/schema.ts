// Database schema definition and migration
// Supports both sync (better-sqlite3) and async (tauri-plugin-sql)
// NOTE: This file should only be imported server-side or via dynamic import

import type { UnifiedDatabase } from './index';

const SCHEMA_VERSION = 1;

// Async version for UnifiedDatabase interface
export async function initializeSchemaAsync(db: UnifiedDatabase): Promise<void> {
  // Create metadata table for tracking schema version
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Check current schema version
  const versionRows = await db.select<{ value: string }>('SELECT value FROM _meta WHERE key = ?', ['schema_version']);
  const currentVersion = versionRows.length > 0 ? parseInt(versionRows[0].value, 10) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    await runMigrationsAsync(db, currentVersion);
  }
}

async function runMigrationsAsync(db: UnifiedDatabase, fromVersion: number): Promise<void> {
  if (fromVersion < 1) {
    await migrateToV1Async(db);
  }

  // Update schema version
  await db.execute('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)', ['schema_version', SCHEMA_VERSION.toString()]);
}

async function migrateToV1Async(db: UnifiedDatabase): Promise<void> {
  // Main images table
  await db.execute(`
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
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_images_deleted ON images(deleted_at)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(favorite) WHERE favorite = 1');

  // Attributes table (normalized YAML key-value pairs)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS image_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(image_id, key)
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_attr_image ON image_attributes(image_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_attr_key ON image_attributes(key)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_attr_value ON image_attributes(value)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_attr_key_value ON image_attributes(key, value)');

  // Full-text search virtual table
  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
      id,
      prompt_yaml,
      content='images',
      content_rowid='rowid'
    )
  `);

  // FTS sync triggers
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS images_ai AFTER INSERT ON images BEGIN
      INSERT INTO images_fts(rowid, id, prompt_yaml)
      VALUES (new.rowid, new.id, new.prompt_yaml);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS images_ad AFTER DELETE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt_yaml)
      VALUES('delete', old.rowid, old.id, old.prompt_yaml);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS images_au AFTER UPDATE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt_yaml)
      VALUES('delete', old.rowid, old.id, old.prompt_yaml);
      INSERT INTO images_fts(rowid, id, prompt_yaml)
      VALUES (new.rowid, new.id, new.prompt_yaml);
    END
  `);

  // Migration status table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    )
  `);
}


export async function isMigrationCompletedAsync(db: UnifiedDatabase, migrationId: string): Promise<boolean> {
  const rows = await db.select<{ id: string }>('SELECT id FROM _migrations WHERE id = ?', [migrationId]);
  return rows.length > 0;
}

export async function markMigrationCompletedAsync(db: UnifiedDatabase, migrationId: string): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO _migrations (id, completed_at) VALUES (?, ?)', [
    migrationId,
    new Date().toISOString()
  ]);
}
