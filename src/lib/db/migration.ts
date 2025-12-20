// Migrate existing JSON metadata to SQLite database
import fs from 'fs';
import path from 'path';
import { getDatabase } from './index';
import { isMigrationCompleted, markMigrationCompleted } from './schema';
import { createImage, imageExists, getAllImageIds, markMissingAsDeleted } from './images';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

interface LegacyMetadata {
  prompt?: string;
  createdAt?: string;
}

/**
 * Migrate existing JSON metadata files to SQLite database
 */
export async function migrateJsonToSqlite(): Promise<{ migrated: number; skipped: number }> {
  const db = getDatabase();
  const migrationId = 'json-to-sqlite-v1';

  // Check if migration already completed
  if (isMigrationCompleted(db, migrationId)) {
    console.log('[Migration] JSON to SQLite migration already completed');
    return { migrated: 0, skipped: 0 };
  }

  console.log('[Migration] Starting JSON to SQLite migration...');

  // Ensure images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    markMigrationCompleted(db, migrationId);
    return { migrated: 0, skipped: 0 };
  }

  const files = fs.readdirSync(IMAGES_DIR);
  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    // Only process image files
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      continue;
    }

    const id = file.replace(/\.(png|jpg|jpeg|webp)$/i, '');

    // Skip if already exists in DB
    if (imageExists(id)) {
      skipped++;
      continue;
    }

    const imagePath = path.join(IMAGES_DIR, file);
    const metaPath = imagePath.replace(/\.(png|jpg|jpeg|webp)$/i, '.json');

    // Read metadata if exists
    let metadata: LegacyMetadata = {};
    try {
      const metaContent = fs.readFileSync(metaPath, 'utf-8');
      metadata = JSON.parse(metaContent);
    } catch {
      // No metadata file, use defaults
    }

    // Get file stats for fallback dates
    let stats: fs.Stats | null = null;
    try {
      stats = fs.statSync(imagePath);
    } catch {
      // File doesn't exist anymore, skip
      continue;
    }

    // Create image record
    try {
      createImage({
        id,
        filename: file,
        promptYaml: metadata.prompt || '',
        fileSize: stats.size,
      });
      migrated++;
    } catch (error) {
      console.error(`[Migration] Failed to migrate ${file}:`, error);
    }
  }

  markMigrationCompleted(db, migrationId);
  console.log(`[Migration] Completed: ${migrated} migrated, ${skipped} skipped`);

  return { migrated, skipped };
}

/**
 * Check file system integrity and mark missing files as deleted
 */
export function checkIntegrity(): { missingFiles: number; orphanFiles: number } {
  // Initialize database (ensures schema is ready)
  getDatabase();

  // Ensure images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return { missingFiles: 0, orphanFiles: 0 };
  }

  // Get all image IDs from database
  const dbIds = new Set(getAllImageIds());

  // Get all image files
  const files = fs.readdirSync(IMAGES_DIR);
  const fileIds = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      fileIds.add(file.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
    }
  }

  // Find missing files (in DB but not on disk)
  const missingIds: string[] = [];
  for (const id of dbIds) {
    if (!fileIds.has(id)) {
      missingIds.push(id);
    }
  }

  // Mark missing files as deleted
  const missingFiles = markMissingAsDeleted(missingIds);

  // Find orphan files (on disk but not in DB) - just count, don't auto-import
  let orphanFiles = 0;
  for (const id of fileIds) {
    if (!dbIds.has(id)) {
      orphanFiles++;
    }
  }

  if (missingFiles > 0 || orphanFiles > 0) {
    console.log(`[Integrity] ${missingFiles} missing files marked as deleted, ${orphanFiles} orphan files found`);
  }

  return { missingFiles, orphanFiles };
}

/**
 * Run all startup migrations and checks
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    // Migrate JSON to SQLite
    await migrateJsonToSqlite();

    // Check integrity
    checkIntegrity();
  } catch (error) {
    console.error('[Migration] Startup migrations failed:', error);
  }
}
