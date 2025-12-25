'use client';

import { useCallback } from 'react';
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
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  dirtyTabs: Set<string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (tabs: string[]) => void;
}

interface SortableTabProps {
  path: string;
  isActive: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function SortableTab({ path, isActive, isDirty, onSelect, onClose }: SortableTabProps) {
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
        title="閉じる"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TabBar({
  tabs,
  activeTab,
  dirtyTabs,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
}: TabBarProps) {
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

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex bg-[#2d2d2d] border-b border-[#3c3c3c] overflow-x-auto">
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
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
