// Image API - Tauri / Web dual support
// Handles image download, save, list, and delete operations
// NOTE: This file is used in client components. DB operations for Tauri
// are handled via dynamic imports that only resolve at runtime in Tauri environment.

import { isTauri, getImagesPath, joinPath } from './tauri-utils';

// Re-export ImageInfo type (simple interface, no db dependency)
export interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
  deleted?: boolean;
  favorite?: boolean;
}

// Web API implementation - uses Next.js API routes
async function webList(includeDeleted = false): Promise<ImageInfo[]> {
  const res = await fetch(`/api/images${includeDeleted ? '?deleted=true' : ''}`);
  if (!res.ok) throw new Error('Failed to list images');
  const data = await res.json();
  return data.images;
}

async function webSearch(query: string, includeDeleted = false): Promise<ImageInfo[]> {
  const params = new URLSearchParams({ q: query });
  if (includeDeleted) params.set('deleted', 'true');
  const res = await fetch(`/api/images/search?${params}`);
  if (!res.ok) throw new Error('Failed to search images');
  const data = await res.json();
  return data.images;
}

async function webSave(imageUrl: string, prompt: string, workflowId?: string): Promise<ImageInfo> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, prompt, workflowId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to save image');
  }
  const data = await res.json();
  return data.image;
}

async function webDelete(filename: string, hard = false): Promise<void> {
  const params = new URLSearchParams({ filename });
  if (hard) params.set('hard', 'true');
  const res = await fetch(`/api/images?${params}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete image');
}

function webGetImageUrl(filename: string): string {
  return `/api/images/${encodeURIComponent(filename)}`;
}

// Tauri API implementation - uses Tauri plugins directly
// Uses tauri-images.ts which imports tauri-db.ts (no better-sqlite3 dependency)
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
  const { writeBinaryFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
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
  await writeBinaryFile(filePath, data);

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
    if (isTauri()) {
      return tauriList(includeDeleted);
    }
    return webList(includeDeleted);
  },

  async save(imageUrl: string, prompt: string, workflowId?: string): Promise<ImageInfo> {
    if (isTauri()) {
      return tauriSave(imageUrl, prompt, workflowId);
    }
    return webSave(imageUrl, prompt, workflowId);
  },

  async delete(filename: string, hard = false): Promise<void> {
    if (isTauri()) {
      return tauriDelete(filename, hard);
    }
    return webDelete(filename, hard);
  },

  getImageUrl(filename: string): string {
    return webGetImageUrl(filename);
  },
};

// Helper to search images - works in both environments
export async function searchImagesByQuery(query: string, includeDeleted = false): Promise<ImageInfo[]> {
  if (isTauri()) {
    return tauriSearch(query, includeDeleted);
  }
  return webSearch(query, includeDeleted);
}

// Helper to get image URL that works in both environments
export async function getImageDisplayUrl(filename: string): Promise<string> {
  if (isTauri()) {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const imagePath = await tauriGetImagePath(filename);
    return convertFileSrc(imagePath);
  }
  return webGetImageUrl(filename);
}
