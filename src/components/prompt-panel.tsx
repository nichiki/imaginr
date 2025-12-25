'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle, Loader2, X, Sparkles, Search, Settings, ArrowDown, ArrowUp, CheckSquare, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ImageGallery } from './image-gallery';
import { ImageViewer, type ImageInfo } from './image-viewer';
import { imageAPI, searchImagesByQuery, type PaginationParams } from '@/lib/image-api';

const PAGE_SIZE = 50;

export type PromptTab = 'prompt' | 'gallery';
export type PromptSubTab = 'yaml' | 'enhanced';

// YAMLのnegativeセクションを赤くハイライトするコンポーネント
function YamlHighlight({ yaml, emptyText }: { yaml: string; emptyText: string }) {
  if (!yaml) {
    return <span className="text-[#888]">{emptyText}</span>;
  }

  // negativeセクションを検出して分割
  // パターン: 行頭の "negative:" から、次の行頭のトップレベルキー（インデントなしでアルファベット始まり）まで
  // 1行形式: negative: hogehoge
  // 複数行形式: negative:\n  - hogehoge\n  - fugafuga
  const negativePattern = /^negative:.*(?:\n(?:[ \t].*|$))*/gm;
  const parts: { text: string; isNegative: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = negativePattern.exec(yaml)) !== null) {
    // negativeの前の部分
    if (match.index > lastIndex) {
      parts.push({ text: yaml.slice(lastIndex, match.index), isNegative: false });
    }
    // negativeセクション
    parts.push({ text: match[0], isNegative: true });
    lastIndex = match.index + match[0].length;
  }

  // 残りの部分
  if (lastIndex < yaml.length) {
    parts.push({ text: yaml.slice(lastIndex), isNegative: false });
  }

  // パーツがない場合は全体を通常表示
  if (parts.length === 0) {
    return <span className="text-[#d4d4d4]">{yaml}</span>;
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className={part.isNegative ? 'text-red-400/80' : 'text-[#d4d4d4]'}>
          {part.text}
        </span>
      ))}
    </>
  );
}

interface PromptPanelProps {
  // タブ状態（親で制御）
  activeTab: PromptTab;
  onActiveTabChange: (tab: PromptTab) => void;
  promptSubTab: PromptSubTab;
  onPromptSubTabChange: (subTab: PromptSubTab) => void;

  // 現在のファイル名（分割ビュー時の表示用）
  currentFileName?: string;

  // Raw（Merged YAML）
  mergedYaml: string;
  isYamlValid: boolean;

  // Enhanced
  enhancedPrompt: string;
  onEnhancedPromptChange: (prompt: string) => void;
  isEnhancing: boolean;
  enhanceError: string | null;
  onClearEnhanceError: () => void;

  // ギャラリー用
  comfyEnabled: boolean;
  isGenerating: boolean;
}

