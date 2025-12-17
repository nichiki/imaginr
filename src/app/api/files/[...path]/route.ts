import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// テンプレートディレクトリのパス（app/data/templates）
const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates');

// パスの安全性チェック（ディレクトリトラバーサル防止）
function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(TEMPLATES_DIR, filePath);
  return resolved.startsWith(TEMPLATES_DIR);
}

// GET /api/files/[...path] - ファイル内容読み込み
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fullPath = path.join(TEMPLATES_DIR, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

// PUT /api/files/[...path] - ファイル保存
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const { content } = await request.json();
    const fullPath = path.join(TEMPLATES_DIR, filePath);

    await fs.writeFile(fullPath, content, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing file:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}

// POST /api/files/[...path] - 新規ファイル作成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const { content = '' } = await request.json();
    const fullPath = path.join(TEMPLATES_DIR, filePath);

    // 親ディレクトリが存在しない場合は作成
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // ファイルが既に存在する場合はエラー
    try {
      await fs.access(fullPath);
      return NextResponse.json({ error: 'File already exists' }, { status: 409 });
    } catch {
      // ファイルが存在しない場合は作成
    }

    await fs.writeFile(fullPath, content, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating file:', error);
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }
}

// DELETE /api/files/[...path] - ファイル/フォルダ削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fullPath = path.join(TEMPLATES_DIR, filePath);

    // ファイルかフォルダかを判定
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      // フォルダの場合は再帰的に削除
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}

// PATCH /api/files/[...path] - フォルダ作成
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const folderPath = pathSegments.join('/');

    if (!isPathSafe(folderPath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fullPath = path.join(TEMPLATES_DIR, folderPath);

    // フォルダが既に存在する場合はエラー
    try {
      await fs.access(fullPath);
      return NextResponse.json({ error: 'Folder already exists' }, { status: 409 });
    } catch {
      // フォルダが存在しない場合は作成
    }

    await fs.mkdir(fullPath, { recursive: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
