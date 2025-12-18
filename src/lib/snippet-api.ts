// スニペットAPI クライアント

export interface Snippet {
  id: string;
  category: string;
  key: string;
  label: string;
  description?: string;
  content: string;
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

// カテゴリでグループ化（フラット）
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

// カテゴリツリーノード
export interface CategoryNode {
  name: string;
  path: string;
  snippets: Snippet[];
  children: CategoryNode[];
}

// カテゴリツリーを構築（多段対応）
export function buildCategoryTree(snippets: Snippet[]): CategoryNode[] {
  const root: CategoryNode[] = [];
  const nodeMap = new Map<string, CategoryNode>();

  // まずすべてのカテゴリパスからノードを作成
  for (const snippet of snippets) {
    const parts = snippet.category.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!nodeMap.has(currentPath)) {
        const node: CategoryNode = {
          name: part,
          path: currentPath,
          snippets: [],
          children: [],
        };
        nodeMap.set(currentPath, node);

        // 親に追加
        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          root.push(node);
        }
      }
    }

    // スニペットを最終カテゴリに追加
    const leafNode = nodeMap.get(snippet.category);
    if (leafNode) {
      leafNode.snippets.push(snippet);
    }
  }

  // 子ノードをソート
  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root);

  return root;
}

// コンテキストに応じたスニペットを取得
export function getSnippetsForContext(snippets: Snippet[], context: string): Snippet[] {
  return snippets.filter(
    (s) => s.key === context || s.category.startsWith(context)
  );
}
