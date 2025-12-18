'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { DictionaryEntry, lookupDictionary } from '@/lib/dictionary-api';

interface Preset {
  name: string;
  values: VariableValues;
}

interface VariableFormProps {
  variables: VariableDefinition[];
  values: VariableValues;
  onChange: (values: VariableValues) => void;
  dictionaryCache: Map<string, DictionaryEntry[]>;
}

// YAMLパスから辞書を検索するためのキーを生成
// 例: "outfit.jacket.style" → ["outfit.jacket", "jacket"] → "jacket.style", "*.style"
function getDictionaryEntries(
  yamlPath: string | undefined,
  dictionaryCache: Map<string, DictionaryEntry[]>
): DictionaryEntry[] {
  if (!yamlPath) return [];

  const parts = yamlPath.split('.');
  if (parts.length === 0) return [];

  const key = parts[parts.length - 1]; // 最後のキー (例: "style")
  const contextPath = parts.slice(0, -1); // コンテキストパス (例: ["outfit", "jacket"])

  return lookupDictionary(dictionaryCache, contextPath, key);
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

// 値が一致するかチェック（配列対応）
function areValuesEqual(a: VariableValues, b: VariableValues): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const valA = a[key];
    const valB = b[key];
    if (Array.isArray(valA) && Array.isArray(valB)) {
      return valA.length === valB.length && valA.every((v, i) => v === valB[i]);
    }
    return valA === valB;
  });
}

