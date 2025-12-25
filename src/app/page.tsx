'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTree } from '@/components/file-tree';
import { SnippetPanel } from '@/components/snippet-panel';
import { PromptPanel, type PromptTab, type PromptSubTab } from '@/components/prompt-panel';
import { GenerationPanel } from '@/components/generation-panel';
import { YamlEditor, YamlEditorRef } from '@/components/yaml-editor';
import { fileAPI, FileTreeItem, RenameResult } from '@/lib/file-api';
import yaml from 'js-yaml';
import {
  resolveAndMergeAsync,
  objectToYaml,
  cleanYamlString,
  FileData,
  excludeNegative,
  extractNegativePrompt,
} from '@/lib/yaml-utils';
import { Snippet, snippetAPI } from '@/lib/snippet-api';
import {
  dictionaryAPI,
  buildDictionaryCache,
  DictionaryEntry,
} from '@/lib/dictionary-api';
import {
  initializeFromBundledKeyFile,
  buildKeyDictionaryCache,
  KeyDictionaryEntry,
} from '@/lib/key-dictionary-api';
import {
  loadState,
  saveState,
  fetchComfyUISettings,
  loadComfyUISettings,
  fetchOllamaSettings,
  loadOllamaSettings,
  getActiveWorkflow,
  getEnhancerSystemPrompt,
  DEFAULT_PANEL_SIZES,
  type ComfyUISettings,
  type OllamaSettings,
  type LayoutMode,
} from '@/lib/storage';
import { ComfyUIClient } from '@/lib/comfyui-api';
import { OllamaClient } from '@/lib/ollama-api';
import { imageAPI } from '@/lib/image-api';
import { getComfyUIPath, joinPath } from '@/lib/tauri-utils';
import { SettingsDialog } from '@/components/settings-dialog';
import * as presetAPI from '@/lib/preset-api';
import {
  extractVariablesWithPath,
  resolveVariables,
  VariableDefinition,
  VariableValues,
} from '@/lib/variable-utils';
import { VariableForm } from '@/components/variable-form';
import { TabBar } from '@/components/tab-bar';
import { Button } from '@/components/ui/button';
import { Settings, FileText, PanelTop, PanelBottom, Rows2, Save, RotateCcw } from 'lucide-react';
import { initializeAppData } from '@/lib/init-data';
import { migrateToUnifiedSettings } from '@/lib/storage';

// 全フォルダのパスを収集
function collectAllFolders(items: FileTreeItem[]): string[] {
  const folders: string[] = [];
  for (const item of items) {
    if (item.type === 'folder') {
      folders.push(item.path);
      if (item.children) {
        folders.push(...collectAllFolders(item.children));
      }
    }
  }
  return folders;
}

// ファイルがツリー内に存在するか確認
function fileExistsInTree(items: FileTreeItem[], path: string): boolean {
  for (const item of items) {
    if (item.path === path) return true;
    if (item.type === 'folder' && item.children) {
      if (fileExistsInTree(item.children, path)) return true;
    }
  }
  return false;
}

// ツリーから最初のファイルを探す
function findFirstFile(items: FileTreeItem[], preferFolder?: string): string | null {
  for (const item of items) {
    if (item.type === 'folder' && item.children) {
      if (!preferFolder || item.name === preferFolder) {
        const found = findFirstFile(item.children);
        if (found) return found;
      }
    } else if (item.type === 'file') {
      return item.path;
    }
  }
  // preferFolderで見つからなかったら全体から探す
  if (preferFolder) {
    return findFirstFile(items);
  }
  return null;
}

