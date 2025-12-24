// Database schema definition and migration
// Supports both sync (better-sqlite3) and async (tauri-plugin-sql)
// NOTE: This file should only be imported server-side or via dynamic import

import type { UnifiedDatabase } from './index';

const SCHEMA_VERSION = 5;

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
  if (fromVersion < 2) {
    await migrateToV2Async(db);
  }
  if (fromVersion < 3) {
    await migrateToV3Async(db);
  }
  if (fromVersion < 4) {
    await migrateToV4Async(db);
  }
  if (fromVersion < 5) {
    await migrateToV5Async(db);
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

async function migrateToV2Async(db: UnifiedDatabase): Promise<void> {
  // Variable presets table - stores presets per template file
  // Note: "values" is a reserved word in SQLite, so we use "preset_values" instead
  await db.execute(`
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_path TEXT NOT NULL,
      name TEXT NOT NULL,
      preset_values TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(template_path, name)
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_presets_template ON presets(template_path)');
}

async function migrateToV3Async(db: UnifiedDatabase): Promise<void> {
  // Dictionary table - stores autocomplete entries for YAML editor
  // Migrated from file-based dictionary/standard/*.yaml to SQLite
  await db.execute(`
    CREATE TABLE IF NOT EXISTS dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(context, key, value)
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_dict_context_key ON dictionary(context, key)');
}

async function migrateToV4Async(db: UnifiedDatabase): Promise<void> {
  // Key dictionary table - stores key suggestions for YAML editor
  // Separate from value dictionary for clean separation of concerns
  await db.execute(`
    CREATE TABLE IF NOT EXISTS key_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_key TEXT NOT NULL,
      child_key TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_key, child_key)
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_keydict_parent ON key_dictionary(parent_key)');
}

async function migrateToV5Async(db: UnifiedDatabase): Promise<void> {
  // Check if prompt_yaml column exists (it might have been renamed already)
  const tableInfo = await db.select<{ name: string }>(`PRAGMA table_info(images)`);
  const hasPromptYaml = tableInfo.some(col => col.name === 'prompt_yaml');
  const hasPrompt = tableInfo.some(col => col.name === 'prompt');

  // Rename prompt_yaml to prompt (it's no longer always YAML)
  if (hasPromptYaml && !hasPrompt) {
    await db.execute(`ALTER TABLE images RENAME COLUMN prompt_yaml TO prompt`);
  }

  // Add negative_prompt and parameters columns to images table
  // negative_prompt: stores the negative prompt text
  // parameters: stores generation parameters as JSON (overrides like width, height, steps, etc.)
  const hasNegativePrompt = tableInfo.some(col => col.name === 'negative_prompt');
  const hasParameters = tableInfo.some(col => col.name === 'parameters');

  if (!hasNegativePrompt) {
    await db.execute(`ALTER TABLE images ADD COLUMN negative_prompt TEXT`);
  }
  if (!hasParameters) {
    await db.execute(`ALTER TABLE images ADD COLUMN parameters TEXT`);
  }

  // Recreate FTS table to use new column name (prompt instead of prompt_yaml)
  // Always recreate to ensure consistency
  await db.execute(`DROP TRIGGER IF EXISTS images_ai`);
  await db.execute(`DROP TRIGGER IF EXISTS images_ad`);
  await db.execute(`DROP TRIGGER IF EXISTS images_au`);
  await db.execute(`DROP TABLE IF EXISTS images_fts`);

  await db.execute(`
    CREATE VIRTUAL TABLE images_fts USING fts5(
      id,
      prompt,
      content='images',
      content_rowid='rowid'
    )
  `);

  // Rebuild FTS index from current data
  await db.execute(`INSERT INTO images_fts(rowid, id, prompt) SELECT rowid, id, prompt FROM images`);

  // Recreate FTS sync triggers
  await db.execute(`
    CREATE TRIGGER images_ai AFTER INSERT ON images BEGIN
      INSERT INTO images_fts(rowid, id, prompt)
      VALUES (new.rowid, new.id, new.prompt);
    END
  `);

  await db.execute(`
    CREATE TRIGGER images_ad AFTER DELETE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt)
      VALUES('delete', old.rowid, old.id, old.prompt);
    END
  `);

  await db.execute(`
    CREATE TRIGGER images_au AFTER UPDATE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, id, prompt)
      VALUES('delete', old.rowid, old.id, old.prompt);
      INSERT INTO images_fts(rowid, id, prompt)
      VALUES (new.rowid, new.id, new.prompt);
    END
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
