'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { DictionaryEntry } from '@/lib/dictionary-db-api';

interface DictionaryEntryListProps {
  context: string;
  keyName: string;
  entries: DictionaryEntry[];
  onAdd: (value: string, descriptionJa?: string, descriptionEn?: string) => Promise<void>;
  onUpdate: (id: number, value: string, descriptionJa?: string, descriptionEn?: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function DictionaryEntryList({
  context,
  keyName,
  entries,
  onAdd,
  onUpdate,
  onDelete,
}: DictionaryEntryListProps) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newDescriptionJa, setNewDescriptionJa] = useState('');
  const [newDescriptionEn, setNewDescriptionEn] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescriptionJa, setEditDescriptionJa] = useState('');
  const [editDescriptionEn, setEditDescriptionEn] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleStartAdd = useCallback(() => {
    setIsAdding(true);
    setNewValue('');
    setNewDescriptionJa('');
    setNewDescriptionEn('');
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewValue('');
    setNewDescriptionJa('');
    setNewDescriptionEn('');
  }, []);

  const handleSaveAdd = useCallback(async () => {
    if (!newValue.trim()) return;
    setIsSaving(true);
    try {
      await onAdd(newValue.trim(), newDescriptionJa.trim() || undefined, newDescriptionEn.trim() || undefined);
      setIsAdding(false);
      setNewValue('');
      setNewDescriptionJa('');
      setNewDescriptionEn('');
    } finally {
      setIsSaving(false);
    }
  }, [newValue, newDescriptionJa, newDescriptionEn, onAdd]);

  const handleStartEdit = useCallback((entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setEditValue(entry.value);
    setEditDescriptionJa(entry.descriptionJa || '');
    setEditDescriptionEn(entry.descriptionEn || '');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
    setEditDescriptionJa('');
    setEditDescriptionEn('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingId === null || !editValue.trim()) return;
    setIsSaving(true);
    try {
      await onUpdate(editingId, editValue.trim(), editDescriptionJa.trim() || undefined, editDescriptionEn.trim() || undefined);
      setEditingId(null);
      setEditValue('');
      setEditDescriptionJa('');
      setEditDescriptionEn('');
    } finally {
      setIsSaving(false);
    }
  }, [editingId, editValue, editDescriptionJa, editDescriptionEn, onUpdate]);

  const handleDelete = useCallback(
    async (id: number) => {
      await onDelete(id);
    },
    [onDelete]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-[#454545]">
        <div className="text-sm text-[#cccccc]">
          <span className="text-[#888]">{context}.</span>
          <span className="font-medium">{keyName}</span>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 && !isAdding ? (
          <div className="p-4 text-center text-[#888] text-sm">
            {t('dictionary.noValues')}
          </div>
        ) : (
          <div className="divide-y divide-[#333]">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-2 hover:bg-[#2a2d2e]"
              >
                {editingId === entry.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-[#888]">
                        {t('dictionary.value')} <span className="text-[#f48771]">*</span>
                      </Label>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-[#888]">{t('dictionary.descriptionJaLabel')}</Label>
                      <Input
                        value={editDescriptionJa}
                        onChange={(e) => setEditDescriptionJa(e.target.value)}
                        className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-[#888]">{t('dictionary.descriptionEnLabel')}</Label>
                      <Input
                        value={editDescriptionEn}
                        onChange={(e) => setEditDescriptionEn(e.target.value)}
                        className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                      />
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="h-6 px-2 text-[#888] hover:text-[#cccccc]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={isSaving || !editValue.trim()}
                        className="h-6 px-2 text-[#89d185] hover:text-[#89d185]"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#cccccc] break-all">
                        {entry.value}
                      </div>
                      {entry.descriptionJa && (
                        <div className="text-xs text-[#888] mt-0.5">
                          <span className="text-[#666]">JA:</span> {entry.descriptionJa}
                        </div>
                      )}
                      {entry.descriptionEn && (
                        <div className="text-xs text-[#888] mt-0.5">
                          <span className="text-[#666]">EN:</span> {entry.descriptionEn}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(entry)}
                        className="h-6 w-6 p-0 text-[#888] hover:text-[#cccccc]"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry.id)}
                        className="h-6 w-6 p-0 text-[#888] hover:text-[#f48771]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new entry */}
      <div className="border-t border-[#454545] p-2">
        {isAdding ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">
                {t('dictionary.value')} <span className="text-[#f48771]">*</span>
              </Label>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleCancelAdd();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">{t('dictionary.descriptionJaLabel')}</Label>
              <Input
                value={newDescriptionJa}
                onChange={(e) => setNewDescriptionJa(e.target.value)}
                className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleCancelAdd();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">{t('dictionary.descriptionEnLabel')}</Label>
              <Input
                value={newDescriptionEn}
                onChange={(e) => setNewDescriptionEn(e.target.value)}
                className="h-7 text-sm bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newValue.trim()) {
                    handleSaveAdd();
                  } else if (e.key === 'Escape') {
                    handleCancelAdd();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelAdd}
                disabled={isSaving}
                className="h-6 px-2 text-xs text-[#888]"
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAdd}
                disabled={isSaving || !newValue.trim()}
                className="h-6 px-2 text-xs bg-[#0e639c] hover:bg-[#1177bb] text-white"
              >
                {t('common.add')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartAdd}
            className="w-full h-7 text-xs text-[#cccccc] hover:bg-[#3c3c3c]"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('dictionary.addValue')}
          </Button>
        )}
      </div>
    </div>
  );
}
