'use client';

import { useState, useEffect, useRef } from 'react';
import { FileTreeItem, RenameResult } from '@/lib/file-api';
import { cn } from '@/lib/utils';
import { ChevronRight, FileIcon, FolderIcon, FolderPlus, Plus, Trash2, Pencil, Columns2 } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileTreeProps {
  items: FileTreeItem[];
  selectedFile: string;
  onSelectFile: (path: string) => void;
  onSelectFileSplit?: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveFile?: (from: string, to: string) => void;
  onRenameFile?: (path: string, newName: string, updateReferences: boolean) => Promise<RenameResult>;
  onFindReferences?: (path: string) => Promise<string[]>;
}

export function FileTree({
  items,
  selectedFile,
  onSelectFile,
  onSelectFileSplit,
  expandedFolders,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onRenameFile,
  onFindReferences,
}: FileTreeProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [createInFolder, setCreateInFolder] = useState('');
  const [draggedItem, setDraggedItem] = useState<FileTreeItem | null>(null);

  // Rename dialog state
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [newRenameName, setNewRenameName] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [isCheckingReferences, setIsCheckingReferences] = useState(false);
  const [showReferenceWarning, setShowReferenceWarning] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [fileNameError, setFileNameError] = useState('');
  const [folderNameError, setFolderNameError] = useState('');
  const [renameError, setRenameError] = useState('');

  // ファイル名/フォルダ名のバリデーション
  const validateFileName = (name: string): string | null => {
    if (!name.trim()) return null;
    // 禁止文字: / \ : * ? " < > |
    const invalidChars = /[/\\:*?"<>|]/;
    if (invalidChars.test(name)) {
      return '使用できない文字が含まれています: / \\ : * ? " < > |';
    }
    if (name.startsWith('.')) {
      return 'ファイル名は . で始められません';
    }
    return null;
  };

  // PointerSensorにdistanceを設定してクリックとドラッグを区別
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const error = validateFileName(newFileName);
    if (error) {
      setFileNameError(error);
      return;
    }
    const fileName = newFileName.endsWith('.yaml') ? newFileName : `${newFileName}.yaml`;
    const path = createInFolder ? `${createInFolder}/${fileName}` : fileName;
    onCreateFile(path);
    setIsCreateDialogOpen(false);
    setNewFileName('');
    setCreateInFolder('');
    setFileNameError('');
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const error = validateFileName(newFolderName);
    if (error) {
      setFolderNameError(error);
      return;
    }
    const path = createInFolder ? `${createInFolder}/${newFolderName}` : newFolderName;
    onCreateFolder(path);
    setIsFolderDialogOpen(false);
    setNewFolderName('');
    setCreateInFolder('');
    setFolderNameError('');
  };

  const openCreateDialog = (folder: string = '') => {
    setCreateInFolder(folder);
    setNewFileName('');
    setFileNameError('');
    setIsCreateDialogOpen(true);
  };

  const openFolderDialog = (folder: string = '') => {
    setCreateInFolder(folder);
    setNewFolderName('');
    setFolderNameError('');
    setIsFolderDialogOpen(true);
  };

  const openRenameDialog = (path: string, name: string, type: 'file' | 'folder') => {
    setRenameTarget({ path, name, type });
    setNewRenameName(name);
    setReferences([]);
    setShowReferenceWarning(false);
    setRenameError('');
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !newRenameName.trim() || !onRenameFile) return;
    if (newRenameName === renameTarget.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    const error = validateFileName(newRenameName);
    if (error) {
      setRenameError(error);
      return;
    }

    // ファイルの場合のみ参照チェック
    if (renameTarget.type === 'file' && onFindReferences && !showReferenceWarning) {
      setIsCheckingReferences(true);
      try {
        const refs = await onFindReferences(renameTarget.path);
        if (refs.length > 0) {
          setReferences(refs);
          setShowReferenceWarning(true);
          setIsCheckingReferences(false);
          return;
        }
      } catch {
        // 参照チェック失敗してもリネームは続行
      }
      setIsCheckingReferences(false);
    }

    // リネーム実行（参照更新なし）
    await executeRename(false);
  };

  const executeRename = async (updateReferences: boolean) => {
    if (!renameTarget || !newRenameName.trim() || !onRenameFile) return;

    setIsRenaming(true);
    try {
      await onRenameFile(renameTarget.path, newRenameName, updateReferences);
      setIsRenameDialogOpen(false);
      setShowReferenceWarning(false);
    } catch (error) {
      const { showError } = await import('@/lib/dialog');
      await showError(error instanceof Error ? error.message : 'リネームに失敗しました');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as FileTreeItem | undefined;
    if (item) {
      setDraggedItem(item);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedItem(null);
    const { active, over } = event;

    if (!over || !onMoveFile) return;

    const sourceItem = active.data.current?.item as FileTreeItem | undefined;
    const targetPath = over.id as string; // フォルダパスまたは '' (ルート)

    if (!sourceItem) return;

    // 同じフォルダへの移動は無視
    const sourceParent = sourceItem.path.includes('/')
      ? sourceItem.path.substring(0, sourceItem.path.lastIndexOf('/'))
      : '';

    if (sourceParent === targetPath) return;

    // 自分自身へのドロップは無視
    if (sourceItem.path === targetPath) return;

    // 自分の子孫への移動は無視（フォルダの場合）
    if (sourceItem.type === 'folder' && targetPath.startsWith(sourceItem.path + '/')) {
      return;
    }

    onMoveFile(sourceItem.path, targetPath);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full bg-[#252526] flex flex-col overflow-hidden">
        <div className="px-4 py-2 text-xs uppercase text-[#888] font-medium flex-shrink-0 flex items-center justify-between">
          <span>Files</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openFolderDialog('')}
              className="p-0.5 hover:bg-[#3c3c3c] rounded"
              title="New Folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              onClick={() => openCreateDialog('')}
              className="p-0.5 hover:bg-[#3c3c3c] rounded"
              title="New File"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="px-2 pb-4">
            {/* ルートドロップゾーン */}
            <RootDropZone />
            {items.map((item) => (
              <FileTreeNode
                key={item.path}
                item={item}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                onSelectFileSplit={onSelectFileSplit}
                expandedFolders={expandedFolders}
                toggleFolder={onToggleFolder}
                onCreateFile={openCreateDialog}
                onCreateFolder={openFolderDialog}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                onRename={openRenameDialog}
                depth={0}
              />
            ))}
          </div>
        </div>

        {/* New File Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle className="text-white">New File</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="filename.yaml"
                value={newFileName}
                onChange={(e) => {
                  setNewFileName(e.target.value);
                  setFileNameError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                autoFocus
              />
              {fileNameError && (
                <p className="text-xs text-red-400 mt-2">{fileNameError}</p>
              )}
              {createInFolder && (
                <p className="text-xs text-[#888] mt-2">
                  In folder: {createInFolder}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFile}
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Folder Dialog */}
        <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
          <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle className="text-white">New Folder</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="folder name"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  setFolderNameError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                autoFocus
              />
              {folderNameError && (
                <p className="text-xs text-red-400 mt-2">{folderNameError}</p>
              )}
              {createInFolder && (
                <p className="text-xs text-[#888] mt-2">
                  In folder: {createInFolder}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFolderDialogOpen(false)}
                className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setShowReferenceWarning(false);
          }
          setIsRenameDialogOpen(open);
        }}>
          <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle className="text-white">
                {showReferenceWarning ? 'References Found' : `Rename ${renameTarget?.type === 'folder' ? 'Folder' : 'File'}`}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {!showReferenceWarning ? (
                <>
                  <Input
                    placeholder={renameTarget?.type === 'folder' ? 'folder name' : 'filename.yaml'}
                    value={newRenameName}
                    onChange={(e) => {
                      setNewRenameName(e.target.value);
                      setRenameError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                    className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                    autoFocus
                    disabled={isCheckingReferences || isRenaming}
                  />
                  {renameError && (
                    <p className="text-xs text-red-400 mt-2">{renameError}</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-yellow-400">
                    This file is referenced by {references.length} file(s):
                  </p>
                  <ul className="text-xs text-[#888] max-h-32 overflow-y-auto space-y-1 bg-[#1e1e1e] p-2 rounded">
                    {references.map((ref) => (
                      <li key={ref}>{ref}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-[#d4d4d4]">
                    Do you want to update these references automatically?
                  </p>
                </div>
              )}
              {renameTarget && (
                <p className="text-xs text-[#888] mt-2">
                  {renameTarget.path}
                </p>
              )}
            </div>
            <DialogFooter>
              {!showReferenceWarning ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsRenameDialogOpen(false)}
                    className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
                    disabled={isCheckingReferences || isRenaming}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRenameSubmit}
                    className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
                    disabled={isCheckingReferences || isRenaming || !newRenameName.trim()}
                  >
                    {isCheckingReferences ? 'Checking...' : isRenaming ? 'Renaming...' : 'Rename'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsRenameDialogOpen(false)}
                    className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
                    disabled={isRenaming}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => executeRename(false)}
                    className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
                    disabled={isRenaming}
                  >
                    {isRenaming ? 'Renaming...' : 'Rename Only'}
                  </Button>
                  <Button
                    onClick={() => executeRename(true)}
                    className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
                    disabled={isRenaming}
                  >
                    {isRenaming ? 'Updating...' : 'Update References'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ドラッグ中のオーバーレイ */}
      <DragOverlay>
        {draggedItem && (
          <div className="flex items-center gap-1.5 py-1 px-2 text-sm bg-[#094771] text-white rounded-sm opacity-90">
            {draggedItem.type === 'folder' ? (
              <FolderIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
            ) : (
              <FileIcon className="h-4 w-4 text-[#888] flex-shrink-0" />
            )}
            <span>{draggedItem.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ルート直下へのドロップゾーン
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: '', // 空文字 = ルート
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-1 mb-1 rounded transition-colors',
        isOver && 'bg-blue-500/50'
      )}
    />
  );
}

interface FileTreeNodeProps {
  item: FileTreeItem;
  selectedFile: string;
  onSelectFile: (path: string) => void;
  onSelectFileSplit?: (path: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onCreateFile: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onRename: (path: string, name: string, type: 'file' | 'folder') => void;
  depth: number;
}

function FileTreeNode({
  item,
  selectedFile,
  onSelectFile,
  onSelectFileSplit,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onRename,
  depth,
}: FileTreeNodeProps) {
  const isSelected = item.path === selectedFile;
  const paddingLeft = depth * 12 + 8;

  if (item.type === 'folder') {
    return (
      <FolderNode
        item={item}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        onSelectFileSplit={onSelectFileSplit}
        expandedFolders={expandedFolders}
        toggleFolder={toggleFolder}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onDeleteFile={onDeleteFile}
        onDeleteFolder={onDeleteFolder}
        onRename={onRename}
        depth={depth}
        paddingLeft={paddingLeft}
      />
    );
  }

  return (
    <FileNode
      item={item}
      isSelected={isSelected}
      onSelectFile={onSelectFile}
      onSelectFileSplit={onSelectFileSplit}
      onDeleteFile={onDeleteFile}
      onRename={onRename}
      paddingLeft={paddingLeft}
    />
  );
}

interface FolderNodeProps {
  item: FileTreeItem;
  selectedFile: string;
  onSelectFile: (path: string) => void;
  onSelectFileSplit?: (path: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onCreateFile: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onRename: (path: string, name: string, type: 'file' | 'folder') => void;
  depth: number;
  paddingLeft: number;
}

function FolderNode({
  item,
  selectedFile,
  onSelectFile,
  onSelectFileSplit,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onRename,
  depth,
  paddingLeft,
}: FolderNodeProps) {
  const isExpanded = expandedFolders.has(item.path);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-${item.path}`,
    data: { item },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: item.path,
  });

  // ドラッグ中にホバーしたら500ms後に自動展開
  useEffect(() => {
    if (isOver && !isExpanded) {
      expandTimerRef.current = setTimeout(() => {
        toggleFolder(item.path);
      }, 500);
    }
    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
    };
  }, [isOver, isExpanded, toggleFolder, item.path]);

  // ドラッグとドロップの両方のrefを結合
  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div className={cn(isDragging && 'opacity-50')}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            ref={setRefs}
            {...attributes}
            {...listeners}
            className={cn(
              'flex items-center gap-1 py-1 px-2 text-sm text-amber-400 cursor-pointer hover:bg-[#2a2d2e] rounded-sm min-w-0',
              isOver && 'bg-blue-500/30 ring-1 ring-blue-500'
            )}
            style={{ paddingLeft }}
            onClick={() => toggleFolder(item.path)}
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 flex-shrink-0 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
            <FolderIcon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate min-w-0" title={item.name}>{item.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#252526] border-[#333]">
          <ContextMenuItem
            onClick={() => onCreateFile(item.path)}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New File
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCreateFolder(item.path)}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onRename(item.path, item.name, 'folder')}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDeleteFolder(item.path)}
            className="text-red-400 focus:bg-red-900 focus:text-red-200"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isExpanded && item.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          item={child}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          onSelectFileSplit={onSelectFileSplit}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onRename={onRename}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

interface FileNodeProps {
  item: FileTreeItem;
  isSelected: boolean;
  onSelectFile: (path: string) => void;
  onSelectFileSplit?: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRename: (path: string, name: string, type: 'file' | 'folder') => void;
  paddingLeft: number;
}

function FileNode({
  item,
  isSelected,
  onSelectFile,
  onSelectFileSplit,
  onDeleteFile,
  onRename,
  paddingLeft,
}: FileNodeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${item.path}`,
    data: { item },
  });

  const handleClick = (e: React.MouseEvent) => {
    // Cmd+click (Mac) or Ctrl+click (Windows/Linux) で分割側に開く
    if ((e.metaKey || e.ctrlKey) && onSelectFileSplit) {
      onSelectFileSplit(item.path);
    } else {
      onSelectFile(item.path);
    }
  };

  return (
    <div className={cn(isDragging && 'opacity-50')}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={cn(
              'flex items-center gap-1.5 py-1 px-2 text-sm cursor-pointer rounded-sm min-w-0',
              isSelected ? 'bg-[#094771] text-white' : 'text-[#d4d4d4] hover:bg-[#2a2d2e]'
            )}
            style={{ paddingLeft: paddingLeft + 18 }}
            onClick={handleClick}
            title={item.name}
          >
            <FileIcon className="h-4 w-4 text-[#888] flex-shrink-0" />
            <span className="truncate min-w-0">{item.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#252526] border-[#333]">
          {onSelectFileSplit && (
            <ContextMenuItem
              onClick={() => onSelectFileSplit(item.path)}
              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
            >
              <Columns2 className="h-4 w-4 mr-2" />
              右に分割して開く
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() => onRename(item.path, item.name, 'file')}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDeleteFile(item.path)}
            className="text-red-400 focus:bg-red-900 focus:text-red-200"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