export function PromptPanel({
  activeTab,
  onActiveTabChange,
  promptSubTab,
  onPromptSubTabChange,
  currentFileName,
  mergedYaml,
  isYamlValid,
  enhancedPrompt,
  onEnhancedPromptChange,
  isEnhancing,
  enhanceError,
  onClearEnhanceError,
  comfyEnabled,
  isGenerating,
}: PromptPanelProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // 画像ギャラリー
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // 選択モード
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // 画像一覧を読み込む（ページネーション対応）
  const loadImages = useCallback(async (query?: string, append = false, offset = 0) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingImages(true);
    }
    try {
      const pagination: PaginationParams = {
        limit: PAGE_SIZE,
        offset,
        sortOrder,
      };

      const result = query
        ? await searchImagesByQuery(query, false, pagination)
        : await imageAPI.list(false, pagination);

      if (append) {
        setImages((prev) => [...prev, ...result.items]);
      } else {
        setImages(result.items);
      }
      setTotalImages(result.total);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoadingImages(false);
      }
    }
  }, [sortOrder]);

  // 追加読み込み
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    loadImages(searchQuery || undefined, true, images.length);
  }, [isLoadingMore, hasMore, loadImages, searchQuery, images.length]);

  // 初回読み込み
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // 検索クエリ変更時のデバウンス検索（リセット）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadImages(searchQuery || undefined, false, 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadImages]);

  // ソート変更時のリセット
  useEffect(() => {
    loadImages(searchQuery || undefined, false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  // 生成後に最新を先頭に再読み込み
  const prevIsGenerating = useRef(isGenerating);
  useEffect(() => {
    if (prevIsGenerating.current && !isGenerating) {
      // 生成完了時: 新しい順の場合は最新を取得
      if (sortOrder === 'desc') {
        loadImages(searchQuery || undefined, false, 0);
      }
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, loadImages, searchQuery, sortOrder]);

  // コピー
  const copyToClipboard = useCallback(async () => {
    let text = '';
    if (activeTab === 'prompt') {
      text = promptSubTab === 'enhanced' && enhancedPrompt ? enhancedPrompt : mergedYaml;
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [activeTab, promptSubTab, mergedYaml, enhancedPrompt]);

  // 画像削除
  const handleDeleteImage = useCallback(async (image: ImageInfo) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(t('dialog.confirmDeleteImage'))) return;

    try {
      await imageAPI.delete(image.filename);
      setImages((prev) => prev.filter((img) => img.id !== image.id));
      setTotalImages((prev) => prev - 1);
      if (selectedImage?.id === image.id) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  }, [selectedImage, t]);

  // 選択トグル（Shift+クリック対応）
  const handleToggleSelect = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && lastSelectedId) {
      // Shift+クリック: 範囲選択
      const lastIndex = images.findIndex((img) => img.id === lastSelectedId);
      const currentIndex = images.findIndex((img) => img.id === id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = images.slice(start, end + 1).map((img) => img.id);
        setSelectedIds((prev) => {
          const newSet = new Set(prev);
          rangeIds.forEach((rid) => newSet.add(rid));
          return newSet;
        });
      }
    } else {
      // 通常クリック: トグル
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    }
    setLastSelectedId(id);
  }, [lastSelectedId, images]);

  // 全選択
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(images.map((img) => img.id)));
  }, [images]);

  // 選択解除
  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 一括削除
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(t('dialog.confirmDelete'))) return;

    try {
      const idsToDelete = Array.from(selectedIds);
      await imageAPI.bulkDelete(idsToDelete);
      setImages((prev) => prev.filter((img) => !selectedIds.has(img.id)));
      setTotalImages((prev) => prev - selectedIds.size);
      setSelectedIds(new Set());
      setIsSelectMode(false);
      if (selectedImage && selectedIds.has(selectedImage.id)) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Failed to bulk delete images:', error);
    }
  }, [selectedIds, selectedImage, t]);

  // 選択モード終了時にリセット
  const handleExitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const canCopy = activeTab === 'prompt' &&
    (promptSubTab === 'enhanced' ? !!enhancedPrompt : (promptSubTab === 'yaml' && isYamlValid && !!mergedYaml));

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as PromptTab)} className="flex flex-col h-full">
        {/* Header */}
        <div className="h-11 px-3 flex items-center justify-between border-b border-[#333] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-[#888] font-medium">
              {activeTab === 'prompt' ? t('prompt.tab') : t('prompt.galleryTab')}
            </span>
            {activeTab === 'prompt' && currentFileName && (
              <span className="text-xs text-[#569cd6] truncate max-w-[200px]" title={currentFileName}>
                {currentFileName}
              </span>
            )}
            {activeTab === 'prompt' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#094771] disabled:opacity-50"
                onClick={copyToClipboard}
                disabled={!canCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                    <span className="text-xs">{t('common.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    <span className="text-xs">{t('common.copy')}</span>
                  </>
                )}
              </Button>
            )}
            {/* 検索バー・ソート・選択ボタン（Galleryタブ選択時のみ） */}
            {activeTab === 'gallery' && comfyEnabled && (
              <>
                <div className="relative ml-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#888]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.search')}
                    className="w-40 pl-7 pr-6 h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4] placeholder:text-[#888]"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 p-0 text-[#888] hover:text-white"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {/* ソートボタン */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
                  onClick={() => setSortOrder((prev) => prev === 'desc' ? 'asc' : 'desc')}
                  title={sortOrder === 'desc' ? t('gallery.sortNewest') : t('gallery.sortOldest')}
                >
                  {sortOrder === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </Button>
                {/* 選択ボタン */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 ${isSelectMode ? 'text-[#0e639c] bg-[#0e639c]/20' : 'text-[#888]'} hover:text-white hover:bg-[#3c3c3c]`}
                  onClick={() => isSelectMode ? handleExitSelectMode() : setIsSelectMode(true)}
                  title={t('gallery.selectionMode')}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <TabsList className="h-7 bg-[#3c3c3c]">
            <TabsTrigger value="prompt" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              {t('prompt.tab')}
            </TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              {t('prompt.galleryTab')}
              {totalImages > 0 && (
                <span className="ml-1 text-[10px] text-[#888]">({totalImages})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Prompt Tab */}
        <TabsContent value="prompt" className="flex-1 m-0 overflow-hidden flex flex-col">
          {/* サブタブ */}
          <div className="px-3 py-2 bg-[#2d2d2d] border-b border-[#333] flex items-center gap-2">
            <button
              onClick={() => onPromptSubTabChange('yaml')}
              className={`text-xs px-2 py-1 rounded ${
                promptSubTab === 'yaml'
                  ? 'bg-[#094771] text-white'
                  : 'text-[#888] hover:text-[#d4d4d4]'
              }`}
            >
              YAML
            </button>
            <button
              onClick={() => onPromptSubTabChange('enhanced')}
              className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                promptSubTab === 'enhanced'
                  ? 'bg-[#094771] text-white'
                  : 'text-[#888] hover:text-[#d4d4d4]'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {t('prompt.enhancedLabel')}
              {isEnhancing && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-auto">
            {promptSubTab === 'yaml' ? (
              !isYamlValid ? (
                <div className="p-4 flex items-center gap-2 text-yellow-500 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{t('prompt.yamlParseError')}</span>
                </div>
              ) : (
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
                  <YamlHighlight yaml={mergedYaml} emptyText={t('prompt.enterYaml')} />
                </pre>
              )
            ) : (
              <div className="h-full flex flex-col overflow-hidden">
                {enhanceError && (
                  <div className="p-3 bg-red-900/30 border-b border-red-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-400 flex-1">{enhanceError}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-red-400 hover:text-red-300"
                      onClick={onClearEnhanceError}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 p-3 overflow-hidden">
                  <Textarea
                    value={enhancedPrompt}
                    onChange={(e) => onEnhancedPromptChange(e.target.value)}
                    placeholder={isEnhancing ? t('generation.enhancing') : t('prompt.useEnhanceButton')}
                    className="h-full w-full bg-[#1e1e1e] border-[#333] text-[#d4d4d4] text-xs font-mono resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Gallery Tab */}
        <TabsContent value="gallery" className="flex-1 m-0 overflow-hidden relative flex flex-col">
          {!comfyEnabled ? (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
              <Settings className="h-8 w-8" />
              <span className="text-sm">{t('prompt.comfyuiNotConfigured')}</span>
            </div>
          ) : (
            <>
              {/* 選択モード操作バー */}
              {isSelectMode && (
                <div className="flex-shrink-0 px-3 py-2 bg-[#0e639c]/20 border-b border-[#0e639c]/40 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-[#0e639c]" />
                  <span className="text-xs text-[#d4d4d4]">
                    {t('common.selected', { count: selectedIds.size })}
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c]"
                    onClick={handleSelectAll}
                  >
                    {t('common.selectAll')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c]"
                    onClick={handleDeselectAll}
                    disabled={selectedIds.size === 0}
                  >
                    {t('common.deselectAll')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30"
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {t('common.delete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
                    onClick={handleExitSelectMode}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <ImageGallery
                  images={images}
                  isLoading={isLoadingImages}
                  searchQuery={searchQuery}
                  onSelectImage={setSelectedImage}
                  onDeleteImage={handleDeleteImage}
                  onLoadMore={handleLoadMore}
                  isLoadingMore={isLoadingMore}
                  hasMore={hasMore}
                  isSelectMode={isSelectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                />
              </div>

              {/* 生成中オーバーレイ */}
              {isGenerating && (
                <div className="absolute inset-0 bg-[#252526]/90 flex flex-col items-center justify-center gap-3 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
                  <span className="text-sm text-[#888]">{t('generation.generating')}</span>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* 画像拡大ダイアログ */}
      <ImageViewer
        image={selectedImage}
        images={images}
        onClose={() => setSelectedImage(null)}
        onNavigate={setSelectedImage}
      />
    </div>
  );
}
