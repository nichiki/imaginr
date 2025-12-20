'use client';

import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Copy, Check, AlertCircle, Play, Loader2, Settings, Trash2, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchComfyUISettings, loadComfyUISettings, getActiveWorkflow, type ComfyUISettings } from '@/lib/storage';
import { ComfyUIClient, type GenerationProgress } from '@/lib/comfyui-api';

interface ImageInfo {
  id: string;
  filename: string;
  createdAt: string;
  prompt?: string;
}

interface PreviewPanelProps {
  mergedYaml: string;
  promptText: string;
  lookName?: string;
  isYamlValid?: boolean;
  onOpenSettings?: () => void;
}

export function PreviewPanel({
  mergedYaml,
  promptText,
  isYamlValid = true,
  onOpenSettings,
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'merged' | 'prompt' | 'image'>('merged');
  const [copied, setCopied] = useState(false);
  const [comfySettings, setComfySettings] = useState<ComfyUISettings | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 画像ギャラリー
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  // 画像ナビゲーション
  const navigateImage = useCallback((direction: 'prev' | 'next') => {
    if (!selectedImage || images.length === 0) return;
    const currentIndex = images.findIndex(img => img.id === selectedImage.id);
    if (currentIndex === -1) return;
    const newIndex = direction === 'prev'
      ? (currentIndex - 1 + images.length) % images.length
      : (currentIndex + 1) % images.length;
    setSelectedImage(images[newIndex]);
  }, [selectedImage, images]);

  // キーボードナビゲーション（拡大表示中のみ）
  useEffect(() => {
    if (!selectedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateImage('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateImage('next');
      } else if (e.key === 'Escape') {
        setSelectedImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, navigateImage]);

  // 設定を読み込む
  useEffect(() => {
    // Start with localStorage cache, then fetch from server
    setComfySettings(loadComfyUISettings());
    fetchComfyUISettings().then(setComfySettings);
  }, []);

  // 画像一覧を読み込む
  const loadImages = useCallback(async () => {
    setIsLoadingImages(true);
    try {
      const response = await fetch('/api/images');
      if (response.ok) {
        const data = await response.json();
        setImages(data.images || []);
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

  const copyToClipboard = useCallback(async () => {
    const text = activeTab === 'merged' ? mergedYaml : promptText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [activeTab, mergedYaml, promptText]);

  const handleGenerate = useCallback(async () => {
    if (!comfySettings?.enabled || !mergedYaml) return;

    const activeWorkflow = getActiveWorkflow(comfySettings);
    if (!activeWorkflow) {
      setGenerationError('ワークフローが選択されていません');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setActiveTab('image');

    try {
      // ワークフローを取得
      const response = await fetch(`/api/comfyui?file=${encodeURIComponent(activeWorkflow.file)}`);
      if (!response.ok) {
        throw new Error('Failed to load workflow');
      }
      const { workflow } = await response.json();

      // 生成（マージ済みYAMLを送信）
      const client = new ComfyUIClient(comfySettings.url);
      const result = await client.generate(
        workflow,
        mergedYaml,
        activeWorkflow.promptNodeId,
        activeWorkflow.samplerNodeId,
        activeWorkflow.overrides,
        (progress) => setGenerationProgress(progress)
      );

      console.log('Generation result:', result);

      if (result.success && result.images.length > 0) {
        console.log('Saving images:', result.images);
        // 生成された画像をローカルに保存
        for (const imageUrl of result.images) {
          try {
            console.log('Saving image from:', imageUrl);
            const saveResponse = await fetch('/api/images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl,
                prompt: mergedYaml,
              }),
            });
            if (!saveResponse.ok) {
              const errorText = await saveResponse.text();
              console.error('Failed to save image:', errorText);
            } else {
              console.log('Image saved successfully');
            }
          } catch (e) {
            console.error('Failed to save image:', e);
          }
        }
        // 画像一覧を再読み込み
        await loadImages();
      } else if (!result.success) {
        console.error('Generation failed:', result.error);
        setGenerationError(result.error || 'Generation failed');
      } else {
        console.warn('Generation succeeded but no images returned');
        setGenerationError('No images returned from ComfyUI');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  }, [comfySettings, mergedYaml, loadImages]);

  const handleDeleteImage = useCallback(async (image: ImageInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('この画像を削除しますか？')) return;

    try {
      const response = await fetch(`/api/images?filename=${encodeURIComponent(image.filename)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setImages((prev) => prev.filter((img) => img.id !== image.id));
        if (selectedImage?.id === image.id) {
          setSelectedImage(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  }, [selectedImage]);

  const handleDownloadImage = useCallback(async (image: ImageInfo) => {
    try {
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
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, []);

  const canCopy = activeTab === 'merged' ? (isYamlValid && !!mergedYaml) : (activeTab === 'prompt' && !!promptText);
  const activeWorkflowForCheck = comfySettings ? getActiveWorkflow(comfySettings) : null;
  const canGenerate = comfySettings?.enabled && !!activeWorkflowForCheck && !!mergedYaml && !isGenerating;

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'merged' | 'prompt' | 'image')} className="flex flex-col h-full">
        <div className="h-11 px-3 flex items-center justify-between border-b border-[#333] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-[#888] font-medium">
              Preview
            </span>
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
                  <span className="text-xs">コピーしました</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-xs">コピー</span>
                </>
              )}
            </Button>
            {comfySettings?.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#094771] disabled:opacity-50"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    <span className="text-xs">生成中...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    <span className="text-xs">生成</span>
                  </>
                )}
              </Button>
            )}
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#094771]"
                onClick={onOpenSettings}
                title="設定"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <TabsList className="h-7 bg-[#3c3c3c]">
            <TabsTrigger value="merged" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Merged YAML
            </TabsTrigger>
            <TabsTrigger value="prompt" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Prompt Text
            </TabsTrigger>
            <TabsTrigger value="image" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Image
              {images.length > 0 && (
                <span className="ml-1 text-[10px] text-[#888]">({images.length})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="merged" className="flex-1 m-0 overflow-auto">
          {!isYamlValid ? (
            <div className="p-4 flex items-center gap-2 text-yellow-500 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>YAML parse error - 構文を確認してください</span>
            </div>
          ) : (
            <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
              {mergedYaml || '(YAMLを入力してください)'}
            </pre>
          )}
        </TabsContent>
        <TabsContent value="prompt" className="flex-1 m-0 overflow-auto">
          <div className="px-3 py-2 text-xs text-[#888] bg-[#2d2d2d] border-b border-[#333]">
            未実装。LLMによるエンハンサーを導入予定。
          </div>
          <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
            {promptText || '(プロンプトテキストがここに表示されます)'}
          </pre>
        </TabsContent>
        <TabsContent value="image" className="flex-1 m-0 overflow-hidden relative">
          {!comfySettings?.enabled ? (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
              <Settings className="h-8 w-8" />
              <span className="text-sm">ComfyUIが設定されていません</span>
              {onOpenSettings && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={onOpenSettings}
                >
                  設定を開く
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* スクロール可能なコンテンツエリア */}
              <div className="h-full overflow-auto">
                {/* エラー表示 */}
                {generationError && (
                  <div className="p-3 bg-red-900/30 border-b border-red-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-400 flex-1">{generationError}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-red-400 hover:text-red-300"
                      onClick={() => setGenerationError(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* 画像ギャラリー */}
                {isLoadingImages ? (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#888]" />
                  </div>
                ) : images.length === 0 ? (
                  <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
                    <Play className="h-8 w-8" />
                    <span className="text-sm">「生成」ボタンで画像を生成</span>
                  </div>
                ) : (
                  <div className="p-2 grid grid-cols-6 gap-2">
                    {images.map((image) => (
                      <div
                        key={image.id}
                        className="relative group cursor-pointer aspect-square bg-[#1e1e1e] rounded overflow-hidden"
                        onClick={() => setSelectedImage(image)}
                      >
                        <img
                          src={`/api/images/${image.filename}`}
                          alt={image.id}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-600 text-white"
                          onClick={(e) => handleDeleteImage(image, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 生成中オーバーレイ - スクロールエリア外に配置 */}
              {isGenerating && (
                <div className="absolute inset-0 bg-[#252526]/90 flex flex-col items-center justify-center gap-3 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
                  <span className="text-sm text-[#888]">
                    {generationProgress?.status === 'connecting' && '接続中...'}
                    {generationProgress?.status === 'queued' && 'キュー待ち...'}
                    {generationProgress?.status === 'generating' && (
                      <>生成中... {generationProgress.progress !== undefined && `${generationProgress.progress}%`}</>
                    )}
                  </span>
                  {generationProgress?.currentNode && (
                    <span className="text-xs text-[#666]">Node: {generationProgress.currentNode}</span>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* 画像拡大ダイアログ */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="!w-auto !max-w-[90vw] max-h-[90vh] p-0 bg-[#1e1e1e] border-[#333] overflow-hidden" showCloseButton={false}>
          <VisuallyHidden>
            <DialogTitle>画像プレビュー</DialogTitle>
          </VisuallyHidden>
          {selectedImage && (
            <div className="flex flex-col">
              <div className="relative">
                <img
                  src={`/api/images/${selectedImage.filename}`}
                  alt={selectedImage.id}
                  className="max-w-[90vw] max-h-[calc(90vh-40px)] object-contain"
                />
                {/* 閉じる・ダウンロードボタン */}
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 bg-black/50 hover:bg-[#555] text-white"
                    onClick={() => handleDownloadImage(selectedImage)}
                    title="ダウンロード"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 bg-black/50 hover:bg-[#555] text-white"
                    onClick={() => setSelectedImage(null)}
                    title="閉じる"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
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
              {/* 日付表示 - 画像の下に配置 */}
              {selectedImage.createdAt && (
                <div className="p-2 bg-[#1e1e1e] text-xs text-[#888] text-center border-t border-[#333]">
                  {new Date(selectedImage.createdAt).toLocaleString('ja-JP')}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
