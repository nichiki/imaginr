// ローカルストレージへの永続化ユーティリティ

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

export function loadComfyUISettings(): ComfyUISettings {
  if (typeof window === 'undefined') return defaultComfyUISettings;

  try {
    const saved = localStorage.getItem(COMFYUI_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);

      // 旧形式からのマイグレーション
      if (parsed.workflowFile && !parsed.workflows?.length) {
        const migratedWorkflow: WorkflowConfig = {
          id: crypto.randomUUID(),
          file: parsed.workflowFile,
          name: parsed.workflowFile.replace(/\.json$/, ''),
          promptNodeId: parsed.promptNodeId || '',
          samplerNodeId: parsed.samplerNodeId || '',
          overrides: [],
        };
        parsed.workflows = [migratedWorkflow];
        parsed.activeWorkflowId = migratedWorkflow.id;
        // 旧プロパティを削除
        delete parsed.workflowFile;
        delete parsed.promptNodeId;
        delete parsed.samplerNodeId;
        // マイグレーション結果を保存
        localStorage.setItem(COMFYUI_SETTINGS_KEY, JSON.stringify(parsed));
      }

      return { ...defaultComfyUISettings, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load ComfyUI settings:', error);
  }
  return defaultComfyUISettings;
}

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
