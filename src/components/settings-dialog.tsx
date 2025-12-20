'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, Upload, Trash2, Plus, Pencil } from 'lucide-react';
import {
  fetchComfyUISettings,
  saveComfyUISettingsAsync,
  getActiveWorkflow,
  createWorkflowConfig,
  migrateLocalStorageToFile,
  type ComfyUISettings,
  type WorkflowConfig,
  type NodeOverride,
} from '@/lib/storage';
import { ComfyUIClient } from '@/lib/comfyui-api';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: () => void;
}

interface WorkflowFile {
  name: string;
  label: string;
}

export function SettingsDialog({ open, onOpenChange, onSettingsChange }: SettingsDialogProps) {
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

  // 設定とワークフロー一覧を読み込む
  useEffect(() => {
    if (open) {
      // First migrate localStorage to file if needed, then fetch from server
      migrateLocalStorageToFile().then(() => {
        fetchComfyUISettings().then(setSettings);
      });
      fetchAvailableWorkflows();
    }
  }, [open]);

  const fetchAvailableWorkflows = async () => {
    try {
      const response = await fetch('/api/comfyui');
      if (response.ok) {
        const data = await response.json();
        setAvailableWorkflows(data.workflows || []);
      }
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
      onSettingsChange?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('設定の保存に失敗しました');
    } finally {
      setIsSaving(false);
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

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const content = await file.text();
      // JSONとして有効か確認
      JSON.parse(content);

      const name = file.name.replace('.json', '');
      const response = await fetch('/api/comfyui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });

      if (response.ok) {
        const { fileName } = await response.json();
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
      } else {
        alert('アップロードに失敗しました');
      }
    } catch {
      alert('無効なJSONファイルです');
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

  const handleAddOverride = useCallback(() => {
    if (!editingWorkflow) return;
    const newOverride: NodeOverride = { nodeId: '', property: '', value: '' };
    handleUpdateWorkflow({
      overrides: [...editingWorkflow.overrides, newOverride],
    });
  }, [editingWorkflow, handleUpdateWorkflow]);

  const handleUpdateOverride = useCallback((index: number, updates: Partial<NodeOverride>) => {
    if (!editingWorkflow) return;
    const newOverrides = [...editingWorkflow.overrides];
    newOverrides[index] = { ...newOverrides[index], ...updates };
    handleUpdateWorkflow({ overrides: newOverrides });
  }, [editingWorkflow, handleUpdateWorkflow]);

  const handleRemoveOverride = useCallback((index: number) => {
    if (!editingWorkflow) return;
    const newOverrides = editingWorkflow.overrides.filter((_, i) => i !== index);
    handleUpdateWorkflow({ overrides: newOverrides });
  }, [editingWorkflow, handleUpdateWorkflow]);

  const activeWorkflow = getActiveWorkflow(settings);

  // 登録済みワークフローで使用されていないファイル
  const unusedWorkflowFiles = availableWorkflows.filter(
    wf => !settings.workflows.some(w => w.file === wf.name)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#d4d4d4]">設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ComfyUI設定 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="comfyui-enabled" className="text-sm font-medium">
                ComfyUI連携
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
                  <div className="space-y-3 p-3 bg-[#1e1e1e] rounded border border-[#444]">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">ワークフロー設定</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-[#3c3c3c]"
                        onClick={() => handleRemoveWorkflow(editingWorkflow.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        削除
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">表示名</Label>
                      <Input
                        value={editingWorkflow.name}
                        onChange={(e) => handleUpdateWorkflow({ name: e.target.value })}
                        className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-[#b0b0b0]">ファイル</Label>
                      <Input
                        value={editingWorkflow.file}
                        disabled
                        className="bg-[#2d2d2d] border-[#444] text-[#888] text-sm h-8"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-[#b0b0b0]">プロンプトノードID</Label>
                        <Input
                          value={editingWorkflow.promptNodeId}
                          onChange={(e) => handleUpdateWorkflow({ promptNodeId: e.target.value })}
                          placeholder="例: 6"
                          className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-[#b0b0b0]">サンプラーノードID</Label>
                        <Input
                          value={editingWorkflow.samplerNodeId}
                          onChange={(e) => handleUpdateWorkflow({ samplerNodeId: e.target.value })}
                          placeholder="例: 3"
                          className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
                        />
                      </div>
                    </div>

                    {/* オーバーライド設定 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-[#b0b0b0]">プロパティ上書き</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c]"
                          onClick={handleAddOverride}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          追加
                        </Button>
                      </div>
                      {editingWorkflow.overrides.length === 0 ? (
                        <p className="text-xs text-[#666]">
                          ノードのプロパティを上書きする設定を追加できます
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {editingWorkflow.overrides.map((override, index) => (
                            <div key={index} className="flex gap-1 items-center">
                              <Input
                                value={override.nodeId}
                                onChange={(e) => handleUpdateOverride(index, { nodeId: e.target.value })}
                                placeholder="NodeID"
                                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 w-16"
                              />
                              <Input
                                value={override.property}
                                onChange={(e) => handleUpdateOverride(index, { property: e.target.value })}
                                placeholder="property"
                                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 flex-1"
                              />
                              <Input
                                value={String(override.value)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const numVal = Number(val);
                                  handleUpdateOverride(index, {
                                    value: !isNaN(numVal) && val !== '' ? numVal : val
                                  });
                                }}
                                placeholder="value"
                                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 w-20"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-[#3c3c3c]"
                                onClick={() => handleRemoveOverride(index)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-[#666]">
                        例: NodeID=5, property=width, value=1024
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
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
    </Dialog>
  );
}
