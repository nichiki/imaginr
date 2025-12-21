// Initial data copy logic for first-time setup

import { getAppDataPath, joinPath } from './tauri-utils';

/**
 * Get the source data path (bundled resources or project directory)
 */
async function getSourceDataPath(): Promise<string> {
  const { resolveResource } = await import('@tauri-apps/api/path');
  const { exists } = await import('@tauri-apps/plugin-fs');

  // Try bundled resource path first (production)
  try {
    const resourcePath = await resolveResource('data');
    if (await exists(resourcePath)) {
      return resourcePath;
    }
  } catch {
    // Ignore error, try dev path
  }

  // Dev mode: use project directory
  // resolveResource points to src-tauri/target/debug/, go up to project root
  const { resolveResource: resolvePath } = await import('@tauri-apps/api/path');
  const debugPath = await resolvePath('.');
  // debugPath is like: D:\Workspace\image-prompt-builder\src-tauri\target\debug
  // We need: D:\Workspace\image-prompt-builder\data
  const { join } = await import('@tauri-apps/api/path');
  const projectRoot = await join(debugPath, '..', '..', '..', 'data');
  return projectRoot;
}

/**
 * Check if app data directory exists and copy initial data if needed
 * This should be called once at app startup
 */
export async function initializeAppData(): Promise<void> {
  const { exists, mkdir, readDir, readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');

  const appDataPath = await getAppDataPath();

  // Check if app data directory exists
  if (await exists(appDataPath)) {
    console.log('App data directory already exists, skipping initialization');
    return;
  }

  console.log('First time setup: copying initial data...');

  // Create app data directory
  await mkdir(appDataPath, { recursive: true });

  // Get source data path
  const sourceDataPath = await getSourceDataPath();
  console.log('Source data path:', sourceDataPath);

  // Folders to copy from bundled resources
  // Note: comfyui is NOT copied - users must add their own workflows
  const folders = ['templates', 'dictionary', 'snippets'];

  for (const folder of folders) {
    try {
      const { join } = await import('@tauri-apps/api/path');
      const srcPath = await join(sourceDataPath, folder);
      const destPath = await joinPath(appDataPath, folder);

      // Check if source exists
      if (!(await exists(srcPath))) {
        console.log(`Source folder not found: ${srcPath}, skipping`);
        continue;
      }

      // Create destination folder
      await mkdir(destPath, { recursive: true });

      // Copy all files from resource folder
      await copyDirectoryContents(srcPath, destPath, { exists, readDir, readTextFile, writeTextFile, mkdir });

      console.log(`Copied ${folder} to ${destPath}`);
    } catch (error) {
      console.error(`Failed to copy ${folder}:`, error);
    }
  }

  // Create empty folders
  const emptyFolders = ['images', 'db', 'comfyui'];
  for (const folder of emptyFolders) {
    const folderPath = await joinPath(appDataPath, folder);
    await mkdir(folderPath, { recursive: true });
  }

  console.log('Initial data setup complete');
}

interface FsApi {
  exists: (path: string) => Promise<boolean>;
  readDir: (path: string) => Promise<Array<{ name?: string; isDirectory?: boolean; isFile?: boolean }>>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
}

/**
 * Recursively copy directory contents
 */
async function copyDirectoryContents(
  srcDir: string,
  destDir: string,
  fs: FsApi
): Promise<void> {
  const { join } = await import('@tauri-apps/api/path');

  const entries = await fs.readDir(srcDir);

  for (const entry of entries) {
    if (!entry.name) continue;

    const srcPath = await join(srcDir, entry.name);
    const destPath = await join(destDir, entry.name);

    if (entry.isDirectory) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectoryContents(srcPath, destPath, fs);
    } else if (entry.isFile || entry.name.includes('.')) {
      // Copy file by reading and writing (text files)
      try {
        const content = await fs.readTextFile(srcPath);
        await fs.writeTextFile(destPath, content);
      } catch (error) {
        console.error(`Failed to copy file ${srcPath}:`, error);
      }
    }
  }
}
