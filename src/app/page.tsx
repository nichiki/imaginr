'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileTree } from '@/components/file-tree';
import { SnippetPanel } from '@/components/snippet-panel';
import { PromptPanel, type PromptTab, type PromptSubTab } from '@/components/prompt-panel';
import { GenerationPanel } from '@/components/generation-panel';
import { YamlEditor, YamlEditorRef } from '@/components/yaml-editor';
import { fileAPI, FileTreeItem, RenameResult } from '@/lib/file-api';
import {
  resolveAndMergeAsync,
  objectToYaml,
  cleanYamlString,
  FileData,
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
  type ComfyUISettings,
  type OllamaSettings,
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
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { initializeAppData } from '@/lib/init-data';

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
  // ファイルツリー
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  // ファイル内容のキャッシュ
  const [files, setFiles] = useState<FileData>({});
  // 選択中のファイル
  const [selectedFile, setSelectedFile] = useState<string>('');
  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);
  // 保存中状態
  const [isSaving, setIsSaving] = useState(false);
  // 未保存の変更があるか
  const [isDirty, setIsDirty] = useState(false);
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
  const [variableValues, setVariableValues] = useState<VariableValues>({});

  // 設定ダイアログ
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);

  // マージ結果（変数解決前）
  const [mergedYamlRaw, setMergedYamlRaw] = useState('');
  const [isYamlValid, setIsYamlValid] = useState(true);

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

  // ComfyUI/Ollama設定
  const [comfySettings, setComfySettings] = useState<ComfyUISettings | null>(null);
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings | null>(null);

  // エンハンス関連
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const lastEnhancedYamlRef = useRef<string>('');

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
  const resizeType = useRef<'preview' | 'left' | 'right' | 'variable' | 'generation' | null>(null);
  const startPos = useRef(0);
  const startSize = useRef(0);

  // 初期読み込み
  useEffect(() => {
    async function loadFiles() {
      try {
        // 初回起動時の初期データコピー
        await initializeAppData();

        // 保存された状態を復元
        const savedState = loadState();
        setPreviewHeight(savedState.previewHeight);
        setLeftPanelWidth(savedState.leftPanelWidth);
        setRightPanelWidth(savedState.rightPanelWidth);
        setVariablePanelWidth(savedState.variablePanelWidth);
        setGenerationPanelWidth(savedState.generationPanelWidth);

        const tree = await fileAPI.listFiles();
        setFileTree(tree);

        // フォルダの開閉状態: 保存されていればそれを使用、なければ全て開く
        if (savedState.expandedFolders !== null) {
          setExpandedFolders(new Set(savedState.expandedFolders));
        } else {
          // 初回起動時: デフォルトで全フォルダを開く
          setExpandedFolders(new Set(collectAllFolders(tree)));
        }

        // 保存されたファイルがあればそれを選択、なければ最初のshotファイル
        let fileToSelect = savedState.selectedFile;

        // 保存されたファイルがツリー内に存在するか確認
        if (fileToSelect && !fileExistsInTree(tree, fileToSelect)) {
          console.warn(`Saved file not found: ${fileToSelect}, falling back to first file`);
          fileToSelect = '';
        }

        if (!fileToSelect) {
          fileToSelect = findFirstFile(tree, 'shots') || '';
        }

        if (fileToSelect) {
          setSelectedFile(fileToSelect);
          // 選択ファイルを読み込み（_base/_layersは非同期マージ時に動的読み込み）
          const content = await fileAPI.readFile(fileToSelect);
          setFiles({ [fileToSelect]: content });
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

  // 現在のファイル内容
  const currentContent = useMemo(
    () => files[selectedFile] || '',
    [files, selectedFile]
  );

  // filesのrefを保持（useEffect内で最新値を参照するため）
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // 変数解決済みのマージ結果（空の値を除去）
  const mergedYaml = useMemo(
    () => cleanYamlString(resolveVariables(mergedYamlRaw, variableValues)),
    [mergedYamlRaw, variableValues]
  );

  // mergedYamlが変更されたらエンハンスキャッシュをクリア
  useEffect(() => {
    if (mergedYaml !== lastEnhancedYamlRef.current) {
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
    if (!ollamaSettings?.enabled || !ollamaSettings.model || !mergedYaml) return;

    // Enhancedタブに切り替え
    setPromptActiveTab('prompt');
    setPromptSubTab('enhanced');

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      const client = new OllamaClient(ollamaSettings.baseUrl);
      const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);

      const result = await client.generate(
        mergedYaml,
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
        lastEnhancedYamlRef.current = mergedYaml;
      } else {
        setEnhanceError(result.error || 'Enhancement failed');
      }
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsEnhancing(false);
    }
  }, [ollamaSettings, mergedYaml]);

  // 画像生成
  const handleGenerate = useCallback(async () => {
    if (!comfySettings?.enabled || !mergedYaml) return;

    const activeWorkflow = getActiveWorkflow(comfySettings);
    if (!activeWorkflow) {
      setGenerationError('ワークフローが選択されていません');
      return;
    }

    // Galleryタブに切り替え
    setPromptActiveTab('gallery');

    setIsGenerating(true);
    setGenerationError(null);

    try {
      let promptToUse = mergedYaml;

      // エンハンスが有効な場合
      if (enhanceEnabled && ollamaSettings?.enabled) {
        if (enhancedPrompt && lastEnhancedYamlRef.current === mergedYaml) {
          promptToUse = enhancedPrompt;
          console.log('[Generate] Using cached enhanced prompt');
        } else {
          console.log('[Generate] Running enhancement first...');
          const client = new OllamaClient(ollamaSettings.baseUrl);
          const systemPrompt = getEnhancerSystemPrompt(ollamaSettings);

          const enhanceResult = await client.generate(
            mergedYaml,
            ollamaSettings.model,
            systemPrompt,
            { temperature: ollamaSettings.temperature }
          );

          if (enhanceResult.success) {
            promptToUse = enhanceResult.content;
            setEnhancedPrompt(enhanceResult.content);
            lastEnhancedYamlRef.current = mergedYaml;
            console.log('[Generate] Enhancement completed');
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

      // 生成
      const client = new ComfyUIClient(comfySettings.url);
      const result = await client.generate(
        workflow,
        promptToUse,
        activeWorkflow.promptNodeId,
        activeWorkflow.samplerNodeId,
        activeWorkflow.overrides
      );

      console.log('Generation result:', result);

      if (result.success && result.images.length > 0) {
        console.log('Saving images:', result.images);
        for (const imageUrl of result.images) {
          try {
            console.log('Saving image from:', imageUrl);
            await imageAPI.save(imageUrl, promptToUse, activeWorkflow.id);
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
  }, [comfySettings, ollamaSettings, mergedYaml, enhanceEnabled, enhancedPrompt]);

  // 生成可能かどうか
  const canGenerate = useMemo(() => {
    const activeWorkflow = comfySettings ? getActiveWorkflow(comfySettings) : null;
    return comfySettings?.enabled && !!activeWorkflow && !!mergedYaml && !isGenerating && !isEnhancing;
  }, [comfySettings, mergedYaml, isGenerating, isEnhancing]);

  // エンハンス可能かどうか
  const canEnhance = useMemo(() => {
    return ollamaSettings?.enabled && !!ollamaSettings?.model && !!mergedYaml;
  }, [ollamaSettings, mergedYaml]);

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
    if (!selectedFile || !currentContent) {
      setMergedYamlRaw('');
      setIsYamlValid(true);
      setVariables([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 参照ファイル用のキャッシュ（メイン状態とは別管理）
        // 現在のファイルは生のコンテンツを使用（変数解決前）
        const tempCache: FileData = { ...filesRef.current, [selectedFile]: currentContent };
        const merged = await resolveAndMergeAsync(selectedFile, tempCache, readFileForMerge);

        if (cancelled) return;

        // 空オブジェクトが返ってきた場合はパースエラーの可能性
        const isEmpty = Object.keys(merged).length === 0 && currentContent.trim() !== '';
        if (isEmpty) {
          setMergedYamlRaw('');
          setIsYamlValid(false);
          // 変数リストは維持（invalidでも前回の変数を表示し続ける）
          return;
        }

        const yamlStr = objectToYaml(merged);

        // マージ後のYAMLオブジェクトから変数を抽出（パス情報付き）
        const vars = extractVariablesWithPath(merged);
        setVariables(vars);

        // 新しい変数があればデフォルト値で初期化
        setVariableValues((prev) => {
          const next = { ...prev };
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
          return next;
        });

        setMergedYamlRaw(yamlStr);
        setIsYamlValid(true);
      } catch {
        if (cancelled) return;
        setMergedYamlRaw('');
        setIsYamlValid(false);
        // 変数リストは維持（invalidでも前回の変数を表示し続ける）
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, currentContent, readFileForMerge]);

  // ファイル選択ハンドラ
  const handleFileSelect = useCallback(async (path: string) => {
    // 同じファイルを選択した場合は何もしない
    if (path === selectedFile) return;

    // 未保存の変更がある場合は確認
    if (isDirty) {
      const { showConfirm } = await import('@/lib/dialog');
      const confirmed = await showConfirm(
        '未保存の変更があります。保存せずに別のファイルを開きますか？',
        { okLabel: '開く' }
      );
      if (!confirmed) return;

      // 現在のファイルの未保存変更を破棄（ディスクから再読み込み）
      try {
        const originalContent = await fileAPI.readFile(selectedFile);
        setFiles((prev) => ({ ...prev, [selectedFile]: originalContent }));
      } catch (error) {
        console.error('Failed to reload original file:', error);
      }
    }

    // 新しいファイルを読み込み（常にディスクから読み込む）
    try {
      const content = await fileAPI.readFile(path);
      setFiles((prev) => ({ ...prev, [path]: content }));
    } catch (error) {
      console.error('Failed to read file:', error);
      return;
    }

    setSelectedFile(path);
    setIsDirty(false);
    // 選択したファイルを保存
    if (initialized.current) {
      saveState({ selectedFile: path });
    }
  }, [selectedFile, isDirty]);

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
      // 新しいファイルを選択
      setFiles((prev) => ({ ...prev, [path]: defaultContent }));
      setSelectedFile(path);
      setIsDirty(false);
      if (initialized.current) {
        saveState({ selectedFile: path });
      }
    } catch (error) {
      console.error('Failed to create file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('ファイルの作成に失敗しました');
    }
  }, []);

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
      await showError('フォルダの作成に失敗しました');
    }
  }, []);

  // ファイル削除ハンドラ
  const handleDeleteFile = useCallback(async (path: string) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(`"${path}" を削除しますか？`)) return;

    try {
      await fileAPI.deleteFile(path);
      // プリセットも削除
      await presetAPI.deletePresetsForTemplate(path);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);
      // 削除したファイルが選択中だった場合、別のファイルを選択
      if (selectedFile === path) {
        const firstFile = findFirstFile(tree, 'shots');
        if (firstFile) {
          const content = await fileAPI.readFile(firstFile);
          setFiles((prev) => {
            const next = { ...prev };
            delete next[path];
            next[firstFile] = content;
            return next;
          });
          setSelectedFile(firstFile);
        } else {
          setSelectedFile('');
          setFiles((prev) => {
            const next = { ...prev };
            delete next[path];
            return next;
          });
        }
      } else {
        setFiles((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to delete file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('ファイルの削除に失敗しました');
    }
  }, [selectedFile]);

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
            // 移動したファイルは新しいパスで追加
            next[newPath] = value;
          } else if (key.startsWith(from + '/')) {
            // 移動したフォルダ内のファイルも更新
            const relativePath = key.substring(from.length);
            next[newPath + relativePath] = value;
          } else {
            next[key] = value;
          }
        }
        return next;
      });

      // 選択中のファイルが移動対象だった場合、新しいパスを選択
      if (selectedFile === from) {
        setSelectedFile(newPath);
        if (initialized.current) {
          saveState({ selectedFile: newPath });
        }
      } else if (selectedFile.startsWith(from + '/')) {
        // 移動したフォルダ内のファイルを選択中だった場合
        const relativePath = selectedFile.substring(from.length);
        const newSelectedPath = newPath + relativePath;
        setSelectedFile(newSelectedPath);
        if (initialized.current) {
          saveState({ selectedFile: newSelectedPath });
        }
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
          saveState({ expandedFolders: Array.from(next) });
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to move file:', error);
      const { showError } = await import('@/lib/dialog');
      await showError(error instanceof Error ? error.message : 'ファイルの移動に失敗しました');
    }
  }, [selectedFile]);

  // フォルダ削除ハンドラ
  const handleDeleteFolder = useCallback(async (path: string) => {
    const { showConfirm } = await import('@/lib/dialog');
    if (!await showConfirm(`フォルダ "${path}" とその中身をすべて削除しますか？`)) return;

    try {
      await fileAPI.deleteFolder(path);
      // フォルダ内のプリセットも削除
      await presetAPI.deletePresetsForFolder(path);
      // ファイルツリーを再読み込み
      const tree = await fileAPI.listFiles();
      setFileTree(tree);
      // 削除したフォルダ内のファイルが選択中だった場合、別のファイルを選択
      if (selectedFile.startsWith(path + '/')) {
        const firstFile = findFirstFile(tree, 'shots');
        if (firstFile) {
          const content = await fileAPI.readFile(firstFile);
          setFiles((prev) => {
            // 削除したフォルダ内のファイルをキャッシュから削除
            const next: Record<string, string> = {};
            for (const [key, value] of Object.entries(prev)) {
              if (!key.startsWith(path + '/')) {
                next[key] = value;
              }
            }
            next[firstFile] = content;
            return next;
          });
          setSelectedFile(firstFile);
        } else {
          setSelectedFile('');
          setFiles((prev) => {
            const next: Record<string, string> = {};
            for (const [key, value] of Object.entries(prev)) {
              if (!key.startsWith(path + '/')) {
                next[key] = value;
              }
            }
            return next;
          });
        }
      } else {
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
      }
      // 展開状態から削除
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(path);
        // サブフォルダも削除
        for (const p of prev) {
          if (p.startsWith(path + '/')) {
            next.delete(p);
          }
        }
        if (initialized.current) {
          saveState({ expandedFolders: Array.from(next) });
        }
        return next;
      });
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      const { showError } = await import('@/lib/dialog');
      await showError('フォルダの削除に失敗しました');
    }
  }, [selectedFile]);

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
          // リネームしたファイルは新しいパスで追加
          next[result.newPath] = value;
        } else if (key.startsWith(path + '/')) {
          // リネームしたフォルダ内のファイルも更新
          const relativePath = key.substring(path.length);
          next[result.newPath + relativePath] = value;
        } else if (result.updatedFiles.includes(key)) {
          // 参照が更新されたファイルはキャッシュから削除（次回選択時に再読み込み）
          // next に追加しないことで削除
        } else {
          next[key] = value;
        }
      }
      return next;
    });

    // 選択中のファイルがリネーム対象だった場合、新しいパスを選択
    if (selectedFile === path) {
      setSelectedFile(result.newPath);
      if (initialized.current) {
        saveState({ selectedFile: result.newPath });
      }
    } else if (selectedFile.startsWith(path + '/')) {
      // リネームしたフォルダ内のファイルを選択中だった場合
      const relativePath = selectedFile.substring(path.length);
      const newSelectedPath = result.newPath + relativePath;
      setSelectedFile(newSelectedPath);
      if (initialized.current) {
        saveState({ selectedFile: newSelectedPath });
      }
    } else if (result.updatedFiles.includes(selectedFile)) {
      // 選択中のファイルの参照が更新された場合、再読み込み
      try {
        const updatedContent = await fileAPI.readFile(selectedFile);
        setFiles((prev) => ({ ...prev, [selectedFile]: updatedContent }));
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
        saveState({ expandedFolders: Array.from(next) });
      }
      return next;
    });

    return result;
  }, [selectedFile]);

  // エディタ変更ハンドラ
  const handleEditorChange = useCallback(
    (value: string) => {
      setFiles((prev) => ({
        ...prev,
        [selectedFile]: value,
      }));
      setIsDirty(true);
    },
    [selectedFile]
  );

  // ファイル保存ハンドラ
  const handleSave = useCallback(async () => {
    if (!selectedFile || !isDirty) return;

    setIsSaving(true);
    try {
      await fileAPI.writeFile(selectedFile, files[selectedFile]);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, files, isDirty]);

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
      saveState({ previewHeight, leftPanelWidth, rightPanelWidth, variablePanelWidth, generationPanelWidth });
    }, 500);
    return () => clearTimeout(timer);
  }, [previewHeight, leftPanelWidth, rightPanelWidth, variablePanelWidth, generationPanelWidth]);

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
          <span className="text-xs text-[#888]">
            Ctrl+S: 保存
          </span>
          {isDirty && (
            <span className="text-xs text-amber-400">● 未保存</span>
          )}
          {isSaving && (
            <span className="text-xs text-blue-400">保存中...</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-[#888] hover:text-white hover:bg-[#3c3c3c]"
          onClick={() => setSettingsOpen(true)}
          title="設定"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex min-h-0">
        {/* File Tree */}
        <div
          className="flex-shrink-0 bg-[#252526] border-r border-[#333]"
          style={{ width: leftPanelWidth }}
        >
          <FileTree
            items={fileTree}
            selectedFile={selectedFile}
            onSelectFile={handleFileSelect}
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

        {/* Editor */}
        <div className="flex-1 min-w-0 bg-[#1e1e1e]">
          <YamlEditor
            key={selectedFile}
            ref={yamlEditorRef}
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

      {/* Preview Resize Handle */}
      <div
        className="h-1 flex-shrink-0 bg-[#333] cursor-ns-resize hover:bg-[#007acc]"
        onMouseDown={handlePreviewResizeStart}
      />

      {/* Preview Panel with Variables */}
      <div
        className="flex-shrink-0 relative flex"
        style={{ height: previewHeight }}
      >
        {/* Variable Form - always show */}
        <div
          className="flex-shrink-0 overflow-y-auto"
          style={{ width: variablePanelWidth }}
        >
          <VariableForm
            templatePath={selectedFile}
            variables={variables}
            values={variableValues}
            onChange={setVariableValues}
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
        <div className="flex-1 min-w-0">
          <PromptPanel
            key={settingsKey}
            activeTab={promptActiveTab}
            onActiveTabChange={setPromptActiveTab}
            promptSubTab={promptSubTab}
            onPromptSubTabChange={setPromptSubTab}
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
          className="flex-shrink-0"
          style={{ width: generationPanelWidth }}
        >
          <GenerationPanel
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
          />
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSettingsChange={() => setSettingsKey((k) => k + 1)}
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
