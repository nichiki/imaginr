// ファイル操作の抽象化レイヤー
// デスクトップ化時に差し替え可能なインターフェース

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
}

export interface RenameResult {
  newPath: string;
  updatedFiles: string[];
}

export interface FileAPI {
  listFiles(): Promise<FileTreeItem[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
  moveFile(from: string, to: string): Promise<string>; // returns new path
  findReferences(path: string): Promise<string[]>; // find files that reference this path
  renameFile(path: string, newName: string, updateReferences?: boolean): Promise<RenameResult>;
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

  async moveFile(from: string, to: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `Failed to move: ${from}`);
    }
    const data = await res.json();
    return data.newPath;
  }

  async findReferences(path: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/rename?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to find references: ${path}`);
    const data = await res.json();
    return data.references;
  }

  async renameFile(path: string, newName: string, updateReferences = false): Promise<RenameResult> {
    const res = await fetch(`${this.baseUrl}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, newName, updateReferences }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `Failed to rename: ${path}`);
    }
    return res.json();
  }
}

// シングルトンインスタンスをエクスポート
export const fileAPI: FileAPI = new WebFileAPI();
