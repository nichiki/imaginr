'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTreeItem, RenameResult } from '@/lib/file-api';
import { cn } from '@/lib/utils';
import { ChevronRight, FileIcon, FolderIcon, FolderPlus, Plus, Trash2, Pencil, Columns2, Copy } from 'lucide-react';
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
  onDuplicateFile?: (path: string) => void;
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
  onDuplicateFile,
}: FileTreeProps) {
  const { t } = useTranslation();
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
      return t('fileTree.invalidChars');
    }
    if (name.startsWith('.')) {
      return t('fileTree.dotPrefix');
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
    const fileName = `${newFileName}.yaml`;
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
    // ファイルの場合は拡張子を除去して表示
    const displayName = type === 'file' ? name.replace(/\.(yaml|yml)$/, '') : name;
    setNewRenameName(displayName);
    setReferences([]);
    setShowReferenceWarning(false);
    setRenameError('');
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !newRenameName.trim() || !onRenameFile) return;
    // ファイルの場合は拡張子を付けて比較
    const fullNewName = renameTarget.type === 'file' ? `${newRenameName}.yaml` : newRenameName;
    if (fullNewName === renameTarget.name) {
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

    // ファイルの場合は拡張子を付ける
    const fullNewName = renameTarget.type === 'file' ? `${newRenameName}.yaml` : newRenameName;

    setIsRenaming(true);
    try {
      await onRenameFile(renameTarget.path, fullNewName, updateReferences);
      setIsRenameDialogOpen(false);
      setShowReferenceWarning(false);
    } catch (error) {
      const { showError } = await import('@/lib/dialog');
      await showError(error instanceof Error ? error.message : t('fileTree.renameFailed'));
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
          <span>{t('fileTree.files')}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openFolderDialog('')}
              className="p-0.5 hover:bg-[#3c3c3c] rounded"
              title={t('fileTree.newFolder')}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              onClick={() => openCreateDialog('')}
              className="p-0.5 hover:bg-[#3c3c3c] rounded"
              title={t('fileTree.newFile')}
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
                onDuplicate={onDuplicateFile}
                depth={0}
              />
            ))}
          </div>
        </div>

        {/* New File Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle className="text-white">{t('fileTree.newFile')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-1">
                <Input
                  placeholder={t('fileTree.fileNamePlaceholder')}
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    setFileNameError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] flex-1"
                  autoFocus
                />
                <span className="text-[#888] text-sm">.yaml</span>
              </div>
              {fileNameError && (
                <p className="text-xs text-red-400 mt-2">{fileNameError}</p>
              )}
              {createInFolder && (
                <p className="text-xs text-[#888] mt-2">
                  {t('fileTree.inFolder', { folder: createInFolder })}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreateFile}
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Folder Dialog */}
        <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
          <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle className="text-white">{t('fileTree.newFolder')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder={t('fileTree.folderNamePlaceholder')}
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
                  {t('fileTree.inFolder', { folder: createInFolder })}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFolderDialogOpen(false)}
                className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreateFolder}
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                {t('common.create')}
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
                {showReferenceWarning ? t('fileTree.referencesFound') : (renameTarget?.type === 'folder' ? t('fileTree.renameFolder') : t('fileTree.renameFile'))}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {!showReferenceWarning ? (
                <>
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder={renameTarget?.type === 'folder' ? t('fileTree.folderNamePlaceholder') : t('fileTree.fileNamePlaceholder')}
                      value={newRenameName}
                      onChange={(e) => {
                        setNewRenameName(e.target.value);
                        setRenameError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                      className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] flex-1"
                      autoFocus
                      disabled={isCheckingReferences || isRenaming}
                    />
                    {renameTarget?.type === 'file' && (
                      <span className="text-[#888] text-sm">.yaml</span>
                    )}
                  </div>
                  {renameError && (
                    <p className="text-xs text-red-400 mt-2">{renameError}</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-yellow-400">
                    {t('fileTree.referencedBy', { count: references.length })}
                  </p>
                  <ul className="text-xs text-[#888] max-h-32 overflow-y-auto space-y-1 bg-[#1e1e1e] p-2 rounded">
                    {references.map((ref) => (
                      <li key={ref}>{ref}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-[#d4d4d4]">
                    {t('fileTree.updateReferencesQuestion')}
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
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleRenameSubmit}
                    className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
                    disabled={isCheckingReferences || isRenaming || !newRenameName.trim()}
                  >
                    {isCheckingReferences ? t('fileTree.checking') : isRenaming ? t('fileTree.renaming') : t('common.rename')}
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
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => executeRename(false)}
                    className="bg-transparent border-[#555] text-[#d4d4d4] hover:bg-[#3c3c3c]"
                    disabled={isRenaming}
                  >
                    {isRenaming ? t('fileTree.renaming') : t('fileTree.renameOnly')}
                  </Button>
                  <Button
                    onClick={() => executeRename(true)}
                    className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
                    disabled={isRenaming}
                  >
                    {isRenaming ? t('fileTree.updating') : t('fileTree.updateReferences')}
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
  onDuplicate?: (path: string) => void;
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
  onDuplicate,
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
        onDuplicate={onDuplicate}
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
      onDuplicate={onDuplicate}
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
  onDuplicate?: (path: string) => void;
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
  onDuplicate,
  depth,
  paddingLeft,
}: FolderNodeProps) {
  const { t } = useTranslation();
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
            {t('fileTree.newFile')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCreateFolder(item.path)}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            {t('fileTree.newFolder')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onRename(item.path, item.name, 'folder')}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t('common.rename')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDeleteFolder(item.path)}
            className="text-red-400 focus:bg-red-900 focus:text-red-200"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('fileTree.deleteFolder')}
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
          onDuplicate={onDuplicate}
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
  onDuplicate?: (path: string) => void;
  paddingLeft: number;
}

function FileNode({
  item,
  isSelected,
  onSelectFile,
  onSelectFileSplit,
  onDeleteFile,
  onRename,
  onDuplicate,
  paddingLeft,
}: FileNodeProps) {
  const { t } = useTranslation();
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
              {t('fileTree.splitRight')}
            </ContextMenuItem>
          )}
          {onDuplicate && (
            <ContextMenuItem
              onClick={() => onDuplicate(item.path)}
              className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
            >
              <Copy className="h-4 w-4 mr-2" />
              {t('fileTree.duplicate')}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() => onRename(item.path, item.name, 'file')}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t('common.rename')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDeleteFile(item.path)}
            className="text-red-400 focus:bg-red-900 focus:text-red-200"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
