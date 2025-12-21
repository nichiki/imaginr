// YAML attribute extraction and storage
// Supports both sync (better-sqlite3) and async (UnifiedDatabase)
// NOTE: This file should only be imported server-side or via dynamic import

import type { UnifiedDatabase } from './index';

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

// =============================================================================
// Async API for UnifiedDatabase (works with both better-sqlite3 wrapper and tauri-plugin-sql)
// =============================================================================

/**
 * Save attributes for an image (async version)
 * Replaces any existing attributes
 */
export async function saveAttributesAsync(
  db: UnifiedDatabase,
  imageId: string,
  attributes: Attribute[]
): Promise<void> {
  // Delete existing attributes
  await db.execute('DELETE FROM image_attributes WHERE image_id = ?', [imageId]);

  // Insert new attributes
  for (const attr of attributes) {
    await db.execute(
      'INSERT INTO image_attributes (image_id, key, value) VALUES (?, ?, ?)',
      [imageId, attr.key, attr.value]
    );
  }
}

/**
 * Get all attributes for an image (async version)
 */
export async function getAttributesAsync(
  db: UnifiedDatabase,
  imageId: string
): Promise<Attribute[]> {
  return db.select<Attribute>(
    'SELECT key, value FROM image_attributes WHERE image_id = ?',
    [imageId]
  );
}

/**
 * Search images by attribute key-value pair (async version)
 * Supports partial matching with LIKE
 */
export async function searchByAttributeAsync(
  db: UnifiedDatabase,
  keyPattern: string,
  valuePattern: string
): Promise<string[]> {
  const rows = await db.select<{ image_id: string }>(
    `SELECT DISTINCT image_id FROM image_attributes
     WHERE key LIKE ? AND value LIKE ?`,
    [`%${keyPattern}%`, `%${valuePattern}%`]
  );
  return rows.map((r) => r.image_id);
}

