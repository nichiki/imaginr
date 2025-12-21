// Migrate existing JSON metadata to SQLite database
// Tauri-only version

import { getDatabase } from './index';
import { isMigrationCompletedAsync, markMigrationCompletedAsync } from './schema';
import { createImage, imageExists, getAllImageIds, markMissingAsDeleted } from './images';
import { getImagesPath, joinPath } from '../tauri-utils';

// Image extensions to process
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

interface LegacyMetadata {
  prompt?: string;
  createdAt?: string;
}

/**
 * Migrate existing JSON metadata files to SQLite database
 */
export async function migrateJsonToSqlite(): Promise<{ migrated: number; skipped: number }> {
  const db = await getDatabase();
  const migrationId = 'json-to-sqlite-v1';

  // Check if migration already completed
  if (await isMigrationCompletedAsync(db, migrationId)) {
    console.log('[Migration] JSON to SQLite migration already completed');
    return { migrated: 0, skipped: 0 };
  }

  console.log('[Migration] Starting JSON to SQLite migration...');

  const { readDir, readTextFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');

  const imagesDir = await getImagesPath();

  // Ensure images directory exists
  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
    await markMigrationCompletedAsync(db, migrationId);
    return { migrated: 0, skipped: 0 };
  }

  const files = await readDir(imagesDir);
  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    if (file.isDirectory) continue;

    const fileName = file.name;
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (!IMAGE_EXTENSIONS.includes(ext)) {
      continue;
    }

    const id = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');

    // Skip if already exists in DB
    if (await imageExists(id)) {
      skipped++;
      continue;
    }

    const metaPath = await joinPath(imagesDir, fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '.json'));

    // Read metadata if exists
    let metadata: LegacyMetadata = {};
    try {
      if (await exists(metaPath)) {
        const metaContent = await readTextFile(metaPath);
        metadata = JSON.parse(metaContent);
      }
    } catch {
      // No metadata file or parse error, use defaults
    }

    // Create image record
    try {
      await createImage({
        id,
        filename: fileName,
        promptYaml: metadata.prompt || '',
      });
      migrated++;
    } catch (error) {
      console.error(`[Migration] Failed to migrate ${fileName}:`, error);
    }
  }

  await markMigrationCompletedAsync(db, migrationId);
  console.log(`[Migration] Completed: ${migrated} migrated, ${skipped} skipped`);

  return { migrated, skipped };
}

/**
 * Check file system integrity and mark missing files as deleted
 */
export async function checkIntegrity(): Promise<{ missingFiles: number; orphanFiles: number }> {
  // Initialize database (ensures schema is ready)
  await getDatabase();

  const { readDir, exists, mkdir } = await import('@tauri-apps/plugin-fs');

  const imagesDir = await getImagesPath();

  // Ensure images directory exists
  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
    return { missingFiles: 0, orphanFiles: 0 };
  }

  // Get all image IDs from database
  const dbIds = new Set(await getAllImageIds());

  // Get all image files
  const files = await readDir(imagesDir);
  const fileIds = new Set<string>();
  for (const file of files) {
    if (file.isDirectory) continue;
    const fileName = file.name;
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      fileIds.add(fileName.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
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
  const missingFiles = await markMissingAsDeleted(missingIds);

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
    await checkIntegrity();
  } catch (error) {
    console.error('[Migration] Startup migrations failed:', error);
  }
}
