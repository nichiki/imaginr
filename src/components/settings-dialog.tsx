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
import { Loader2, CheckCircle, XCircle, Upload, Trash2 } from 'lucide-react';
import { loadComfyUISettings, saveComfyUISettings, type ComfyUISettings } from '@/lib/storage';
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
    workflowFile: '',
    promptNodeId: '',
    samplerNodeId: '',
  });
  const [workflows, setWorkflows] = useState<WorkflowFile[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 設定とワークフロー一覧を読み込む
  useEffect(() => {
    if (open) {
      setSettings(loadComfyUISettings());
      fetchWorkflows();
    }
  }, [open]);

  const fetchWorkflows = async () => {
    try {
      const response = await fetch('/api/comfyui');
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
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

  const handleSave = () => {
    saveComfyUISettings(settings);
    onSettingsChange?.();
    onOpenChange(false);
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
        await fetchWorkflows();
        updateSettings({ workflowFile: fileName });
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

  const handleDeleteWorkflow = useCallback(async (fileName: string) => {
    if (!confirm(`"${fileName}" を削除しますか？`)) return;

    try {
      const response = await fetch(`/api/comfyui?file=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchWorkflows();
        if (settings.workflowFile === fileName) {
          updateSettings({ workflowFile: '' });
        }
      }
    } catch {
      alert('削除に失敗しました');
    }
  }, [settings.workflowFile]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4] max-w-md">
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

                <div className="space-y-2">
                  <Label htmlFor="workflow" className="text-xs text-[#b0b0b0]">
                    ワークフロー
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={settings.workflowFile}
                      onValueChange={(value) => updateSettings({ workflowFile: value })}
                    >
                      <SelectTrigger className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm flex-1 h-9">
                        <SelectValue placeholder="ワークフローを選択" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252526] border-[#333]">
                        {workflows.length === 0 ? (
                          <SelectItem value="_none" disabled className="text-[#888]">
                            ワークフローがありません
                          </SelectItem>
                        ) : (
                          workflows.map((wf) => (
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
                    {settings.workflowFile && (
                      <Button
                        variant="outline"
                        size="default"
                        className="shrink-0 px-2 h-9 bg-[#3c3c3c] border-[#555] text-red-400 hover:bg-[#4a4a4a] hover:text-red-300"
                        onClick={() => handleDeleteWorkflow(settings.workflowFile)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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

                <div className="space-y-2">
                  <Label htmlFor="prompt-node" className="text-xs text-[#b0b0b0]">
                    プロンプトノードID
                  </Label>
                  <Input
                    id="prompt-node"
                    value={settings.promptNodeId}
                    onChange={(e) => updateSettings({ promptNodeId: e.target.value })}
                    placeholder="例: 6"
                    className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9"
                  />
                  <p className="text-xs text-[#888]">
                    プロンプトを挿入するCLIP Text EncodeノードのID
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sampler-node" className="text-xs text-[#b0b0b0]">
                    サンプラーノードID
                  </Label>
                  <Input
                    id="sampler-node"
                    value={settings.samplerNodeId}
                    onChange={(e) => updateSettings({ samplerNodeId: e.target.value })}
                    placeholder="例: 3"
                    className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-9"
                  />
                  <p className="text-xs text-[#888]">
                    シードをランダム化するサンプラーノードのID
                  </p>
                </div>
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
            className="bg-[#094771] text-white hover:bg-[#0e639c]"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
