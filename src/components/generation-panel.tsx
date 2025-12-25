'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Play, Loader2, AlertCircle, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchComfyUISettings,
  loadComfyUISettings,
  saveActiveWorkflowId,
  fetchOllamaSettings,
  loadOllamaSettings,
  saveActiveEnhancerPresetId,
  type ComfyUISettings,
  type WorkflowConfig,
  type OllamaSettings,
  type EnhancerPreset,
} from '@/lib/storage';

interface GenerationPanelProps {
  // 現在のファイル名
  currentFileName?: string;

  // エンハンス制御
  enhanceEnabled: boolean;
  onEnhanceEnabledChange: (enabled: boolean) => void;
  onEnhance: () => void;
  hasEnhancedPrompt: boolean;

  // 生成
  isGenerating: boolean;
  isEnhancing: boolean;
  onGenerate: () => void;
  generationError: string | null;
  onClearError: () => void;

  // 生成可能かどうか
  canGenerate: boolean;
  canEnhance: boolean;

  // プロパティ上書き
  overrideValues: Record<string, string | number>;
  onOverrideValuesChange: (values: Record<string, string | number>) => void;

  // ワークフロー変更通知
  onWorkflowChange?: () => void;

  // プリセット変更通知
  onPresetChange?: () => void;
}

