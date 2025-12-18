'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Save, Trash2 } from 'lucide-react';
import type { VariableDefinition, VariableValues } from '@/lib/variable-utils';

interface Preset {
  name: string;
  values: VariableValues;
}

interface VariableFormProps {
  variables: VariableDefinition[];
  values: VariableValues;
  onChange: (values: VariableValues) => void;
}

// プリセットのストレージキーを変数名から生成
function getPresetStorageKey(variables: VariableDefinition[]): string {
  const varNames = variables.map((v) => v.name).sort().join(',');
  return `var-presets:${varNames}`;
}

// プリセットを読み込み
function loadPresets(variables: VariableDefinition[]): Preset[] {
  if (typeof window === 'undefined') return [];
  const key = getPresetStorageKey(variables);
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// プリセットを保存
function savePresetsToStorage(variables: VariableDefinition[], presets: Preset[]): void {
  if (typeof window === 'undefined') return;
  const key = getPresetStorageKey(variables);
  localStorage.setItem(key, JSON.stringify(presets));
}

// 値が一致するかチェック
function areValuesEqual(a: VariableValues, b: VariableValues): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

export function VariableForm({ variables, values, onChange }: VariableFormProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // プリセット読み込み
  useEffect(() => {
    if (variables.length > 0) {
      setPresets(loadPresets(variables));
      setSelectedPreset('');
    }
  }, [variables]);

  // 選択中のプリセットと現在の値が異なるかチェック
  const isModified = useMemo(() => {
    if (!selectedPreset) return false;
    const preset = presets.find((p) => p.name === selectedPreset);
    if (!preset) return false;
    return !areValuesEqual(values, preset.values);
  }, [selectedPreset, presets, values]);

  const handleChange = useCallback(
    (name: string, value: string) => {
      onChange({ ...values, [name]: value });
      // 選択状態は維持（クリアしない）
    },
    [values, onChange]
  );

  // 新規プリセット作成
  const handleCreatePreset = useCallback(() => {
    if (!newPresetName.trim()) return;

    const newPreset: Preset = {
      name: newPresetName.trim(),
      values: { ...values },
    };

    // 同名のプリセットがあれば上書き
    const existingIndex = presets.findIndex((p) => p.name === newPreset.name);
    let newPresets: Preset[];
    if (existingIndex >= 0) {
      newPresets = [...presets];
      newPresets[existingIndex] = newPreset;
    } else {
      newPresets = [...presets, newPreset];
    }

    setPresets(newPresets);
    savePresetsToStorage(variables, newPresets);
    setNewPresetName('');
    setIsCreateDialogOpen(false);
    setSelectedPreset(newPreset.name);
  }, [newPresetName, values, presets, variables]);

  // 選択中のプリセットを上書き保存
  const handleSavePreset = useCallback(() => {
    if (!selectedPreset) return;

    const existingIndex = presets.findIndex((p) => p.name === selectedPreset);
    if (existingIndex < 0) return;

    const newPresets = [...presets];
    newPresets[existingIndex] = {
      name: selectedPreset,
      values: { ...values },
    };

    setPresets(newPresets);
    savePresetsToStorage(variables, newPresets);
  }, [selectedPreset, values, presets, variables]);

  // プリセット読み込み（または「なし」でクリア）
  const handleLoadPreset = useCallback(
    (presetName: string) => {
      if (presetName === '__none__') {
        // プリセットなし → フォームクリア
        const cleared: VariableValues = {};
        variables.forEach((v) => {
          cleared[v.name] = '';
        });
        onChange(cleared);
        setSelectedPreset('');
        return;
      }
      const preset = presets.find((p) => p.name === presetName);
      if (preset) {
        onChange(preset.values);
        setSelectedPreset(presetName);
      }
    },
    [presets, onChange, variables]
  );

  // 保存ボタンのハンドラ
  const handleSaveClick = useCallback(() => {
    if (selectedPreset) {
      // プリセット選択中 → 上書き保存
      handleSavePreset();
    } else {
      // プリセットなし → 名前入力ダイアログを開く
      setIsCreateDialogOpen(true);
    }
  }, [selectedPreset, handleSavePreset]);

  // プリセット削除
  const handleDeletePreset = useCallback(
    (presetName: string) => {
      const newPresets = presets.filter((p) => p.name !== presetName);
      setPresets(newPresets);
      savePresetsToStorage(variables, newPresets);
      if (selectedPreset === presetName) {
        setSelectedPreset('');
      }
    },
    [presets, variables, selectedPreset]
  );

  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      {/* Header - Preview と同じスタイル */}
      <div className="h-11 px-3 flex items-center justify-between border-b border-[#333] flex-shrink-0">
        <span className="text-xs uppercase text-[#888] font-medium">
          Variables
        </span>
        <div className="flex items-center gap-1">
          {/* Save button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-[#888] hover:text-[#d4d4d4] hover:bg-[#3c3c3c] disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={handleSaveClick}
            disabled={selectedPreset ? !isModified : false}
            title={selectedPreset ? `Save to "${selectedPreset}"` : 'Save as new preset'}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preset selector - always show */}
      <div className="px-3 py-2 border-b border-[#333] flex-shrink-0">
        <div className="flex items-center gap-1">
          <Select value={selectedPreset || '__none__'} onValueChange={handleLoadPreset}>
            <SelectTrigger className="h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4] flex-1">
              <SelectValue>
                {selectedPreset ? (
                  <span>
                    {selectedPreset}
                    {isModified && <span className="text-yellow-500 ml-1">*</span>}
                  </span>
                ) : (
                  <span className="text-[#888]">No preset</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[#252526] border-[#333]">
              <SelectItem
                value="__none__"
                className="text-xs text-[#888] focus:bg-[#094771] focus:text-white"
              >
                No preset
              </SelectItem>
              {presets.map((preset) => (
                <SelectItem
                  key={preset.name}
                  value={preset.name}
                  className="text-xs text-[#d4d4d4] focus:bg-[#094771] focus:text-white"
                >
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPreset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
              onClick={() => handleDeletePreset(selectedPreset)}
              title="Delete preset"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Variable inputs */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-3">
          {variables.map((variable) => (
            <div key={variable.name} className="flex flex-col gap-1">
              <Label
                htmlFor={`var-${variable.name}`}
                className="text-xs text-[#9cdcfe]"
              >
                {variable.name}
                {variable.defaultValue && (
                  <span className="text-[#666] ml-1">
                    (default: {variable.defaultValue})
                  </span>
                )}
              </Label>
              <Input
                id={`var-${variable.name}`}
                value={values[variable.name] ?? variable.defaultValue ?? ''}
                onChange={(e) => handleChange(variable.name, e.target.value)}
                placeholder={variable.defaultValue || `Enter ${variable.name}`}
                className="h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save as new preset dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-[#252526] border-[#333] text-[#d4d4d4]">
          <DialogHeader>
            <DialogTitle className="text-white">Save as New Preset</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Preset name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreatePreset()}
              className="bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
              autoFocus
            />
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
              onClick={handleCreatePreset}
              className="bg-[#0e639c] hover:bg-[#1177bb] text-white"
              disabled={!newPresetName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
