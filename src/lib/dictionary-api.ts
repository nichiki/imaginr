// 辞書API クライアント
// Tauri / Web両対応

import { isTauri, getDictionaryPath, joinPath } from './tauri-utils';
import { readTextFile, readDir, exists } from '@tauri-apps/plugin-fs';
import yaml from 'js-yaml';

export interface DictionaryEntry {
  value: string;
  description?: string;  // 補足説明（省略可）
}

export interface DictionaryItem {
  key: string;           // YAMLキー名 (例: "color", "type")
  context: string;       // 親コンテキスト (例: "*", "outfit", "outfit.top")
  values: DictionaryEntry[];
  source: 'standard' | 'user';  // 標準辞書かユーザー辞書か
}

// フラット化された辞書エントリ（API経由で取得する形式）
export interface FlatDictionaryEntry {
  key: string;
  context: string;
  value: string;
  description?: string;
  source: 'standard' | 'user';
}

// Web版の実装
const webDictionaryAPI = {
  async list(): Promise<FlatDictionaryEntry[]> {
    const res = await fetch('/api/dictionary');
    if (!res.ok) throw new Error('Failed to fetch dictionary');
    return res.json();
  },
};

// 辞書YAMLファイルの形式
interface DictionaryFile {
  entries: Array<{
    key: string;
    context: string;
    values: Array<{
      value: string;
      description?: string;
    }>;
  }>;
}

// Tauri版の実装
const tauriDictionaryAPI = {
  async loadDictionaryFiles(
    dir: string,
    source: 'standard' | 'user'
  ): Promise<FlatDictionaryEntry[]> {
    const entries: FlatDictionaryEntry[] = [];

    try {
      if (!(await exists(dir))) {
        return entries;
      }

      const files = await readDir(dir);
      const yamlFiles = files.filter(
        (f) => !f.isDirectory && (f.name.endsWith('.yaml') || f.name.endsWith('.yml'))
      );

      for (const file of yamlFiles) {
        try {
          const filePath = await joinPath(dir, file.name);
          const content = await readTextFile(filePath);
          const data = yaml.load(content) as DictionaryFile | null;

          if (data?.entries && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
              if (entry.key && entry.context && Array.isArray(entry.values)) {
                for (const val of entry.values) {
                  entries.push({
                    key: entry.key,
                    context: entry.context,
                    value: val.value,
                    description: val.description,
                    source,
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error parsing dictionary file ${file.name}:`, err);
        }
      }
    } catch (error) {
      console.warn('Dictionary directory not accessible:', dir, error);
    }

    return entries;
  },

  async list(): Promise<FlatDictionaryEntry[]> {
    const dictionaryDir = await getDictionaryPath();
    const standardDir = await joinPath(dictionaryDir, 'standard');
    const userDir = await joinPath(dictionaryDir, 'user');

    const [standardEntries, userEntries] = await Promise.all([
      this.loadDictionaryFiles(standardDir, 'standard'),
      this.loadDictionaryFiles(userDir, 'user'),
    ]);

    return [...standardEntries, ...userEntries];
  },
};

// 環境に応じてAPIを切り替え
export const dictionaryAPI = isTauri() ? tauriDictionaryAPI : webDictionaryAPI;

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
