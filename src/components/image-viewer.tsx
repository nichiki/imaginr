'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Download, Copy, Check, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { getImageDisplayUrl } from '@/lib/image-api';
import { isTauri, getImagesPath, joinPath } from '@/lib/tauri-utils';

export interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
}

interface ImageViewerProps {
  image: ImageInfo | null;
  images: ImageInfo[];
  onClose: () => void;
  onNavigate: (image: ImageInfo) => void;
}

export function ImageViewer({ image, images, onClose, onNavigate }: ImageViewerProps) {
  const [copied, setCopied] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 画像URLを取得
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }

    let cancelled = false;
    getImageDisplayUrl(image.filename).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [image]);

  // プロンプトをコピー
  const copyPrompt = useCallback(async () => {
    if (!image?.prompt) return;
    try {
      await navigator.clipboard.writeText(image.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy prompt:', error);
    }
  }, [image]);

  // 画像ナビゲーション
  const navigateImage = useCallback((direction: 'prev' | 'next') => {
    if (!image || images.length === 0) return;
    const currentIndex = images.findIndex(img => img.id === image.id);
    if (currentIndex === -1) return;
    const newIndex = direction === 'prev'
      ? (currentIndex - 1 + images.length) % images.length
      : (currentIndex + 1) % images.length;
    onNavigate(images[newIndex]);
  }, [image, images, onNavigate]);

  // キーボードナビゲーション
  useEffect(() => {
    if (!image) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateImage('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateImage('next');
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, navigateImage, onClose]);

  const handleDownload = useCallback(async () => {
    if (!image) return;

    try {
      if (isTauri()) {
        // Tauri: use save dialog and copy file
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { copyFile } = await import('@tauri-apps/plugin-fs');

        const imagesDir = await getImagesPath();
        const sourcePath = await joinPath(imagesDir, image.filename);

        const destPath = await save({
          defaultPath: image.filename,
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });

        if (destPath) {
          await copyFile(sourcePath, destPath);
        }
      } else {
        // Web: fetch and download via blob
        const response = await fetch(`/api/images/${image.filename}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = image.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, [image]);

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="!w-[90vw] !max-w-[90vw] h-[90vh] p-0 bg-[#1e1e1e] border-[#333] overflow-hidden"
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>画像プレビュー</DialogTitle>
        </VisuallyHidden>
        {image && (
          <div className="flex flex-col h-full">
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-2 bg-[#252526] border-b border-[#333]">
              <div className="text-xs text-[#888]">
                {new Date(image.createdAt).toLocaleString('ja-JP')}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
                  onClick={handleDownload}
                  title="ダウンロード"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
                  onClick={onClose}
                  title="閉じる"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* コンテンツ（左：画像、右：プロンプト） */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* 左側：画像 */}
              <div className="relative flex-1 flex items-center justify-center bg-[#1e1e1e] border-r border-[#333] min-w-0 overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={image.id}
                    className="max-w-full max-h-[calc(90vh-60px)] object-contain"
                  />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
                )}
                {/* 左右ナビゲーション */}
                {images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 bg-black/50 hover:bg-[#555] text-white"
                      onClick={() => navigateImage('prev')}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 bg-black/50 hover:bg-[#555] text-white"
                      onClick={() => navigateImage('next')}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}
              </div>
              {/* 右側：プロンプト */}
              <div className="w-[350px] flex-shrink-0 flex flex-col bg-[#252526]">
                <div className="flex-1 overflow-auto p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#888]">プロンプト (YAML)</span>
                    {image.prompt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
                        onClick={copyPrompt}
                        title="コピー"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 mr-1 text-green-500" />
                            <span className="text-xs text-green-500">コピーしました</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            <span className="text-xs">コピー</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <pre className="text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
                    {image.prompt || '(プロンプトなし)'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
