// ローカルストレージへの永続化ユーティリティ
// Tauri専用

import { getConfigPath } from './tauri-utils';

const STORAGE_KEY = 'image-prompt-builder-state';
const COMFYUI_SETTINGS_KEY = 'image-prompt-builder-comfyui';

export interface AppState {
  leftPanelWidth: number;
  rightPanelWidth: number;
  previewHeight: number;
  variablePanelWidth: number;
  expandedFolders: string[] | null; // nullは未保存を示す
  selectedFile: string;
}

const defaultState: AppState = {
  leftPanelWidth: 280,
  rightPanelWidth: 280,
  previewHeight: 280,
  variablePanelWidth: 280, // leftPanelWidthと同じ
  expandedFolders: null, // 初回は全て開く
  selectedFile: '',
};

export function loadState(): AppState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultState, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
  return defaultState;
}

export function saveState(state: Partial<AppState>): void {
  if (typeof window === 'undefined') return;

  try {
    const current = loadState();
    const newState = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

// ComfyUI設定
export interface NodeOverride {
  nodeId: string;         // ノードID
  property: string;       // プロパティ名 (例: "width", "height", "steps")
  value: number | string; // 値
}

export interface WorkflowConfig {
  id: string;             // 一意のID
  file: string;           // ファイル名 (data/comfyui/ 以下)
  name: string;           // 表示名
  promptNodeId: string;   // プロンプトを挿入するノードID
  samplerNodeId: string;  // シードをランダム化するサンプラーノードID
  overrides: NodeOverride[]; // ノードプロパティの上書き設定
}

export interface ComfyUISettings {
  enabled: boolean;
  url: string;
  activeWorkflowId: string;  // 現在選択中のワークフローID
  workflows: WorkflowConfig[];
  // 後方互換性のため残す（マイグレーション用）
  workflowFile?: string;
  promptNodeId?: string;
  samplerNodeId?: string;
}

const defaultComfyUISettings: ComfyUISettings = {
  enabled: false,
  url: 'http://localhost:8188',
  activeWorkflowId: '',
  workflows: [],
};

/**
 * Load ComfyUI settings from localStorage (client-side cache)
 * For the authoritative settings, use fetchComfyUISettings()
 */
export function loadComfyUISettings(): ComfyUISettings {
  if (typeof window === 'undefined') return defaultComfyUISettings;

  try {
    const saved = localStorage.getItem(COMFYUI_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultComfyUISettings, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load ComfyUI settings:', error);
  }
  return defaultComfyUISettings;
}

/**
 * Fetch ComfyUI settings from file (Tauri)
 * This is the authoritative source
 */
export async function fetchComfyUISettings(): Promise<ComfyUISettings> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const configPath = await getConfigPath();

    let settings: ComfyUISettings;
    if (await exists(configPath)) {
      const content = await readTextFile(configPath);
      settings = JSON.parse(content);
    } else {
      settings = defaultComfyUISettings;
    }

    // Update localStorage cache
    if (typeof window !== 'undefined') {
      localStorage.setItem(COMFYUI_SETTINGS_KEY, JSON.stringify(settings));
    }

    return { ...defaultComfyUISettings, ...settings };
  } catch (error) {
    console.error('Failed to fetch ComfyUI settings:', error);
    // Fall back to localStorage
    return loadComfyUISettings();
  }
}

/**
 * Save ComfyUI settings to file (Tauri)
 * Also updates localStorage cache
 */
export async function saveComfyUISettingsAsync(settings: Partial<ComfyUISettings>): Promise<ComfyUISettings> {
  try {
    // Merge with current settings
    const current = await fetchComfyUISettings();
    const newSettings = { ...current, ...settings };

    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const { appDataDir } = await import('@tauri-apps/api/path');
    const configPath = await getConfigPath();

    // Ensure app data directory exists
    const appData = await appDataDir();
    if (!(await exists(appData))) {
      await mkdir(appData, { recursive: true });
    }

    await writeTextFile(configPath, JSON.stringify(newSettings, null, 2));

    // Update localStorage cache
    if (typeof window !== 'undefined') {
      localStorage.setItem(COMFYUI_SETTINGS_KEY, JSON.stringify(newSettings));
    }

    return newSettings;
  } catch (error) {
    console.error('Failed to save ComfyUI settings:', error);
    throw error;
  }
}

/**
 * @deprecated Use saveComfyUISettingsAsync instead for persistence to file
 * This only saves to localStorage (client-side cache)
 */
export function saveComfyUISettings(settings: Partial<ComfyUISettings>): void {
  if (typeof window === 'undefined') return;

  try {
    const current = loadComfyUISettings();
    const newSettings = { ...current, ...settings };
    localStorage.setItem(COMFYUI_SETTINGS_KEY, JSON.stringify(newSettings));
  } catch (error) {
    console.error('Failed to save ComfyUI settings:', error);
  }
}

/**
 * Migrate settings from localStorage to file
 * Called once on app initialization
 */
export async function migrateLocalStorageToFile(): Promise<void> {
  if (typeof window === 'undefined') return;

  const migrationKey = 'image-prompt-builder-settings-migrated';
  if (localStorage.getItem(migrationKey)) {
    return; // Already migrated
  }

  try {
    const localSettings = loadComfyUISettings();

    // Check if there's anything to migrate
    if (localSettings.workflows.length === 0 && !localSettings.enabled) {
      localStorage.setItem(migrationKey, 'true');
      return;
    }

    // Migrate to file
    await saveComfyUISettingsAsync(localSettings);
    localStorage.setItem(migrationKey, 'true');
    console.log('Settings migrated from localStorage to file');
  } catch (error) {
    console.error('Failed to migrate settings:', error);
  }
}

// アクティブなワークフロー設定を取得
export function getActiveWorkflow(settings: ComfyUISettings): WorkflowConfig | null {
  if (!settings.activeWorkflowId) return null;
  return settings.workflows.find(w => w.id === settings.activeWorkflowId) || null;
}

// 新しいワークフロー設定を生成
export function createWorkflowConfig(
  file: string,
  name?: string
): WorkflowConfig {
  return {
    id: crypto.randomUUID(),
    file,
    name: name || file.replace(/\.json$/, ''),
    promptNodeId: '',
    samplerNodeId: '',
    overrides: [],
  };
}
