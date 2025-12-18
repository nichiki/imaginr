// ローカルストレージへの永続化ユーティリティ

const STORAGE_KEY = 'image-prompt-builder-state';

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
