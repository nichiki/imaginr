// ファイル操作の抽象化レイヤー
// Tauri / Web両対応

import { isTauri, getTemplatesPath, joinPath } from './tauri-utils';
import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  remove,
  rename,
  exists,
} from '@tauri-apps/plugin-fs';

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

// Tauri版の実装（Tauri FS API経由）
class TauriFileAPI implements FileAPI {
  private templatesPath: string | null = null;

  private async getBasePath(): Promise<string> {
    if (!this.templatesPath) {
      this.templatesPath = await getTemplatesPath();
    }
    return this.templatesPath;
  }

  private async getFullPath(relativePath: string): Promise<string> {
    const base = await this.getBasePath();
    return joinPath(base, relativePath);
  }

  async listFiles(): Promise<FileTreeItem[]> {
    const basePath = await this.getBasePath();

    // Ensure directory exists
    if (!(await exists(basePath))) {
      await mkdir(basePath, { recursive: true });
      return [];
    }

    return this.buildFileTree(basePath, '');
  }

  private async buildFileTree(dirPath: string, relativePath: string): Promise<FileTreeItem[]> {
    const items: FileTreeItem[] = [];

    try {
      const entries = await readDir(dirPath);

      // Sort: folders first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        // Skip hidden files and output directory
        if (entry.name.startsWith('.') || entry.name === 'output') continue;

        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const entryFullPath = await joinPath(dirPath, entry.name);

        if (entry.isDirectory) {
          const children = await this.buildFileTree(entryFullPath, entryRelativePath);
          items.push({
            name: entry.name,
            path: entryRelativePath,
            type: 'folder',
            children,
          });
        } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
          items.push({
            name: entry.name,
            path: entryRelativePath,
            type: 'file',
          });
        }
      }
    } catch (error) {
      console.error('Error reading directory:', dirPath, error);
    }

    return items;
  }

  async readFile(path: string): Promise<string> {
    const fullPath = await this.getFullPath(path);
    return readTextFile(fullPath);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fullPath = await this.getFullPath(path);
    await writeTextFile(fullPath, content);
  }

  async createFile(path: string, content = ''): Promise<void> {
    const fullPath = await this.getFullPath(path);

    // Ensure parent directory exists
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentPath && !(await exists(parentPath))) {
      await mkdir(parentPath, { recursive: true });
    }

    // Check if file already exists
    if (await exists(fullPath)) {
      throw new Error('File already exists');
    }

    await writeTextFile(fullPath, content);
  }

  async createFolder(path: string): Promise<void> {
    const fullPath = await this.getFullPath(path);

    if (await exists(fullPath)) {
      throw new Error('Folder already exists');
    }

    await mkdir(fullPath, { recursive: true });
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = await this.getFullPath(path);
    await remove(fullPath);
  }

  async deleteFolder(path: string): Promise<void> {
    const fullPath = await this.getFullPath(path);
    await remove(fullPath, { recursive: true });
  }

  async moveFile(from: string, to: string): Promise<string> {
    const fromFull = await this.getFullPath(from);
    const toFull = await this.getFullPath(to);

    // Ensure parent directory of destination exists
    const parentPath = toFull.substring(0, toFull.lastIndexOf('/'));
    if (parentPath && !(await exists(parentPath))) {
      await mkdir(parentPath, { recursive: true });
    }

    await rename(fromFull, toFull);
    return to;
  }

  async findReferences(path: string): Promise<string[]> {
    // Search all YAML files for references to this path
    const references: string[] = [];
    const basePath = await this.getBasePath();

    const searchInDir = async (dirPath: string, relativePath: string) => {
      try {
        const entries = await readDir(dirPath);

        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;

          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const entryFullPath = await joinPath(dirPath, entry.name);

          if (entry.isDirectory) {
            await searchInDir(entryFullPath, entryRelativePath);
          } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
            const content = await readTextFile(entryFullPath);
            if (content.includes(path)) {
              references.push(entryRelativePath);
            }
          }
        }
      } catch (error) {
        console.error('Error searching directory:', dirPath, error);
      }
    };

    await searchInDir(basePath, '');
    return references;
  }

  async renameFile(path: string, newName: string, updateReferences = false): Promise<RenameResult> {
    const oldPath = path;
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    // Find references before renaming
    const references = updateReferences ? await this.findReferences(oldPath) : [];

    // Rename the file
    await this.moveFile(oldPath, newPath);

    // Update references if requested
    const updatedFiles: string[] = [];
    if (updateReferences && references.length > 0) {
      for (const refPath of references) {
        if (refPath === newPath) continue; // Skip the renamed file itself

        try {
          const content = await this.readFile(refPath);
          const updatedContent = content.replace(
            new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            newPath
          );

          if (content !== updatedContent) {
            await this.writeFile(refPath, updatedContent);
            updatedFiles.push(refPath);
          }
        } catch (error) {
          console.error(`Failed to update reference in ${refPath}:`, error);
        }
      }
    }

    return { newPath, updatedFiles };
  }
}

// 環境に応じてAPIを切り替え
function createFileAPI(): FileAPI {
  if (isTauri()) {
    return new TauriFileAPI();
  }
  return new WebFileAPI();
}

// シングルトンインスタンスをエクスポート
export const fileAPI: FileAPI = createFileAPI();
