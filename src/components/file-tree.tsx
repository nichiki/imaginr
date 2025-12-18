'use client';

import { useState, useEffect, useRef } from 'react';
import { FileTreeItem } from '@/lib/file-api';
import { cn } from '@/lib/utils';
import { ChevronRight, FileIcon, FolderIcon, FolderPlus, Plus, Trash2 } from 'lucide-react';
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
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveFile?: (from: string, to: string) => void;
}

export function FileTree({
  items,
  selectedFile,
  onSelectFile,
  expandedFolders,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
}: FileTreeProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [createInFolder, setCreateInFolder] = useState('');
  const [draggedItem, setDraggedItem] = useState<FileTreeItem | null>(null);

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
    const fileName = newFileName.endsWith('.yaml') ? newFileName : `${newFileName}.yaml`;
    const path = createInFolder ? `${createInFolder}/${fileName}` : fileName;
    onCreateFile(path);
    setIsCreateDialogOpen(false);
    setNewFileName('');
    setCreateInFolder('');
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const path = createInFolder ? `${createInFolder}/${newFolderName}` : newFolderName;
    onCreateFolder(path);
    setIsFolderDialogOpen(false);
    setNewFolderName('');
    setCreateInFolder('');
  };

  const openCreateDialog = (folder: string = '') => {
    setCreateInFolder(folder);
    setNewFileName('');
    setIsCreateDialogOpen(true);
  };

  const openFolderDialog = (folder: string = '') => {
    setCreateInFolder(folder);
    setNewFolderName('');
    setIsFolderDialogOpen(true);
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
                expandedFolders={expandedFolders}
                toggleFolder={onToggleFolder}
                onCreateFile={openCreateDialog}
                onCreateFolder={openFolderDialog}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
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
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                autoFocus
              />
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
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                autoFocus
              />
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
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onCreateFile: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  depth: number;
}

function FileTreeNode({
  item,
  selectedFile,
  onSelectFile,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
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
        expandedFolders={expandedFolders}
        toggleFolder={toggleFolder}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onDeleteFile={onDeleteFile}
        onDeleteFolder={onDeleteFolder}
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
      onDeleteFile={onDeleteFile}
      paddingLeft={paddingLeft}
    />
  );
}

interface FolderNodeProps {
  item: FileTreeItem;
  selectedFile: string;
  onSelectFile: (path: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onCreateFile: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  depth: number;
  paddingLeft: number;
}

function FolderNode({
  item,
  selectedFile,
  onSelectFile,
  expandedFolders,
  toggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
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
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
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
  onDeleteFile: (path: string) => void;
  paddingLeft: number;
}

function FileNode({
  item,
  isSelected,
  onSelectFile,
  onDeleteFile,
  paddingLeft,
}: FileNodeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${item.path}`,
    data: { item },
  });

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
            onClick={() => onSelectFile(item.path)}
            title={item.name}
          >
            <FileIcon className="h-4 w-4 text-[#888] flex-shrink-0" />
            <span className="truncate min-w-0">{item.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#252526] border-[#333]">
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