// オートコンプリート付きインプット
function AutocompleteInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions: DictionaryEntry[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<DictionaryEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ドロップダウンの表示位置を計算
  const calculateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;

    const inputRect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 160; // max-h-40 = 10rem = 160px

    // 下に表示するスペースがあるか
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;

    // 下にスペースがない場合は上に表示
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownPosition('above');
    } else {
      setDropdownPosition('below');
    }
  }, []);

  // 入力値でフィルタ
  useEffect(() => {
    if (!value.trim()) {
      setFilteredSuggestions(suggestions);
    } else {
      const lower = value.toLowerCase();
      setFilteredSuggestions(
        suggestions.filter(
          (s) =>
            s.value.toLowerCase().includes(lower) ||
            s.description?.toLowerCase().includes(lower)
        )
      );
    }
    setSelectedIndex(-1);
  }, [value, suggestions]);

  // フォーカス時に位置を計算
  const handleFocus = useCallback(() => {
    calculateDropdownPosition();
    setIsOpen(true);
  }, [calculateDropdownPosition]);

  const handleSelect = useCallback(
    (entry: DictionaryEntry) => {
      onChange(entry.value);
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredSuggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
            handleSelect(filteredSuggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filteredSuggestions, selectedIndex, handleSelect]
  );

  // 選択アイテムをスクロールで見える位置に
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => {
          // 少し遅延させてクリックイベントが先に処理されるようにする
          setTimeout(() => setIsOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
        autoComplete="off"
      />
      {isOpen && filteredSuggestions.length > 0 && (
        <div
          ref={listRef}
          className={`absolute z-50 w-full max-h-40 overflow-y-auto bg-[#252526] border border-[#454545] rounded shadow-lg ${
            dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {filteredSuggestions.map((entry, index) => (
            <div
              key={entry.value}
              className={`px-2 py-1 text-xs cursor-pointer ${
                index === selectedIndex
                  ? 'bg-[#094771] text-white'
                  : 'text-[#d4d4d4] hover:bg-[#2a2d2e]'
              }`}
              onMouseDown={() => handleSelect(entry)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span>{entry.value}</span>
              {entry.description && (
                <span className="text-[#888] ml-2">{entry.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 複数選択チェックボックス（カスタム値追加対応）
function MultiSelectCheckboxes({
  id,
  value,
  onChange,
  suggestions,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: DictionaryEntry[];
}) {
  const [customInput, setCustomInput] = useState('');

  // 辞書に含まれる値のセット
  const suggestionValues = useMemo(
    () => new Set(suggestions.map((s) => s.value)),
    [suggestions]
  );

  // カスタム値（辞書にない値）
  const customValues = useMemo(
    () => value.filter((v) => !suggestionValues.has(v)),
    [value, suggestionValues]
  );

  const handleToggle = useCallback(
    (entryValue: string) => {
      if (value.includes(entryValue)) {
        onChange(value.filter((v) => v !== entryValue));
      } else {
        onChange([...value, entryValue]);
      }
    },
    [value, onChange]
  );

  const handleAddCustom = useCallback(() => {
    const trimmed = customInput.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setCustomInput('');
    }
  }, [customInput, value, onChange]);

  const handleRemoveCustom = useCallback(
    (customValue: string) => {
      onChange(value.filter((v) => v !== customValue));
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleAddCustom();
      }
    },
    [handleAddCustom]
  );

  return (
    <div className="flex flex-col gap-2 border border-[#555] rounded p-2 bg-[#3c3c3c]">
      {/* チェックボックス（辞書の値） */}
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
        {suggestions.map((entry) => {
          const label = entry.description
            ? `${entry.value}（${entry.description}）`
            : entry.value;
          return (
            <label
              key={entry.value}
              className="flex items-center gap-2 text-xs text-[#d4d4d4] cursor-pointer hover:bg-[#4c4c4c] px-1 py-0.5 rounded min-w-0"
              title={label}
            >
              <input
                type="checkbox"
                checked={value.includes(entry.value)}
                onChange={() => handleToggle(entry.value)}
                className="w-3 h-3 accent-[#0e639c] flex-shrink-0"
              />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
        {suggestions.length === 0 && (
          <span className="text-[#888] text-xs">No options available</span>
        )}
      </div>

      {/* カスタム値の表示 */}
      {customValues.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-[#555]">
          {customValues.map((cv) => (
            <span
              key={cv}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#4c4c4c] text-[#d4d4d4] text-xs rounded"
            >
              {cv}
              <button
                type="button"
                onClick={() => handleRemoveCustom(cv)}
                className="text-[#888] hover:text-red-400 font-bold leading-none"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* カスタム値追加入力 */}
      <div className="flex gap-1 pt-1 border-t border-[#555]">
        <Input
          id={`${id}-custom`}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add custom value..."
          className="h-6 text-xs bg-[#2d2d2d] border-[#555] text-[#d4d4d4] flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="h-6 px-2 text-xs text-[#888] hover:text-[#d4d4d4] hover:bg-[#4c4c4c] disabled:opacity-30"
        >
          +
        </Button>
      </div>
    </div>
  );
}

export function VariableForm({ variables, values, onChange, dictionaryCache }: VariableFormProps) {
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
    (name: string, value: string | string[]) => {
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
        // 現在の変数リストに存在するキーのみ適用（古いキーは除外）
        const validVarNames = new Set(variables.map((v) => v.name));
        const filteredValues: VariableValues = {};

        // プリセットの値のうち、現在の変数に存在するものだけ適用
        for (const [key, value] of Object.entries(preset.values)) {
          if (validVarNames.has(key)) {
            filteredValues[key] = value;
          }
        }

        // 現在の変数で、プリセットにないものは空文字で初期化
        for (const v of variables) {
          if (!(v.name in filteredValues)) {
            filteredValues[v.name] = '';
          }
        }

        onChange(filteredValues);
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
          {variables.map((variable) => {
            const suggestions = getDictionaryEntries(variable.yamlPath, dictionaryCache);
            const hasSuggestions = suggestions.length > 0;
            const currentValue = values[variable.name];

            return (
              <div key={variable.name} className="flex flex-col gap-1">
                <Label
                  htmlFor={`var-${variable.name}`}
                  className="text-xs text-[#9cdcfe]"
                >
                  {variable.name}
                  {variable.isMulti && (
                    <span className="text-[#888] ml-1">[]</span>
                  )}
                  {variable.defaultValue && (
                    <span className="text-[#666] ml-1">
                      (default: {variable.defaultValue})
                    </span>
                  )}
                </Label>
                {/* YAMLパスをヒントとして表示 */}
                {variable.yamlPath && (
                  <span className="text-[10px] text-[#666] -mt-0.5">
                    {variable.yamlPath}
                  </span>
                )}
                {/* 複数選択変数 */}
                {variable.isMulti && hasSuggestions ? (
                  <MultiSelectCheckboxes
                    id={`var-${variable.name}`}
                    value={Array.isArray(currentValue) ? currentValue : []}
                    onChange={(value) => handleChange(variable.name, value)}
                    suggestions={suggestions}
                  />
                ) : hasSuggestions ? (
                  <AutocompleteInput
                    id={`var-${variable.name}`}
                    value={typeof currentValue === 'string' ? currentValue : (currentValue?.[0] ?? variable.defaultValue ?? '')}
                    onChange={(value) => handleChange(variable.name, value)}
                    placeholder={variable.defaultValue || `Enter ${variable.name}`}
                    suggestions={suggestions}
                  />
                ) : (
                  <Input
                    id={`var-${variable.name}`}
                    value={typeof currentValue === 'string' ? currentValue : (currentValue?.[0] ?? variable.defaultValue ?? '')}
                    onChange={(e) => handleChange(variable.name, e.target.value)}
                    placeholder={variable.defaultValue || `Enter ${variable.name}`}
                    className="h-7 text-xs bg-[#3c3c3c] border-[#555] text-[#d4d4d4]"
                  />
                )}
              </div>
            );
          })}
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
