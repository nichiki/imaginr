import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createImage, listImages, deleteImage, type ImageInfo } from '@/lib/db/images';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

// ディレクトリが存在しなければ作成
async function ensureDir() {
  try {
    await fs.access(IMAGES_DIR);
  } catch {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  }
}

// Re-export ImageInfo type for compatibility
export type { ImageInfo };

// 画像一覧を取得
export async function GET(request: NextRequest) {
  try {
    await ensureDir();

    const searchParams = request.nextUrl.searchParams;
    const includeDeleted = searchParams.get('deleted') === 'true';

    const images = listImages(includeDeleted);

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

    const { imageUrl, prompt, workflowId } = await request.json();

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
    const id = `${timestamp}-${randomSuffix}`;
    const filePath = path.join(IMAGES_DIR, filename);

    // 画像を保存
    await fs.writeFile(filePath, buffer);

    // DBにメタデータを保存
    const imageRecord = createImage({
      id,
      filename,
      promptYaml: prompt || '',
      workflowId,
      fileSize: buffer.length,
    });

    return NextResponse.json({
      success: true,
      image: {
        id: imageRecord.id,
        filename: imageRecord.filename,
        createdAt: imageRecord.created_at,
        prompt: imageRecord.prompt_yaml,
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

// 画像を削除（論理削除）
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filename = searchParams.get('filename');
  const hardDelete = searchParams.get('hard') === 'true';

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }

  try {
    const filePath = path.join(IMAGES_DIR, filename);

    // セキュリティ: ディレクトリトラバーサル防止
    if (!filePath.startsWith(IMAGES_DIR)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const id = filename.replace(/\.(png|jpg|jpeg|webp)$/, '');

    if (hardDelete) {
      // 物理削除：ファイルも削除
      try {
        await fs.unlink(filePath);
      } catch {
        // ファイルがなくてもDB上は削除
      }

      // メタデータJSONも削除（レガシー対応）
      const metaPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/, '.json');
      try {
        await fs.unlink(metaPath);
      } catch {
        // メタデータがなければ無視
      }
    }

    // DBから削除（論理削除）
    deleteImage(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
