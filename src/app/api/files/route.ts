import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// テンプレートディレクトリのパス（app/data/templates）
const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates');

interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
}

// ディレクトリを再帰的に読み込んでツリー構造を構築
async function buildFileTree(dirPath: string, relativePath = ''): Promise<FileTreeItem[]> {
  const items: FileTreeItem[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // ソート: フォルダ優先、その後アルファベット順
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      // 隠しファイルとoutputディレクトリはスキップ
      if (entry.name.startsWith('.') || entry.name === 'output') continue;

      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const entryFullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = await buildFileTree(entryFullPath, entryRelativePath);
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

// GET /api/files - ファイル一覧取得
export async function GET() {
  try {
    const tree = await buildFileTree(TEMPLATES_DIR);
    return NextResponse.json(tree);
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}
