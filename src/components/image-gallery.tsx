'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Play, Search } from 'lucide-react';
import { type ImageInfo } from './image-viewer';
import { getImageDisplayUrl } from '@/lib/image-api';

interface ImageGalleryProps {
  images: ImageInfo[];
  isLoading: boolean;
  searchQuery: string;
  onSelectImage: (image: ImageInfo) => void;
  onDeleteImage: (image: ImageInfo) => void;
}

// Component for a single image with resolved URL
function ImageThumbnail({
  image,
  onSelect,
  onDelete,
}: {
  image: ImageInfo;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImageDisplayUrl(image.filename).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [image.filename]);

  if (!imageUrl) {
    return (
      <div className="aspect-square bg-[#1e1e1e] rounded overflow-hidden flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-[#888]" />
      </div>
    );
  }

  return (
    <div
      className="relative group cursor-pointer aspect-square bg-[#1e1e1e] rounded overflow-hidden"
      onClick={onSelect}
    >
      <img
        src={imageUrl}
        alt={image.id}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-600 text-white"
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function ImageGallery({
  images,
  isLoading,
  searchQuery,
  onSelectImage,
  onDeleteImage,
}: ImageGalleryProps) {
  const handleDelete = (image: ImageInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteImage(image);
  };

  return (
    <div className="h-full overflow-auto">
        {/* 初回ロード時のみスピナー表示（検索中は結果を維持してちらつき防止） */}
        {isLoading && images.length === 0 ? (
          <div className="p-4 flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-[#888]" />
          </div>
        ) : images.length === 0 ? (
          <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
            {searchQuery ? (
              <>
                <Search className="h-8 w-8" />
                <span className="text-sm">検索結果がありません</span>
              </>
            ) : (
              <>
                <Play className="h-8 w-8" />
                <span className="text-sm">「生成」ボタンで画像を生成</span>
              </>
            )}
          </div>
        ) : (
          <div className="p-2 grid grid-cols-6 gap-2">
            {images.map((image) => (
              <ImageThumbnail
                key={image.id}
                image={image}
                onSelect={() => onSelectImage(image)}
                onDelete={(e) => handleDelete(image, e)}
              />
            ))}
          </div>
        )}
    </div>
  );
}
