// Dictionary Database API
// CRUD operations for dictionary entries stored in SQLite

import yaml from 'js-yaml';

export interface DictionaryEntry {
  id: number;
  context: string;
  key: string;
  value: string;
  description?: string;
  createdAt: string;
}

interface DictionaryRow {
  id: number;
  context: string;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
}

// Tree structure for UI display
export interface DictionaryTreeNode {
  context: string;
  keys: string[];
}

// Get all dictionary entries
export async function getAllEntries(): Promise<DictionaryEntry[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<DictionaryRow>(
    'SELECT * FROM dictionary ORDER BY context, key, value'
  );

  return rows.map(rowToEntry);
}

// Get entries by context and key
export async function getEntriesByContextKey(
  context: string,
  key: string
): Promise<DictionaryEntry[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<DictionaryRow>(
    'SELECT * FROM dictionary WHERE context = ? AND key = ? ORDER BY value',
    [context, key]
  );

  return rows.map(rowToEntry);
}

// Add a new entry
export async function addEntry(
  context: string,
  key: string,
  value: string,
  description?: string
): Promise<DictionaryEntry> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO dictionary (context, key, value, description, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [context, key, value, description || null, now]
  );

  // Fetch the inserted entry
  const rows = await db.select<DictionaryRow>(
    'SELECT * FROM dictionary WHERE context = ? AND key = ? AND value = ?',
    [context, key, value]
  );

  if (rows.length === 0) {
    throw new Error('Failed to add dictionary entry');
  }

  return rowToEntry(rows[0]);
}

// Update an entry
export async function updateEntry(
  id: number,
  value: string,
  description?: string
): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'UPDATE dictionary SET value = ?, description = ? WHERE id = ?',
    [value, description || null, id]
  );
}

// Delete an entry
export async function deleteEntry(id: number): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute('DELETE FROM dictionary WHERE id = ?', [id]);
}

// Delete all entries for a context/key combination
export async function deleteEntriesForContextKey(
  context: string,
  key: string
): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'DELETE FROM dictionary WHERE context = ? AND key = ?',
    [context, key]
  );
}

// Get context tree for UI display
export async function getContextTree(): Promise<DictionaryTreeNode[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<{ context: string; key: string }>(
    'SELECT DISTINCT context, key FROM dictionary ORDER BY context, key'
  );

  const contextMap = new Map<string, string[]>();

  for (const row of rows) {
    if (!contextMap.has(row.context)) {
      contextMap.set(row.context, []);
    }
    contextMap.get(row.context)!.push(row.key);
  }

  return Array.from(contextMap.entries()).map(([context, keys]) => ({
    context,
    keys,
  }));
}

// Get entry count
export async function getEntryCount(): Promise<number> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM dictionary'
  );

  return rows[0]?.count ?? 0;
}

// Search entries
export async function searchEntries(query: string): Promise<DictionaryEntry[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const likeQuery = `%${query}%`;
  const rows = await db.select<DictionaryRow>(
    `SELECT * FROM dictionary
     WHERE context LIKE ? OR key LIKE ? OR value LIKE ? OR description LIKE ?
     ORDER BY context, key, value
     LIMIT 100`,
    [likeQuery, likeQuery, likeQuery, likeQuery]
  );

  return rows.map(rowToEntry);
}

// ================================
// Import / Export
// ================================

interface DictionaryYamlFile {
  entries: Array<{
    key: string;
    context: string;
    values: Array<{
      value: string;
      description?: string;
    }>;
  }>;
}

