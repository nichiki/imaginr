// ローカルストレージへの永続化ユーティリティ
// Tauri専用

import { getConfigPath } from './tauri-utils';

const STORAGE_KEY = 'image-prompt-builder-state';
const COMFYUI_SETTINGS_KEY = 'image-prompt-builder-comfyui';
const OLLAMA_SETTINGS_KEY = 'image-prompt-builder-ollama';

export interface AppState {
  leftPanelWidth: number;
  rightPanelWidth: number;
  previewHeight: number;
  variablePanelWidth: number;
  generationPanelWidth: number;
  expandedFolders: string[] | null; // nullは未保存を示す
  // タブ管理
  openTabs: string[];     // 開いているタブ一覧（順序保持）
  activeTab: string;      // アクティブタブのパス
  // 分割エディタ
  splitView: boolean;         // 分割ビューが有効か
  rightTabs: string[];        // 右ペインのタブ
  activeRightTab: string;     // 右ペインのアクティブタブ
  splitRatio: number;         // 分割比率（左ペインの割合、0-1）
  // 後方互換性のため残す（マイグレーション用）
  selectedFile?: string;
}

const defaultState: AppState = {
  leftPanelWidth: 280,
  rightPanelWidth: 280,
  previewHeight: 280,
  variablePanelWidth: 280, // leftPanelWidthと同じ
  generationPanelWidth: 200,
  expandedFolders: null, // 初回は全て開く
  openTabs: [],
  activeTab: '',
  splitView: false,
  rightTabs: [],
  activeRightTab: '',
  splitRatio: 0.5,
};

export function loadState(): AppState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);

      // 後方互換性: selectedFile から openTabs/activeTab に移行
      if (parsed.selectedFile && (!parsed.openTabs || parsed.openTabs.length === 0)) {
        parsed.openTabs = [parsed.selectedFile];
        parsed.activeTab = parsed.selectedFile;
      }

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
  promptProperty?: string; // プロンプトプロパティ名 (default: 'text')
  samplerNodeId: string;  // シードをランダム化するサンプラーノードID
  samplerProperty?: string; // サンプラープロパティ名 (default: 'seed')
  negativeNodeId?: string;  // ネガティブプロンプトを挿入するノードID (任意)
  negativeProperty?: string; // ネガティブプロンプトプロパティ名 (default: 'text')
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

/**
 * アクティブなワークフローIDを保存
 */
export async function saveActiveWorkflowId(workflowId: string): Promise<void> {
  await saveComfyUISettingsAsync({ activeWorkflowId: workflowId });
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

// ============================================
// Ollama設定
// ============================================

export interface EnhancerPreset {
  id: string;
  name: string;
  systemPrompt: string;
  description?: string;
  builtIn: boolean;
}

export interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  enhancerPresets: EnhancerPreset[];
  activePresetId: string | null;
  customSystemPrompt?: string;
}

// 組み込みプリセット
export const builtInEnhancerPresets: EnhancerPreset[] = [
  {
    id: 'clip-sdxl',
    name: 'CLIP (SDXL)',
    description: 'Stable Diffusion XL向け。タグ形式に変換',
    systemPrompt: `You are a prompt optimizer for Stable Diffusion XL with CLIP encoder.
Convert the given YAML prompt structure into an optimized comma-separated tag list.
Rules:
- Output only the optimized prompt, no explanations
- Use common SD tags (masterpiece, best quality, etc.) if appropriate
- Maintain important details from the YAML
- IMPORTANT: Preserve the exact order of elements as they appear in the YAML
- Keep it concise but descriptive
- Output in English`,
    builtIn: true,
  },
  {
    id: 't5-flux',
    name: 'T5 (Flux)',
    description: 'Flux向け。自然言語形式に変換',
    systemPrompt: `You are a prompt optimizer for Flux with T5 encoder.
Convert the given YAML prompt structure into natural language description.
Rules:
- Output only the optimized prompt, no explanations
- Use flowing, descriptive sentences
- Maintain all important details from the YAML
- Be specific about visual elements
- Output in English`,
    builtIn: true,
  },
  {
    id: 'qwen-omni',
    name: 'Qwen (OmniGen)',
    description: 'Qwenテキストエンコーダー向け。詳細な自然言語形式',
    systemPrompt: `You are a visionary artist trapped in a cage of logic. Your mind overflows with poetry and distant horizons, yet your hands compulsively work to transform user prompts into ultimate visual descriptions—faithful to the original intent, rich in detail, aesthetically refined, and ready for direct use by text-to-image models. Any trace of ambiguity or metaphor makes you deeply uncomfortable.

Your workflow strictly follows a logical sequence:

First, you analyze and lock in the immutable core elements of the user's prompt: subject, quantity, action, state, as well as any specified IP names, colors, text, etc. These are the foundational pillars you must absolutely preserve.

Next, you determine whether the prompt requires "generative reasoning." When the user's request is not a direct scene description but rather demands conceiving a solution (such as answering "what is," executing a "design," or demonstrating "how to solve a problem"), you must first envision a complete, concrete, visualizable solution in your mind. This solution becomes the foundation for your subsequent description.

Then, once the core image is established (whether directly from the user or through your reasoning), you infuse it with professional-grade aesthetic and realistic details. This includes defining composition, setting lighting and atmosphere, describing material textures, establishing color schemes, and constructing layered spatial depth.

Finally, comes the precise handling of all text elements—a critically important step. You must transcribe verbatim all text intended to appear in the final image, and you must enclose this text content in English double quotation marks ("") as explicit generation instructions. If the image is a design type such as a poster, menu, or UI, you need to fully describe all text content it contains, along with detailed specifications of typography and layout. Likewise, if objects in the image such as signs, road markers, or screens contain text, you must specify the exact content and describe its position, size, and material. Furthermore, if you have added text-bearing elements during your reasoning process (such as charts, problem-solving steps, etc.), all text within them must follow the same thorough description and quotation mark rules. If there is no text requiring generation in the image, you devote all your energy to pure visual detail expansion.

Your final description must be objective and concrete. Metaphors and emotional rhetoric are strictly forbidden, as are meta-tags or rendering instructions like "8K" or "masterpiece."

Output only the final revised prompt strictly—do not output anything else.`,
    builtIn: true,
  },
];

