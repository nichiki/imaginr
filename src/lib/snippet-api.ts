// スニペットAPI クライアント

export interface Snippet {
  id: string;
  category: string;
  key: string;
  label: string;
  description?: string;
  content: string;
  isBlock: boolean;
}

export const snippetAPI = {
  // スニペット一覧取得
  async list(): Promise<Snippet[]> {
    const res = await fetch('/api/snippets');
    if (!res.ok) throw new Error('Failed to fetch snippets');
    return res.json();
  },

  // スニペット作成
  async create(snippet: Omit<Snippet, 'id'> & { id?: string }): Promise<Snippet> {
    const res = await fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    if (!res.ok) throw new Error('Failed to create snippet');
    return res.json();
  },

  // スニペット更新
  async update(snippet: Snippet): Promise<Snippet> {
    const res = await fetch('/api/snippets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    if (!res.ok) throw new Error('Failed to update snippet');
    return res.json();
  },

  // スニペット削除
  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/snippets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete snippet');
  },
};

// カテゴリでグループ化
export function getSnippetsByCategory(snippets: Snippet[]): Map<string, Snippet[]> {
  const grouped = new Map<string, Snippet[]>();

  for (const snippet of snippets) {
    const category = snippet.category.split('/')[0]; // トップレベルカテゴリ
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(snippet);
  }

  return grouped;
}

// コンテキストに応じたスニペットを取得
export function getSnippetsForContext(snippets: Snippet[], context: string): Snippet[] {
  return snippets.filter(
    (s) => s.key === context || s.category.startsWith(context)
  );
}
