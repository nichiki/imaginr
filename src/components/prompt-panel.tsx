'use client';

import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle, Loader2, X, Sparkles, Search, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ImageGallery } from './image-gallery';
import { ImageViewer, type ImageInfo } from './image-viewer';
import { imageAPI, searchImagesByQuery } from '@/lib/image-api';

export type PromptTab = 'prompt' | 'gallery';
export type PromptSubTab = 'yaml' | 'enhanced';

// YAMLのnegativeセクションを赤くハイライトするコンポーネント
function YamlHighlight({ yaml }: { yaml: string }) {
  if (!yaml) {
    return <span className="text-[#888]">(YAMLを入力してください)</span>;
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
  const [copied, setCopied] = useState(false);

  // 画像ギャラリー
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 画像一覧を読み込む（検索クエリ対応）
  const loadImages = useCallback(async (query?: string) => {
    setIsLoadingImages(true);
    try {
      if (query) {
        const results = await searchImagesByQuery(query);
        setImages(results);
      } else {
        const results = await imageAPI.list();
        setImages(results);
      }
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setIsLoadingImages(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // 検索クエリ変更時のデバウンス検索
  useEffect(() => {
    const timer = setTimeout(() => {
      loadImages(searchQuery || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadImages]);

  // 生成後に画像を再読み込み
  useEffect(() => {
    if (!isGenerating) {
      loadImages(searchQuery || undefined);
    }
  }, [isGenerating, loadImages, searchQuery]);

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
    if (!await showConfirm('この画像を削除しますか？')) return;

    try {
      await imageAPI.delete(image.filename);
      setImages((prev) => prev.filter((img) => img.id !== image.id));
      if (selectedImage?.id === image.id) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  }, [selectedImage]);

  const canCopy = activeTab === 'prompt' &&
    (promptSubTab === 'enhanced' ? !!enhancedPrompt : (promptSubTab === 'yaml' && isYamlValid && !!mergedYaml));

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as PromptTab)} className="flex flex-col h-full">
        {/* Header */}
        <div className="h-11 px-3 flex items-center justify-between border-b border-[#333] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-[#888] font-medium">
              {activeTab === 'prompt' ? 'Prompt' : 'Gallery'}
            </span>
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
                    <span className="text-xs">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    <span className="text-xs">Copy</span>
                  </>
                )}
              </Button>
            )}
            {/* 検索バー（Galleryタブ選択時のみ） */}
            {activeTab === 'gallery' && comfyEnabled && (
              <div className="relative ml-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#888]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className="w-48 pl-7 pr-6 h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4] placeholder:text-[#888]"
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
            )}
          </div>
          <TabsList className="h-7 bg-[#3c3c3c]">
            <TabsTrigger value="prompt" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Prompt
            </TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Gallery
              {images.length > 0 && (
                <span className="ml-1 text-[10px] text-[#888]">({images.length})</span>
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
              Enhanced
              {isEnhancing && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-auto">
            {promptSubTab === 'yaml' ? (
              !isYamlValid ? (
                <div className="p-4 flex items-center gap-2 text-yellow-500 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>YAML parse error - 構文を確認してください</span>
                </div>
              ) : (
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
                  <YamlHighlight yaml={mergedYaml} />
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
                    placeholder={isEnhancing ? 'Enhancing...' : 'Use "Enhance" button in Generate panel'}
                    className="h-full w-full bg-[#1e1e1e] border-[#333] text-[#d4d4d4] text-xs font-mono resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Gallery Tab */}
        <TabsContent value="gallery" className="flex-1 m-0 overflow-hidden relative">
          {!comfyEnabled ? (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
              <Settings className="h-8 w-8" />
              <span className="text-sm">ComfyUIが設定されていません</span>
              <span className="text-xs">設定から有効にしてください</span>
            </div>
          ) : (
            <>
              <div className="h-full overflow-auto">
                <ImageGallery
                  images={images}
                  isLoading={isLoadingImages}
                  searchQuery={searchQuery}
                  onSelectImage={setSelectedImage}
                  onDeleteImage={handleDeleteImage}
                />
              </div>

              {/* 生成中オーバーレイ */}
              {isGenerating && (
                <div className="absolute inset-0 bg-[#252526]/90 flex flex-col items-center justify-center gap-3 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
                  <span className="text-sm text-[#888]">Generating...</span>
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
