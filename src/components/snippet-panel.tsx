'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Snippet, snippetAPI, getSnippetsByCategory } from '@/lib/snippet-api';
import { cn } from '@/lib/utils';
import { ChevronRight, Search, Plus, Pencil, Trash2, FileInput } from 'lucide-react';

const NEW_CATEGORY_VALUE = '__new__';
const EXPANDED_CATEGORIES_KEY = 'snippet-expanded-categories';

interface SnippetPanelProps {
  onInsertSnippet: (snippet: Snippet) => void;
  onSnippetsChange?: (snippets: Snippet[]) => void;
}

export function SnippetPanel({ onInsertSnippet, onSnippetsChange }: SnippetPanelProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // localStorageから復元
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(EXPANDED_CATEGORIES_KEY);
        if (saved) {
          return new Set(JSON.parse(saved));
        }
      } catch {
        // 無視
      }
    }
    return new Set(['pose', 'lighting', 'expression']);
  });
  const [isLoading, setIsLoading] = useState(true);

  // 編集ダイアログ用の状態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // ダブルクリック検出用
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 既存カテゴリ一覧
  const existingCategories = useMemo(() => {
    return Array.from(new Set(snippets.map((s) => s.category))).sort();
  }, [snippets]);

  // スニペット一覧を読み込み
  const loadSnippets = useCallback(async () => {
    try {
      const data = await snippetAPI.list();
      setSnippets(data);
      onSnippetsChange?.(data);
    } catch (error) {
      console.error('Failed to load snippets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onSnippetsChange]);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  // カテゴリでグループ化（フラット）
  const categorizedSnippets = useMemo(() => getSnippetsByCategory(snippets), [snippets]);
  const sortedCategories = useMemo(() =>
    Array.from(categorizedSnippets.keys()).sort((a, b) => a.localeCompare(b)),
    [categorizedSnippets]
  );

  const toggleCategory = useCallback((categoryPath: string) => {
    setExpandedCategories((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(categoryPath)) {
        newExpanded.delete(categoryPath);
      } else {
        newExpanded.add(categoryPath);
      }
      // localStorageに保存
      try {
        localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify([...newExpanded]));
      } catch {
        // 無視
      }
      return newExpanded;
    });
  }, []);


  // クリック: 遅延後に編集ダイアログを開く（ダブルクリックでキャンセル）
  const handleClick = (snippet: Snippet) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setEditingSnippet({ ...snippet });
      setIsCreating(false);
      setIsNewCategory(false);
      setNewCategoryName('');
      setEditDialogOpen(true);
      clickTimeoutRef.current = null;
    }, 250);
  };

  // ダブルクリック: 挿入（シングルクリックをキャンセル）
  const handleDoubleClick = (snippet: Snippet) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    onInsertSnippet(snippet);
  };

  // 新規作成（カテゴリ指定可能）
  const handleCreate = useCallback((presetCategory?: string) => {
    // プリセットカテゴリがあればそれを使用、なければデフォルト
    const category = presetCategory || (existingCategories.length > 0 ? existingCategories[0] : 'custom');
    setEditingSnippet({
      id: '',
      category,
      key: 'custom',
      label: '',
      description: '',
      content: '',
    });
    setIsCreating(true);
    // プリセットがある場合は新規カテゴリモードにしない
    setIsNewCategory(!presetCategory && existingCategories.length === 0);
    setNewCategoryName(!presetCategory && existingCategories.length === 0 ? 'custom' : '');
    setEditDialogOpen(true);
  }, [existingCategories]);

  // カテゴリ選択ハンドラ
  const handleCategoryChange = (value: string) => {
    if (!editingSnippet) return;
    if (value === NEW_CATEGORY_VALUE) {
      setIsNewCategory(true);
      setNewCategoryName('');
    } else {
      setIsNewCategory(false);
      setEditingSnippet({ ...editingSnippet, category: value });
    }
  };

  // 保存
  const handleSave = async () => {
    if (!editingSnippet) return;

    // 新規カテゴリの場合、カテゴリ名を適用
    const snippetToSave = isNewCategory
      ? { ...editingSnippet, category: newCategoryName.trim() || 'custom' }
      : editingSnippet;

    try {
      if (isCreating) {
        await snippetAPI.create(snippetToSave);
      } else {
        await snippetAPI.update(snippetToSave);
      }
      setEditDialogOpen(false);
      setEditingSnippet(null);
      setIsNewCategory(false);
      setNewCategoryName('');
      await loadSnippets();
    } catch (error) {
      console.error('Failed to save snippet:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('スニペットの保存に失敗しました');
    }
  };

  // 削除
  const handleDelete = async (snippet: Snippet) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(`"${snippet.label}" を削除しますか？`)) return;

    try {
      await snippetAPI.delete(snippet.id);
      await loadSnippets();
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('スニペットの削除に失敗しました');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#252526] flex items-center justify-center text-[#888] text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <div className="px-4 py-2 text-xs uppercase text-[#888] font-medium flex items-center justify-between">
        <span>Snippets</span>
        <button
          onClick={() => handleCreate()}
          className="p-0.5 hover:bg-[#3c3c3c] rounded"
          title="New Snippet"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#888]" />
          <Input
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs bg-[#3c3c3c] border-[#555] focus:border-[#007acc]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-2 pb-4">
          {snippets.length === 0 ? (
            <div className="text-center text-[#888] text-xs py-4">
              No snippets yet.
              <br />
              Click + to create one.
            </div>
          ) : (
            sortedCategories.map((category) => {
              const categorySnippets = categorizedSnippets.get(category) || [];
              // 検索フィルタ
              const filteredSnippets = searchQuery
                ? categorySnippets.filter(
                    (s) =>
                      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      s.category.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : categorySnippets;

              // 検索でマッチしない場合は非表示
              if (searchQuery && filteredSnippets.length === 0) {
                return null;
              }

              const isExpanded = expandedCategories.has(category);

              return (
                <div key={category} className="mb-1">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <div
                        className="flex items-center gap-1 py-1 px-2 text-sm text-[#cccccc] cursor-pointer hover:bg-[#2a2d2e] rounded-sm"
                        style={{ paddingLeft: 8 }}
                        onClick={() => toggleCategory(category)}
                      >
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isExpanded && 'rotate-90'
                          )}
                        />
                        {category}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-[#252526] border-[#333]">
                      <ContextMenuItem
                        onClick={() => handleCreate(category)}
                        className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Snippet
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                  {isExpanded && (
                    <>
                      {filteredSnippets.map((snippet) => (
                        <ContextMenu key={snippet.id}>
                          <ContextMenuTrigger>
                            <div
                              className="py-1.5 px-2 text-xs cursor-pointer rounded-sm hover:bg-[#2a2d2e] text-[#888] truncate"
                              style={{ paddingLeft: 28 }}
                              onClick={() => handleClick(snippet)}
                              onDoubleClick={() => handleDoubleClick(snippet)}
                              title={snippet.description ? `${snippet.label}（${snippet.description}）` : snippet.label}
                            >
                              <span className="text-[#9cdcfe]">{snippet.label}</span>
                              {snippet.description && (
                                <span>（{snippet.description}）</span>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="bg-[#252526] border-[#333]">
                            <ContextMenuItem
                              onClick={() => handleDoubleClick(snippet)}
                              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                            >
                              <FileInput className="h-4 w-4 mr-2" />
                              Insert
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => handleClick(snippet)}
                              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => handleDelete(snippet)}
                              className="text-red-400 focus:bg-red-900 focus:text-red-200"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 編集ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {isCreating ? 'New Snippet' : 'Edit Snippet'}
            </DialogTitle>
          </DialogHeader>
          {editingSnippet && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#888]">Label</Label>
                  <Input
                    value={editingSnippet.label}
                    onChange={(e) =>
                      setEditingSnippet({ ...editingSnippet, label: e.target.value })
                    }
                    className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                    placeholder="e.g. standing pose"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#888]">Category</Label>
                  {isNewCategory ? (
                    <div className="flex gap-2">
                      <Input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] flex-1"
                        placeholder="New category name"
                        autoFocus
                      />
                      {existingCategories.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsNewCategory(false);
                            setEditingSnippet({
                              ...editingSnippet,
                              category: existingCategories[0],
                            });
                          }}
                          className="bg-transparent border-[#555] text-[#888] hover:bg-[#3c3c3c] px-2"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Select
                      value={editingSnippet.category}
                      onValueChange={handleCategoryChange}
                    >
                      <SelectTrigger className="w-full bg-[#3c3c3c] border-[#555] text-[#d4d4d4]">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#3c3c3c] border-[#555]">
                        {existingCategories.map((cat) => (
                          <SelectItem
                            key={cat}
                            value={cat}
                            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                          >
                            {cat}
                          </SelectItem>
                        ))}
                        <SelectItem
                          value={NEW_CATEGORY_VALUE}
                          className="text-[#9cdcfe] focus:bg-[#094771] focus:text-white"
                        >
                          + New Category...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[#888]">Description (optional)</Label>
                <Input
                  value={editingSnippet.description || ''}
                  onChange={(e) =>
                    setEditingSnippet({ ...editingSnippet, description: e.target.value })
                  }
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                  placeholder="e.g. Basic standing pose"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#888]">Content</Label>
                <Textarea
                  value={editingSnippet.content}
                  onChange={(e) =>
                    setEditingSnippet({ ...editingSnippet, content: e.target.value })
                  }
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] font-mono text-xs min-h-[150px]"
                  placeholder="base: standing&#10;direction: frontal"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editingSnippet?.label || !editingSnippet?.content}
              className="bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-50"
            >
              {isCreating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

