import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates');

// パスの安全性チェック（ディレクトリトラバーサル防止）
function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(TEMPLATES_DIR, filePath);
  return resolved.startsWith(TEMPLATES_DIR);
}

// 全YAMLファイルを再帰的に取得
async function getAllYamlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllYamlFiles(fullPath)));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      files.push(fullPath);
    }
  }

  return files;
}

// ファイル内の参照を検索（_base, _layers）
async function findReferencesInFile(
  filePath: string,
  targetPath: string
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // _base: や _layers: の値としてターゲットパスが含まれているかチェック
    // 相対パスで参照されることを想定
    const targetName = path.basename(targetPath);
    const targetRelative = path.relative(TEMPLATES_DIR, targetPath);

    // パターン: _base: filename.yaml または _base: path/to/filename.yaml
    const patterns = [
      new RegExp(`_base:\\s*['"]?${escapeRegex(targetName)}['"]?`, 'g'),
      new RegExp(`_base:\\s*['"]?${escapeRegex(targetRelative)}['"]?`, 'g'),
      new RegExp(`_layers:[\\s\\S]*?-\\s*['"]?${escapeRegex(targetName)}['"]?`, 'g'),
      new RegExp(`_layers:[\\s\\S]*?-\\s*['"]?${escapeRegex(targetRelative)}['"]?`, 'g'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// 正規表現用にエスケープ
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ファイル内の参照を更新
async function updateReferencesInFile(
  filePath: string,
  oldPath: string,
  newPath: string
): Promise<boolean> {
  try {
    const originalContent = await fs.readFile(filePath, 'utf-8');
    let content = originalContent;
    const oldName = path.basename(oldPath);
    const newName = path.basename(newPath);
    const oldRelative = path.relative(TEMPLATES_DIR, oldPath);
    const newRelative = path.relative(TEMPLATES_DIR, newPath);

    // ファイル名での参照を更新（_base: と _layers: - のみ）
    content = content.replace(
      new RegExp(`(_base:\\s*['"]?)${escapeRegex(oldName)}(['"]?\\s*$)`, 'gm'),
      `$1${newName}$2`
    );
    content = content.replace(
      new RegExp(`(^\\s*-\\s*['"]?)${escapeRegex(oldName)}(['"]?\\s*$)`, 'gm'),
      `$1${newName}$2`
    );

    // 相対パスでの参照を更新
    content = content.replace(
      new RegExp(`(_base:\\s*['"]?)${escapeRegex(oldRelative)}(['"]?\\s*$)`, 'gm'),
      `$1${newRelative}$2`
    );
    content = content.replace(
      new RegExp(`(^\\s*-\\s*['"]?)${escapeRegex(oldRelative)}(['"]?\\s*$)`, 'gm'),
      `$1${newRelative}$2`
    );

    // 実際に変更があった場合のみ保存
    if (content !== originalContent) {
      await fs.writeFile(filePath, content, 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// GET /api/files/rename?path=xxx - 参照を検索
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fullPath = path.join(TEMPLATES_DIR, filePath);

    // ファイル/フォルダの存在確認
    try {
      await fs.access(fullPath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // 全YAMLファイルを取得
    const allFiles = await getAllYamlFiles(TEMPLATES_DIR);
    const references: string[] = [];

    // 自分自身を除外して参照を検索
    for (const file of allFiles) {
      if (file === fullPath) continue;
      if (await findReferencesInFile(file, fullPath)) {
        references.push(path.relative(TEMPLATES_DIR, file));
      }
    }

    return NextResponse.json({ references });
  } catch (error) {
    console.error('Error finding references:', error);
    return NextResponse.json({ error: 'Failed to find references' }, { status: 500 });
  }
}

// POST /api/files/rename - リネーム実行
export async function POST(request: NextRequest) {
  try {
    const { path: filePath, newName, updateReferences } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (!newName || typeof newName !== 'string') {
      return NextResponse.json({ error: 'Invalid new name' }, { status: 400 });
    }

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // 新しい名前のバリデーション
    if (newName.includes('/') || newName.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    const fullPath = path.join(TEMPLATES_DIR, filePath);
    const dir = path.dirname(fullPath);
    const newPath = path.join(dir, newName);
    const newRelativePath = path.relative(TEMPLATES_DIR, newPath);

    if (!isPathSafe(newRelativePath)) {
      return NextResponse.json({ error: 'Invalid new path' }, { status: 400 });
    }

    // ソースの存在確認
    try {
      await fs.access(fullPath);
    } catch {
      return NextResponse.json({ error: 'Source does not exist' }, { status: 404 });
    }

    // 移動先の存在確認（既に存在する場合はエラー）
    try {
      await fs.access(newPath);
      return NextResponse.json({ error: 'A file with that name already exists' }, { status: 409 });
    } catch {
      // 存在しない場合は問題なし
    }

    // 参照を更新（オプション）
    const updatedFiles: string[] = [];
    if (updateReferences) {
      const allFiles = await getAllYamlFiles(TEMPLATES_DIR);
      for (const file of allFiles) {
        if (file === fullPath) continue;
        if (await updateReferencesInFile(file, fullPath, newPath)) {
          updatedFiles.push(path.relative(TEMPLATES_DIR, file));
        }
      }
    }

    // リネーム実行
    await fs.rename(fullPath, newPath);

    return NextResponse.json({
      success: true,
      newPath: newRelativePath,
      updatedFiles,
    });
  } catch (error) {
    console.error('Error renaming file:', error);
    return NextResponse.json({ error: 'Failed to rename file' }, { status: 500 });
  }
}
