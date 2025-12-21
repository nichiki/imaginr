'use client';

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import * as dictAPI from '@/lib/dictionary-db-api';

interface DictionaryQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: string;
  suggestedContext?: string;
  suggestedKey?: string;
  onSuccess?: () => void;
}

export function DictionaryQuickAddDialog({
  open,
  onOpenChange,
  initialValue = '',
  suggestedContext = '*',
  suggestedKey = '',
  onSuccess,
}: DictionaryQuickAddDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [description, setDescription] = useState('');
  const [context, setContext] = useState(suggestedContext);
  const [key, setKey] = useState(suggestedKey);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setDescription('');
      setContext(suggestedContext);
      setKey(suggestedKey);
      setError(null);
    }
  }, [open, initialValue, suggestedContext, suggestedKey]);

  const handleSave = async () => {
    if (!value.trim() || !context.trim() || !key.trim()) {
      setError('すべての必須項目を入力してください');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await dictAPI.addEntry(
        context.trim(),
        key.trim(),
        value.trim(),
        description.trim() || undefined
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to add dictionary entry:', e);
      if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
        setError('この値は既に登録されています');
      } else {
        setError('辞書への追加に失敗しました');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-[#252526] border-[#454545]">
        <DialogHeader>
          <DialogTitle className="text-[#cccccc]">辞書に追加</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-[#888] mb-1 block">
              値 <span className="text-red-400">*</span>
            </Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="追加する値"
              className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-[#888] mb-1 block">
              説明（任意）
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="日本語の説明など"
              className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-[#888] mb-1 block">
                コンテキスト <span className="text-red-400">*</span>
              </Label>
              <Input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="* または hair など"
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
            <div>
              <Label className="text-xs text-[#888] mb-1 block">
                キー <span className="text-red-400">*</span>
              </Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="color, style など"
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
          </div>

          {suggestedContext && suggestedKey && (
            <p className="text-xs text-[#888]">
              カーソル位置から検出: {suggestedContext}.{suggestedKey}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="text-[#cccccc]"
          >
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !value.trim() || !context.trim() || !key.trim()}
            className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
