import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

// 画像ファイルを配信
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  try {
    const filePath = path.join(IMAGES_DIR, filename);

    // セキュリティ: ディレクトリトラバーサル防止
    if (!filePath.startsWith(IMAGES_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const buffer = await fs.readFile(filePath);

    // Content-Typeを決定
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.webp' ? 'image/webp' :
      ext === '.gif' ? 'image/gif' :
      'image/png';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to serve image:', error);
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
