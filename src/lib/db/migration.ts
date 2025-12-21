// Migrate existing JSON metadata to SQLite database
// Supports both sync (Node.js fs) and async (Tauri fs) operations

import { getDatabase } from './index';
import { isMigrationCompletedAsync, markMigrationCompletedAsync } from './schema';
import { createImage, imageExists, getAllImageIds, markMissingAsDeleted } from './images';
import { isTauri, getImagesPath, joinPath } from '../tauri-utils';

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

  if (isTauri()) {
    // Tauri environment - use Tauri fs APIs
    return migrateJsonToSqliteTauri(db, migrationId);
  } else {
    // Node.js environment - use Node fs
    return migrateJsonToSqliteNode(db, migrationId);
  }
}

/**
 * Node.js version of migration
 */
async function migrateJsonToSqliteNode(
  db: Awaited<ReturnType<typeof getDatabase>>,
  migrationId: string
): Promise<{ migrated: number; skipped: number }> {
  const fs = await import('fs');
  const path = await import('path');
  const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

  // Ensure images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    await markMigrationCompletedAsync(db, migrationId);
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
    if (await imageExists(id)) {
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
    let stats: import('fs').Stats | null = null;
    try {
      stats = fs.statSync(imagePath);
    } catch {
      // File doesn't exist anymore, skip
      continue;
    }

    // Create image record
    try {
      await createImage({
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

  await markMigrationCompletedAsync(db, migrationId);
  console.log(`[Migration] Completed: ${migrated} migrated, ${skipped} skipped`);

  return { migrated, skipped };
}

/**
 * Tauri version of migration
 */
async function migrateJsonToSqliteTauri(
  db: Awaited<ReturnType<typeof getDatabase>>,
  migrationId: string
): Promise<{ migrated: number; skipped: number }> {
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

    // Create image record (fileSize not easily available in Tauri without stat)
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

  if (isTauri()) {
    return checkIntegrityTauri();
  } else {
    return checkIntegrityNode();
  }
}

/**
 * Node.js version of integrity check
 */
async function checkIntegrityNode(): Promise<{ missingFiles: number; orphanFiles: number }> {
  const fs = await import('fs');
  const path = await import('path');
  const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

  // Ensure images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return { missingFiles: 0, orphanFiles: 0 };
  }

  // Get all image IDs from database
  const dbIds = new Set(await getAllImageIds());

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
 * Tauri version of integrity check
 */
async function checkIntegrityTauri(): Promise<{ missingFiles: number; orphanFiles: number }> {
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
