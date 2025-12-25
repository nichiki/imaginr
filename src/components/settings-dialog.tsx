'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Upload,
  FolderOpen,
  BookOpen,
  Brain,
  Settings2,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Globe,
} from 'lucide-react';
import { DictionaryManagerDialog } from './dictionary-manager-dialog';
import { WorkflowEditor } from './workflow-editor';
import {
  fetchComfyUISettings,
  saveComfyUISettingsAsync,
  createWorkflowConfig,
  migrateLocalStorageToFile,
  fetchOllamaSettings,
  saveOllamaSettingsAsync,
  saveLanguage,
  type ComfyUISettings,
  type WorkflowConfig,
  type OllamaSettings,
  type EnhancerPreset,
  type SupportedLanguage,
} from '@/lib/storage';
import { changeLanguage, languages, type Language } from '@/lib/i18n';
import { ComfyUIClient } from '@/lib/comfyui-api';
import { OllamaClient } from '@/lib/ollama-api';
import { getComfyUIPath, joinPath, getAppDataPath } from '@/lib/tauri-utils';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: () => void;
  onDictionaryChange?: () => void;
  onOllamaChange?: () => void;
}

interface WorkflowFile {
  name: string;
  label: string;
}

// ツリーアイテムの型
type TreeItemType =
  | 'data'
  | 'comfyui'
  | 'comfyui-workflow'
  | 'comfyui-add'
  | 'ollama'
  | 'ollama-preset'
  | 'ollama-add';

interface TreeSelection {
  type: TreeItemType;
  id?: string; // workflow ID or preset ID
}