// Import from YAML content
export async function importFromYaml(
  yamlContent: string,
  mode: 'merge' | 'replace'
): Promise<{ added: number; updated: number; skipped: number }> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const data = yaml.load(yamlContent) as DictionaryYamlFile | null;

  if (!data?.entries || !Array.isArray(data.entries)) {
    throw new Error('Invalid YAML format: missing entries array');
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  if (mode === 'replace') {
    await db.execute('DELETE FROM dictionary');
  }

  const now = new Date().toISOString();

  for (const entry of data.entries) {
    if (!entry.key || !entry.context || !Array.isArray(entry.values)) {
      skipped++;
      continue;
    }

    for (const val of entry.values) {
      if (!val.value) {
        skipped++;
        continue;
      }

      try {
        if (mode === 'merge') {
          // Check if entry exists
          const existing = await db.select<{ id: number }>(
            'SELECT id FROM dictionary WHERE context = ? AND key = ? AND value = ?',
            [entry.context, entry.key, val.value]
          );

          if (existing.length > 0) {
            // Update description if provided
            if (val.description) {
              await db.execute(
                'UPDATE dictionary SET description = ? WHERE id = ?',
                [val.description, existing[0].id]
              );
              updated++;
            } else {
              skipped++;
            }
          } else {
            await db.execute(
              `INSERT INTO dictionary (context, key, value, description, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [entry.context, entry.key, val.value, val.description || null, now]
            );
            added++;
          }
        } else {
          // Replace mode: just insert
          await db.execute(
            `INSERT INTO dictionary (context, key, value, description, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [entry.context, entry.key, val.value, val.description || null, now]
          );
          added++;
        }
      } catch {
        // Likely a duplicate in replace mode, skip
        skipped++;
      }
    }
  }

  return { added, updated, skipped };
}

// Export to YAML format
export async function exportToYaml(): Promise<string> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<DictionaryRow>(
    'SELECT * FROM dictionary ORDER BY context, key, value'
  );

  // Group by context and key
  const entriesMap = new Map<string, Map<string, Array<{ value: string; description?: string }>>>();

  for (const row of rows) {
    if (!entriesMap.has(row.context)) {
      entriesMap.set(row.context, new Map());
    }
    const contextMap = entriesMap.get(row.context)!;
    if (!contextMap.has(row.key)) {
      contextMap.set(row.key, []);
    }
    contextMap.get(row.key)!.push({
      value: row.value,
      ...(row.description ? { description: row.description } : {}),
    });
  }

  // Convert to YAML structure
  const entries: DictionaryYamlFile['entries'] = [];

  for (const [context, keyMap] of entriesMap) {
    for (const [key, values] of keyMap) {
      entries.push({ context, key, values });
    }
  }

  return yaml.dump({ entries }, { lineWidth: -1, noRefs: true });
}

// ================================
// Initial data import
// ================================

// Import from bundled dictionary files (first launch only)
// Reads directly from app bundle resources, NOT from user data folder
export async function initializeFromBundledFiles(): Promise<boolean> {
  const { getDatabase } = await import('./db/tauri-db');
  const { isMigrationCompletedAsync, markMigrationCompletedAsync } = await import('./db/schema');
  const db = await getDatabase();

  // Check if already imported
  if (await isMigrationCompletedAsync(db, 'initial_dictionary_import')) {
    return false;
  }

  // Check if dictionary table is empty
  const count = await getEntryCount();
  if (count > 0) {
    // Mark as completed if there's already data
    await markMigrationCompletedAsync(db, 'initial_dictionary_import');
    return false;
  }

  // Load dictionary files from bundled resources (NOT user data folder)
  const { resolveResource, join } = await import('@tauri-apps/api/path');
  const { readTextFile, readDir, exists } = await import('@tauri-apps/plugin-fs');

  // Try to find bundled dictionary directory
  let standardDir: string;
  try {
    // Production: bundled resources
    const resourcePath = await resolveResource('data/dictionary/standard');
    if (await exists(resourcePath)) {
      standardDir = resourcePath;
    } else {
      // Dev mode: go up from debug folder to project root
      const debugPath = await resolveResource('.');
      standardDir = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'standard');
    }
  } catch {
    // Fallback for dev mode
    const debugPath = await resolveResource('.');
    standardDir = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'standard');
  }

  if (!(await exists(standardDir))) {
    console.warn('Bundled dictionary not found:', standardDir);
    await markMigrationCompletedAsync(db, 'initial_dictionary_import');
    return false;
  }

  const files = await readDir(standardDir);
  const yamlFiles = files.filter(
    (f) => !f.isDirectory && (f.name?.endsWith('.yaml') || f.name?.endsWith('.yml'))
  );

  let totalImported = 0;

  for (const file of yamlFiles) {
    if (!file.name) continue;
    try {
      const filePath = await join(standardDir, file.name);
      const content = await readTextFile(filePath);
      const result = await importFromYaml(content, 'merge');
      totalImported += result.added;
    } catch (err) {
      console.error(`Error importing dictionary file ${file.name}:`, err);
    }
  }

  await markMigrationCompletedAsync(db, 'initial_dictionary_import');
  console.log(`Imported ${totalImported} dictionary entries from bundled resources`);

  return true;
}

// Helper function to convert row to entry
function rowToEntry(row: DictionaryRow): DictionaryEntry {
  return {
    id: row.id,
    context: row.context,
    key: row.key,
    value: row.value,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}
