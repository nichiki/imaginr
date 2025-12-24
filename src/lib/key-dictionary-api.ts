// Key Dictionary API
// Provides key suggestions for YAML editor autocomplete
// Separate from value dictionary for clean separation of concerns

import yaml from 'js-yaml';

export interface KeyDictionaryEntry {
  id: number;
  parentKey: string;
  childKey: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
}

interface KeyDictionaryRow {
  id: number;
  parent_key: string;
  child_key: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

// Get keys by parent context
export async function getKeysByParent(parentKey: string): Promise<KeyDictionaryEntry[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  // First try exact match, then fallback to wildcard
  let rows = await db.select<KeyDictionaryRow>(
    'SELECT * FROM key_dictionary WHERE parent_key = ? ORDER BY sort_order, child_key',
    [parentKey]
  );

  // If no exact match and not already wildcard, try wildcard
  if (rows.length === 0 && parentKey !== '*') {
    rows = await db.select<KeyDictionaryRow>(
      'SELECT * FROM key_dictionary WHERE parent_key = ? ORDER BY sort_order, child_key',
      ['*']
    );
  }

  return rows.map(rowToEntry);
}

// Get all key entries
export async function getAllKeyEntries(): Promise<KeyDictionaryEntry[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<KeyDictionaryRow>(
    'SELECT * FROM key_dictionary ORDER BY parent_key, sort_order, child_key'
  );

  return rows.map(rowToEntry);
}

// Add a new key entry
export async function addKeyEntry(
  parentKey: string,
  childKey: string,
  description?: string,
  sortOrder: number = 0
): Promise<KeyDictionaryEntry> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO key_dictionary (parent_key, child_key, description, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [parentKey, childKey, description || null, sortOrder, now]
  );

  const rows = await db.select<KeyDictionaryRow>(
    'SELECT * FROM key_dictionary WHERE parent_key = ? AND child_key = ?',
    [parentKey, childKey]
  );

  if (rows.length === 0) {
    throw new Error('Failed to add key dictionary entry');
  }

  return rowToEntry(rows[0]);
}

// Delete a key entry
export async function deleteKeyEntry(id: number): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute('DELETE FROM key_dictionary WHERE id = ?', [id]);
}

// Get entry count
export async function getKeyEntryCount(): Promise<number> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM key_dictionary'
  );

  return rows[0]?.count ?? 0;
}

// ================================
// Import from YAML
// ================================

interface KeyDictionaryYamlFile {
  entries: Array<{
    parent: string;
    description?: string;
    children: Array<{
      key: string;
      description?: string;
    }>;
  }>;
}

// Import from YAML content
export async function importKeyDictionaryFromYaml(
  yamlContent: string,
  mode: 'merge' | 'replace'
): Promise<{ added: number; skipped: number }> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const data = yaml.load(yamlContent) as KeyDictionaryYamlFile | null;

  if (!data?.entries || !Array.isArray(data.entries)) {
    throw new Error('Invalid YAML format: missing entries array');
  }

  let added = 0;
  let skipped = 0;

  if (mode === 'replace') {
    await db.execute('DELETE FROM key_dictionary');
  }

  const now = new Date().toISOString();

  for (const entry of data.entries) {
    if (!entry.parent || !Array.isArray(entry.children)) {
      skipped++;
      continue;
    }

    let sortOrder = 0;
    for (const child of entry.children) {
      if (!child.key) {
        skipped++;
        continue;
      }

      try {
        if (mode === 'merge') {
          // Check if entry exists
          const existing = await db.select<{ id: number }>(
            'SELECT id FROM key_dictionary WHERE parent_key = ? AND child_key = ?',
            [entry.parent, child.key]
          );

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await db.execute(
          `INSERT INTO key_dictionary (parent_key, child_key, description, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [entry.parent, child.key, child.description || null, sortOrder, now]
        );
        added++;
        sortOrder++;
      } catch {
        skipped++;
      }
    }
  }

  return { added, skipped };
}

// ================================
// Initial data import
// ================================

// Import from bundled key dictionary file (first launch only)
export async function initializeFromBundledKeyFile(): Promise<boolean> {
  const { getDatabase } = await import('./db/tauri-db');
  const { isMigrationCompletedAsync, markMigrationCompletedAsync } = await import('./db/schema');
  const db = await getDatabase();

  // Check if already imported
  const alreadyImported = await isMigrationCompletedAsync(db, 'initial_key_dictionary_import');
  console.log('Key dictionary migration already completed:', alreadyImported);
  if (alreadyImported) {
    const count = await getKeyEntryCount();
    console.log('Key dictionary entry count:', count);
    return false;
  }

  // Check if key dictionary table is empty
  const count = await getKeyEntryCount();
  console.log('Key dictionary entry count (before import):', count);
  if (count > 0) {
    await markMigrationCompletedAsync(db, 'initial_key_dictionary_import');
    return false;
  }

  // Load key dictionary file from bundled resources
  const { resolveResource, join } = await import('@tauri-apps/api/path');
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

  let keyFilePath: string;
  try {
    // Production: bundled resources
    const resourcePath = await resolveResource('data/dictionary/keys.yaml');
    if (await exists(resourcePath)) {
      keyFilePath = resourcePath;
    } else {
      // Dev mode: go up from debug folder to project root
      const debugPath = await resolveResource('.');
      keyFilePath = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'keys.yaml');
    }
  } catch {
    // Fallback for dev mode
    const debugPath = await resolveResource('.');
    keyFilePath = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'keys.yaml');
  }

  if (!(await exists(keyFilePath))) {
    console.warn('Bundled key dictionary not found:', keyFilePath);
    await markMigrationCompletedAsync(db, 'initial_key_dictionary_import');
    return false;
  }

  try {
    const content = await readTextFile(keyFilePath);
    const result = await importKeyDictionaryFromYaml(content, 'merge');
    console.log(`Imported ${result.added} key dictionary entries from bundled resources`);
  } catch (err) {
    console.error('Error importing key dictionary:', err);
  }

  await markMigrationCompletedAsync(db, 'initial_key_dictionary_import');
  return true;
}

// ================================
// Cache for editor
// ================================

// Build cache for fast lookup in editor
export async function buildKeyDictionaryCache(): Promise<Map<string, KeyDictionaryEntry[]>> {
  const entries = await getAllKeyEntries();
  const cache = new Map<string, KeyDictionaryEntry[]>();

  for (const entry of entries) {
    if (!cache.has(entry.parentKey)) {
      cache.set(entry.parentKey, []);
    }
    cache.get(entry.parentKey)!.push(entry);
  }

  return cache;
}

// Lookup keys from cache
export function lookupKeysFromCache(
  cache: Map<string, KeyDictionaryEntry[]>,
  parentKey: string
): KeyDictionaryEntry[] {
  // First try exact match
  const exactMatch = cache.get(parentKey);
  if (exactMatch && exactMatch.length > 0) {
    return exactMatch;
  }

  // Fallback to wildcard if not already wildcard
  if (parentKey !== '*') {
    return cache.get('*') || [];
  }

  return [];
}

// Helper function to convert row to entry
function rowToEntry(row: KeyDictionaryRow): KeyDictionaryEntry {
  return {
    id: row.id,
    parentKey: row.parent_key,
    childKey: row.child_key,
    description: row.description ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}
