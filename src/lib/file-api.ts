// ファイル操作の抽象化レイヤー
// デスクトップ化時に差し替え可能なインターフェース

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
}

export interface FileAPI {
  listFiles(): Promise<FileTreeItem[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
}

// Web版の実装（Next.js API Routes経由）
class WebFileAPI implements FileAPI {
  private baseUrl = '/api/files';

  async listFiles(): Promise<FileTreeItem[]> {
    const res = await fetch(this.baseUrl);
    if (!res.ok) throw new Error('Failed to list files');
    return res.json();
  }

  async readFile(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to read file: ${path}`);
    const data = await res.json();
    return data.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Failed to write file: ${path}`);
  }

  async createFile(path: string, content = ''): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Failed to create file: ${path}`);
  }

  async createFolder(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error(`Failed to create folder: ${path}`);
  }

  async deleteFile(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete file: ${path}`);
  }

  async deleteFolder(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete folder: ${path}`);
  }
}

// シングルトンインスタンスをエクスポート
export const fileAPI: FileAPI = new WebFileAPI();
