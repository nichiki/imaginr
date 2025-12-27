'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { X, Columns2, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  dirtyTabs: Set<string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseAllTabs?: () => void;
  onReorderTabs: (tabs: string[]) => void;
  onSplitRight?: (path: string) => void;
  paneId?: 'left' | 'right';
}

interface SortableTabProps {
  path: string;
  isActive: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onSplitRight?: () => void;
  showSplitOption: boolean;
}

function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function SortableTab({ path, isActive, isDirty, onSelect, onClose, onSplitRight, showSplitOption }: SortableTabProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: path });

  const style = {
    // translateのみ使用（scaleを除外してサイズ変更を防ぐ）
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className={`
            group flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer select-none
            border-r border-[#3c3c3c] min-w-0 max-w-[200px]
            ${isActive
              ? 'bg-[#1e1e1e] text-white'
              : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#3c3c3c] hover:text-white'
            }
            ${isDragging ? 'opacity-50' : ''}
          `}
          onClick={onSelect}
          title={path}
        >
          <span className="truncate">
            {isDirty && <span className="text-orange-400 mr-1">●</span>}
            {getFileName(path)}
          </span>
          <button
            className={`
              flex-shrink-0 p-0.5 rounded hover:bg-[#4c4c4c]
              ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
            onClick={onClose}
            title={t('tabBar.close')}
          >
            <X size={14} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-[#252526] border-[#333]">
        {showSplitOption && onSplitRight && (
          <ContextMenuItem
            onClick={onSplitRight}
            className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
          >
            <Columns2 className="h-4 w-4 mr-2" />
            {t('tabBar.splitRight')}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={(e) => onClose(e as unknown as React.MouseEvent)}
          className="text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
        >
          <X className="h-4 w-4 mr-2" />
          {t('tabBar.close')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function TabBar({
  tabs,
  activeTab,
  dirtyTabs,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onReorderTabs,
  onSplitRight,
  paneId = 'left',
}: TabBarProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = tabs.indexOf(active.id as string);
        const newIndex = tabs.indexOf(over.id as string);
        onReorderTabs(arrayMove(tabs, oldIndex, newIndex));
      }
    },
    [tabs, onReorderTabs]
  );

  const handleClose = useCallback(
    (path: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onCloseTab(path);
    },
    [onCloseTab]
  );

  const handleSplitRight = useCallback(
    (path: string) => () => {
      onSplitRight?.(path);
    },
    [onSplitRight]
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex bg-[#2d2d2d] border-b border-[#3c3c3c]">
      <div className="flex-1 flex overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
            {tabs.map((path) => (
              <SortableTab
                key={path}
                path={path}
                isActive={path === activeTab}
                isDirty={dirtyTabs.has(path)}
                onSelect={() => onSelectTab(path)}
                onClose={handleClose(path)}
                onSplitRight={handleSplitRight(path)}
                showSplitOption={paneId === 'left' && !!onSplitRight}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {/* Close All button - only show on left pane when there are multiple tabs */}
      {paneId === 'left' && tabs.length > 1 && onCloseAllTabs && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCloseAllTabs}
              className="flex-shrink-0 px-2 py-1.5 text-gray-400 hover:text-white hover:bg-[#3c3c3c] border-l border-[#3c3c3c]"
            >
              <XCircle size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('tabBar.closeAll')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
