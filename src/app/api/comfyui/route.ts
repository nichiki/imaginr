import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const COMFYUI_DIR = path.join(process.cwd(), 'data', 'comfyui');

// ディレクトリが存在しなければ作成
async function ensureDir() {
  try {
    await fs.access(COMFYUI_DIR);
  } catch {
    await fs.mkdir(COMFYUI_DIR, { recursive: true });
  }
}

// ワークフロー一覧 or 特定のワークフローを取得
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const file = searchParams.get('file');

  try {
    // 特定のワークフローを取得
    if (file) {
      const filePath = path.join(COMFYUI_DIR, file);

      // セキュリティ: ディレクトリトラバーサル防止
      if (!filePath.startsWith(COMFYUI_DIR)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const workflow = JSON.parse(content);
      return NextResponse.json({ workflow });
    }

    // ワークフロー一覧を取得
    try {
      const files = await fs.readdir(COMFYUI_DIR);
      const workflows = files
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          label: f.replace('.json', ''),
        }));
      return NextResponse.json({ workflows });
    } catch {
      // ディレクトリがなければ空配列
      return NextResponse.json({ workflows: [] });
    }
  } catch (error) {
    console.error('Failed to read workflow:', error);
    return NextResponse.json(
      { error: 'Failed to read workflow' },
      { status: 500 }
    );
  }
}

// ワークフローをアップロード
export async function POST(request: NextRequest) {
  try {
    await ensureDir();

    const { name, content } = await request.json();

    if (!name || !content) {
      return NextResponse.json(
        { error: 'Name and content are required' },
        { status: 400 }
      );
    }

    // ファイル名のバリデーション
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = safeName.endsWith('.json') ? safeName : `${safeName}.json`;
    const filePath = path.join(COMFYUI_DIR, fileName);

    // セキュリティ: ディレクトリトラバーサル防止
    if (!filePath.startsWith(COMFYUI_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // JSONとして保存（整形）
    const jsonContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf-8');

    return NextResponse.json({ success: true, fileName });
  } catch (error) {
    console.error('Failed to save workflow:', error);
    return NextResponse.json(
      { error: 'Failed to save workflow' },
      { status: 500 }
    );
  }
}

// ワークフローを削除
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const file = searchParams.get('file');

  if (!file) {
    return NextResponse.json({ error: 'File name is required' }, { status: 400 });
  }

  try {
    const filePath = path.join(COMFYUI_DIR, file);

    // セキュリティ: ディレクトリトラバーサル防止
    if (!filePath.startsWith(COMFYUI_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workflow:', error);
    return NextResponse.json(
      { error: 'Failed to delete workflow' },
      { status: 500 }
    );
  }
}
