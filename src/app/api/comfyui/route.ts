import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const COMFYUI_DIR = path.join(process.cwd(), 'data', 'comfyui');

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
