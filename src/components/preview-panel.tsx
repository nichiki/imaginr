'use client';

import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle, Play, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadComfyUISettings, type ComfyUISettings } from '@/lib/storage';
import { ComfyUIClient, type GenerationProgress } from '@/lib/comfyui-api';

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
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 設定を読み込む
  useEffect(() => {
    setComfySettings(loadComfyUISettings());
  }, []);

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
    if (!comfySettings?.enabled || !promptText) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedImages([]);
    setActiveTab('image');

    try {
      // ワークフローを取得
      const response = await fetch(`/api/comfyui?file=${encodeURIComponent(comfySettings.workflowFile)}`);
      if (!response.ok) {
        throw new Error('Failed to load workflow');
      }
      const { workflow } = await response.json();

      // 生成
      const client = new ComfyUIClient(comfySettings.url);
      const result = await client.generate(
        workflow,
        promptText,
        comfySettings.promptNodeId,
        (progress) => setGenerationProgress(progress)
      );

      if (result.success) {
        setGeneratedImages(result.images);
      } else {
        setGenerationError(result.error || 'Generation failed');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  }, [comfySettings, promptText]);

  const canCopy = activeTab === 'merged' ? (isYamlValid && !!mergedYaml) : (activeTab === 'prompt' && !!promptText);
  const canGenerate = comfySettings?.enabled && !!promptText && !isGenerating;

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
        <TabsContent value="image" className="flex-1 m-0 overflow-auto">
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
          ) : isGenerating ? (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">
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
          ) : generationError ? (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <span className="text-sm text-red-500">{generationError}</span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleGenerate}
              >
                再試行
              </Button>
            </div>
          ) : generatedImages.length > 0 ? (
            <div className="p-3 grid gap-3">
              {generatedImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Generated ${index + 1}`}
                  className="w-full rounded border border-[#333]"
                />
              ))}
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-3 text-[#888]">
              <Play className="h-8 w-8" />
              <span className="text-sm">「生成」ボタンで画像を生成</span>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
