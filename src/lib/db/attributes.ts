// YAML attribute extraction and storage

import type Database from 'better-sqlite3';

export interface Attribute {
  key: string;
  value: string;
}

/**
 * Extract key-value pairs from a YAML object recursively
 * Transforms nested objects into dot-notation keys
 *
 * Example:
 *   { appearance: { hair: { color: 'blonde' } } }
 *   => [{ key: 'appearance.hair.color', value: 'blonde' }]
 */
export function extractAttributes(
  obj: Record<string, unknown>,
  prefix = ''
): Attribute[] {
  const attrs: Attribute[] = [];

  for (const [k, v] of Object.entries(obj)) {
    // Skip special YAML keys
    if (k.startsWith('_')) continue;

    const key = prefix ? `${prefix}.${k}` : k;

    if (v === null || v === undefined) continue;

    if (typeof v === 'object' && !Array.isArray(v)) {
      // Recursively process nested objects
      attrs.push(...extractAttributes(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      // Join array values into a single string
      const stringValues = v
        .filter((item): item is string | number =>
          typeof item === 'string' || typeof item === 'number'
        )
        .map(String);
      if (stringValues.length > 0) {
        attrs.push({ key, value: stringValues.join(', ') });
      }
    } else {
      // Store primitive values
      attrs.push({ key, value: String(v) });
    }
  }

  return attrs;
}

/**
 * Save attributes for an image
 * Replaces any existing attributes
 */
export function saveAttributes(
  db: Database.Database,
  imageId: string,
  attributes: Attribute[]
): void {
  // Delete existing attributes
  db.prepare('DELETE FROM image_attributes WHERE image_id = ?').run(imageId);

  // Insert new attributes
  const insert = db.prepare(
    'INSERT INTO image_attributes (image_id, key, value) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction((attrs: Attribute[]) => {
    for (const attr of attrs) {
      insert.run(imageId, attr.key, attr.value);
    }
  });

  insertMany(attributes);
}

/**
 * Get all attributes for an image
 */
export function getAttributes(
  db: Database.Database,
  imageId: string
): Attribute[] {
  return db
    .prepare('SELECT key, value FROM image_attributes WHERE image_id = ?')
    .all(imageId) as Attribute[];
}

/**
 * Search images by attribute key-value pair
 * Supports partial matching with LIKE
 */
export function searchByAttribute(
  db: Database.Database,
  keyPattern: string,
  valuePattern: string
): string[] {
  const rows = db
    .prepare(`
      SELECT DISTINCT image_id FROM image_attributes
      WHERE key LIKE ? AND value LIKE ?
    `)
    .all(`%${keyPattern}%`, `%${valuePattern}%`) as Array<{ image_id: string }>;

  return rows.map((r) => r.image_id);
}
