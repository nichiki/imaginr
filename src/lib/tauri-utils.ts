// Tauri environment detection and utilities

import { appDataDir, join } from '@tauri-apps/api/path';

/**
 * Check if running in Tauri environment
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

let cachedAppDataPath: string | null = null;

/**
 * Get the application data directory path
 * Windows: %APPDATA%/Image Prompt Builder/
 * Mac: ~/Library/Application Support/Image Prompt Builder/
 */
export async function getAppDataPath(): Promise<string> {
  if (cachedAppDataPath) {
    return cachedAppDataPath;
  }

  if (!isTauri()) {
    throw new Error('getAppDataPath() is only available in Tauri environment');
  }

  cachedAppDataPath = await appDataDir();
  return cachedAppDataPath;
}

/**
 * Join path segments using Tauri's path API (cross-platform)
 */
export async function joinPath(...segments: string[]): Promise<string> {
  if (!isTauri()) {
    // Fallback for non-Tauri environment (should not happen in production)
    return segments.join('/');
  }

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
  return joinPath(appData, 'data', 'templates');
}

/**
 * Get the snippets directory path
 */
export async function getSnippetsPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'data', 'snippets');
}

/**
 * Get the dictionary directory path
 */
export async function getDictionaryPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'data', 'dictionary');
}

/**
 * Get the images directory path
 */
export async function getImagesPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'data', 'images');
}

/**
 * Get the ComfyUI workflows directory path
 */
export async function getComfyUIPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'data', 'comfyui');
}

/**
 * Get the database directory path
 */
export async function getDatabasePath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'db');
}

/**
 * Get the config file path
 */
export async function getConfigPath(): Promise<string> {
  const appData = await getAppDataPath();
  return joinPath(appData, 'config.json');
}
