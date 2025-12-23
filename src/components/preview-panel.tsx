'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle, Play, Loader2, X, Settings, Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchComfyUISettings,
  loadComfyUISettings,
  getActiveWorkflow,
  fetchOllamaSettings,
  loadOllamaSettings,
  getEnhancerSystemPrompt,
  type ComfyUISettings,
  type OllamaSettings,
} from '@/lib/storage';
import { ComfyUIClient, type GenerationProgress } from '@/lib/comfyui-api';
import { OllamaClient } from '@/lib/ollama-api';
import { ImageGallery } from './image-gallery';
import { ImageViewer, type ImageInfo } from './image-viewer';
import { imageAPI, searchImagesByQuery } from '@/lib/image-api';
import { getComfyUIPath, joinPath } from '@/lib/tauri-utils';

const ENHANCE_ENABLED_KEY = 'image-prompt-builder-enhance-enabled';

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

  // Ollamaエンハンサー
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings | null>(null);
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [promptSubTab, setPromptSubTab] = useState<'raw' | 'enhanced'>('raw');
  // キャッシュ用: 同じmergedYamlに対してはエンハンス結果を再利用
  const lastEnhancedYamlRef = useRef<string>('');

  // 設定を読み込む
  useEffect(() => {
    // Start with localStorage cache, then fetch from server
    setComfySettings(loadComfyUISettings());
    fetchComfyUISettings().then(setComfySettings);
    // Ollama設定
    setOllamaSettings(loadOllamaSettings());
    fetchOllamaSettings().then(setOllamaSettings);
    // エンハンス有効状態を復元
    const savedEnhanceEnabled = localStorage.getItem(ENHANCE_ENABLED_KEY);
    if (savedEnhanceEnabled !== null) {
      setEnhanceEnabled(savedEnhanceEnabled === 'true');
    }
  }, []);

  // mergedYamlが変更されたらキャッシュをクリア
  useEffect(() => {
    if (mergedYaml !== lastEnhancedYamlRef.current) {
      // YAMLが変わったのでエンハンス結果をクリア
      setEnhancedPrompt('');
      setEnhanceError(null);
    }
  }, [mergedYaml]);

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

  // エンハンス有効/無効切り替え
  const handleEnhanceEnabledChange = useCallback((checked: boolean) => {
    setEnhanceEnabled(checked);
    localStorage.setItem(ENHANCE_ENABLED_KEY, String(checked));
  }, []);

  // エンハンス実行
  const handleEnhance = useCallback(async () => {
    if (!ollamaSettings?.enabled || !mergedYaml) return;

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const client = new OllamaClient(ollamaSettings.baseUrl);
      const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);

      const result = await client.generate(
        mergedYaml,
        ollamaSettings.model,
        systemPrompt,
        { temperature: ollamaSettings.temperature },
        (progress) => {
          if (progress.content) {
            setEnhancedPrompt(progress.content);
          }
        }
      );

      if (result.success) {
        setEnhancedPrompt(result.content);
        lastEnhancedYamlRef.current = mergedYaml;
        setPromptSubTab('enhanced');
      } else {
        setEnhanceError(result.error || 'Enhancement failed');
      }
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsEnhancing(false);
    }
  }, [ollamaSettings, mergedYaml]);

  const copyToClipboard = useCallback(async () => {
    let text = '';
    if (activeTab === 'merged') {
      text = mergedYaml;
    } else if (activeTab === 'prompt') {
      text = promptSubTab === 'enhanced' && enhancedPrompt ? enhancedPrompt : promptText;
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [activeTab, promptSubTab, mergedYaml, promptText, enhancedPrompt]);

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
      // エンハンスが有効な場合、プロンプトを決定
      let promptToUse = mergedYaml;

      if (enhanceEnabled && ollamaSettings?.enabled) {
        // エンハンス結果がある場合はそれを使用
        if (enhancedPrompt && lastEnhancedYamlRef.current === mergedYaml) {
          promptToUse = enhancedPrompt;
          console.log('[Generate] Using cached enhanced prompt');
        } else {
          // エンハンス結果がない場合は先にエンハンスを実行
          console.log('[Generate] Running enhancement first...');
          const client = new OllamaClient(ollamaSettings.baseUrl);
          const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);

          const enhanceResult = await client.generate(
            mergedYaml,
            ollamaSettings.model,
            systemPrompt,
            { temperature: ollamaSettings.temperature }
          );

          if (enhanceResult.success) {
            promptToUse = enhanceResult.content;
            setEnhancedPrompt(enhanceResult.content);
            lastEnhancedYamlRef.current = mergedYaml;
            console.log('[Generate] Enhancement completed');
          } else {
            console.warn('[Generate] Enhancement failed, using raw prompt');
            // エンハンス失敗時はrawプロンプトを使用
          }
        }
      }

      // ワークフローを取得
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const comfyuiDir = await getComfyUIPath();
      const workflowPath = await joinPath(comfyuiDir, activeWorkflow.file);

      if (!(await exists(workflowPath))) {
        throw new Error(`Workflow file not found: ${activeWorkflow.file}`);
      }

      const content = await readTextFile(workflowPath);
      const workflow: Record<string, unknown> = JSON.parse(content);

      // 生成
      const client = new ComfyUIClient(comfySettings.url);
      const result = await client.generate(
        workflow,
        promptToUse,
        activeWorkflow.promptNodeId,
        activeWorkflow.samplerNodeId,
        activeWorkflow.overrides,
        (progress) => setGenerationProgress(progress)
      );

      console.log('Generation result:', result);

      if (result.success && result.images.length > 0) {
        console.log('Saving images:', result.images);
        // 生成された画像をローカルに保存（エンハンス後のプロンプトを保存）
        for (const imageUrl of result.images) {
          try {
            console.log('Saving image from:', imageUrl);
            await imageAPI.save(imageUrl, promptToUse, activeWorkflow.id);
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
  }, [comfySettings, ollamaSettings, mergedYaml, enhanceEnabled, enhancedPrompt, loadImages]);

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

  const canCopy = activeTab === 'merged'
    ? (isYamlValid && !!mergedYaml)
    : (activeTab === 'prompt' && (promptSubTab === 'enhanced' ? !!enhancedPrompt : !!promptText));
  const activeWorkflowForCheck = comfySettings ? getActiveWorkflow(comfySettings) : null;
  const canGenerate = comfySettings?.enabled && !!activeWorkflowForCheck && !!mergedYaml && !isGenerating && !isEnhancing;
  const canEnhance = ollamaSettings?.enabled && !!ollamaSettings.model && !!mergedYaml && !isEnhancing;

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
            {/* エンハンスチェックボックス */}
            {ollamaSettings?.enabled && comfySettings?.enabled && (
              <div className="flex items-center gap-1.5 ml-1">
                <Checkbox
                  id="enhance-enabled"
                  checked={enhanceEnabled}
                  onCheckedChange={(checked) => handleEnhanceEnabledChange(checked === true)}
                  className="h-3.5 w-3.5 border-[#555] data-[state=checked]:bg-[#094771] data-[state=checked]:border-[#094771]"
                />
                <label
                  htmlFor="enhance-enabled"
                  className="text-xs text-[#888] cursor-pointer select-none flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  エンハンス
                </label>
              </div>
            )}
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
                    <span className="text-xs">{isEnhancing ? 'エンハンス中...' : '生成中...'}</span>
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
        <TabsContent value="prompt" className="flex-1 m-0 overflow-hidden flex flex-col">
          {/* サブタブ */}
          <div className="px-3 py-2 bg-[#2d2d2d] border-b border-[#333] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPromptSubTab('raw')}
                className={`text-xs px-2 py-1 rounded ${
                  promptSubTab === 'raw'
                    ? 'bg-[#094771] text-white'
                    : 'text-[#888] hover:text-[#d4d4d4]'
                }`}
              >
                Raw
              </button>
              <button
                onClick={() => setPromptSubTab('enhanced')}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  promptSubTab === 'enhanced'
                    ? 'bg-[#094771] text-white'
                    : 'text-[#888] hover:text-[#d4d4d4]'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Enhanced
              </button>
            </div>
            {promptSubTab === 'enhanced' && ollamaSettings?.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-[#d4d4d4] hover:text-white hover:bg-[#094771]"
                onClick={handleEnhance}
                disabled={!canEnhance}
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    実行中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    エンハンス実行
                  </>
                )}
              </Button>
            )}
          </div>
          {/* コンテンツ */}
          <div className="flex-1 overflow-auto">
            {promptSubTab === 'raw' ? (
              <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
                {promptText || '(プロンプトテキストがここに表示されます)'}
              </pre>
            ) : (
              <div className="h-full flex flex-col">
                {!ollamaSettings?.enabled ? (
                  <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
                    <Sparkles className="h-8 w-8" />
                    <span className="text-sm">Ollamaが設定されていません</span>
                    <span className="text-xs">設定からOllamaを有効にしてください</span>
                  </div>
                ) : enhanceError ? (
                  <div className="p-3 bg-red-900/30 border-b border-red-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-400 flex-1">{enhanceError}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-red-400 hover:text-red-300"
                      onClick={() => setEnhanceError(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null}
                {ollamaSettings?.enabled && (
                  <Textarea
                    value={enhancedPrompt}
                    onChange={(e) => setEnhancedPrompt(e.target.value)}
                    placeholder={isEnhancing ? 'エンハンス中...' : 'エンハンス実行ボタンを押してください'}
                    className="flex-1 m-3 bg-[#1e1e1e] border-[#333] text-[#d4d4d4] text-xs font-mono resize-none"
                  />
                )}
              </div>
            )}
          </div>
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
