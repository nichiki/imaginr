// Dictionary Database API
// CRUD operations for dictionary entries stored in SQLite

import yaml from 'js-yaml';

export interface DictionaryEntry {
  id: number;
  context: string;
  key: string;
  value: string;
  descriptionJa?: string;
  descriptionEn?: string;
  createdAt: string;
}

interface DictionaryRow {
  id: number;
  context: string;
  key: string;
  value: string;
  description_ja: string | null;
  description_en: string | null;
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
  descriptionJa?: string,
  descriptionEn?: string
): Promise<DictionaryEntry> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO dictionary (context, key, value, description_ja, description_en, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [context, key, value, descriptionJa || null, descriptionEn || null, now]
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
  descriptionJa?: string,
  descriptionEn?: string
): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'UPDATE dictionary SET value = ?, description_ja = ?, description_en = ? WHERE id = ?',
    [value, descriptionJa || null, descriptionEn || null, id]
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
     WHERE context LIKE ? OR key LIKE ? OR value LIKE ? OR description_ja LIKE ? OR description_en LIKE ?
     ORDER BY context, key, value
     LIMIT 100`,
    [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery]
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
      description_ja?: string;
      description_en?: string;
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
            // Update descriptions if provided
            if (val.description_ja || val.description_en) {
              await db.execute(
                'UPDATE dictionary SET description_ja = ?, description_en = ? WHERE id = ?',
                [val.description_ja || null, val.description_en || null, existing[0].id]
              );
              updated++;
            } else {
              skipped++;
            }
          } else {
            await db.execute(
              `INSERT INTO dictionary (context, key, value, description_ja, description_en, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [entry.context, entry.key, val.value, val.description_ja || null, val.description_en || null, now]
            );
            added++;
          }
        } else {
          // Replace mode: just insert
          await db.execute(
            `INSERT INTO dictionary (context, key, value, description_ja, description_en, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [entry.context, entry.key, val.value, val.description_ja || null, val.description_en || null, now]
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
  const entriesMap = new Map<string, Map<string, Array<{ value: string; description_ja?: string; description_en?: string }>>>();

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
      ...(row.description_ja ? { description_ja: row.description_ja } : {}),
      ...(row.description_en ? { description_en: row.description_en } : {}),
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
// CSV Import / Export
// ================================

// BOM for UTF-8 (helps Excel recognize encoding)
const UTF8_BOM = '\uFEFF';

// CSV header
const CSV_HEADER = 'context,key,value,description_ja,description_en';

// Escape a field for CSV (RFC 4180)
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    // Escape double quotes by doubling them
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

// Parse a CSV line respecting quoted fields
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Don't forget the last field
  fields.push(current);

  return fields;
}

// Import from CSV content
export async function importFromCsv(
  csvContent: string,
  mode: 'merge' | 'replace'
): Promise<{ added: number; updated: number; skipped: number }> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  // Remove BOM if present
  let content = csvContent;
  if (content.startsWith(UTF8_BOM)) {
    content = content.slice(1);
  }

  // Split into lines (handle both \r\n and \n)
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error('Empty CSV file');
  }

  // Check header
  const header = lines[0].toLowerCase();
  if (!header.startsWith('context,key,value')) {
    throw new Error('Invalid CSV format: missing required columns (context, key, value)');
  }

  // Detect if using old format (4 columns: description) or new format (5 columns: description_ja, description_en)
  const headerFields = parseCsvLine(lines[0].toLowerCase());
  const hasDescriptionJa = headerFields.includes('description_ja');
  const hasOldDescription = headerFields.includes('description') && !hasDescriptionJa;

  let added = 0;
  let updated = 0;
  let skipped = 0;

  if (mode === 'replace') {
    await db.execute('DELETE FROM dictionary');
  }

  const now = new Date().toISOString();

  // Process data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    if (fields.length < 3) {
      skipped++;
      continue;
    }

    const [context, key, value] = fields;
    // Support both old format (4th column = description → description_ja) and new format
    let descriptionJa: string | undefined;
    let descriptionEn: string | undefined;

    if (hasOldDescription) {
      // Old format: 4th column is description (treat as description_ja)
      descriptionJa = fields[3] || undefined;
    } else {
      // New format: 4th = description_ja, 5th = description_en
      descriptionJa = fields[3] || undefined;
      descriptionEn = fields[4] || undefined;
    }

    if (!context || !key || !value) {
      skipped++;
      continue;
    }

    try {
      if (mode === 'merge') {
        // Check if entry exists
        const existing = await db.select<{ id: number }>(
          'SELECT id FROM dictionary WHERE context = ? AND key = ? AND value = ?',
          [context, key, value]
        );

        if (existing.length > 0) {
          // Update descriptions if provided
          if (descriptionJa || descriptionEn) {
            await db.execute('UPDATE dictionary SET description_ja = ?, description_en = ? WHERE id = ?', [
              descriptionJa || null,
              descriptionEn || null,
              existing[0].id,
            ]);
            updated++;
          } else {
            skipped++;
          }
        } else {
          await db.execute(
            `INSERT INTO dictionary (context, key, value, description_ja, description_en, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [context, key, value, descriptionJa || null, descriptionEn || null, now]
          );
          added++;
        }
      } else {
        // Replace mode: just insert
        await db.execute(
          `INSERT INTO dictionary (context, key, value, description_ja, description_en, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [context, key, value, descriptionJa || null, descriptionEn || null, now]
        );
        added++;
      }
    } catch {
      // Likely a duplicate in replace mode, skip
      skipped++;
    }
  }

  return { added, updated, skipped };
}

// Export to CSV format (BOM-prefixed UTF-8)
export async function exportToCsv(): Promise<string> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<DictionaryRow>(
    'SELECT * FROM dictionary ORDER BY context, key, value'
  );

  const lines: string[] = [CSV_HEADER];

  for (const row of rows) {
    const fields = [
      escapeCsvField(row.context),
      escapeCsvField(row.key),
      escapeCsvField(row.value),
      escapeCsvField(row.description_ja || ''),
      escapeCsvField(row.description_en || ''),
    ];
    lines.push(fields.join(','));
  }

  // Add BOM for Excel compatibility
  return UTF8_BOM + lines.join('\n');
}

// ================================
// Initial data import
// ================================

// Import from bundled dictionary CSV (first launch only)
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

  // Load dictionary CSV from bundled resources (NOT user data folder)
  const { resolveResource, join } = await import('@tauri-apps/api/path');
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

  // Try to find bundled dictionary CSV
  let csvPath: string;
  try {
    // Production: bundled resources
    const resourcePath = await resolveResource('data/dictionary/standard.csv');
    if (await exists(resourcePath)) {
      csvPath = resourcePath;
    } else {
      // Dev mode: go up from debug folder to project root
      const debugPath = await resolveResource('.');
      csvPath = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'standard.csv');
    }
  } catch {
    // Fallback for dev mode
    const debugPath = await resolveResource('.');
    csvPath = await join(debugPath, '..', '..', '..', 'data', 'dictionary', 'standard.csv');
  }

  if (!(await exists(csvPath))) {
    console.warn('Bundled dictionary CSV not found:', csvPath);
    await markMigrationCompletedAsync(db, 'initial_dictionary_import');
    return false;
  }

  let totalImported = 0;

  try {
    const content = await readTextFile(csvPath);
    const result = await importFromCsv(content, 'merge');
    totalImported = result.added;
  } catch (err) {
    console.error('Error importing bundled dictionary CSV:', err);
  }

  await markMigrationCompletedAsync(db, 'initial_dictionary_import');
  console.log(`Imported ${totalImported} dictionary entries from bundled CSV`);

  return true;
}

// Helper function to convert row to entry
function rowToEntry(row: DictionaryRow): DictionaryEntry {
  return {
    id: row.id,
    context: row.context,
    key: row.key,
    value: row.value,
    descriptionJa: row.description_ja ?? undefined,
    descriptionEn: row.description_en ?? undefined,
    createdAt: row.created_at,
  };
}
