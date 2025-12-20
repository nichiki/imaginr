// Image metadata CRUD operations

import { getDatabase } from './index';
import { extractAttributes, saveAttributes } from './attributes';
import yaml from 'js-yaml';

export interface ImageRecord {
  id: string;
  filename: string;
  prompt_yaml: string;
  workflow_id: string | null;
  seed: number | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  created_at: string;
  deleted_at: string | null;
  favorite: number;
  rating: number | null;
  notes: string | null;
}

export interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
  deleted?: boolean;
  favorite?: boolean;
}

export interface CreateImageInput {
  id: string;
  filename: string;
  promptYaml: string;
  workflowId?: string;
  seed?: number;
  width?: number;
  height?: number;
  fileSize?: number;
}

/**
 * Create a new image record with attributes
 */
export function createImage(input: CreateImageInput): ImageRecord {
  const db = getDatabase();

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO images (
      id, filename, prompt_yaml, workflow_id, seed, width, height, file_size, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.filename,
    input.promptYaml,
    input.workflowId || null,
    input.seed || null,
    input.width || null,
    input.height || null,
    input.fileSize || null,
    now
  );

  // Extract and save attributes from YAML
  try {
    const parsed = yaml.load(input.promptYaml);
    if (parsed && typeof parsed === 'object') {
      const attrs = extractAttributes(parsed as Record<string, unknown>);
      saveAttributes(db, input.id, attrs);
    }
  } catch (e) {
    console.warn('Failed to parse YAML for attributes:', e);
  }

  return getImage(input.id)!;
}

/**
 * Get a single image by ID
 */
export function getImage(id: string): ImageRecord | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRecord | undefined;
  return row || null;
}

/**
 * Get all images (optionally including deleted)
 */
export function listImages(includeDeleted = false): ImageInfo[] {
  const db = getDatabase();

  const query = includeDeleted
    ? 'SELECT id, filename, prompt_yaml, created_at, deleted_at, favorite FROM images ORDER BY created_at DESC'
    : 'SELECT id, filename, prompt_yaml, created_at, deleted_at, favorite FROM images WHERE deleted_at IS NULL ORDER BY created_at DESC';

  const rows = db.prepare(query).all() as Array<{
    id: string;
    filename: string;
    prompt_yaml: string;
    created_at: string;
    deleted_at: string | null;
    favorite: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    prompt: row.prompt_yaml,
    deleted: !!row.deleted_at,
    favorite: row.favorite === 1,
  }));
}

/**
 * Soft delete an image (set deleted_at timestamp)
 */
export function deleteImage(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'UPDATE images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL'
  ).run(new Date().toISOString(), id);
  return result.changes > 0;
}

/**
 * Hard delete an image (permanently remove from DB)
 */
export function hardDeleteImage(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM images WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Restore a soft-deleted image
 */
export function restoreImage(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'UPDATE images SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL'
  ).run(id);
  return result.changes > 0;
}

/**
 * Toggle favorite status
 */
export function toggleFavorite(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'UPDATE images SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?'
  ).run(id);
  return result.changes > 0;
}

/**
 * Full-text search
 */
export function searchImages(query: string, includeDeleted = false): ImageInfo[] {
  const db = getDatabase();

  // Escape special FTS characters
  const escapedQuery = query.replace(/['"]/g, '');

  const rows = db.prepare(`
    SELECT i.id, i.filename, i.prompt_yaml, i.created_at, i.deleted_at, i.favorite
    FROM images i
    JOIN images_fts f ON i.id = f.id
    WHERE images_fts MATCH ?
    ${includeDeleted ? '' : 'AND i.deleted_at IS NULL'}
    ORDER BY i.created_at DESC
  `).all(escapedQuery) as Array<{
    id: string;
    filename: string;
    prompt_yaml: string;
    created_at: string;
    deleted_at: string | null;
    favorite: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    prompt: row.prompt_yaml,
    deleted: !!row.deleted_at,
    favorite: row.favorite === 1,
  }));
}

/**
 * Check if an image exists in the database
 */
export function imageExists(id: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT 1 FROM images WHERE id = ?').get(id);
  return !!row;
}

/**
 * Get all image IDs (for integrity check)
 */
export function getAllImageIds(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT id FROM images').all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/**
 * Mark images as deleted if their files are missing
 */
export function markMissingAsDeleted(missingIds: string[]): number {
  if (missingIds.length === 0) return 0;

  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(
    'UPDATE images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL'
  );

  let count = 0;
  const updateMany = db.transaction((ids: string[]) => {
    for (const id of ids) {
      const result = stmt.run(now, id);
      count += result.changes;
    }
  });

  updateMany(missingIds);
  return count;
}
