'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Download, Upload, Plus } from 'lucide-react';
import { DictionaryContextTree } from './dictionary-context-tree';
import { DictionaryEntryList } from './dictionary-entry-list';
import * as dictAPI from '@/lib/dictionary-db-api';

interface DictionaryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDictionaryChange?: () => void;
}

export function DictionaryManagerDialog({
  open,
  onOpenChange,
  onDictionaryChange,
}: DictionaryManagerDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<dictAPI.DictionaryTreeNode[]>([]);
  const [entries, setEntries] = useState<dictAPI.DictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newKeyContext, setNewKeyContext] = useState('');
  const [newKeyName, setNewKeyName] = useState('');

  // Load tree data on open
  useEffect(() => {
    if (open) {
      loadTreeData();
    }
  }, [open]);

  // Load entries when selection changes
  useEffect(() => {
    if (selectedContext && selectedKey) {
      loadEntries(selectedContext, selectedKey);
    } else {
      setEntries([]);
    }
  }, [selectedContext, selectedKey]);

  const loadTreeData = async () => {
    setIsLoading(true);
    try {
      const tree = await dictAPI.getContextTree();
      setTreeData(tree);
    } catch (e) {
      console.error('Failed to load dictionary tree:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEntries = async (context: string, key: string) => {
    try {
      const data = await dictAPI.getEntriesByContextKey(context, key);
      setEntries(data);
    } catch (e) {
      console.error('Failed to load dictionary entries:', e);
    }
  };

  const handleSelectKey = useCallback((context: string, key: string) => {
    setSelectedContext(context);
    setSelectedKey(key);
  }, []);

  const handleAddEntry = async (value: string, description?: string) => {
    if (!selectedContext || !selectedKey) return;

    try {
      await dictAPI.addEntry(selectedContext, selectedKey, value, description);
      await loadEntries(selectedContext, selectedKey);
      onDictionaryChange?.();
    } catch (e) {
      console.error('Failed to add entry:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('値の追加に失敗しました');
    }
  };

  const handleUpdateEntry = async (id: number, value: string, description?: string) => {
    try {
      await dictAPI.updateEntry(id, value, description);
      if (selectedContext && selectedKey) {
        await loadEntries(selectedContext, selectedKey);
      }
      onDictionaryChange?.();
    } catch (e) {
      console.error('Failed to update entry:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('値の更新に失敗しました');
    }
  };

  const handleDeleteEntry = async (id: number) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm('この値を削除しますか？')) return;

    try {
      await dictAPI.deleteEntry(id);
      if (selectedContext && selectedKey) {
        await loadEntries(selectedContext, selectedKey);
      }
      await loadTreeData();
      onDictionaryChange?.();
    } catch (e) {
      console.error('Failed to delete entry:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('値の削除に失敗しました');
    }
  };

  const handleCreateNewKey = async () => {
    if (!newKeyContext.trim() || !newKeyName.trim()) return;

    try {
      // Create a placeholder entry for the new key
      await dictAPI.addEntry(newKeyContext.trim(), newKeyName.trim(), '(placeholder)', undefined);
      await loadTreeData();
      setSelectedContext(newKeyContext.trim());
      setSelectedKey(newKeyName.trim());
      setShowNewKeyDialog(false);
      setNewKeyContext('');
      setNewKeyName('');
      onDictionaryChange?.();
    } catch (e) {
      console.error('Failed to create new key:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('キーの作成に失敗しました');
    }
  };

  const handleExport = async () => {
    try {
      const yamlContent = await dictAPI.exportToYaml();
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
        defaultPath: 'dictionary-export.yaml',
      });

      if (filePath) {
        await writeTextFile(filePath, yamlContent);
        const { showInfo } = await import('@/lib/dialog');
        await showInfo('辞書をエクスポートしました');
      }
    } catch (e) {
      console.error('Failed to export dictionary:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('エクスポートに失敗しました');
    }
  };

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
        multiple: false,
      });

      if (!filePath || typeof filePath !== 'string') return;

      const content = await readTextFile(filePath);

      // Ask for import mode
      const { showConfirm } = await import('@/lib/dialog');
      const replaceMode = await showConfirm(
        'インポート方法を選択してください:\n\n「OK」= 既存データを全て置き換え\n「キャンセル」= 既存データにマージ',
        { okLabel: '置き換え', cancelLabel: 'マージ' }
      );

      const result = await dictAPI.importFromYaml(content, replaceMode ? 'replace' : 'merge');
      await loadTreeData();
      onDictionaryChange?.();

      const { showInfo } = await import('@/lib/dialog');
      await showInfo(
        `インポート完了:\n追加: ${result.added}件\n更新: ${result.updated}件\nスキップ: ${result.skipped}件`
      );
    } catch (e) {
      console.error('Failed to import dictionary:', e);
      const { showError } = await import('@/lib/dialog');
      await showError('インポートに失敗しました: ' + (e instanceof Error ? e.message : ''));
    }
  };

  // Filter tree based on search query
  const filteredTree = searchQuery.trim()
    ? treeData
        .map((node) => ({
          ...node,
          keys: node.keys.filter(
            (key) =>
              key.toLowerCase().includes(searchQuery.toLowerCase()) ||
              node.context.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((node) => node.keys.length > 0 || node.context.toLowerCase().includes(searchQuery.toLowerCase()))
    : treeData;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-5xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0 bg-[#252526] border-[#454545]">
          <DialogHeader className="px-4 py-3 border-b border-[#454545]">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[#cccccc]">辞書管理</DialogTitle>
              <div className="flex items-center gap-2 mr-8">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleImport}
                  className="h-7 text-xs text-[#cccccc] hover:bg-[#3c3c3c]"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  インポート
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExport}
                  className="h-7 text-xs text-[#cccccc] hover:bg-[#3c3c3c]"
                >
                  <Download className="h-3 w-3 mr-1" />
                  エクスポート
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Search bar */}
          <div className="px-4 py-2 border-b border-[#454545]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
              <Input
                placeholder="検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 bg-[#3c3c3c] border-[#454545] text-[#cccccc] text-sm"
              />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex min-h-0">
            {/* Left pane: Context/Key tree */}
            <div className="w-[280px] min-w-[250px] border-r border-[#454545] flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-[#888] text-sm">読み込み中...</div>
                ) : (
                  <DictionaryContextTree
                    nodes={filteredTree}
                    selectedContext={selectedContext}
                    selectedKey={selectedKey}
                    onSelectKey={handleSelectKey}
                  />
                )}
              </div>
              <div className="p-2 border-t border-[#454545]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewKeyDialog(true)}
                  className="w-full h-7 text-xs text-[#cccccc] hover:bg-[#3c3c3c]"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  新規キー
                </Button>
              </div>
            </div>

            {/* Right pane: Entry list */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedContext && selectedKey ? (
                <DictionaryEntryList
                  context={selectedContext}
                  keyName={selectedKey}
                  entries={entries}
                  onAdd={handleAddEntry}
                  onUpdate={handleUpdateEntry}
                  onDelete={handleDeleteEntry}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#888] text-sm">
                  左のツリーからキーを選択してください
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Key Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="max-w-sm bg-[#252526] border-[#454545]">
          <DialogHeader>
            <DialogTitle className="text-[#cccccc]">新規キーを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#888] mb-1 block">
                コンテキスト（例: hair, outfit, *）
              </label>
              <Input
                value={newKeyContext}
                onChange={(e) => setNewKeyContext(e.target.value)}
                placeholder="*"
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
            <div>
              <label className="text-xs text-[#888] mb-1 block">
                キー名（例: style, color）
              </label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="キー名"
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewKeyDialog(false)}
                className="text-[#cccccc]"
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={handleCreateNewKey}
                disabled={!newKeyContext.trim() || !newKeyName.trim()}
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                作成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
