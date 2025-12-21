// 辞書API クライアント
// Tauri専用 - SQLite DBから読み込み

export interface DictionaryEntry {
  value: string;
  description?: string;  // 補足説明（省略可）
}

// フラット化された辞書エントリ（API経由で取得する形式）
export interface FlatDictionaryEntry {
  id: number;           // DB ID（削除・更新用）
  key: string;
  context: string;
  value: string;
  description?: string;
}

// Tauri版の実装（DBベース）
const tauriDictionaryAPI = {
  async list(): Promise<FlatDictionaryEntry[]> {
    const { getAllEntries } = await import('./dictionary-db-api');
    const entries = await getAllEntries();

    return entries.map(entry => ({
      id: entry.id,
      key: entry.key,
      context: entry.context,
      value: entry.value,
      description: entry.description,
    }));
  },

  async initializeFromBundled(): Promise<boolean> {
    const { initializeFromBundledFiles } = await import('./dictionary-db-api');
    return initializeFromBundledFiles();
  },
};

export const dictionaryAPI = tauriDictionaryAPI;

// 辞書をルックアップ用のMapに変換
// キー: "context.key" (例: "outfit.type", "*.color")
export function buildDictionaryCache(
  entries: FlatDictionaryEntry[]
): Map<string, DictionaryEntry[]> {
  const cache = new Map<string, DictionaryEntry[]>();

  for (const entry of entries) {
    const cacheKey = `${entry.context}.${entry.key}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, []);
    }
    cache.get(cacheKey)!.push({
      value: entry.value,
      description: entry.description,
    });
  }

  return cache;
}

// コンテキストに応じた辞書エントリを検索
// 具体的なコンテキストから汎用へフォールバック
// 例: contextPath=["outfit", "jacket"], key="style" の場合
// 1. outfit.jacket.style を検索（フルパス - 最も具体的）
// 2. jacket.style を検索（直近の親）
// 3. outfit.style を検索（上位の親）
// 4. *.style を検索（汎用）
export function lookupDictionary(
  cache: Map<string, DictionaryEntry[]>,
  contextPath: string[], // 親キーの配列 (例: ["outfit", "jacket"])
  key: string
): DictionaryEntry[] {
  // 1. フルパスで検索（最も具体的）
  if (contextPath.length > 0) {
    const fullPath = contextPath.join('.');
    const fullKey = `${fullPath}.${key}`;
    const entries = cache.get(fullKey);
    if (entries && entries.length > 0) {
      return entries;
    }
  }

  // 2. 各親コンテキストを後ろから順に検索
  // ["outfit", "jacket"] → "jacket.style", "outfit.style"
  for (let i = contextPath.length - 1; i >= 0; i--) {
    const contextKey = `${contextPath[i]}.${key}`;
    const entries = cache.get(contextKey);
    if (entries && entries.length > 0) {
      return entries;
    }
  }

  // 3. 最後に汎用コンテキストを検索
  const wildcardKey = `*.${key}`;
  return cache.get(wildcardKey) || [];
}
