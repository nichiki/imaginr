// Tauri utilities for path management

let cachedAppDataPath: string | null = null;

/**
 * Get the application data directory path
 * Windows: %APPDATA%/studio.imaginr/
 * Mac: ~/Library/Application Support/studio.imaginr/
 */
export async function getAppDataPath(): Promise<string> {
  if (cachedAppDataPath) {
    return cachedAppDataPath;
  }

  // 動的インポートでTauri APIを読み込む
  const { appDataDir } = await import('@tauri-apps/api/path');
  cachedAppDataPath = await appDataDir();
  return cachedAppDataPath;
}

/**
 * Join path segments using Tauri's path API (cross-platform)
 */
export async function joinPath(...segments: string[]): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  let result = segments[0];
  for (let i = 1; i < segments.length; i++) {
    result = await join(result, segments[i]);
  }
  return result;
}

/**
 * Get the templates directory path
 */
export async function getTemplatesPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'templates');
}

/**
 * Get the snippets directory path
 */
export async function getSnippetsPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'snippets');
}

/**
 * Get the dictionary directory path
 */
export async function getDictionaryPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'dictionary');
}

/**
 * Get the images directory path
 */
export async function getImagesPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'images');
}

/**
 * Get the ComfyUI workflows directory path
 */
export async function getComfyUIPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'comfyui');
}

/**
 * Get the database directory path
 */
export async function getDatabasePath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'db');
}

/**
 * Get the unified settings file path
 */
export async function getSettingsPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'settings.json');
}

/**
 * @deprecated Use getSettingsPath() instead
 * Get the old config file path (for migration)
 */
export async function getConfigPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'config.json');
}
