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
import { Loader2, CheckCircle, XCircle, Upload, Pencil } from 'lucide-react';
import { WorkflowEditor } from './workflow-editor';
import {
  fetchComfyUISettings,
  saveComfyUISettingsAsync,
  getActiveWorkflow,
  createWorkflowConfig,
  migrateLocalStorageToFile,
  type ComfyUISettings,
  type WorkflowConfig,
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
                  <WorkflowEditor
                    workflow={editingWorkflow}
                    onUpdate={handleUpdateWorkflow}
                    onRemove={() => handleRemoveWorkflow(editingWorkflow.id)}
                  />
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
