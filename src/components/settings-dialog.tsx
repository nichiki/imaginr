'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Loader2, CheckCircle, XCircle, Upload, Pencil, FolderOpen, BookOpen, Brain } from 'lucide-react';
import { DictionaryManagerDialog } from './dictionary-manager-dialog';
import { WorkflowEditor } from './workflow-editor';
import {
  fetchComfyUISettings,
  saveComfyUISettingsAsync,
  getActiveWorkflow,
  createWorkflowConfig,
  migrateLocalStorageToFile,
  fetchOllamaSettings,
  saveOllamaSettingsAsync,
  getActiveEnhancerPreset,
  type ComfyUISettings,
  type WorkflowConfig,
  type OllamaSettings,
} from '@/lib/storage';
import { ComfyUIClient } from '@/lib/comfyui-api';
import { OllamaClient } from '@/lib/ollama-api';
import { getComfyUIPath, joinPath, getAppDataPath } from '@/lib/tauri-utils';

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

export function SettingsDialog({ open, onOpenChange, onSettingsChange, onDictionaryChange, onOllamaChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('data');

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
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowConfig | null>(null);
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
      fetchOllamaSettings().then(setOllamaSettings);
    }
  }, [open]);

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
      onSettingsChange?.();
      onOllamaChange?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('設定の保存に失敗しました');
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
      setOllamaModels([]);
    }
    setIsLoadingModels(false);
  }, [ollamaSettings.baseUrl]);

  const updateOllamaSettings = (updates: Partial<OllamaSettings>) => {
    setOllamaSettings(prev => ({ ...prev, ...updates }));
    if ('baseUrl' in updates) {
      setOllamaConnectionStatus('idle');
      setOllamaConnectionError(null);
      setOllamaModels([]);
    }
  };

  const activePreset = getActiveEnhancerPreset(ollamaSettings);

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
      setEditingWorkflow(newWorkflow);
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
    setEditingWorkflow(newWorkflow);
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
    if (editingWorkflow?.id === id) {
      setEditingWorkflow(null);
    }
  }, [editingWorkflow]);

  const handleUpdateWorkflow = useCallback((updates: Partial<WorkflowConfig>) => {
    if (!editingWorkflow) return;
    const updated = { ...editingWorkflow, ...updates };
    setEditingWorkflow(updated);
    setSettings(prev => ({
      ...prev,
      workflows: prev.workflows.map(w => w.id === updated.id ? updated : w),
    }));
  }, [editingWorkflow]);

  const activeWorkflow = getActiveWorkflow(settings);

  // 登録済みワークフローで使用されていないファイル
  const unusedWorkflowFiles = availableWorkflows.filter(
    wf => !settings.workflows.some(w => w.file === wf.name)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4] max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#d4d4d4]">設定</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="bg-[#3c3c3c] shrink-0">
            <TabsTrigger value="data" className="text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              データ
            </TabsTrigger>
            <TabsTrigger value="comfyui" className="text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              ComfyUI
            </TabsTrigger>
            <TabsTrigger value="ollama" className="text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              <Brain className="h-4 w-4 mr-1.5" />
              Ollama
            </TabsTrigger>
          </TabsList>

          {/* データタブ */}
          <TabsContent value="data" className="flex-1 overflow-y-auto mt-0 p-4 space-y-6">
            {/* データフォルダ */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">データフォルダ</Label>
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
                  title="フォルダを開く"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-[#888]">
                テンプレート、辞書、スニペット、生成画像の保存先
              </p>
            </div>

            {/* 辞書管理 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">辞書管理</Label>
              <Button
                variant="outline"
                onClick={() => setDictionaryManagerOpen(true)}
                className="w-full h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white justify-start"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                辞書管理を開く
              </Button>
              <p className="text-xs text-[#888]">
                オートコンプリート用の辞書を管理
              </p>
            </div>
          </TabsContent>

          {/* ComfyUIタブ */}
          <TabsContent value="comfyui" className="flex-1 overflow-y-auto mt-0 p-4 space-y-4">
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

                {/* ワークフロー選択 */}
                <div className="space-y-2">
                  <Label className="text-xs text-[#b0b0b0]">
                    アクティブなワークフロー
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={settings.activeWorkflowId}
                      onValueChange={(value) => {
                        updateSettings({ activeWorkflowId: value });
                        const wf = settings.workflows.find(w => w.id === value);
                        if (wf) setEditingWorkflow(wf);
                      }}
                    >
                      <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm flex-1 h-9">
                        <SelectValue placeholder="ワークフローを選択" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252526] border-[#333]">
                        {settings.workflows.length === 0 ? (
                          <SelectItem value="_none" disabled className="text-[#888]">
                            ワークフローを追加してください
                          </SelectItem>
                        ) : (
                          settings.workflows.map((wf) => (
                            <SelectItem
                              key={wf.id}
                              value={wf.id}
                              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                            >
                              {wf.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {activeWorkflow && (
                      <Button
                        variant="outline"
                        size="default"
                        className={`shrink-0 px-2 h-9 bg-[#3c3c3c] border-[#555] hover:bg-[#4a4a4a] hover:text-white ${editingWorkflow?.id === activeWorkflow.id ? 'text-white bg-[#094771]' : 'text-[#d4d4d4]'}`}
                        onClick={() => setEditingWorkflow(editingWorkflow?.id === activeWorkflow.id ? null : activeWorkflow)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* 新規ワークフロー追加 */}
                <div className="space-y-2">
                  <Label className="text-xs text-[#b0b0b0]">
                    ワークフローを追加
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value=""
                      onValueChange={(value) => handleAddWorkflow(value)}
                    >
                      <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm flex-1 h-9">
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
                    <Button
                      variant="outline"
                      size="default"
                      className="shrink-0 px-2 h-9 bg-[#3c3c3c] border-[#555] text-[#d4d4d4] hover:bg-[#4a4a4a] hover:text-white"
                      disabled={isUploading}
                      onClick={() => document.getElementById('workflow-upload')?.click()}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
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

                {/* ワークフロー編集 */}
                {editingWorkflow && (
                  <WorkflowEditor
                    workflow={editingWorkflow}
                    onUpdate={handleUpdateWorkflow}
                    onRemove={() => handleRemoveWorkflow(editingWorkflow.id)}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Ollamaタブ */}
          <TabsContent value="ollama" className="flex-1 overflow-y-auto mt-0 p-4 space-y-4">
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
                      <SelectValue placeholder={isLoadingModels ? "読み込み中..." : "モデルを選択（接続テストで取得）"} />
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

                {/* エンハンサープリセット */}
                <div className="space-y-2">
                  <Label className="text-xs text-[#b0b0b0]">
                    エンハンサープリセット
                  </Label>
                  <Select
                    value={ollamaSettings.activePresetId || ''}
                    onValueChange={(value) => updateOllamaSettings({ activePresetId: value })}
                  >
                    <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9">
                      <SelectValue placeholder="プリセットを選択" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252526] border-[#333]">
                      {ollamaSettings.enhancerPresets.map((preset) => (
                        <SelectItem
                          key={preset.id}
                          value={preset.id}
                          className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                        >
                          <div className="flex flex-col">
                            <span>{preset.name}</span>
                            {preset.description && (
                              <span className="text-[10px] text-[#888]">{preset.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* システムプロンプト表示/編集 */}
                {activePreset && (
                  <div className="space-y-2">
                    <Label className="text-xs text-[#b0b0b0]">
                      システムプロンプト {activePreset.builtIn && '(読み取り専用)'}
                    </Label>
                    <Textarea
                      value={activePreset.systemPrompt}
                      readOnly={activePreset.builtIn}
                      onChange={(e) => {
                        if (!activePreset.builtIn) {
                          const updated = ollamaSettings.enhancerPresets.map(p =>
                            p.id === activePreset.id ? { ...p, systemPrompt: e.target.value } : p
                          );
                          updateOllamaSettings({ enhancerPresets: updated });
                        }
                      }}
                      className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-32 resize-none font-mono"
                      placeholder="システムプロンプトを入力..."
                    />
                  </div>
                )}

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
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
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
