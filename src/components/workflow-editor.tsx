'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import { type WorkflowConfig, type NodeOverride } from '@/lib/storage';

interface WorkflowEditorProps {
  workflow: WorkflowConfig;
  onUpdate: (updates: Partial<WorkflowConfig>) => void;
  onRemove: () => void;
  hideRemoveButton?: boolean;
}

export function WorkflowEditor({ workflow, onUpdate, onRemove, hideRemoveButton }: WorkflowEditorProps) {
  const { t } = useTranslation();

  const handleAddOverride = () => {
    const newOverride: NodeOverride = { nodeId: '', property: '', value: '' };
    onUpdate({
      overrides: [...workflow.overrides, newOverride],
    });
  };

  const handleUpdateOverride = (index: number, updates: Partial<NodeOverride>) => {
    const newOverrides = [...workflow.overrides];
    newOverrides[index] = { ...newOverrides[index], ...updates };
    onUpdate({ overrides: newOverrides });
  };

  const handleRemoveOverride = (index: number) => {
    const newOverrides = workflow.overrides.filter((_, i) => i !== index);
    onUpdate({ overrides: newOverrides });
  };

  return (
    <div className="space-y-3 p-3 bg-[#1e1e1e] rounded border border-[#444]">
      {!hideRemoveButton && (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t('workflow.title')}</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-[#3c3c3c]"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            {t('common.delete')}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-[#b0b0b0]">{t('workflow.displayName')}</Label>
        <Input
          value={workflow.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-[#b0b0b0]">{t('workflow.file')}</Label>
        <Input
          value={workflow.file}
          disabled
          className="bg-[#2d2d2d] border-[#444] text-[#888] text-sm h-8"
        />
      </div>

      {/* プロンプトノード設定 */}
      <div className="space-y-2">
        <Label className="text-xs text-[#b0b0b0]">{t('workflow.promptNode')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={workflow.promptNodeId}
            onChange={(e) => onUpdate({ promptNodeId: e.target.value })}
            placeholder={t('workflow.nodeId')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
          <Input
            value={workflow.promptProperty || ''}
            onChange={(e) => onUpdate({ promptProperty: e.target.value || undefined })}
            placeholder={t('workflow.promptProperty')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
        </div>
      </div>

      {/* サンプラーノード設定 */}
      <div className="space-y-2">
        <Label className="text-xs text-[#b0b0b0]">{t('workflow.samplerNode')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={workflow.samplerNodeId}
            onChange={(e) => onUpdate({ samplerNodeId: e.target.value })}
            placeholder={t('workflow.samplerNodeId')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
          <Input
            value={workflow.samplerProperty || ''}
            onChange={(e) => onUpdate({ samplerProperty: e.target.value || undefined })}
            placeholder={t('workflow.seedProperty')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
        </div>
      </div>

      {/* ネガティブプロンプトノード設定 */}
      <div className="space-y-2">
        <Label className="text-xs text-[#b0b0b0]">{t('workflow.negativeNode')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={workflow.negativeNodeId || ''}
            onChange={(e) => onUpdate({ negativeNodeId: e.target.value || undefined })}
            placeholder={t('workflow.negativeNodeId')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
          <Input
            value={workflow.negativeProperty || ''}
            onChange={(e) => onUpdate({ negativeProperty: e.target.value || undefined })}
            placeholder={t('workflow.negativeProperty')}
            className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-sm h-8"
          />
        </div>
        <p className="text-xs text-[#666]">
          {t('workflow.negativeHint')}
        </p>
      </div>

      {/* オーバーライド設定 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-[#b0b0b0]">{t('workflow.overrides')}</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#3c3c3c]"
            onClick={handleAddOverride}
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('common.add')}
          </Button>
        </div>
        {workflow.overrides.length === 0 ? (
          <p className="text-xs text-[#666]">
            {t('workflow.overridesHint')}
          </p>
        ) : (
          <div className="space-y-2">
            {workflow.overrides.map((override, index) => (
              <div key={index} className="flex gap-1 items-center">
                <Input
                  value={override.nodeId}
                  onChange={(e) => handleUpdateOverride(index, { nodeId: e.target.value })}
                  placeholder="NodeID"
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 flex-1"
                />
                <Input
                  value={override.property}
                  onChange={(e) => handleUpdateOverride(index, { property: e.target.value })}
                  placeholder="property"
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 flex-1"
                />
                <Input
                  value={String(override.value)}
                  onChange={(e) => {
                    const val = e.target.value;
                    const numVal = Number(val);
                    handleUpdateOverride(index, {
                      value: !isNaN(numVal) && val !== '' ? numVal : val
                    });
                  }}
                  placeholder="value"
                  className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4] text-xs h-7 flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-[#3c3c3c]"
                  onClick={() => handleRemoveOverride(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[#666]">
          {t('workflow.overridesExample')}
        </p>
      </div>
    </div>
  );
}
