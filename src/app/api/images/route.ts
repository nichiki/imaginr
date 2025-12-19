import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

// ディレクトリが存在しなければ作成
async function ensureDir() {
  try {
    await fs.access(IMAGES_DIR);
  } catch {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  }
}

export interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
}

// 画像一覧を取得
export async function GET() {
  try {
    await ensureDir();
    const files = await fs.readdir(IMAGES_DIR);

    const images: ImageInfo[] = [];
    for (const file of files) {
      if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg') && !file.endsWith('.webp')) {
        continue;
      }

      const filePath = path.join(IMAGES_DIR, file);
      const stats = await fs.stat(filePath);

      // メタデータファイルがあれば読み込む
      let prompt: string | undefined;
      const metaPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/, '.json');
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        prompt = meta.prompt;
      } catch {
        // メタデータがなければスキップ
      }

      images.push({
        id: file.replace(/\.(png|jpg|jpeg|webp)$/, ''),
        filename: file,
        createdAt: stats.mtime.toISOString(),
        prompt,
      });
    }

    // 新しい順にソート
    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ images });
  } catch (error) {
    console.error('Failed to list images:', error);
    return NextResponse.json({ error: 'Failed to list images' }, { status: 500 });
  }
}

// ComfyUIから画像をダウンロードして保存
export async function POST(request: NextRequest) {
  try {
    await ensureDir();

    const { imageUrl, prompt } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    // ComfyUIから画像をダウンロード
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' :
                contentType.includes('webp') ? 'webp' : 'png';

    const buffer = Buffer.from(await response.arrayBuffer());

    // ファイル名を生成（タイムスタンプベース）
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const filename = `${timestamp}-${randomSuffix}.${ext}`;
    const filePath = path.join(IMAGES_DIR, filename);

    // 画像を保存
    await fs.writeFile(filePath, buffer);

    // メタデータを保存
    if (prompt) {
      const metaPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/, '.json');
      await fs.writeFile(metaPath, JSON.stringify({ prompt, createdAt: new Date().toISOString() }, null, 2));
    }

    return NextResponse.json({
      success: true,
      image: {
        id: filename.replace(/\.(png|jpg|jpeg|webp)$/, ''),
        filename,
        createdAt: new Date().toISOString(),
        prompt,
      },
    });
  } catch (error) {
    console.error('Failed to save image:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save image' },
      { status: 500 }
    );
  }
}

// 画像を削除
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }

  try {
    const filePath = path.join(IMAGES_DIR, filename);

    // セキュリティ: ディレクトリトラバーサル防止
    if (!filePath.startsWith(IMAGES_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // 画像を削除
    await fs.unlink(filePath);

    // メタデータも削除（存在すれば）
    const metaPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/, '.json');
    try {
      await fs.unlink(metaPath);
    } catch {
      // メタデータがなければ無視
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