export default function Home() {
  const { t } = useTranslation();

  // ファイルツリー
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  // ファイル内容のキャッシュ
  const [files, setFiles] = useState<FileData>({});
  // タブ管理
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  // 分割エディタ
  const [splitView, setSplitView] = useState(false);
  const [rightTabs, setRightTabs] = useState<string[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<string>('');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [focusedPane, setFocusedPane] = useState<'left' | 'right'>('left');
  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);
  // 保存中状態
  const [isSaving, setIsSaving] = useState(false);
  // フォルダ開閉状態
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // スニペット一覧（補完用）
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  // 辞書キャッシュ（補完用）
  const [dictionaryCache, setDictionaryCache] = useState<Map<string, DictionaryEntry[]>>(new Map());
  // キー辞書キャッシュ（補完用）
  const [keyDictionaryCache, setKeyDictionaryCache] = useState<Map<string, KeyDictionaryEntry[]>>(new Map());

  // 変数関連
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [variableValuesMap, setVariableValuesMap] = useState<Record<string, VariableValues>>({});

  // 設定ダイアログ
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);

  // マージ結果（変数解決前）
  const [mergedYamlRaw, setMergedYamlRaw] = useState('');
  const [isYamlValid, setIsYamlValid] = useState(true);
  // ネガティブプロンプト（マージ結果から抽出）
  const [negativePrompt, setNegativePrompt] = useState('');

  // プレビューパネルの高さ
  const [previewHeight, setPreviewHeight] = useState(280);
  // 左ペインの幅
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  // 右ペインの幅
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  // 変数パネルの幅
  const [variablePanelWidth, setVariablePanelWidth] = useState(280);
  // 生成パネルの幅
  const [generationPanelWidth, setGenerationPanelWidth] = useState(200);
  // レイアウトモード
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('full');

  // ComfyUI/Ollama設定
  const [comfySettings, setComfySettings] = useState<ComfyUISettings | null>(null);
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings | null>(null);

  // エンハンス関連
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  // キャッシュの有効性判定用（YAML + プリセットID）
  const lastEnhancedConfigRef = useRef<{ yaml: string; presetId: string }>({ yaml: '', presetId: '' });

  // プロパティ上書き値（生成パネルで入力された値）
  const [overrideValues, setOverrideValues] = useState<Record<string, string | number>>({});

  // 生成関連
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // PromptPanelのタブ状態
  const [promptActiveTab, setPromptActiveTab] = useState<PromptTab>('prompt');
  const [promptSubTab, setPromptSubTab] = useState<PromptSubTab>('yaml');

  // 初期化済みフラグ
  const initialized = useRef(false);
  // YamlEditorへのref
  const yamlEditorRef = useRef<YamlEditorRef>(null);

  // リサイズ用のref
  const resizeType = useRef<'preview' | 'left' | 'right' | 'variable' | 'generation' | 'split' | null>(null);
  const startPos = useRef(0);
  const startSize = useRef(0);

  // 初期読み込み
  useEffect(() => {
    async function loadFiles() {
      try {
        // 初回起動時の初期データコピー
        await initializeAppData();

        // 旧設定ファイルを統一設定にマイグレーション
        await migrateToUnifiedSettings();

        // 保存された状態を復元
        const savedState = loadState();
        setPreviewHeight(savedState.previewHeight);
        setLeftPanelWidth(savedState.leftPanelWidth);
        setRightPanelWidth(savedState.rightPanelWidth);
        setVariablePanelWidth(savedState.variablePanelWidth);
        setGenerationPanelWidth(savedState.generationPanelWidth);
        if (savedState.layoutMode) {
          setLayoutMode(savedState.layoutMode);
        }

        const tree = await fileAPI.listFiles();
        setFileTree(tree);

        // フォルダの開閉状態: 保存されていればそれを使用
        // デフォルトは全て閉じる（expandedFolders: []）
        // null は旧バージョンからのマイグレーション用（全て開く）
        if (savedState.expandedFolders !== null) {
          setExpandedFolders(new Set(savedState.expandedFolders));
        } else {
          setExpandedFolders(new Set(collectAllFolders(tree)));
        }

        // タブを復元
        let tabs = savedState.openTabs || [];
        let active = savedState.activeTab || '';

        // 存在しないファイルを除外
        tabs = tabs.filter((path) => fileExistsInTree(tree, path));
        if (active && !tabs.includes(active)) {
          active = tabs[0] || '';
        }

        // タブが空の場合、最初のファイルを開く
        if (tabs.length === 0) {
          const firstFile = findFirstFile(tree, 'shots');
          if (firstFile) {
            tabs = [firstFile];
            active = firstFile;
          }
        }

        // 開いているタブのファイルを読み込み
        const filesData: FileData = {};
        for (const path of tabs) {
          try {
            filesData[path] = await fileAPI.readFile(path);
          } catch {
            // 読み込み失敗したタブは除外
            console.error(`Failed to read file: ${path}`);
          }
        }

        // 読み込みに成功したタブのみ保持
        const validTabs = tabs.filter((path) => path in filesData);
        const validActive = validTabs.includes(active) ? active : validTabs[0] || '';

        setFiles(filesData);
        setOpenTabs(validTabs);
        setActiveTab(validActive);

        // 分割エディタの状態を復元
        if (savedState.splitView && savedState.rightTabs && savedState.rightTabs.length > 0) {
          // 右ペインのタブを読み込み
          const rightFilesData: FileData = {};
          for (const path of savedState.rightTabs) {
            if (filesData[path]) {
              // 既に読み込み済み
              rightFilesData[path] = filesData[path];
            } else {
              try {
                rightFilesData[path] = await fileAPI.readFile(path);
              } catch {
                console.error(`Failed to read file for right pane: ${path}`);
              }
            }
          }
          // 読み込み成功したタブのみ
          const validRightTabs = savedState.rightTabs.filter(
            (path) => path in rightFilesData || path in filesData
          );
          if (validRightTabs.length > 0) {
            setFiles((prev) => ({ ...prev, ...rightFilesData }));
            setSplitView(true);
            setRightTabs(validRightTabs);
            setActiveRightTab(
              validRightTabs.includes(savedState.activeRightTab || '')
                ? savedState.activeRightTab!
                : validRightTabs[0]
            );
            setSplitRatio(savedState.splitRatio || 0.5);
          }
        }

        // スニペットを読み込み
        try {
          const snippetData = await snippetAPI.list();
          setSnippets(snippetData);
        } catch (e) {
          console.error('Failed to load snippets:', e);
        }

        // 辞書を読み込み（初回起動時はバンドルファイルからインポート）
        try {
          await dictionaryAPI.initializeFromBundled();
          const dictData = await dictionaryAPI.list();
          const cache = buildDictionaryCache(dictData);
          setDictionaryCache(cache);
        } catch (e) {
          console.error('Failed to load dictionary:', e);
        }

        // キー辞書を読み込み（初回起動時はバンドルファイルからインポート）
        try {
          await initializeFromBundledKeyFile();
          const keyCache = await buildKeyDictionaryCache();
          console.log('Key dictionary cache loaded:', keyCache.size, 'parent keys');
          for (const [key, entries] of keyCache) {
            console.log(`  ${key}: ${entries.length} entries`);
          }
          setKeyDictionaryCache(keyCache);
        } catch (e) {
          console.error('Failed to load key dictionary:', e);
        }

        // ComfyUI/Ollama設定を読み込み
        setComfySettings(loadComfyUISettings());
        fetchComfyUISettings().then(setComfySettings);
        setOllamaSettings(loadOllamaSettings());
        fetchOllamaSettings().then(setOllamaSettings);

        // エンハンス有効状態を復元
        const savedEnhanceEnabled = localStorage.getItem('image-prompt-builder-enhance-enabled');
        if (savedEnhanceEnabled !== null) {
          setEnhanceEnabled(savedEnhanceEnabled === 'true');
        }

        initialized.current = true;
      } catch (error) {
        console.error('Failed to load files:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadFiles();
  }, []);

  // 現在フォーカスしているペインのアクティブファイル
  const currentFilePath = useMemo(
    () => (focusedPane === 'right' && splitView ? activeRightTab : activeTab),
    [focusedPane, splitView, activeTab, activeRightTab]
  );

  // フォーカスしているペインのアクティブタブの内容
  const currentContent = useMemo(
    () => files[currentFilePath] || '',
    [files, currentFilePath]
  );

  // フォーカスしているペインのファイル名（プロンプトパネル表示用）
  const currentFileName = useMemo(() => {
    if (!currentFilePath) return '';
    const parts = currentFilePath.split('/');
    return parts[parts.length - 1] || '';
  }, [currentFilePath]);

  // フォーカスしているペインのアクティブタブが未保存かどうか
  const isCurrentFileDirty = useMemo(
    () => dirtyFiles.has(currentFilePath),
    [dirtyFiles, currentFilePath]
  );

  // フォーカスしているペインのアクティブタブの変数値
  const currentVariableValues = useMemo(
    () => variableValuesMap[currentFilePath] || {},
    [variableValuesMap, currentFilePath]
  );

  // filesのrefを保持（useEffect内で最新値を参照するため）
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // 変数解決済みのマージ結果（表示用、negativeも含む）
  const mergedYaml = useMemo(
    () => cleanYamlString(resolveVariables(mergedYamlRaw, currentVariableValues)),
    [mergedYamlRaw, currentVariableValues]
  );

  // エンハンス・生成用（negativeを除外）
  const mergedYamlForPrompt = useMemo(() => {
    if (!mergedYaml) return '';
    try {
      const parsed = yaml.load(mergedYaml) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return mergedYaml;
      const withoutNegative = excludeNegative(parsed);
      const result = yaml.dump(withoutNegative, { indent: 2, lineWidth: -1 });
      console.log('[mergedYamlForPrompt] Input has negative:', 'negative' in parsed);
      console.log('[mergedYamlForPrompt] Output has negative:', result.includes('negative'));
      return result;
    } catch {
      return mergedYaml;
    }
  }, [mergedYaml]);

  // 変数解決済みのネガティブプロンプト
  const resolvedNegativePrompt = useMemo(
    () => resolveVariables(negativePrompt, currentVariableValues),
    [negativePrompt, currentVariableValues]
  );

  // mergedYamlが変更されたらエンハンスキャッシュをクリア
  // プリセット変更時はクリアしない（Re-run/生成時に再エンハンスする）
  useEffect(() => {
    const lastConfig = lastEnhancedConfigRef.current;
    if (mergedYaml !== lastConfig.yaml) {
      setEnhancedPrompt('');
      setEnhanceError(null);
    }
  }, [mergedYaml]);

  // エンハンス有効/無効切り替え
  const handleEnhanceEnabledChange = useCallback((enabled: boolean) => {
    setEnhanceEnabled(enabled);
    localStorage.setItem('image-prompt-builder-enhance-enabled', String(enabled));
  }, []);

  // エンハンス実行（GenerationPanelから呼ばれる）
  const handleEnhance = useCallback(async () => {
    if (!ollamaSettings?.enabled || !ollamaSettings.model || !mergedYamlForPrompt) return;

    // Enhancedタブに切り替え
    setPromptActiveTab('prompt');
    setPromptSubTab('enhanced');

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const client = new OllamaClient(ollamaSettings.baseUrl);
      const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);
      const currentPresetId = ollamaSettings.activePresetId || '';
      const currentPreset = ollamaSettings.enhancerPresets?.find(p => p.id === currentPresetId);
      const presetName = currentPreset?.name || 'default';

      console.log(`[Enhance] Using preset: "${presetName}" (${currentPresetId})`);

      const result = await client.generate(
        mergedYamlForPrompt,
        ollamaSettings.model,
        systemPrompt,
        { temperature: ollamaSettings.temperature },
        (progress) => {
          if (progress.content) {
            setEnhancedPrompt(progress.content);
          }
        }
      );

      if (result.success) {
        setEnhancedPrompt(result.content);
        lastEnhancedConfigRef.current = {
          yaml: mergedYamlForPrompt,
          presetId: currentPresetId,
        };
        console.log(`[Enhance] Completed with preset: "${presetName}"`);
      } else {
        setEnhanceError(result.error || 'Enhancement failed');
      }
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsEnhancing(false);
    }
  }, [ollamaSettings, mergedYamlForPrompt]);

  // 画像生成
  const handleGenerate = useCallback(async () => {
    if (!comfySettings?.enabled || !mergedYamlForPrompt) return;

    const activeWorkflow = getActiveWorkflow(comfySettings);
    if (!activeWorkflow) {
      setGenerationError(t('main.noWorkflowSelected'));
      return;
    }

    // Galleryタブに切り替え
    setPromptActiveTab('gallery');

    setIsGenerating(true);
    setGenerationError(null);

    try {
      let promptToUse = mergedYamlForPrompt;

      // エンハンスが有効な場合
      if (enhanceEnabled && ollamaSettings?.enabled) {
        const currentPresetId = ollamaSettings.activePresetId || '';
        const currentPreset = ollamaSettings.enhancerPresets?.find(p => p.id === currentPresetId);
        const presetName = currentPreset?.name || 'default';
        const lastConfig = lastEnhancedConfigRef.current;
        const isCacheValid = enhancedPrompt &&
          lastConfig.yaml === mergedYamlForPrompt &&
          lastConfig.presetId === currentPresetId;

        if (isCacheValid) {
          promptToUse = enhancedPrompt;
          console.log(`[Generate] Using cached enhanced prompt (preset: "${presetName}")`);
        } else {
          const reason = !enhancedPrompt ? 'no cache' :
            lastConfig.yaml !== mergedYamlForPrompt ? 'YAML changed' :
            lastConfig.presetId !== currentPresetId ? `preset changed from "${lastConfig.presetId}" to "${currentPresetId}"` : 'unknown';
          console.log(`[Generate] Running enhancement first (${reason})...`);
          console.log(`[Generate] Using preset: "${presetName}" (${currentPresetId})`);
          const client = new OllamaClient(ollamaSettings.baseUrl);
          const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);

          const enhanceResult = await client.generate(
            mergedYamlForPrompt,
            ollamaSettings.model,
            systemPrompt,
            { temperature: ollamaSettings.temperature }
          );

          if (enhanceResult.success) {
            promptToUse = enhanceResult.content;
            setEnhancedPrompt(enhanceResult.content);
            lastEnhancedConfigRef.current = {
              yaml: mergedYamlForPrompt,
              presetId: currentPresetId,
            };
            console.log(`[Generate] Enhancement completed with preset: "${presetName}"`);
          } else {
            console.warn('[Generate] Enhancement failed, using raw prompt');
          }
        }
      }

      // ワークフローを取得
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const comfyuiDir = await getComfyUIPath();
      const workflowPath = await joinPath(comfyuiDir, activeWorkflow.file);

      if (!(await exists(workflowPath))) {
        throw new Error(`Workflow file not found: ${activeWorkflow.file}`);
      }

      const content = await readTextFile(workflowPath);
      const workflow: Record<string, unknown> = JSON.parse(content);

      // overridesに生成パネルで入力された値を反映
      const effectiveOverrides = activeWorkflow.overrides.map(override => {
        const key = `${override.nodeId}.${override.property}`;
        if (key in overrideValues) {
          return { ...override, value: overrideValues[key] };
        }
        return override;
      });

      // 生成
      const client = new ComfyUIClient(comfySettings.url);
      const result = await client.generate({
        workflow,
        prompt: promptToUse,
        promptNodeId: activeWorkflow.promptNodeId,
        promptProperty: activeWorkflow.promptProperty,
        samplerNodeId: activeWorkflow.samplerNodeId,
        samplerProperty: activeWorkflow.samplerProperty,
        negativePrompt: resolvedNegativePrompt || undefined,
        negativeNodeId: activeWorkflow.negativeNodeId,
        negativeProperty: activeWorkflow.negativeProperty,
        overrides: effectiveOverrides,
      });

      console.log('Generation result:', result);

      if (result.success && result.images.length > 0) {
        console.log('Saving images:', result.images);

        // パラメーターをオブジェクトに変換
        const parametersObj: Record<string, unknown> = {};
        for (const override of effectiveOverrides) {
          if (override.nodeId && override.property && override.value !== '') {
            parametersObj[override.property] = override.value;
          }
        }

        for (const imageUrl of result.images) {
          try {
            console.log('Saving image from:', imageUrl);
            await imageAPI.save({
              imageUrl,
              prompt: promptToUse,
              workflowId: activeWorkflow.id,
              seed: result.seed,
              negativePrompt: resolvedNegativePrompt || undefined,
              parameters: Object.keys(parametersObj).length > 0 ? parametersObj : undefined,
            });
            console.log('Image saved successfully');
          } catch (e) {
            console.error('Failed to save image:', e);
          }
        }
      } else if (!result.success) {
        console.error('Generation failed:', result.error);
        setGenerationError(result.error || 'Generation failed');
      } else {
        console.warn('Generation succeeded but no images returned');
        setGenerationError('No images returned from ComfyUI');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  }, [comfySettings, ollamaSettings, mergedYamlForPrompt, enhanceEnabled, enhancedPrompt, resolvedNegativePrompt, overrideValues, t]);

  // 生成可能かどうか
  const canGenerate = useMemo(() => {
    const activeWorkflow = comfySettings ? getActiveWorkflow(comfySettings) : null;
    return !!(comfySettings?.enabled && activeWorkflow && mergedYamlForPrompt && !isGenerating && !isEnhancing);
  }, [comfySettings, mergedYamlForPrompt, isGenerating, isEnhancing]);

  // エンハンス可能かどうか
  const canEnhance = useMemo(() => {
    return !!(ollamaSettings?.enabled && ollamaSettings?.model && mergedYamlForPrompt);
  }, [ollamaSettings, mergedYamlForPrompt]);

  // ファイルパス一覧（補完用）
  const allFilePaths = useMemo(() => {
    const collectFiles = (items: FileTreeItem[]): string[] => {
      const paths: string[] = [];
      for (const item of items) {
        if (item.type === 'file') {
          paths.push(item.path);
        } else if (item.children) {
          paths.push(...collectFiles(item.children));
        }
      }
      return paths;
    };
    return collectFiles(fileTree);
  }, [fileTree]);

  // ファイル読み込み関数（非同期マージ用）
  const readFileForMerge = useCallback(async (path: string): Promise<string | null> => {
    try {
      return await fileAPI.readFile(path);
    } catch {
      return null;
    }
  }, []);

  // マージ結果とプロンプトテキスト（非同期で計算）
  // マージ後のYAMLから変数を抽出
  useEffect(() => {
    if (!currentFilePath || !currentContent) {
      setMergedYamlRaw('');
      setIsYamlValid(true);
      setVariables([]);
      setNegativePrompt('');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 参照ファイル用のキャッシュ（メイン状態とは別管理）
        // 現在のファイルは生のコンテンツを使用（変数解決前）
        const tempCache: FileData = { ...filesRef.current, [currentFilePath]: currentContent };
        const merged = await resolveAndMergeAsync(currentFilePath, tempCache, readFileForMerge);

        if (cancelled) return;

        // 空オブジェクトが返ってきた場合はパースエラーの可能性
        const isEmpty = Object.keys(merged).length === 0 && currentContent.trim() !== '';
        if (isEmpty) {
          setMergedYamlRaw('');
          setIsYamlValid(false);
          setNegativePrompt('');
          // 変数リストは維持（invalidでも前回の変数を表示し続ける）
          return;
        }

        // ネガティブプロンプトを抽出
        const negPrompt = extractNegativePrompt(merged);
        setNegativePrompt(negPrompt);

        // YAML文字列を生成（negativeも含む、表示用）
        const yamlStr = objectToYaml(merged);

        // マージ後のYAMLオブジェクトから変数を抽出（パス情報付き）
        // ※ negativeも含めた元のmergedから抽出（negative内の変数も対応）
        const vars = extractVariablesWithPath(merged);
        setVariables(vars);

        // 新しい変数があればデフォルト値で初期化（タブごとに管理）
        setVariableValuesMap((prev) => {
          const currentValues = prev[currentFilePath] || {};
          const next = { ...currentValues };
          for (const v of vars) {
            if (!(v.name in next)) {
              // 配列変数は空配列、通常変数は空文字列で初期化
              next[v.name] = v.isMulti ? [] : (v.defaultValue ?? '');
            }
          }
          // 不要な変数を削除
          const varNames = new Set(vars.map((v) => v.name));
          for (const key of Object.keys(next)) {
            if (!varNames.has(key)) {
              delete next[key];
            }
          }
          return { ...prev, [currentFilePath]: next };
        });

        setMergedYamlRaw(yamlStr);
        setIsYamlValid(true);
      } catch {
        if (cancelled) return;
        setMergedYamlRaw('');
        setIsYamlValid(false);
        setNegativePrompt('');
        // 変数リストは維持（invalidでも前回の変数を表示し続ける）
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentFilePath, currentContent, readFileForMerge]);

  // ファイル選択ハンドラ（タブを開く）
  const handleFileSelect = useCallback(async (path: string) => {
    // 既にタブが開いていればアクティブにする
    if (openTabs.includes(path)) {
      setActiveTab(path);
      if (initialized.current) {
        saveState({ activeTab: path });
      }
      return;
    }

    // 新しいファイルを読み込み
    try {
      const content = await fileAPI.readFile(path);
      setFiles((prev) => ({ ...prev, [path]: content }));
    } catch (error) {
      console.error('Failed to read file:', error);
      return;
    }

    // 新しいタブを追加してアクティブにする
    const newTabs = [...openTabs, path];
    setOpenTabs(newTabs);
    setActiveTab(path);

    // 状態を保存
    if (initialized.current) {
      saveState({ openTabs: newTabs, activeTab: path });
    }
  }, [openTabs]);

  // タブを閉じるハンドラ
  const handleCloseTab = useCallback(async (path: string) => {
    // 未保存なら確認
    if (dirtyFiles.has(path)) {
      const { showConfirm } = await import('@/lib/dialog');
      const confirmed = await showConfirm(
        t('dialog.unsavedChanges'),
        { okLabel: t('common.close') }
      );
      if (!confirmed) return;
    }

    // タブを削除
    const closedIndex = openTabs.indexOf(path);
    const newTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(newTabs);

    // ファイルキャッシュから削除
    setFiles((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });

    // 未保存フラグを削除
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });

    // 変数値を削除
    setVariableValuesMap((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });

    // アクティブタブが閉じられた場合、別のタブをアクティブにする
    let newActiveTab = activeTab;
    if (activeTab === path) {
      // 右隣 → 左隣 → なし の順で選択
      newActiveTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || '';
      setActiveTab(newActiveTab);
    }

    // 状態を保存
    if (initialized.current) {
      saveState({ openTabs: newTabs, activeTab: newActiveTab });
    }
  }, [openTabs, activeTab, dirtyFiles, t]);

  // タブ並び替えハンドラ
  const handleReorderTabs = useCallback((newTabs: string[]) => {
    setOpenTabs(newTabs);
    if (initialized.current) {
      saveState({ openTabs: newTabs });
    }
  }, []);

  // 右ペインのタブ並び替えハンドラ
  const handleReorderRightTabs = useCallback((newTabs: string[]) => {
    setRightTabs(newTabs);
    if (initialized.current) {
      saveState({ rightTabs: newTabs });
    }
  }, []);

  // 右に分割して開くハンドラ
  const handleSplitRight = useCallback(async (path: string) => {
    // ファイル内容を確認（既に読み込み済みなら何もしない）
    if (!files[path]) {
      const content = await fileAPI.readFile(path);
      setFiles((prev) => ({ ...prev, [path]: content }));
    }
    // 左ペインから削除
    const newLeftTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(newLeftTabs);
    if (path === activeTab) {
      setActiveTab(newLeftTabs[0] || '');
    }
    // 右ペインに追加
    setSplitView(true);
    setRightTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveRightTab(path);
    setFocusedPane('right');
    if (initialized.current) {
      saveState({
        openTabs: newLeftTabs,
        activeTab: path === activeTab ? newLeftTabs[0] || '' : activeTab,
        splitView: true,
        rightTabs: rightTabs.includes(path) ? rightTabs : [...rightTabs, path],
        activeRightTab: path,
      });
    }
  }, [files, openTabs, activeTab, rightTabs]);

  // 分割側にファイルを開くハンドラ（Cmd+クリック用）
  const handleSelectFileSplit = useCallback(async (path: string) => {
    // ファイル内容を読み込み
    if (!files[path]) {
      const content = await fileAPI.readFile(path);
      setFiles((prev) => ({ ...prev, [path]: content }));
    }
    // 分割ビューを有効化
    setSplitView(true);
    // 右ペインに追加
    setRightTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveRightTab(path);
    setFocusedPane('right');
    if (initialized.current) {
      saveState({
        splitView: true,
        rightTabs: rightTabs.includes(path) ? rightTabs : [...rightTabs, path],
        activeRightTab: path,
      });
    }
  }, [files, rightTabs]);

  // 右ペインでタブを選択
  const handleSelectRightTab = useCallback((path: string) => {
    setActiveRightTab(path);
    setFocusedPane('right');
    if (initialized.current) {
      saveState({ activeRightTab: path });
    }
  }, []);

  // 右ペインのタブを閉じる
  const handleCloseRightTab = useCallback(async (path: string) => {
    // 未保存の確認
    if (dirtyFiles.has(path)) {
      const { showConfirm } = await import('@/lib/dialog');
      const result = await showConfirm(t('dialog.unsavedChanges'));
      if (!result) return;
    }
    const newTabs = rightTabs.filter((t) => t !== path);
    setRightTabs(newTabs);
    // 最後のタブを閉じたら分割終了
    if (newTabs.length === 0) {
      setSplitView(false);
      setFocusedPane('left');
      if (initialized.current) {
        saveState({ splitView: false, rightTabs: [], activeRightTab: '' });
      }
    } else {
      const newActive = path === activeRightTab ? newTabs[0] : activeRightTab;
      setActiveRightTab(newActive);
      if (initialized.current) {
        saveState({ rightTabs: newTabs, activeRightTab: newActive });
      }
    }
  }, [rightTabs, activeRightTab, dirtyFiles, t]);

  // フォルダ開閉ハンドラ
  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      // 保存
      if (initialized.current) {
        saveState({ expandedFolders: Array.from(next) });
      }
      return next;
    });
  }, []);

  // ファイル作成ハンドラ
  const handleCreateFile = useCallback(async (path: string) => {
    try {
      const defaultContent = `# ${path.split('/').pop()?.replace('.yaml', '')}\n\n`;
      await fileAPI.createFile(path, defaultContent);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);
      // 新しいファイルを選択（タブを開く）
      setFiles((prev) => ({ ...prev, [path]: defaultContent }));
      const newTabs = openTabs.includes(path) ? openTabs : [...openTabs, path];
      setOpenTabs(newTabs);
      setActiveTab(path);
      if (initialized.current) {
        saveState({ openTabs: newTabs, activeTab: path });
      }
    } catch (error) {
      console.error('Failed to create file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(t('fileTree.createFileFailed'));
    }
  }, [openTabs, t]);

  // フォルダ作成ハンドラ
  const handleCreateFolder = useCallback(async (path: string) => {
    try {
      await fileAPI.createFolder(path);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);
      // 新しいフォルダを展開状態に追加
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(path);
        if (initialized.current) {
          saveState({ expandedFolders: Array.from(next) });
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to create folder:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(t('fileTree.createFolderFailed'));
    }
  }, [t]);

  // ファイル削除ハンドラ
  const handleDeleteFile = useCallback(async (path: string) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(t('dialog.confirmDeleteFile', { path }))) return;

    try {
      await fileAPI.deleteFile(path);
      // プリセットも削除
      await presetAPI.deletePresetsForTemplate(path);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);

      // タブから削除
      const newTabs = openTabs.filter((t) => t !== path);
      setOpenTabs(newTabs);

      // ファイルキャッシュから削除
      setFiles((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });

      // 未保存フラグを削除
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });

      // 変数値を削除
      setVariableValuesMap((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });

      // 削除したファイルがアクティブタブだった場合、別のタブをアクティブにする
      let newActiveTab = activeTab;
      if (activeTab === path) {
        const closedIndex = openTabs.indexOf(path);
        newActiveTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || '';
        setActiveTab(newActiveTab);
      }

      if (initialized.current) {
        saveState({ openTabs: newTabs, activeTab: newActiveTab });
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(t('fileTree.deleteFileFailed'));
    }
  }, [openTabs, activeTab, t]);

  // ファイル/フォルダ移動ハンドラ
  const handleMoveFile = useCallback(async (from: string, to: string) => {
    try {
      const newPath = await fileAPI.moveFile(from, to);
      // プリセットのパスも更新
      if (from.endsWith('.yaml') || from.endsWith('.yml')) {
        await presetAPI.updatePresetTemplatePath(from, newPath);
      } else {
        await presetAPI.updatePresetFolderPath(from, newPath);
      }
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);

      // キャッシュを更新（移動元を削除し、移動先を追加）
      setFiles((prev) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (key === from) {
            next[newPath] = value;
          } else if (key.startsWith(from + '/')) {
            const relativePath = key.substring(from.length);
            next[newPath + relativePath] = value;
          } else {
            next[key] = value;
          }
        }
        return next;
      });

      // タブのパスを更新
      const newTabs = openTabs.map((t) => {
        if (t === from) return newPath;
        if (t.startsWith(from + '/')) {
          const relativePath = t.substring(from.length);
          return newPath + relativePath;
        }
        return t;
      });
      setOpenTabs(newTabs);

      // 変数値のパスを更新
      setVariableValuesMap((prev) => {
        const next: Record<string, VariableValues> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (key === from) {
            next[newPath] = value;
          } else if (key.startsWith(from + '/')) {
            const relativePath = key.substring(from.length);
            next[newPath + relativePath] = value;
          } else {
            next[key] = value;
          }
        }
        return next;
      });

      // 未保存フラグのパスを更新
      setDirtyFiles((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (p === from) {
            next.add(newPath);
          } else if (p.startsWith(from + '/')) {
            const relativePath = p.substring(from.length);
            next.add(newPath + relativePath);
          } else {
            next.add(p);
          }
        }
        return next;
      });

      // アクティブタブのパスを更新
      let newActiveTab = activeTab;
      if (activeTab === from) {
        newActiveTab = newPath;
        setActiveTab(newPath);
      } else if (activeTab.startsWith(from + '/')) {
        const relativePath = activeTab.substring(from.length);
        newActiveTab = newPath + relativePath;
        setActiveTab(newActiveTab);
      }

      // 展開状態を更新（フォルダの場合）
      setExpandedFolders((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (p === from) {
            next.add(newPath);
          } else if (p.startsWith(from + '/')) {
            const relativePath = p.substring(from.length);
            next.add(newPath + relativePath);
          } else {
            next.add(p);
          }
        }
        if (initialized.current) {
          saveState({ expandedFolders: Array.from(next), openTabs: newTabs, activeTab: newActiveTab });
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to move file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(error instanceof Error ? error.message : t('fileTree.moveFailed'));
    }
  }, [openTabs, activeTab, t]);

  // フォルダ削除ハンドラ
  const handleDeleteFolder = useCallback(async (path: string) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(t('dialog.confirmDeleteFolder', { path }))) return;

    try {
      await fileAPI.deleteFolder(path);
      // フォルダ内のプリセットも削除
      await presetAPI.deletePresetsForFolder(path);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);

      // 削除したフォルダ内のタブを閉じる
      const newTabs = openTabs.filter((t) => !t.startsWith(path + '/'));
      setOpenTabs(newTabs);

      // 削除したフォルダ内のファイルをキャッシュから削除
      setFiles((prev) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (!key.startsWith(path + '/')) {
            next[key] = value;
          }
        }
        return next;
      });

      // 未保存フラグから削除
      setDirtyFiles((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (!p.startsWith(path + '/')) {
            next.add(p);
          }
        }
        return next;
      });

      // 変数値から削除
      setVariableValuesMap((prev) => {
        const next: Record<string, VariableValues> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (!key.startsWith(path + '/')) {
            next[key] = value;
          }
        }
        return next;
      });

      // アクティブタブが削除された場合、別のタブをアクティブにする
      let newActiveTab = activeTab;
      if (activeTab.startsWith(path + '/')) {
        newActiveTab = newTabs[0] || '';
        setActiveTab(newActiveTab);
      }

      // 展開状態から削除
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(path);
        for (const p of prev) {
          if (p.startsWith(path + '/')) {
            next.delete(p);
          }
        }
        if (initialized.current) {
          saveState({ expandedFolders: Array.from(next), openTabs: newTabs, activeTab: newActiveTab });
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(t('fileTree.deleteFolderFailed'));
    }
  }, [openTabs, activeTab, t]);

  // 参照検索ハンドラ
  const handleFindReferences = useCallback(async (path: string): Promise<string[]> => {
    return await fileAPI.findReferences(path);
  }, []);

  // リネームハンドラ
  const handleRenameFile = useCallback(async (
    path: string,
    newName: string,
    updateReferences: boolean
  ): Promise<RenameResult> => {
    const result = await fileAPI.renameFile(path, newName, updateReferences);
    // プリセットのパスも更新
    if (path.endsWith('.yaml') || path.endsWith('.yml')) {
      await presetAPI.updatePresetTemplatePath(path, result.newPath);
    } else {
      await presetAPI.updatePresetFolderPath(path, result.newPath);
    }

    // ファイルツリーを再読み込み
    const tree = await fileAPI.listFiles();
    setFileTree(tree);

    // キャッシュを更新
    setFiles((prev) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (key === path) {
          next[result.newPath] = value;
        } else if (key.startsWith(path + '/')) {
          const relativePath = key.substring(path.length);
          next[result.newPath + relativePath] = value;
        } else if (result.updatedFiles.includes(key)) {
          // 参照が更新されたファイルはキャッシュから削除（次回選択時に再読み込み）
        } else {
          next[key] = value;
        }
      }
      return next;
    });

    // タブのパスを更新
    const newTabs = openTabs.map((t) => {
      if (t === path) return result.newPath;
      if (t.startsWith(path + '/')) {
        const relativePath = t.substring(path.length);
        return result.newPath + relativePath;
      }
      return t;
    });
    setOpenTabs(newTabs);

    // 変数値のパスを更新
    setVariableValuesMap((prev) => {
      const next: Record<string, VariableValues> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (key === path) {
          next[result.newPath] = value;
        } else if (key.startsWith(path + '/')) {
          const relativePath = key.substring(path.length);
          next[result.newPath + relativePath] = value;
        } else {
          next[key] = value;
        }
      }
      return next;
    });

    // 未保存フラグのパスを更新
    setDirtyFiles((prev) => {
      const next = new Set<string>();
      for (const p of prev) {
        if (p === path) {
          next.add(result.newPath);
        } else if (p.startsWith(path + '/')) {
          const relativePath = p.substring(path.length);
          next.add(result.newPath + relativePath);
        } else {
          next.add(p);
        }
      }
      return next;
    });

    // アクティブタブのパスを更新
    let newActiveTab = activeTab;
    if (activeTab === path) {
      newActiveTab = result.newPath;
      setActiveTab(result.newPath);
    } else if (activeTab.startsWith(path + '/')) {
      const relativePath = activeTab.substring(path.length);
      newActiveTab = result.newPath + relativePath;
      setActiveTab(newActiveTab);
    } else if (result.updatedFiles.includes(activeTab)) {
      // アクティブタブの参照が更新された場合、再読み込み
      try {
        const updatedContent = await fileAPI.readFile(activeTab);
        setFiles((prev) => ({ ...prev, [activeTab]: updatedContent }));
      } catch (e) {
        console.error('Failed to reload updated file:', e);
      }
    }

    // 展開状態を更新（フォルダの場合）
    setExpandedFolders((prev) => {
      const next = new Set<string>();
      for (const p of prev) {
        if (p === path) {
          next.add(result.newPath);
        } else if (p.startsWith(path + '/')) {
          const relativePath = p.substring(path.length);
          next.add(result.newPath + relativePath);
        } else {
          next.add(p);
        }
      }
      if (initialized.current) {
        saveState({ expandedFolders: Array.from(next), openTabs: newTabs, activeTab: newActiveTab });
      }
      return next;
    });

    return result;
  }, [openTabs, activeTab]);

  // エディタ変更ハンドラ
  const handleEditorChange = useCallback(
    (value: string) => {
      setFiles((prev) => ({
        ...prev,
        [activeTab]: value,
      }));
      // アクティブタブを未保存に設定
      setDirtyFiles((prev) => new Set(prev).add(activeTab));
    },
    [activeTab]
  );

  // 変数値変更ハンドラ
  const handleVariableValuesChange = useCallback(
    (values: VariableValues) => {
      setVariableValuesMap((prev) => ({
        ...prev,
        [currentFilePath]: values,
      }));
    },
    [currentFilePath]
  );

  // ファイル保存ハンドラ（フォーカスしているペインのファイルを保存）
  const handleSave = useCallback(async () => {
    if (!currentFilePath || !dirtyFiles.has(currentFilePath)) return;

    setIsSaving(true);
    try {
      await fileAPI.writeFile(currentFilePath, files[currentFilePath]);
      // 未保存フラグを削除
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(currentFilePath);
        return next;
      });
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentFilePath, files, dirtyFiles]);

  // パネルサイズをリセット
  const handleResetLayout = useCallback(() => {
    setLeftPanelWidth(DEFAULT_PANEL_SIZES.leftPanelWidth);
    setRightPanelWidth(DEFAULT_PANEL_SIZES.rightPanelWidth);
    setPreviewHeight(DEFAULT_PANEL_SIZES.previewHeight);
    setVariablePanelWidth(DEFAULT_PANEL_SIZES.variablePanelWidth);
    setGenerationPanelWidth(DEFAULT_PANEL_SIZES.generationPanelWidth);
    setSplitRatio(DEFAULT_PANEL_SIZES.splitRatio);
    saveState(DEFAULT_PANEL_SIZES);
  }, []);

  // Ctrl+S で保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // スニペットクリックハンドラ
  const handleSnippetClick = useCallback((snippet: Snippet) => {
    if (yamlEditorRef.current) {
      yamlEditorRef.current.insertSnippet(snippet.content, true); // 全スニペットはブロック形式
    }
  }, []);

  // プレビューリサイズハンドラ
  const handlePreviewResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'preview';
    startPos.current = e.clientY;
    startSize.current = previewHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [previewHeight]);

  // 左ペインリサイズハンドラ
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'left';
    startPos.current = e.clientX;
    startSize.current = leftPanelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [leftPanelWidth]);

  // 右ペインリサイズハンドラ
  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'right';
    startPos.current = e.clientX;
    startSize.current = rightPanelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [rightPanelWidth]);

  // 変数パネルリサイズハンドラ
  const handleVariableResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'variable';
    startPos.current = e.clientX;
    startSize.current = variablePanelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [variablePanelWidth]);

  // 生成パネルリサイズハンドラ
  const handleGenerationResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'generation';
    startPos.current = e.clientX;
    startSize.current = generationPanelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [generationPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeType.current) return;

      if (resizeType.current === 'preview') {
        const delta = startPos.current - e.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, startSize.current + delta));
        setPreviewHeight(newHeight);
      } else if (resizeType.current === 'left') {
        const delta = e.clientX - startPos.current;
        const newWidth = Math.max(150, Math.min(400, startSize.current + delta));
        setLeftPanelWidth(newWidth);
      } else if (resizeType.current === 'right') {
        // 右ペインは左に動かすと広がる
        const delta = startPos.current - e.clientX;
        const newWidth = Math.max(200, Math.min(500, startSize.current + delta));
        setRightPanelWidth(newWidth);
      } else if (resizeType.current === 'variable') {
        const delta = e.clientX - startPos.current;
        const newWidth = Math.max(150, Math.min(400, startSize.current + delta));
        setVariablePanelWidth(newWidth);
      } else if (resizeType.current === 'generation') {
        // 生成パネルは左に動かすと広がる
        const delta = startPos.current - e.clientX;
        const newWidth = Math.max(150, Math.min(350, startSize.current + delta));
        setGenerationPanelWidth(newWidth);
      } else if (resizeType.current === 'split') {
        // 分割ハンドル: 左右の比率を変更
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) {
          const rect = editorContainer.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
        }
      }
    };

    const handleMouseUp = () => {
      resizeType.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // サイズ変更を保存（デバウンス付き）
  useEffect(() => {
    if (!initialized.current) return;
    const timer = setTimeout(() => {
      saveState({ previewHeight, leftPanelWidth, rightPanelWidth, variablePanelWidth, generationPanelWidth, splitRatio });
    }, 500);
    return () => clearTimeout(timer);
  }, [previewHeight, leftPanelWidth, rightPanelWidth, variablePanelWidth, generationPanelWidth, splitRatio]);

  // レイアウトモード変更を保存（即時）
  useEffect(() => {
    if (!initialized.current) return;
    saveState({ layoutMode });
  }, [layoutMode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1e1e1e] text-[#d4d4d4]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      {/* Header */}
      <header className="h-10 flex-shrink-0 bg-[#2d2d2d] flex items-center justify-between px-4 border-b border-[#333]">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium text-white">Imaginr</h1>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[#888] hover:text-white hover:bg-[#3c3c3c] disabled:opacity-50"
            onClick={handleSave}
            disabled={!isCurrentFileDirty || isSaving}
            title={t('common.save')}
          >
            <Save className="h-4 w-4" />
          </Button>
          {isCurrentFileDirty && (
            <span className="text-xs text-amber-400">● {t('header.unsaved')}</span>
          )}
          {isSaving && (
            <span className="text-xs text-blue-400">{t('header.saving')}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* レイアウト切り替えボタン */}
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 hover:bg-[#3c3c3c] ${layoutMode === 'upper' ? 'text-white bg-[#3c3c3c]' : 'text-[#888] hover:text-white'}`}
            onClick={() => setLayoutMode(layoutMode === 'upper' ? 'full' : 'upper')}
            title={t('header.layoutUpper')}
          >
            <PanelBottom className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 hover:bg-[#3c3c3c] ${layoutMode === 'lower' ? 'text-white bg-[#3c3c3c]' : 'text-[#888] hover:text-white'}`}
            onClick={() => setLayoutMode(layoutMode === 'lower' ? 'full' : 'lower')}
            title={t('header.layoutLower')}
          >
            <PanelTop className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 hover:bg-[#3c3c3c] ${layoutMode === 'full' ? 'text-white bg-[#3c3c3c]' : 'text-[#888] hover:text-white'}`}
            onClick={() => setLayoutMode('full')}
            title={t('header.layoutFull')}
          >
            <Rows2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
            onClick={handleResetLayout}
            title={t('header.resetLayout')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-[#444] mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
            onClick={() => setSettingsOpen(true)}
            title={t('header.settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Area (Upper Row) */}
      {layoutMode !== 'lower' && (
      <div className="flex-1 flex min-h-0">
        {/* File Tree */}
        <div
          className="flex-shrink-0 bg-[#252526] border-r border-[#333]"
          style={{ width: leftPanelWidth }}
        >
          <FileTree
            items={fileTree}
            selectedFile={focusedPane === 'left' ? activeTab : activeRightTab}
            onSelectFile={handleFileSelect}
            onSelectFileSplit={handleSelectFileSplit}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolder}
            onMoveFile={handleMoveFile}
            onRenameFile={handleRenameFile}
            onFindReferences={handleFindReferences}
          />
        </div>

        {/* Left Resize Handle */}
        <div
          className="w-1 flex-shrink-0 bg-[#333] cursor-ew-resize hover:bg-[#007acc]"
          onMouseDown={handleLeftResizeStart}
        />

        {/* Editor with Tab Bar (Split Support) */}
        <div id="editor-container" className="flex-1 min-w-0 bg-[#1e1e1e] flex">
          {/* Left Pane */}
          <div
            className="flex flex-col min-w-0"
            style={{ width: splitView ? `${splitRatio * 100}%` : '100%' }}
            onClick={() => setFocusedPane('left')}
          >
            {/* Tab Bar */}
            <TabBar
              tabs={openTabs}
              activeTab={activeTab}
              dirtyTabs={dirtyFiles}
              onSelectTab={(path) => {
                setActiveTab(path);
                setFocusedPane('left');
              }}
              onCloseTab={handleCloseTab}
              onReorderTabs={handleReorderTabs}
              onSplitRight={handleSplitRight}
              paneId="left"
            />

            {/* Editor or Empty Placeholder */}
            <div className="flex-1 min-h-0">
              {activeTab ? (
                <YamlEditor
                  key={activeTab}
                  ref={focusedPane === 'left' ? yamlEditorRef : undefined}
                  value={currentContent}
                  onChange={handleEditorChange}
                  fileList={allFilePaths}
                  snippets={snippets}
                  dictionaryCache={dictionaryCache}
                  keyDictionaryCache={keyDictionaryCache}
                  onDictionaryChange={async () => {
                    try {
                      const dictData = await dictionaryAPI.list();
                      const cache = buildDictionaryCache(dictData);
                      setDictionaryCache(cache);
                    } catch (e) {
                      console.error('Failed to reload dictionary:', e);
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('main.openFile')}</p>
                    <p className="text-sm mt-2 opacity-75">
                      {t('main.selectFromTree')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Split Resize Handle */}
          {splitView && (
            <div
              className="w-1 flex-shrink-0 bg-[#333] cursor-ew-resize hover:bg-[#007acc]"
              onMouseDown={(e) => {
                resizeType.current = 'split';
                startPos.current = e.clientX;
                document.body.style.cursor = 'ew-resize';
              }}
            />
          )}

          {/* Right Pane */}
          {splitView && (
            <div
              className="flex flex-col min-w-0 flex-1"
              onClick={() => setFocusedPane('right')}
            >
              {/* Tab Bar */}
              <TabBar
                tabs={rightTabs}
                activeTab={activeRightTab}
                dirtyTabs={dirtyFiles}
                onSelectTab={handleSelectRightTab}
                onCloseTab={handleCloseRightTab}
                onReorderTabs={handleReorderRightTabs}
                paneId="right"
              />

              {/* Editor or Empty Placeholder */}
              <div className="flex-1 min-h-0">
                {activeRightTab ? (
                  <YamlEditor
                    key={activeRightTab}
                    ref={focusedPane === 'right' ? yamlEditorRef : undefined}
                    value={files[activeRightTab] || ''}
                    onChange={(value) => {
                      setFiles((prev) => ({ ...prev, [activeRightTab]: value }));
                      setDirtyFiles((prev) => new Set(prev).add(activeRightTab));
                    }}
                    fileList={allFilePaths}
                    snippets={snippets}
                    dictionaryCache={dictionaryCache}
                    keyDictionaryCache={keyDictionaryCache}
                    onDictionaryChange={async () => {
                      try {
                        const dictData = await dictionaryAPI.list();
                        const cache = buildDictionaryCache(dictData);
                        setDictionaryCache(cache);
                      } catch (e) {
                        console.error('Failed to reload dictionary:', e);
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('main.openFile')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Resize Handle */}
        <div
          className="w-1 flex-shrink-0 bg-[#333] cursor-ew-resize hover:bg-[#007acc]"
          onMouseDown={handleRightResizeStart}
        />

        {/* Snippets Panel */}
        <div
          className="flex-shrink-0 bg-[#252526] border-l border-[#333]"
          style={{ width: rightPanelWidth }}
        >
          <SnippetPanel
            onInsertSnippet={handleSnippetClick}
            onSnippetsChange={setSnippets}
          />
        </div>
      </div>
      )}

      {/* Preview Resize Handle (only in full mode) */}
      {layoutMode === 'full' && (
      <div
        className="h-1 flex-shrink-0 bg-[#333] cursor-ns-resize hover:bg-[#007acc]"
        onMouseDown={handlePreviewResizeStart}
      />
      )}

      {/* Preview Panel with Variables (Lower Row) */}
      {layoutMode !== 'upper' && (
      <div
        className={`relative flex ${layoutMode === 'lower' ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}
        style={layoutMode === 'lower' ? undefined : { height: previewHeight }}
      >
        {/* Variable Form - always show */}
        <div
          className="flex-shrink-0 overflow-y-auto h-full"
          style={{ width: variablePanelWidth }}
        >
          <VariableForm
            templatePath={currentFilePath}
            variables={variables}
            values={currentVariableValues}
            onChange={handleVariableValuesChange}
            dictionaryCache={dictionaryCache}
            isYamlValid={isYamlValid}
          />
        </div>
        {/* Variable Panel Resize Handle */}
        <div
          className="w-1 flex-shrink-0 bg-[#333] cursor-ew-resize hover:bg-[#007acc]"
          onMouseDown={handleVariableResizeStart}
        />
        {/* Prompt/Gallery Panel */}
        <div className="flex-1 min-w-0 h-full">
          <PromptPanel
            key={settingsKey}
            activeTab={promptActiveTab}
            onActiveTabChange={setPromptActiveTab}
            promptSubTab={promptSubTab}
            onPromptSubTabChange={setPromptSubTab}
            currentFileName={currentFileName}
            mergedYaml={mergedYaml}
            isYamlValid={isYamlValid}
            enhancedPrompt={enhancedPrompt}
            onEnhancedPromptChange={setEnhancedPrompt}
            isEnhancing={isEnhancing}
            enhanceError={enhanceError}
            onClearEnhanceError={() => setEnhanceError(null)}
            comfyEnabled={comfySettings?.enabled || false}
            isGenerating={isGenerating}
          />
        </div>
        {/* Generation Panel Resize Handle */}
        <div
          className="w-1 flex-shrink-0 bg-[#333] cursor-ew-resize hover:bg-[#007acc]"
          onMouseDown={handleGenerationResizeStart}
        />
        {/* Generation Panel */}
        <div
          className="flex-shrink-0 h-full"
          style={{ width: generationPanelWidth }}
        >
          <GenerationPanel
            key={settingsKey}
            currentFileName={currentFileName}
            enhanceEnabled={enhanceEnabled}
            onEnhanceEnabledChange={handleEnhanceEnabledChange}
            onEnhance={handleEnhance}
            hasEnhancedPrompt={!!enhancedPrompt}
            isGenerating={isGenerating}
            isEnhancing={isEnhancing}
            onGenerate={handleGenerate}
            generationError={generationError}
            onClearError={() => setGenerationError(null)}
            canGenerate={canGenerate}
            canEnhance={canEnhance}
            overrideValues={overrideValues}
            onOverrideValuesChange={setOverrideValues}
            onWorkflowChange={() => fetchComfyUISettings().then(setComfySettings)}
            onPresetChange={() => fetchOllamaSettings().then(setOllamaSettings)}
          />
        </div>
      </div>
      )}

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSettingsChange={() => {
          setSettingsKey((k) => k + 1);
          // Also update the settings state to reflect changes in canGenerate/canEnhance
          fetchComfyUISettings().then(setComfySettings);
          fetchOllamaSettings().then(setOllamaSettings);
        }}
        onDictionaryChange={async () => {
          // Reload dictionary cache
          try {
            const dictData = await dictionaryAPI.list();
            const cache = buildDictionaryCache(dictData);
            setDictionaryCache(cache);
          } catch (e) {
            console.error('Failed to reload dictionary:', e);
          }
        }}
      />
    </div>
  );
}
