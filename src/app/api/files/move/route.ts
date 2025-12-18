import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates');

// パスの安全性チェック（ディレクトリトラバーサル防止）
function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(TEMPLATES_DIR, filePath);
  return resolved.startsWith(TEMPLATES_DIR);
}

// POST /api/files/move - ファイル/フォルダ移動
export async function POST(request: NextRequest) {
  try {
    const { from, to } = await request.json();

    if (!from || typeof from !== 'string') {
      return NextResponse.json({ error: 'Invalid source path' }, { status: 400 });
    }

    if (typeof to !== 'string') {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 });
    }

    if (!isPathSafe(from)) {
      return NextResponse.json({ error: 'Invalid source path' }, { status: 400 });
    }

    const sourcePath = path.join(TEMPLATES_DIR, from);
    const fileName = path.basename(from);

    // 移動先パスを構築（toが空文字ならルート直下）
    const destDir = to ? path.join(TEMPLATES_DIR, to) : TEMPLATES_DIR;
    const destPath = path.join(destDir, fileName);

    if (!isPathSafe(to ? `${to}/${fileName}` : fileName)) {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 });
    }

    // 同じ場所への移動をチェック
    if (sourcePath === destPath) {
      return NextResponse.json({ error: 'Source and destination are the same' }, { status: 400 });
    }

    // ソースの存在確認
    try {
      await fs.access(sourcePath);
    } catch {
      return NextResponse.json({ error: 'Source does not exist' }, { status: 404 });
    }

    // 移動先ディレクトリの存在確認
    try {
      const destDirStat = await fs.stat(destDir);
      if (!destDirStat.isDirectory()) {
        return NextResponse.json({ error: 'Destination is not a directory' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Destination directory does not exist' }, { status: 404 });
    }

    // 自分の子孫への移動を防止（フォルダの場合）
    const sourceStat = await fs.stat(sourcePath);
    if (sourceStat.isDirectory()) {
      const normalizedSource = path.normalize(sourcePath) + path.sep;
      const normalizedDest = path.normalize(destDir) + path.sep;
      if (normalizedDest.startsWith(normalizedSource)) {
        return NextResponse.json({ error: 'Cannot move a folder into its own descendant' }, { status: 400 });
      }
    }

    // 移動先に同名ファイル/フォルダが存在するかチェック
    try {
      await fs.access(destPath);
      return NextResponse.json({ error: 'Destination already exists' }, { status: 409 });
    } catch {
      // 存在しない場合は問題なし
    }

    // 移動実行
    await fs.rename(sourcePath, destPath);

    // 新しいパスを返す
    const newRelativePath = to ? `${to}/${fileName}` : fileName;
    return NextResponse.json({ success: true, newPath: newRelativePath });
  } catch (error) {
    console.error('Error moving file:', error);
    return NextResponse.json({ error: 'Failed to move file' }, { status: 500 });
  }
}
