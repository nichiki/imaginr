'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Loader2, Play, Search } from 'lucide-react';
import { type ImageInfo } from './image-viewer';
import { getImageDisplayUrl } from '@/lib/image-api';

interface ImageGalleryProps {
  images: ImageInfo[];
  isLoading: boolean;
  searchQuery: string;
  onSelectImage: (image: ImageInfo) => void;
  onDeleteImage: (image: ImageInfo) => void;
  // Pagination
  onLoadMore: () => void;
  isLoadingMore: boolean;
  hasMore: boolean;
  // Selection
  isSelectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
}

// Component for a single image with resolved URL
function ImageThumbnail({
  image,
  onSelect,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: {
  image: ImageInfo;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (shiftKey: boolean) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImageDisplayUrl(image.filename).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [image.filename]);

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectMode) {
      onToggleSelect(e.shiftKey);
    } else {
      onSelect();
    }
  };

  if (!imageUrl) {
    return (
      <div className="aspect-square bg-[#1e1e1e] rounded overflow-hidden flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-[#888]" />
      </div>
    );
  }

  return (
    <div
      className={`relative group cursor-pointer aspect-square bg-[#1e1e1e] rounded overflow-hidden ${
        isSelected ? 'ring-2 ring-[#0e639c]' : ''
      }`}
      onClick={handleClick}
    >
      <img
        src={imageUrl}
        alt={image.id}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className={`absolute inset-0 transition-colors ${
        isSelected ? 'bg-[#0e639c]/30' : 'bg-black/0 group-hover:bg-black/40'
      }`} />
      {/* Selection checkbox */}
      {isSelectMode && (
        <div
          className="absolute top-1 left-1 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
        >
          <Checkbox
            checked={isSelected}
            className="h-5 w-5 border-2 border-white bg-black/50 data-[state=checked]:bg-[#0e639c] data-[state=checked]:border-[#0e639c]"
          />
        </div>
      )}
      {/* Delete button (only in non-select mode) */}
      {!isSelectMode && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-600 text-white"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function ImageGallery({
  images,
  isLoading,
  searchQuery,
  onSelectImage,
  onDeleteImage,
  onLoadMore,
  isLoadingMore,
  hasMore,
  isSelectMode,
  selectedIds,
  onToggleSelect,
}: ImageGalleryProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleDelete = (image: ImageInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteImage(image);
  };

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when user is within 200px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      onLoadMore();
    }
  }, [isLoadingMore, hasMore, onLoadMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto">
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
          <>
            <div className="p-2 grid grid-cols-6 gap-2">
              {images.map((image) => (
                <ImageThumbnail
                  key={image.id}
                  image={image}
                  onSelect={() => onSelectImage(image)}
                  onDelete={(e) => handleDelete(image, e)}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(image.id)}
                  onToggleSelect={(shiftKey) => onToggleSelect(image.id, shiftKey)}
                />
              ))}
            </div>
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="p-4 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#888]" />
              </div>
            )}
            {/* End of list indicator */}
            {!hasMore && images.length > 0 && (
              <div className="p-3 text-center text-xs text-[#666]">
                — すべて表示しました —
              </div>
            )}
          </>
        )}
    </div>
  );
}