export function SettingsDialog({ open, onOpenChange, onSettingsChange, onDictionaryChange, onOllamaChange }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();

  // ツリー選択状態
  const [selection, setSelection] = useState<TreeSelection>({ type: 'data' });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    comfyui: true,
    ollama: true,
  });

  // ComfyUI設定
  const [settings, setSettings] = useState<ComfyUISettings>({
    enabled: false,
    url: 'http://localhost:8188',
    activeWorkflowId: '',
    workflows: [],
  });
  const [availableWorkflows, setAvailableWorkflows] = useState<WorkflowFile[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dataFolderPath, setDataFolderPath] = useState<string>('');
  const [dictionaryManagerOpen, setDictionaryManagerOpen] = useState(false);

  // Ollama設定
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings>({
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: '',
    temperature: 0.7,
    enhancerPresets: [],
    activePresetId: null,
    customSystemPrompt: '',
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaConnectionStatus, setOllamaConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ollamaConnectionError, setOllamaConnectionError] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 言語設定（保存時まで適用しない）
  const [pendingLanguage, setPendingLanguage] = useState<Language>(i18n.language as Language);

  // 設定とワークフロー一覧を読み込む
  useEffect(() => {
    if (open) {
      // First migrate localStorage to file if needed, then fetch from server
      migrateLocalStorageToFile().then(() => {
        fetchComfyUISettings().then(setSettings);
      });
      fetchAvailableWorkflows();
      // Get data folder path
      getAppDataPath().then(setDataFolderPath);
      // Ollama設定を読み込む
      fetchOllamaSettings().then((settings) => {
        setOllamaSettings(settings);
        // 保存済みモデルがあれば初期リストに追加（UX改善）
        if (settings.model) {
          setOllamaModels([settings.model]);
        }
      });
      // 言語設定を現在の値で初期化
      setPendingLanguage(i18n.language as Language);
    }
  }, [open, i18n.language]);

  const fetchAvailableWorkflows = async () => {
    try {
      const { readDir, exists, mkdir } = await import('@tauri-apps/plugin-fs');
      const comfyuiDir = await getComfyUIPath();

      // Ensure directory exists
      if (!(await exists(comfyuiDir))) {
        await mkdir(comfyuiDir, { recursive: true });
        setAvailableWorkflows([]);
        return;
      }

      const entries = await readDir(comfyuiDir);
      const workflows: WorkflowFile[] = entries
        .filter(entry => entry.name?.endsWith('.json'))
        .map(entry => ({
          name: entry.name!,
          label: entry.name!.replace('.json', ''),
        }));
      setAvailableWorkflows(workflows);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  };

  const handleTestConnection = useCallback(async () => {
    setConnectionStatus('testing');
    setConnectionError(null);

    const client = new ComfyUIClient(settings.url);
    const result = await client.testConnection();

    if (result.success) {
      setConnectionStatus('success');
    } else {
      setConnectionStatus('error');
      setConnectionError(result.error || 'Connection failed');
    }
  }, [settings.url]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveComfyUISettingsAsync(settings);
      await saveOllamaSettingsAsync(ollamaSettings);

      // 言語が変更された場合
      const languageChanged = pendingLanguage !== i18n.language;
      if (languageChanged) {
        await saveLanguage(pendingLanguage as SupportedLanguage);
        changeLanguage(pendingLanguage);
      }

      onSettingsChange?.();
      onOllamaChange?.();
      onOpenChange(false);

      // Monaco Editorのローケール変更のためにリロードが必要
      if (languageChanged) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Ollama接続テストとモデル一覧取得
  const handleTestOllamaConnection = useCallback(async () => {
    setOllamaConnectionStatus('testing');
    setOllamaConnectionError(null);
    setIsLoadingModels(true);

    const client = new OllamaClient(ollamaSettings.baseUrl);
    const result = await client.testConnection();

    if (result.success) {
      setOllamaConnectionStatus('success');
      // モデル一覧を取得
      const models = await client.listModels();
      setOllamaModels(models.map(m => m.name));
    } else {
      setOllamaConnectionStatus('error');
      setOllamaConnectionError(result.error || 'Connection failed');
    }
    setIsLoadingModels(false);
  }, [ollamaSettings.baseUrl]);

  const updateOllamaSettings = (updates: Partial<OllamaSettings>) => {
    setOllamaSettings(prev => ({ ...prev, ...updates }));
    if ('baseUrl' in updates) {
      setOllamaConnectionStatus('idle');
      setOllamaConnectionError(null);
    }
  };

  const updateSettings = (updates: Partial<ComfyUISettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    // URLが変更されたら接続ステータスをリセット
    if ('url' in updates) {
      setConnectionStatus('idle');
      setConnectionError(null);
    }
  };

  const handleOpenDataFolder = useCallback(async () => {
    if (!dataFolderPath) return;
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(dataFolderPath);
    } catch (error) {
      console.error('Failed to open data folder:', error);
    }
  }, [dataFolderPath]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const content = await file.text();
      // JSONとして有効か確認
      JSON.parse(content);

      const name = file.name.replace('.json', '');
      const fileName = file.name;

      const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
      const comfyuiDir = await getComfyUIPath();

      // Ensure directory exists
      if (!(await exists(comfyuiDir))) {
        await mkdir(comfyuiDir, { recursive: true });
      }

      const filePath = await joinPath(comfyuiDir, fileName);
      await writeTextFile(filePath, content);

      await fetchAvailableWorkflows();

      // 新しいワークフロー設定を作成して追加
      const newWorkflow = createWorkflowConfig(fileName, name);
      setSettings(prev => ({
        ...prev,
        workflows: [...prev.workflows, newWorkflow],
        activeWorkflowId: newWorkflow.id,
      }));
      // 編集モードに入る
      setSelection({ type: 'comfyui-workflow', id: newWorkflow.id });
    } catch {
      const { showError } = await import('@/lib/dialog');
      await showError('無効なJSONファイルです');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, []);

  const handleAddWorkflow = useCallback((file: string) => {
    const wf = availableWorkflows.find(w => w.name === file);
    const newWorkflow = createWorkflowConfig(file, wf?.label || file.replace('.json', ''));
    setSettings(prev => ({
      ...prev,
      workflows: [...prev.workflows, newWorkflow],
      activeWorkflowId: newWorkflow.id,
    }));
    setSelection({ type: 'comfyui-workflow', id: newWorkflow.id });
  }, [availableWorkflows]);

  const handleRemoveWorkflow = useCallback((id: string) => {
    setSettings(prev => {
      const newWorkflows = prev.workflows.filter(w => w.id !== id);
      const activeStillExists = newWorkflows.some(w => w.id === prev.activeWorkflowId);
      return {
        ...prev,
        workflows: newWorkflows,
        activeWorkflowId: activeStillExists ? prev.activeWorkflowId : (newWorkflows[0]?.id || ''),
      };
    });
    if (selection.type === 'comfyui-workflow' && selection.id === id) {
      setSelection({ type: 'comfyui' });
    }
  }, [selection]);

  const handleUpdateWorkflow = useCallback((id: string, updates: Partial<WorkflowConfig>) => {
    setSettings(prev => ({
      ...prev,
      workflows: prev.workflows.map(w => w.id === id ? { ...w, ...updates } : w),
    }));
  }, []);

  // Ollamaプリセット操作
  const handleAddPreset = useCallback(() => {
    const newPreset: EnhancerPreset = {
      id: crypto.randomUUID(),
      name: 'New Preset',
      description: '',
      systemPrompt: '',
      builtIn: false,
    };
    setOllamaSettings(prev => ({
      ...prev,
      enhancerPresets: [...prev.enhancerPresets, newPreset],
      activePresetId: newPreset.id,
    }));
    setSelection({ type: 'ollama-preset', id: newPreset.id });
  }, []);

  const handleDuplicatePreset = useCallback((preset: EnhancerPreset) => {
    const newPreset: EnhancerPreset = {
      id: crypto.randomUUID(),
      name: `${preset.name} (Copy)`,
      description: preset.description,
      systemPrompt: preset.systemPrompt,
      builtIn: false,
    };
    setOllamaSettings(prev => ({
      ...prev,
      enhancerPresets: [...prev.enhancerPresets, newPreset],
      activePresetId: newPreset.id,
    }));
    setSelection({ type: 'ollama-preset', id: newPreset.id });
  }, []);

  const handleRemovePreset = useCallback((id: string) => {
    setOllamaSettings(prev => {
      const newPresets = prev.enhancerPresets.filter(p => p.id !== id);
      const activeStillExists = newPresets.some(p => p.id === prev.activePresetId);
      return {
        ...prev,
        enhancerPresets: newPresets,
        activePresetId: activeStillExists ? prev.activePresetId : (newPresets[0]?.id || null),
      };
    });
    if (selection.type === 'ollama-preset' && selection.id === id) {
      setSelection({ type: 'ollama' });
    }
  }, [selection]);

  const handleUpdatePreset = useCallback((id: string, updates: Partial<EnhancerPreset>) => {
    setOllamaSettings(prev => ({
      ...prev,
      enhancerPresets: prev.enhancerPresets.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, []);

  // 現在選択中のワークフローを取得
  const selectedWorkflow = selection.type === 'comfyui-workflow' && selection.id
    ? settings.workflows.find(w => w.id === selection.id)
    : null;

  // 現在選択中のプリセットを取得
  const selectedPreset = selection.type === 'ollama-preset' && selection.id
    ? ollamaSettings.enhancerPresets.find(p => p.id === selection.id)
    : null;

  // 登録済みワークフローで使用されていないファイル
  const unusedWorkflowFiles = availableWorkflows.filter(
    wf => !settings.workflows.some(w => w.file === wf.name)
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // ツリーアイテムのレンダリング
  const renderTreeItem = (
    label: string,
    type: TreeItemType,
    id?: string,
    icon?: React.ReactNode,
    indent = 0,
    extra?: React.ReactNode
  ) => {
    const isSelected = selection.type === type && selection.id === id;
    return (
      <button
        key={id || type}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded transition-colors',
          isSelected
            ? 'bg-[#094771] text-white'
            : 'text-[#d4d4d4] hover:bg-[#3c3c3c]'
        )}
        style={{ paddingLeft: `${8 + indent * 16}px` }}
        onClick={() => setSelection({ type, id })}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {extra}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4] max-w-4xl sm:max-w-4xl h-[80vh] max-h-[700px] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b border-[#333] shrink-0">
          <DialogTitle className="text-[#d4d4d4]">設定</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* 左ペイン: ツリーナビゲーション */}
          <div className="w-56 border-r border-[#333] flex flex-col shrink-0">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {/* データ */}
                {renderTreeItem('データ', 'data', undefined, <FolderOpen className="h-4 w-4 shrink-0" />)}

                {/* ComfyUI */}
                <div>
                  <button
                    className={cn(
                      'w-full flex items-center gap-1 px-2 py-1.5 text-left text-sm rounded transition-colors',
                      selection.type === 'comfyui'
                        ? 'bg-[#094771] text-white'
                        : 'text-[#d4d4d4] hover:bg-[#3c3c3c]'
                    )}
                    onClick={() => {
                      setSelection({ type: 'comfyui' });
                    }}
                  >
                    <span
                      className="p-0.5 hover:bg-[#555] rounded cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('comfyui');
                      }}
                    >
                      {expandedSections.comfyui ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </span>
                    <Settings2 className="h-4 w-4 shrink-0" />
                    <span className="flex-1">ComfyUI</span>
                  </button>

                  {expandedSections.comfyui && settings.enabled && (
                    <div className="mt-0.5 space-y-0.5">
                      {settings.workflows.map(wf => (
                        renderTreeItem(wf.name, 'comfyui-workflow', wf.id, undefined, 1)
                      ))}
                      {renderTreeItem(
                        '追加...',
                        'comfyui-add',
                        undefined,
                        <Plus className="h-3 w-3 shrink-0" />,
                        1
                      )}
                    </div>
                  )}
                </div>

                {/* Ollama */}
                <div>
                  <button
                    className={cn(
                      'w-full flex items-center gap-1 px-2 py-1.5 text-left text-sm rounded transition-colors',
                      selection.type === 'ollama'
                        ? 'bg-[#094771] text-white'
                        : 'text-[#d4d4d4] hover:bg-[#3c3c3c]'
                    )}
                    onClick={() => {
                      setSelection({ type: 'ollama' });
                    }}
                  >
                    <span
                      className="p-0.5 hover:bg-[#555] rounded cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('ollama');
                      }}
                    >
                      {expandedSections.ollama ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </span>
                    <Brain className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Ollama</span>
                  </button>

                  {expandedSections.ollama && ollamaSettings.enabled && (
                    <div className="mt-0.5 space-y-0.5">
                      {ollamaSettings.enhancerPresets.map(preset => (
                        renderTreeItem(
                          preset.name,
                          'ollama-preset',
                          preset.id,
                          preset.builtIn ? undefined : undefined,
                          1,
                          preset.builtIn ? (
                            <span className="text-[10px] text-[#888] px-1 bg-[#333] rounded">Built-in</span>
                          ) : undefined
                        )
                      ))}
                      {renderTreeItem(
                        '追加...',
                        'ollama-add',
                        undefined,
                        <Plus className="h-3 w-3 shrink-0" />,
                        1
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* 右ペイン: 編集フォーム */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4">
                {/* データ設定 */}
                {selection.type === 'data' && (
                  <div className="space-y-6">
                    <h3 className="text-sm font-medium text-[#d4d4d4]">{t('settings.title')}</h3>

                    {/* 言語設定 */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        {t('settings.language')}
                      </Label>
                      <Select
                        value={pendingLanguage}
                        onValueChange={(value: Language) => {
                          setPendingLanguage(value);
                        }}
                      >
                        <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9 w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#252526] border-[#333]">
                          {languages.map((lang) => (
                            <SelectItem
                              key={lang.code}
                              value={lang.code}
                              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                            >
                              {lang.nativeName} ({lang.name})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* データフォルダ */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Data Folder</Label>
                      <div className="flex gap-2">
                        <Input
                          value={dataFolderPath}
                          readOnly
                          className="bg-[#3c3c3c] border-[#555] text-[#888] text-sm h-9 flex-1"
                        />
                        <Button
                          variant="outline"
                          size="default"
                          onClick={handleOpenDataFolder}
                          className="shrink-0 h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                          title={t('common.openFolder')}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-[#888]">
                        Templates, dictionary, snippets, and generated images
                      </p>
                    </div>

                    {/* 辞書管理 */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Dictionary</Label>
                      <Button
                        variant="outline"
                        onClick={() => setDictionaryManagerOpen(true)}
                        className="w-full h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white justify-start"
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Manage Dictionary
                      </Button>
                      <p className="text-xs text-[#888]">
                        Manage autocomplete dictionary
                      </p>
                    </div>
                  </div>
                )}

                {/* ComfyUI基本設定 */}
                {selection.type === 'comfyui' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#d4d4d4]">ComfyUI設定</h3>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="comfyui-enabled" className="text-sm font-medium">
                        ComfyUI連携を有効化
                      </Label>
                      <Switch
                        id="comfyui-enabled"
                        checked={settings.enabled}
                        onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                      />
                    </div>

                    {settings.enabled && (
                      <>
                        {/* URL設定 */}
                        <div className="space-y-2">
                          <Label htmlFor="comfyui-url" className="text-xs text-[#b0b0b0]">
                            ComfyUI URL
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="comfyui-url"
                              value={settings.url}
                              onChange={(e) => updateSettings({ url: e.target.value })}
                              placeholder="http://localhost:8188"
                              className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9"
                            />
                            <Button
                              variant="outline"
                              size="default"
                              onClick={handleTestConnection}
                              disabled={connectionStatus === 'testing'}
                              className="shrink-0 h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                            >
                              {connectionStatus === 'testing' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : connectionStatus === 'success' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : connectionStatus === 'error' ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                'テスト'
                              )}
                            </Button>
                          </div>
                          {connectionError && (
                            <p className="text-xs text-red-500">{connectionError}</p>
                          )}
                        </div>

                      </>
                    )}
                  </div>
                )}

                {/* ワークフロー編集 */}
                {selection.type === 'comfyui-workflow' && selectedWorkflow && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[#d4d4d4]">
                        ワークフロー: {selectedWorkflow.name}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        onClick={() => handleRemoveWorkflow(selectedWorkflow.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        削除
                      </Button>
                    </div>
                    <WorkflowEditor
                      workflow={selectedWorkflow}
                      onUpdate={(updates) => handleUpdateWorkflow(selectedWorkflow.id, updates)}
                      onRemove={() => handleRemoveWorkflow(selectedWorkflow.id)}
                      hideRemoveButton
                    />
                  </div>
                )}

                {/* ワークフロー追加 */}
                {selection.type === 'comfyui-add' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#d4d4d4]">ワークフローを追加</h3>

                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">
                        既存ファイルから追加
                      </Label>
                      <Select
                        value=""
                        onValueChange={(value) => handleAddWorkflow(value)}
                      >
                        <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9">
                          <SelectValue placeholder="ファイルを選択..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#252526] border-[#333]">
                          {unusedWorkflowFiles.length === 0 ? (
                            <SelectItem value="_none" disabled className="text-[#888]">
                              利用可能なファイルがありません
                            </SelectItem>
                          ) : (
                            unusedWorkflowFiles.map((wf) => (
                              <SelectItem
                                key={wf.name}
                                value={wf.name}
                                className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                              >
                                {wf.label}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">
                        ファイルをアップロード
                      </Label>
                      <Button
                        variant="outline"
                        className="w-full h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                        disabled={isUploading}
                        onClick={() => document.getElementById('workflow-upload')?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        JSONファイルをアップロード
                      </Button>
                      <input
                        id="workflow-upload"
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <p className="text-xs text-[#888]">
                        ComfyUIからAPI形式でエクスポートしたJSONをアップロード
                      </p>
                    </div>
                  </div>
                )}

                {/* Ollama基本設定 */}
                {selection.type === 'ollama' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#d4d4d4]">Ollama設定</h3>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="ollama-enabled" className="text-sm font-medium">
                        Ollamaエンハンサーを有効化
                      </Label>
                      <Switch
                        id="ollama-enabled"
                        checked={ollamaSettings.enabled}
                        onCheckedChange={(checked) => updateOllamaSettings({ enabled: checked })}
                      />
                    </div>

                    {ollamaSettings.enabled && (
                      <>
                        {/* URL設定 */}
                        <div className="space-y-2">
                          <Label htmlFor="ollama-url" className="text-xs text-[#b0b0b0]">
                            Ollama URL
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="ollama-url"
                              value={ollamaSettings.baseUrl}
                              onChange={(e) => updateOllamaSettings({ baseUrl: e.target.value })}
                              placeholder="http://localhost:11434"
                              className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9"
                            />
                            <Button
                              variant="outline"
                              size="default"
                              onClick={handleTestOllamaConnection}
                              disabled={ollamaConnectionStatus === 'testing'}
                              className="shrink-0 h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                            >
                              {ollamaConnectionStatus === 'testing' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : ollamaConnectionStatus === 'success' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : ollamaConnectionStatus === 'error' ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                'テスト'
                              )}
                            </Button>
                          </div>
                          {ollamaConnectionError && (
                            <p className="text-xs text-red-500">{ollamaConnectionError}</p>
                          )}
                        </div>

                        {/* モデル選択 */}
                        <div className="space-y-2">
                          <Label className="text-xs text-[#b0b0b0]">
                            モデル
                          </Label>
                          <Select
                            value={ollamaSettings.model}
                            onValueChange={(value) => updateOllamaSettings({ model: value })}
                          >
                            <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9">
                              <SelectValue placeholder={isLoadingModels ? "読み込み中..." : "モデルを選択"} />
                            </SelectTrigger>
                            <SelectContent className="bg-[#252526] border-[#333]">
                              {ollamaModels.length === 0 ? (
                                <SelectItem value="_none" disabled className="text-[#888]">
                                  接続テストでモデル一覧を取得してください
                                </SelectItem>
                              ) : (
                                ollamaModels.map((model) => (
                                  <SelectItem
                                    key={model}
                                    value={model}
                                    className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                                  >
                                    {model}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Temperature */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-[#b0b0b0]">
                              Temperature
                            </Label>
                            <span className="text-xs text-[#888]">{ollamaSettings.temperature.toFixed(1)}</span>
                          </div>
                          <Slider
                            value={[ollamaSettings.temperature]}
                            onValueChange={([value]) => updateOllamaSettings({ temperature: value })}
                            min={0}
                            max={1}
                            step={0.1}
                            className="w-full"
                          />
                          <p className="text-xs text-[#888]">
                            低い値: 一貫性重視 / 高い値: 創造性重視
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* プリセット編集 */}
                {selection.type === 'ollama-preset' && selectedPreset && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[#d4d4d4]">
                        プリセット: {selectedPreset.name}
                        {selectedPreset.builtIn && (
                          <span className="ml-2 text-[10px] text-[#888] px-1.5 py-0.5 bg-[#333] rounded">Built-in</span>
                        )}
                      </h3>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c]"
                          onClick={() => handleDuplicatePreset(selectedPreset)}
                          title="複製"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {!selectedPreset.builtIn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            onClick={() => handleRemovePreset(selectedPreset.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 名前 */}
                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">名前</Label>
                      <Input
                        value={selectedPreset.name}
                        onChange={(e) => handleUpdatePreset(selectedPreset.id, { name: e.target.value })}
                        disabled={selectedPreset.builtIn}
                        className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9 disabled:opacity-50"
                      />
                    </div>

                    {/* 説明 */}
                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">説明</Label>
                      <Input
                        value={selectedPreset.description || ''}
                        onChange={(e) => handleUpdatePreset(selectedPreset.id, { description: e.target.value })}
                        disabled={selectedPreset.builtIn}
                        placeholder="プリセットの説明"
                        className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9 disabled:opacity-50"
                      />
                    </div>

                    {/* システムプロンプト */}
                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">
                        システムプロンプト
                        {selectedPreset.builtIn && ' (読み取り専用)'}
                      </Label>
                      <Textarea
                        value={selectedPreset.systemPrompt}
                        onChange={(e) => handleUpdatePreset(selectedPreset.id, { systemPrompt: e.target.value })}
                        disabled={selectedPreset.builtIn}
                        className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-64 resize-none font-mono disabled:opacity-50"
                        placeholder="システムプロンプトを入力..."
                      />
                    </div>
                  </div>
                )}

                {/* プリセット追加 */}
                {selection.type === 'ollama-add' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#d4d4d4]">プリセットを追加</h3>

                    <Button
                      variant="outline"
                      className="w-full h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                      onClick={handleAddPreset}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      新規プリセットを作成
                    </Button>

                    <p className="text-xs text-[#888]">
                      既存のプリセットを複製する場合は、プリセットを選択して複製ボタンを使用してください。
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-[#333] shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#d4d4d4] hover:bg-[#3c3c3c]"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#094771] text-white hover:bg-[#0e639c]"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Dictionary Manager Dialog */}
      <DictionaryManagerDialog
        open={dictionaryManagerOpen}
        onOpenChange={setDictionaryManagerOpen}
        onDictionaryChange={onDictionaryChange}
      />
    </Dialog>
  );
}
