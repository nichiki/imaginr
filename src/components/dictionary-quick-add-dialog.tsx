'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setError(t('dictionary.allFieldsRequired'));
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
        setError(t('dictionary.alreadyExists'));
      } else {
        setError(t('dictionary.addFailed'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-[#252526] border-[#454545]">
        <DialogHeader>
          <DialogTitle className="text-[#cccccc]">{t('dictionary.addToDictionary')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-[#888] mb-1 block">
              {t('dictionary.value')} <span className="text-red-400">*</span>
            </Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('dictionary.valuePlaceholder')}
              className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-[#888] mb-1 block">
              {t('dictionary.description')}
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('dictionary.descriptionExample')}
              className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-[#888] mb-1 block">
                {t('dictionary.contextLabel').split('（')[0]} <span className="text-red-400">*</span>
              </Label>
              <Input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={t('dictionary.contextPlaceholder')}
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
            <div>
              <Label className="text-xs text-[#888] mb-1 block">
                {t('dictionary.keyName')} <span className="text-red-400">*</span>
              </Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('dictionary.keyPlaceholder')}
                className="bg-[#3c3c3c] border-[#454545] text-[#cccccc]"
              />
            </div>
          </div>

          {suggestedContext && suggestedKey && (
            <p className="text-xs text-[#888]">
              {t('dictionary.detectedContext', { context: suggestedContext, key: suggestedKey })}
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
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !value.trim() || !context.trim() || !key.trim()}
            className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
