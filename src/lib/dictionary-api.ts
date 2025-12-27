// 辞書API クライアント
// Tauri専用 - SQLite DBから読み込み

export interface DictionaryEntry {
  value: string;
  description?: string;  // 補足説明（省略可）
  source?: string;       // 由来元コンテキスト (例: "outfit.color", "*.color")
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
// 具体的なコンテキストと汎用コンテキストをマージして返す
// 例: contextPath=["outfit", "jacket"], key="color" の場合
// 以下を全てマージして返す:
// 1. outfit.jacket.color（フルパス - 最も具体的）
// 2. jacket.color（直近の親）
// 3. outfit.color（上位の親）
// 4. *.color（汎用 - 常に含める）
export function lookupDictionary(
  cache: Map<string, DictionaryEntry[]>,
  contextPath: string[], // 親キーの配列 (例: ["outfit", "jacket"])
  key: string
): DictionaryEntry[] {
  const results: DictionaryEntry[] = [];
  const seenValues = new Set<string>(); // 重複排除用

  const addEntries = (entries: DictionaryEntry[] | undefined, source: string) => {
    if (!entries) return;
    for (const entry of entries) {
      if (!seenValues.has(entry.value)) {
        seenValues.add(entry.value);
        results.push({ ...entry, source });
      }
    }
  };

  // 1. フルパスで検索（最も具体的）
  if (contextPath.length > 0) {
    const fullPath = contextPath.join('.');
    const fullKey = `${fullPath}.${key}`;
    addEntries(cache.get(fullKey), fullKey);
  }

  // 2. 各親コンテキストを後ろから順に検索
  // ["outfit", "jacket"] → "jacket.color", "outfit.color"
  for (let i = contextPath.length - 1; i >= 0; i--) {
    const contextKey = `${contextPath[i]}.${key}`;
    addEntries(cache.get(contextKey), contextKey);
  }

  // 3. 汎用コンテキストを常に追加
  const wildcardKey = `*.${key}`;
  addEntries(cache.get(wildcardKey), wildcardKey);

  return results;
}
