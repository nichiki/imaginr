// Image API - Tauri専用
// Handles image download, save, list, and delete operations
// DB operations are handled via tauri-images.ts

import { getImagesPath, joinPath } from './tauri-utils';

// Re-export ImageInfo type (simple interface, no db dependency)
export interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
  deleted?: boolean;
  favorite?: boolean;
}

// Tauri API implementation - uses Tauri plugins directly
async function tauriList(includeDeleted = false): Promise<ImageInfo[]> {
  const dbImages = await import('./db/tauri-images');
  return dbImages.listImages(includeDeleted);
}

async function tauriSearch(query: string, includeDeleted = false): Promise<ImageInfo[]> {
  const dbImages = await import('./db/tauri-images');
  return dbImages.searchImages(query, includeDeleted);
}

async function tauriSave(imageUrl: string, prompt: string, workflowId?: string): Promise<ImageInfo> {
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
  const dbImages = await import('./db/tauri-images');

  // Ensure images directory exists
  const imagesDir = await getImagesPath();
  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
  }

  // Download image from ComfyUI
  const response = await tauriFetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' :
              contentType.includes('webp') ? 'webp' : 'png';

  const arrayBuffer = await response.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Generate filename
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const filename = `${timestamp}-${randomSuffix}.${ext}`;
  const id = `${timestamp}-${randomSuffix}`;
  const filePath = await joinPath(imagesDir, filename);

  // Save image file
  await writeFile(filePath, data);

  // Save metadata to DB
  const imageRecord = await dbImages.createImage({
    id,
    filename,
    promptYaml: prompt || '',
    workflowId,
    fileSize: data.length,
  });

  return {
    id: imageRecord.id,
    filename: imageRecord.filename,
    createdAt: imageRecord.created_at,
    prompt: imageRecord.prompt_yaml,
    deleted: !!imageRecord.deleted_at,
    favorite: imageRecord.favorite === 1,
  };
}

async function tauriDelete(filename: string, hard = false): Promise<void> {
  const dbImages = await import('./db/tauri-images');
  const id = filename.replace(/\.(png|jpg|jpeg|webp)$/, '');

  if (hard) {
    const { remove, exists } = await import('@tauri-apps/plugin-fs');
    const imagesDir = await getImagesPath();
    const filePath = await joinPath(imagesDir, filename);

    if (await exists(filePath)) {
      await remove(filePath);
    }

    const metaPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/, '.json');
    if (await exists(metaPath)) {
      await remove(metaPath);
    }

    await dbImages.hardDeleteImage(id);
  } else {
    await dbImages.deleteImage(id);
  }
}

async function tauriGetImagePath(filename: string): Promise<string> {
  const imagesDir = await getImagesPath();
  return joinPath(imagesDir, filename);
}

// Unified API object
export const imageAPI = {
  async list(includeDeleted = false): Promise<ImageInfo[]> {
    return tauriList(includeDeleted);
  },

  async save(imageUrl: string, prompt: string, workflowId?: string): Promise<ImageInfo> {
    return tauriSave(imageUrl, prompt, workflowId);
  },

  async delete(filename: string, hard = false): Promise<void> {
    return tauriDelete(filename, hard);
  },
};

// Helper to search images
export async function searchImagesByQuery(query: string, includeDeleted = false): Promise<ImageInfo[]> {
  return tauriSearch(query, includeDeleted);
}

// Helper to get image URL
export async function getImageDisplayUrl(filename: string): Promise<string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const imagePath = await tauriGetImagePath(filename);
  return convertFileSrc(imagePath);
}