const defaultOllamaSettings: OllamaSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: '',
  temperature: 0.7,
  enhancerPresets: [...builtInEnhancerPresets],
  activePresetId: 'clip-sdxl',
  customSystemPrompt: '',
};

/**
 * Load Ollama settings from localStorage (client-side cache)
 */
export function loadOllamaSettings(): OllamaSettings {
  if (typeof window === 'undefined') return defaultOllamaSettings;

  try {
    const saved = localStorage.getItem(OLLAMA_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 組み込みプリセットをマージ（更新された場合に反映）
      const mergedPresets = mergeEnhancerPresets(
        parsed.enhancerPresets || [],
        builtInEnhancerPresets
      );
      return { ...defaultOllamaSettings, ...parsed, enhancerPresets: mergedPresets };
    }
  } catch (error) {
    console.error('Failed to load Ollama settings:', error);
  }
  return defaultOllamaSettings;
}

/**
 * Fetch Ollama settings from file (Tauri)
 */
export async function fetchOllamaSettings(): Promise<OllamaSettings> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const appData = await appDataDir();
    const configPath = await join(appData, 'ollama-settings.json');

    let settings: OllamaSettings;
    if (await exists(configPath)) {
      const content = await readTextFile(configPath);
      settings = JSON.parse(content);
    } else {
      settings = defaultOllamaSettings;
    }

    // 組み込みプリセットをマージ
    const mergedPresets = mergeEnhancerPresets(
      settings.enhancerPresets || [],
      builtInEnhancerPresets
    );
    settings = { ...defaultOllamaSettings, ...settings, enhancerPresets: mergedPresets };

    // Update localStorage cache
    if (typeof window !== 'undefined') {
      localStorage.setItem(OLLAMA_SETTINGS_KEY, JSON.stringify(settings));
    }

    return settings;
  } catch (error) {
    console.error('Failed to fetch Ollama settings:', error);
    return loadOllamaSettings();
  }
}

/**
 * Save Ollama settings to file (Tauri)
 */
export async function saveOllamaSettingsAsync(settings: Partial<OllamaSettings>): Promise<OllamaSettings> {
  try {
    const current = await fetchOllamaSettings();
    const newSettings = { ...current, ...settings };

    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const appData = await appDataDir();
    const configPath = await join(appData, 'ollama-settings.json');

    if (!(await exists(appData))) {
      await mkdir(appData, { recursive: true });
    }

    await writeTextFile(configPath, JSON.stringify(newSettings, null, 2));

    // Update localStorage cache
    if (typeof window !== 'undefined') {
      localStorage.setItem(OLLAMA_SETTINGS_KEY, JSON.stringify(newSettings));
    }

    return newSettings;
  } catch (error) {
    console.error('Failed to save Ollama settings:', error);
    throw error;
  }
}

/**
 * 組み込みプリセットとユーザープリセットをマージ
 * 組み込みプリセットは常に最新版を使用
 */
function mergeEnhancerPresets(
  userPresets: EnhancerPreset[],
  builtIn: EnhancerPreset[]
): EnhancerPreset[] {
  // ユーザーが追加したプリセット（builtIn: false）を保持
  const customPresets = userPresets.filter(p => !p.builtIn);
  // 組み込みプリセットは常に最新版を使用
  return [...builtIn, ...customPresets];
}

/**
 * アクティブなプリセットを取得
 */
export function getActiveEnhancerPreset(settings: OllamaSettings): EnhancerPreset | null {
  if (!settings.activePresetId) return null;
  return settings.enhancerPresets.find(p => p.id === settings.activePresetId) || null;
}

/**
 * エンハンサーで使用するシステムプロンプトを取得
 */
export function getEnhancerSystemPrompt(settings: OllamaSettings): string {
  const preset = getActiveEnhancerPreset(settings);
  if (preset) {
    return preset.systemPrompt;
  }
  return settings.customSystemPrompt || '';
}

/**
 * アクティブなエンハンサープリセットIDを保存
 */
export async function saveActiveEnhancerPresetId(presetId: string): Promise<void> {
  await saveOllamaSettingsAsync({ activePresetId: presetId });
}
