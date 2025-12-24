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

// Pagination types (re-exported for convenience)
export interface PaginationParams {
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// Detailed image info (includes all metadata)
export interface ImageDetail {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
  workflowId?: string;
  seed?: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
  parameters?: Record<string, unknown>;
  deleted?: boolean;
  favorite?: boolean;
}

// Tauri API implementation - uses Tauri plugins directly
async function tauriList(
  includeDeleted = false,
  pagination?: PaginationParams
): Promise<PaginatedResult<ImageInfo>> {
  const dbImages = await import('./db/tauri-images');
  return dbImages.listImages(includeDeleted, pagination);
}

async function tauriSearch(
  query: string,
  includeDeleted = false,
  pagination?: PaginationParams
): Promise<PaginatedResult<ImageInfo>> {
  const dbImages = await import('./db/tauri-images');
  return dbImages.searchImages(query, includeDeleted, pagination);
}

async function tauriBulkDelete(ids: string[]): Promise<number> {
  const dbImages = await import('./db/tauri-images');
  return dbImages.bulkDeleteImages(ids);
}

async function tauriGetDetail(id: string): Promise<ImageDetail | null> {
  const dbImages = await import('./db/tauri-images');
  const record = await dbImages.getImage(id);
  if (!record) return null;

  return {
    id: record.id,
    filename: record.filename,
    createdAt: record.created_at,
    prompt: record.prompt,
    workflowId: record.workflow_id || undefined,
    seed: record.seed || undefined,
    width: record.width || undefined,
    height: record.height || undefined,
    negativePrompt: record.negative_prompt || undefined,
    parameters: record.parameters ? JSON.parse(record.parameters) : undefined,
    deleted: !!record.deleted_at,
    favorite: record.favorite === 1,
  };
}

export interface SaveImageOptions {
  imageUrl: string;
  prompt: string;
  workflowId?: string;
  seed?: number;
  negativePrompt?: string;
  parameters?: Record<string, unknown>;
}

async function tauriSave(options: SaveImageOptions): Promise<ImageInfo> {
  const { imageUrl, prompt, workflowId, seed, negativePrompt, parameters } = options;
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
    prompt: prompt || '',
    workflowId,
    seed,
    fileSize: data.length,
    negativePrompt,
    parameters,
  });

  return {
    id: imageRecord.id,
    filename: imageRecord.filename,
    createdAt: imageRecord.created_at,
    prompt: imageRecord.prompt,
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
  async list(
    includeDeleted = false,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<ImageInfo>> {
    return tauriList(includeDeleted, pagination);
  },

  async getDetail(id: string): Promise<ImageDetail | null> {
    return tauriGetDetail(id);
  },

  async save(options: SaveImageOptions): Promise<ImageInfo> {
    return tauriSave(options);
  },

  async delete(filename: string, hard = false): Promise<void> {
    return tauriDelete(filename, hard);
  },

  async bulkDelete(ids: string[]): Promise<number> {
    return tauriBulkDelete(ids);
  },
};

// Helper to search images with pagination
export async function searchImagesByQuery(
  query: string,
  includeDeleted = false,
  pagination?: PaginationParams
): Promise<PaginatedResult<ImageInfo>> {
  return tauriSearch(query, includeDeleted, pagination);
}

// Helper to get image URL
export async function getImageDisplayUrl(filename: string): Promise<string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const imagePath = await tauriGetImagePath(filename);
  return convertFileSrc(imagePath);
}
