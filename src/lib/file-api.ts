// ファイル操作の抽象化レイヤー
// Tauri専用

import { getTemplatesPath, joinPath } from './tauri-utils';
import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  remove,
  rename,
  exists,
  stat,
} from '@tauri-apps/plugin-fs';

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
  moveFile(from: string, to: string): Promise<string>; // returns new path
  renameFile(path: string, newName: string): Promise<string>; // returns new path
  duplicateFile(path: string): Promise<string>; // returns new path
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

    // Check if destination is a directory
    let targetPath = toFull;
    let resultPath = to;

    const toExists = await exists(toFull);
    if (toExists) {
      const toStat = await stat(toFull);
      if (toStat.isDirectory) {
        // If destination is a directory, append the source filename
        const fileName = from.includes('/')
          ? from.substring(from.lastIndexOf('/') + 1)
          : from;
        targetPath = `${toFull}/${fileName}`;
        resultPath = to ? `${to}/${fileName}` : fileName;
      }
    }

    // Ensure parent directory of destination exists
    const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
    if (parentPath && !(await exists(parentPath))) {
      await mkdir(parentPath, { recursive: true });
    }

    await rename(fromFull, targetPath);
    return resultPath;
  }

  async renameFile(path: string, newName: string): Promise<string> {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    await this.moveFile(path, newPath);
    return newPath;
  }

  async duplicateFile(path: string): Promise<string> {
    // Read original file content
    const content = await this.readFile(path);

    // Generate unique copy name
    const ext = path.endsWith('.yaml') ? '.yaml' : path.endsWith('.yml') ? '.yml' : '';
    const baseName = path.replace(/\.(yaml|yml)$/, '');
    const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';

    let copyNum = 0;
    let newPath = '';

    do {
      const suffix = copyNum === 0 ? '_copy' : `_copy${copyNum + 1}`;
      const newName = `${baseName.includes('/') ? baseName.substring(baseName.lastIndexOf('/') + 1) : baseName}${suffix}${ext}`;
      newPath = parentPath ? `${parentPath}/${newName}` : newName;

      const fullPath = await this.getFullPath(newPath);
      if (!(await exists(fullPath))) {
        break;
      }
      copyNum++;
    } while (copyNum < 100); // Safety limit

    // Create the duplicate file
    await this.createFile(newPath, content);

    return newPath;
  }
}

// シングルトンインスタンスをエクスポート
export const fileAPI: FileAPI = new TauriFileAPI();
