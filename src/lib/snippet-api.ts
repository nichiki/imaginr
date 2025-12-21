// スニペットAPI クライアント
// Tauri / Web両対応

import { isTauri, getSnippetsPath, joinPath } from './tauri-utils';
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import yaml from 'js-yaml';

export interface Snippet {
  id: string;
  category: string;
  key: string;
  label: string;
  description?: string;
  content: string;
}

// Web版の実装
const webSnippetAPI = {
  async list(): Promise<Snippet[]> {
    const res = await fetch('/api/snippets');
    if (!res.ok) throw new Error('Failed to fetch snippets');
    return res.json();
  },

  async create(snippet: Omit<Snippet, 'id'> & { id?: string }): Promise<Snippet> {
    const res = await fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    if (!res.ok) throw new Error('Failed to create snippet');
    return res.json();
  },

  async update(snippet: Snippet): Promise<Snippet> {
    const res = await fetch('/api/snippets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    if (!res.ok) throw new Error('Failed to update snippet');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/snippets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete snippet');
  },
};

// Tauri版の実装
const tauriSnippetAPI = {
  async getFilePath(): Promise<string> {
    const snippetsDir = await getSnippetsPath();
    return joinPath(snippetsDir, 'snippets.yaml');
  },

  async ensureFile(): Promise<void> {
    const filePath = await this.getFilePath();
    const dir = await getSnippetsPath();

    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }

    if (!(await exists(filePath))) {
      await writeTextFile(filePath, yaml.dump({ snippets: [] }));
    }
  },

  async list(): Promise<Snippet[]> {
    await this.ensureFile();
    const filePath = await this.getFilePath();
    const content = await readTextFile(filePath);
    const data = yaml.load(content) as { snippets?: Snippet[] } | null;
    return data?.snippets || [];
  },

  async save(snippets: Snippet[]): Promise<void> {
    const filePath = await this.getFilePath();
    const content = yaml.dump({ snippets });
    await writeTextFile(filePath, content);
  },

  async create(snippet: Omit<Snippet, 'id'> & { id?: string }): Promise<Snippet> {
    const snippets = await this.list();
    const newSnippet: Snippet = {
      ...snippet,
      id: snippet.id || `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    snippets.push(newSnippet);
    await this.save(snippets);
    return newSnippet;
  },

  async update(snippet: Snippet): Promise<Snippet> {
    const snippets = await this.list();
    const index = snippets.findIndex((s) => s.id === snippet.id);
    if (index === -1) throw new Error('Snippet not found');
    snippets[index] = snippet;
    await this.save(snippets);
    return snippet;
  },

  async delete(id: string): Promise<void> {
    const snippets = await this.list();
    const filtered = snippets.filter((s) => s.id !== id);
    if (filtered.length === snippets.length) throw new Error('Snippet not found');
    await this.save(filtered);
  },
};

// 環境に応じてAPIを切り替え
export const snippetAPI = isTauri() ? tauriSnippetAPI : webSnippetAPI;

// カテゴリでグループ化（フラット・カテゴリ名はそのまま使用）
export function getSnippetsByCategory(snippets: Snippet[]): Map<string, Snippet[]> {
  const grouped = new Map<string, Snippet[]>();

  for (const snippet of snippets) {
    // カテゴリ名をそのまま使用（/も含めてそのまま）
    const category = snippet.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(snippet);
  }

  return grouped;
}