export function GenerationPanel({
  currentFileName,
  enhanceEnabled,
  onEnhanceEnabledChange,
  onEnhance,
  hasEnhancedPrompt,
  isGenerating,
  isEnhancing,
  onGenerate,
  generationError,
  onClearError,
  canGenerate,
  canEnhance,
  overrideValues,
  onOverrideValuesChange,
  onWorkflowChange,
  onPresetChange,
}: GenerationPanelProps) {
  // ComfyUI設定
  const [comfySettings, setComfySettings] = useState<ComfyUISettings | null>(() => loadComfyUISettings());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    const settings = loadComfyUISettings();
    return settings?.activeWorkflowId || '';
  });

  // Ollama設定
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings | null>(() => loadOllamaSettings());
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const settings = loadOllamaSettings();
    return settings?.activePresetId || '';
  });

  // 設定を非同期で取得
  useEffect(() => {
    fetchComfyUISettings().then((settings) => {
      setComfySettings(settings);
      if (settings?.activeWorkflowId) {
        setSelectedWorkflowId(settings.activeWorkflowId);
      }
    });
    fetchOllamaSettings().then((settings) => {
      setOllamaSettings(settings);
      if (settings?.activePresetId) {
        setSelectedPresetId(settings.activePresetId);
      }
    });
  }, []);

  // ワークフロー変更
  const handleWorkflowChange = useCallback(async (id: string) => {
    setSelectedWorkflowId(id);
    await saveActiveWorkflowId(id);
    const settings = await fetchComfyUISettings();
    setComfySettings(settings);
    onWorkflowChange?.();
  }, [onWorkflowChange]);

  // プリセット変更
  const handlePresetChange = useCallback(async (id: string) => {
    setSelectedPresetId(id);
    await saveActiveEnhancerPresetId(id);
    const settings = await fetchOllamaSettings();
    setOllamaSettings(settings);
    onPresetChange?.();
  }, [onPresetChange]);

  const workflows = useMemo(() => comfySettings?.workflows || [], [comfySettings?.workflows]);
  const presets = ollamaSettings?.enhancerPresets || [];
  const isComfyEnabled = comfySettings?.enabled;
  const isOllamaEnabled = ollamaSettings?.enabled;

  // 選択中ワークフローのoverridesを取得
  const selectedWorkflow = useMemo(() => {
    return workflows.find(wf => wf.id === selectedWorkflowId);
  }, [workflows, selectedWorkflowId]);

  const overrides = useMemo(() => selectedWorkflow?.overrides || [], [selectedWorkflow?.overrides]);

  // override値の変更ハンドラ
  const handleOverrideChange = useCallback((index: number, value: string) => {
    const override = overrides[index];
    if (!override) return;

    const key = `${override.nodeId}.${override.property}`;
    const numVal = Number(value);
    const newValue = !isNaN(numVal) && value !== '' ? numVal : value;

    onOverrideValuesChange({
      ...overrideValues,
      [key]: newValue,
    });
  }, [overrides, overrideValues, onOverrideValuesChange]);

  if (!isComfyEnabled) {
    return (
      <div className="h-full bg-[#252526] flex flex-col">
        <div className="h-11 px-3 flex items-center gap-2 border-b border-[#333] flex-shrink-0 min-w-0">
          <span className="text-xs uppercase text-[#888] font-medium flex-shrink-0">
            Generate
          </span>
          {currentFileName && (
            <span className="text-xs text-[#569cd6] truncate" title={currentFileName}>
              {currentFileName}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-[#666] text-center">
            ComfyUIが設定されていません。<br />
            設定から有効にしてください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      {/* Header */}
      <div className="h-11 px-3 flex items-center gap-2 border-b border-[#333] flex-shrink-0 min-w-0">
        <span className="text-xs uppercase text-[#888] font-medium flex-shrink-0">
          Generate
        </span>
        {currentFileName && (
          <span className="text-xs text-[#569cd6] truncate" title={currentFileName}>
            {currentFileName}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* エンハンス設定セクション */}
        {isOllamaEnabled && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase text-[#666] font-medium">Enhance</span>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d4d4d4]">Preset</label>
                <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                  <SelectTrigger className="w-full h-8 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]">
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#252526] border-[#333]">
                    {presets.map((preset: EnhancerPreset) => (
                      <SelectItem
                        key={preset.id}
                        value={preset.id}
                        className="text-xs text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                      >
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t border-[#333]" />
          </>
        )}

        {/* 生成設定セクション */}
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase text-[#666] font-medium">Generation</span>

          {/* Workflow選択 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#d4d4d4]">Workflow</label>
            <Select value={selectedWorkflowId} onValueChange={handleWorkflowChange}>
              <SelectTrigger className="w-full h-8 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent className="bg-[#252526] border-[#333]">
                {workflows.map((wf: WorkflowConfig) => (
                  <SelectItem
                    key={wf.id}
                    value={wf.id}
                    className="text-xs text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                  >
                    {wf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* エンハンス有効/無効 */}
          {isOllamaEnabled && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <label
                htmlFor="enhance-enabled"
                className="text-xs text-[#d4d4d4] cursor-pointer select-none"
              >
                Enhance before generate
              </label>
              <Switch
                id="enhance-enabled"
                checked={enhanceEnabled}
                onCheckedChange={onEnhanceEnabledChange}
                className="data-[state=checked]:bg-[#094771]"
              />
            </div>
          )}

          {/* プロパティ上書き */}
          {overrides.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs uppercase text-[#666] font-medium">Properties</span>
              {overrides.map((override, index) => {
                const key = `${override.nodeId}.${override.property}`;
                const currentValue = overrideValues[key] ?? override.value;
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-[#d4d4d4]">{override.property}</label>
                    <Input
                      value={String(currentValue)}
                      onChange={(e) => handleOverrideChange(index, e.target.value)}
                      className="h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {generationError && (
          <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="break-words">{generationError}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-red-400 hover:text-red-300 flex-shrink-0"
              onClick={onClearError}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* ボタンエリア */}
      <div className="p-3 border-t border-[#333] flex flex-col gap-2">
        {/* Enhanceボタン */}
        {isOllamaEnabled && (
          <Button
            variant="outline"
            className="w-full h-9 bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c] hover:text-white disabled:opacity-50"
            onClick={onEnhance}
            disabled={!canEnhance || isEnhancing || isGenerating}
          >
            {isEnhancing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enhancing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Enhance{hasEnhancedPrompt ? ' (Re-run)' : ''}
              </>
            )}
          </Button>
        )}

        {/* Generateボタン */}
        <Button
          className="w-full h-9 bg-[#094771] hover:bg-[#0e5a8a] text-white disabled:opacity-50"
          onClick={onGenerate}
          disabled={!canGenerate || !selectedWorkflowId || isEnhancing}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
