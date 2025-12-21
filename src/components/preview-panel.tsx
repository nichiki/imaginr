'use client';

import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle, Play, Loader2, X, Settings, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchComfyUISettings, loadComfyUISettings, getActiveWorkflow, type ComfyUISettings } from '@/lib/storage';
import { ComfyUIClient, type GenerationProgress } from '@/lib/comfyui-api';
import { ImageGallery } from './image-gallery';
import { ImageViewer, type ImageInfo } from './image-viewer';
import { imageAPI, searchImagesByQuery } from '@/lib/image-api';
import { getComfyUIPath, joinPath } from '@/lib/tauri-utils';

interface PreviewPanelProps {
  mergedYaml: string;
  promptText: string;
  lookName?: string;
  isYamlValid?: boolean;
}

export function PreviewPanel({
  mergedYaml,
  promptText,
  isYamlValid = true,
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
  const [searchQuery, setSearchQuery] = useState('');

  // 設定を読み込む
  useEffect(() => {
    // Start with localStorage cache, then fetch from server
    setComfySettings(loadComfyUISettings());
    fetchComfyUISettings().then(setComfySettings);
  }, []);

  // 画像一覧を読み込む（検索クエリ対応）
  const loadImages = useCallback(async (query?: string) => {
    setIsLoadingImages(true);
    try {
      if (query) {
        // Use search API
        const results = await searchImagesByQuery(query);
        setImages(results);
      } else {
        // Use imageAPI for listing
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
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const comfyuiDir = await getComfyUIPath();
      const workflowPath = await joinPath(comfyuiDir, activeWorkflow.file);

      if (!(await exists(workflowPath))) {
        throw new Error(`Workflow file not found: ${activeWorkflow.file}`);
      }

      const content = await readTextFile(workflowPath);
      const workflow: Record<string, unknown> = JSON.parse(content);

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
            await imageAPI.save(imageUrl, mergedYaml, activeWorkflow.id);
            console.log('Image saved successfully');
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

  const handleDeleteImage = useCallback(async (image: ImageInfo) => {
    if (!confirm('この画像を削除しますか？')) return;

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
            {/* 検索バー（Imageタブ選択時のみ） */}
            {activeTab === 'image' && comfySettings?.enabled && (
              <div className="relative ml-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#888]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="検索"
                  className="w-64 pl-7 pr-6 h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4] placeholder:text-[#888]"
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
              <span className="text-xs">ヘッダー右上の設定から有効にしてください</span>
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
                <ImageGallery
                  images={images}
                  isLoading={isLoadingImages}
                  searchQuery={searchQuery}
                  onSelectImage={setSelectedImage}
                  onDeleteImage={handleDeleteImage}
                />
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
      <ImageViewer
        image={selectedImage}
        images={images}
        onClose={() => setSelectedImage(null)}
        onNavigate={setSelectedImage}
      />
    </div>
  );
}
