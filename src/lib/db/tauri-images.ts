// Tauri-only Image metadata CRUD operations
// This file should only be dynamically imported in Tauri environment

import { getDatabase, UnifiedDatabase } from './tauri-db';
import { extractAttributes, saveAttributesAsync } from './attributes';
import yaml from 'js-yaml';

export interface ImageRecord {
  id: string;
  filename: string;
  prompt: string;
  workflow_id: string | null;
  seed: number | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  negative_prompt: string | null;
  parameters: string | null;
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

// Pagination types
export interface PaginationParams {
  limit?: number;      // Default: 50
  offset?: number;     // Default: 0
  sortOrder?: 'asc' | 'desc';  // Default: 'desc' (newest first)
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface CreateImageInput {
  id: string;
  filename: string;
  prompt: string;
  workflowId?: string;
  seed?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  negativePrompt?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Create a new image record with attributes
 */
export async function createImage(input: CreateImageInput): Promise<ImageRecord> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(`
    INSERT INTO images (
      id, filename, prompt, workflow_id, seed, width, height, file_size, negative_prompt, parameters, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    input.id,
    input.filename,
    input.prompt,
    input.workflowId || null,
    input.seed || null,
    input.width || null,
    input.height || null,
    input.fileSize || null,
    input.negativePrompt || null,
    input.parameters ? JSON.stringify(input.parameters) : null,
    now
  ]);

  // Extract and save attributes from YAML (if prompt is YAML format)
  try {
    const parsed = yaml.load(input.prompt);
    if (parsed && typeof parsed === 'object') {
      const attrs = extractAttributes(parsed as Record<string, unknown>);
      await saveAttributesAsync(db, input.id, attrs);
    }
  } catch (e) {
    console.warn('Failed to parse YAML for attributes:', e);
  }

  const record = await getImage(input.id);
  if (!record) throw new Error('Failed to create image record');
  return record;
}

/**
 * Get a single image by ID
 */
export async function getImage(id: string): Promise<ImageRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<ImageRecord>('SELECT * FROM images WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * Get images with pagination (optionally including deleted)
 */
export async function listImages(
  includeDeleted = false,
  pagination?: PaginationParams
): Promise<PaginatedResult<ImageInfo>> {
  const db = await getDatabase();

  const limit = pagination?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = pagination?.offset ?? 0;
  const sortOrder = pagination?.sortOrder ?? 'desc';
  const orderClause = `ORDER BY created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  const deletedClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';

  // Get total count
  const countQuery = includeDeleted
    ? 'SELECT COUNT(*) as count FROM images'
    : 'SELECT COUNT(*) as count FROM images WHERE deleted_at IS NULL';
  const countRows = await db.select<{ count: number }>(countQuery);
  const total = countRows[0]?.count ?? 0;

  // Get paginated items
  const query = `
    SELECT id, filename, prompt, created_at, deleted_at, favorite
    FROM images
    ${deletedClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const rows = await db.select<{
    id: string;
    filename: string;
    prompt: string;
    created_at: string;
    deleted_at: string | null;
    favorite: number;
  }>(query, [limit, offset]);

  const items = rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    prompt: row.prompt,
    deleted: !!row.deleted_at,
    favorite: row.favorite === 1,
  }));

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

/**
 * Soft delete an image (set deleted_at timestamp)
 */
export async function deleteImage(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    'UPDATE images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
    [new Date().toISOString(), id]
  );
  return result.rowsAffected > 0;
}

/**
 * Hard delete an image (permanently remove from DB)
 */
export async function hardDeleteImage(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute('DELETE FROM images WHERE id = ?', [id]);
  return result.rowsAffected > 0;
}

/**
 * Restore a soft-deleted image
 */
export async function restoreImage(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    'UPDATE images SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id]
  );
  return result.rowsAffected > 0;
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    'UPDATE images SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?',
    [id]
  );
  return result.rowsAffected > 0;
}

/**
 * Full-text search with automatic prefix matching and pagination
 */
export async function searchImages(
  query: string,
  includeDeleted = false,
  pagination?: PaginationParams
): Promise<PaginatedResult<ImageInfo>> {
  const db = await getDatabase();

  const limit = pagination?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = pagination?.offset ?? 0;
  const sortOrder = pagination?.sortOrder ?? 'desc';

  // Build FTS query: add * to each word for prefix matching
  const ftsQuery = query
    .replace(/['"]/g, '')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.endsWith('*') ? word : `${word}*`)
    .join(' ');

  const deletedClause = includeDeleted ? '' : 'AND i.deleted_at IS NULL';

  // Get total count for search results
  const countRows = await db.select<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM images i
    JOIN images_fts f ON i.id = f.id
    WHERE images_fts MATCH ?
    ${deletedClause}
  `, [ftsQuery]);
  const total = countRows[0]?.count ?? 0;

  // Get paginated search results
  const rows = await db.select<{
    id: string;
    filename: string;
    prompt: string;
    created_at: string;
    deleted_at: string | null;
    favorite: number;
  }>(`
    SELECT i.id, i.filename, i.prompt, i.created_at, i.deleted_at, i.favorite
    FROM images i
    JOIN images_fts f ON i.id = f.id
    WHERE images_fts MATCH ?
    ${deletedClause}
    ORDER BY i.created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
    LIMIT ? OFFSET ?
  `, [ftsQuery, limit, offset]);

  const items = rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    prompt: row.prompt,
    deleted: !!row.deleted_at,
    favorite: row.favorite === 1,
  }));

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

/**
 * Check if an image exists in the database
 */
export async function imageExists(id: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string }>('SELECT id FROM images WHERE id = ?', [id]);
  return rows.length > 0;
}

/**
 * Get all image IDs (for integrity check)
 */
export async function getAllImageIds(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string }>('SELECT id FROM images');
  return rows.map((r) => r.id);
}

/**
 * Mark images as deleted if their files are missing
 */
export async function markMissingAsDeleted(missingIds: string[]): Promise<number> {
  if (missingIds.length === 0) return 0;

  const db = await getDatabase();
  const now = new Date().toISOString();

  let count = 0;
  for (const id of missingIds) {
    const result = await db.execute(
      'UPDATE images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, id]
    );
    count += result.rowsAffected;
  }

  return count;
}

/**
 * Bulk soft delete images
 */
export async function bulkDeleteImages(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const db = await getDatabase();
  const now = new Date().toISOString();

  let count = 0;
  for (const id of ids) {
    const result = await db.execute(
      'UPDATE images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, id]
    );
    count += result.rowsAffected;
  }

  return count;
}

/**
 * Helper to get database instance for external use
 */
export async function getDatabaseInstance(): Promise<UnifiedDatabase> {
  return getDatabase();
}
