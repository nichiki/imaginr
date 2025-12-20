'use client';

import { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor, languages, Position, IDisposable } from 'monaco-editor';
import type { Snippet } from '@/lib/snippet-api';
import type { DictionaryEntry } from '@/lib/dictionary-api';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileList?: string[];
  snippets?: Snippet[];
  dictionaryCache?: Map<string, DictionaryEntry[]>;
}

export interface YamlEditorRef {
  insertSnippet: (content: string, isBlock: boolean) => void;
}

const YamlEditorInner = forwardRef<YamlEditorRef, YamlEditorProps>(function YamlEditor(
  { value, onChange, fileList = [], snippets = [], dictionaryCache },
  ref
) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const fileListRef = useRef<string[]>(fileList);
  const snippetsRef = useRef<Snippet[]>(snippets);
  const dictionaryCacheRef = useRef<Map<string, DictionaryEntry[]> | undefined>(dictionaryCache);

  // IME composition状態を追跡
  const isComposingRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);

  // fileListが変更されたらrefを更新
  useEffect(() => {
    fileListRef.current = fileList;
  }, [fileList]);

  // snippetsが変更されたらrefを更新
  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);

  // dictionaryCacheが変更されたらrefを更新
  useEffect(() => {
    dictionaryCacheRef.current = dictionaryCache;
  }, [dictionaryCache]);

  // クリーンアップ: コンポーネントアンマウント時にdisposablesを解放
  useEffect(() => {
    return () => {
      for (const disposable of disposablesRef.current) {
        disposable.dispose();
      }
      disposablesRef.current = [];
    };
  }, []);

  // カーソル位置から親キーのコンテキストパスを取得
  // 配列要素内の場合も親の配列キーを含める
  const getContextPath = useCallback((model: editor.ITextModel, lineNumber: number): string[] => {
    const contextPath: string[] = [];
    let currentIndent = Infinity;

    // 現在行のインデントを取得
    const currentLine = model.getLineContent(lineNumber);
    const currentLineIndent = currentLine.match(/^(\s*)/)?.[1].length ?? 0;
    currentIndent = currentLineIndent;

    // 上方向に走査して親キーを収集
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = model.getLineContent(i);
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;

      // 配列要素の開始行 (例: "    - type:")
      const arrayItemMatch = line.match(/^(\s*)-\s*(\w+):/);
      // 通常のキー (例: "  outfit:")
      const keyMatch = line.match(/^(\s*)(\w+):/);

      if (indent < currentIndent) {
        if (arrayItemMatch) {
          // 配列要素の最初のキーは無視（親の配列キーを探す）
          currentIndent = indent;
        } else if (keyMatch) {
          contextPath.unshift(keyMatch[2]);
          currentIndent = indent;
        }
      }

      // ルートレベルに達したら終了
      if (indent === 0 && keyMatch) {
        break;
      }
    }

    return contextPath;
  }, []);

  // 辞書からエントリを検索（具体的なコンテキストから汎用へフォールバック）
  // 例: contextPath=["fashion", "outfit"], key="type" の場合
  // 1. outfit.type を検索（直近の親）
  // 2. fashion.outfit.type を検索（フルパス）
  // 3. *.type を検索（汎用）
  const lookupDictionary = useCallback((contextPath: string[], key: string): DictionaryEntry[] => {
    const cache = dictionaryCacheRef.current;
    if (!cache) return [];

    // まず直近の親コンテキストで検索（最も一般的なケース）
    if (contextPath.length > 0) {
      const immediateParent = contextPath[contextPath.length - 1];
      const immediateKey = `${immediateParent}.${key}`;
      const immediateEntries = cache.get(immediateKey);
      if (immediateEntries && immediateEntries.length > 0) {
        return immediateEntries;
      }
    }

    // 次にフルパスで検索（より具体的なコンテキスト）
    if (contextPath.length > 1) {
      const fullPath = contextPath.join('.');
      const fullKey = `${fullPath}.${key}`;
      const fullEntries = cache.get(fullKey);
      if (fullEntries && fullEntries.length > 0) {
        return fullEntries;
      }
    }

    // 最後に汎用コンテキストを検索
    const wildcardKey = `*.${key}`;
    return cache.get(wildcardKey) || [];
  }, []);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // YAML言語の補完プロバイダーを登録
    const completionProvider = monaco.languages.registerCompletionItemProvider('yaml', {
      triggerCharacters: [' ', ':'],
      provideCompletionItems: (
        model: editor.ITextModel,
        position: Position
      ): languages.ProviderResult<languages.CompletionList> => {
        const lineContent = model.getLineContent(position.lineNumber);
        const textUntilPosition = lineContent.substring(0, position.column - 1);

        // キー入力中かどうか判定（コロンの前）
        const keyMatch = textUntilPosition.match(/^\s*(\w+)$/);
        if (keyMatch) {
          const typedKey = keyMatch[1].toLowerCase();
          // キーに対応するスニペットを検索
          const matchingSnippets = snippetsRef.current.filter(
            (s) =>
              s.key.toLowerCase().includes(typedKey) ||
              s.category.toLowerCase().includes(typedKey)
          );

          if (matchingSnippets.length > 0) {
            return {
              suggestions: matchingSnippets.map((snippet) => ({
                  label: `${snippet.key}: ${snippet.label}`,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  insertText: `${snippet.key}:\n  ${snippet.content.replace(/\n/g, '\n  ')}`,
                  insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  documentation: snippet.description,
                  detail: snippet.category,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column - typedKey.length,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                })),
            };
          }
        }

        // 値入力中かどうか判定（コロンの後）
        // 通常のキー: "  key: value" または 配列要素内: "    - key: value" / "      key: value"
        // コロン直後にスペースがあるかどうかも検出
        const valueMatchWithSpace = textUntilPosition.match(/^\s*-?\s*(\w+):(\s*)(.*)$/);
        if (valueMatchWithSpace) {
          const currentKey = valueMatchWithSpace[1].toLowerCase();
          const spaceAfterColon = valueMatchWithSpace[2]; // スペースがあれば " "、なければ ""
          const typedValue = valueMatchWithSpace[3];

          // _base: の後ろならファイル補完
          if (currentKey === '_base') {
            const filteredFiles = fileListRef.current.filter((f) =>
              f.toLowerCase().includes(typedValue.toLowerCase())
            );
            // スペースがなければ挿入時に追加
            const needsSpace = spaceAfterColon.length === 0;
            return {
              suggestions: filteredFiles.map((file) => ({
                label: file,
                kind: monaco.languages.CompletionItemKind.File,
                insertText: needsSpace ? ` ${file}` : file,
                detail: 'Base template file',
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - typedValue.length,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              })),
            };
          }

          // 辞書から値を検索（コンテキストを考慮）
          const contextPath = getContextPath(model, position.lineNumber);
          const dictEntries = lookupDictionary(contextPath, currentKey);

          if (dictEntries.length > 0) {
            const needsSpace = spaceAfterColon.length === 0;
            const filteredEntries = dictEntries.filter((entry) =>
              entry.value.toLowerCase().includes(typedValue.toLowerCase()) ||
              (entry.description && entry.description.toLowerCase().includes(typedValue.toLowerCase()))
            );

            if (filteredEntries.length > 0) {
              return {
                suggestions: filteredEntries.map((entry) => ({
                  label: entry.description ? `${entry.value}（${entry.description}）` : entry.value,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: needsSpace ? ` ${entry.value}` : entry.value,
                  detail: `${contextPath.length > 0 ? contextPath.join('.') + '.' : ''}${currentKey}`,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column - typedValue.length,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                })),
              };
            }
          }
        }

        // _layers: 配列内のアイテム（  - xxx）
        const layerItemMatch = textUntilPosition.match(/^\s+-\s*(.*)$/);
        if (layerItemMatch) {
          // 直前の行から _layers: を探す
          let isInLayers = false;
          for (let i = position.lineNumber - 1; i >= 1; i--) {
            const prevLine = model.getLineContent(i).trim();
            if (prevLine.startsWith('_layers:')) {
              isInLayers = true;
              break;
            }
            // 他のキーが出てきたら終了
            if (prevLine.match(/^\w+:/) && !prevLine.startsWith('-')) {
              break;
            }
          }

          if (isInLayers) {
            const typedValue = layerItemMatch[1];
            const filteredFiles = fileListRef.current.filter((f) =>
              f.toLowerCase().includes(typedValue.toLowerCase())
            );
            return {
              suggestions: filteredFiles.map((file) => ({
                label: file,
                kind: monaco.languages.CompletionItemKind.File,
                insertText: file,
                detail: 'Layer file',
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - typedValue.length,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              })),
            };
          }

          // 一般的な配列要素の辞書補完（_layers以外）
          // 親キーを探して、そのキーで辞書を検索
          const typedValue = layerItemMatch[1];
          const currentLineIndent = textUntilPosition.match(/^(\s*)/)?.[1].length ?? 0;

          // 親キーを探す（現在行より浅いインデントの key: を持つ行）
          let parentKey: string | null = null;
          for (let i = position.lineNumber - 1; i >= 1; i--) {
            const prevLine = model.getLineContent(i);
            const prevIndent = prevLine.match(/^(\s*)/)?.[1].length ?? 0;
            const keyMatch = prevLine.match(/^(\s*)(\w+):\s*$/);

            if (prevIndent < currentLineIndent && keyMatch) {
              parentKey = keyMatch[2];
              break;
            }
          }

          if (parentKey) {
            const contextPath = getContextPath(model, position.lineNumber);
            // contextPathの最後の要素がparentKeyと同じなら、それを除く
            const lookupContext = contextPath[contextPath.length - 1] === parentKey
              ? contextPath.slice(0, -1)
              : contextPath;
            const dictEntries = lookupDictionary(lookupContext, parentKey);

            if (dictEntries.length > 0) {
              const filteredEntries = dictEntries.filter((entry) =>
                entry.value.toLowerCase().includes(typedValue.toLowerCase()) ||
                (entry.description && entry.description.toLowerCase().includes(typedValue.toLowerCase()))
              );

              if (filteredEntries.length > 0) {
                return {
                  suggestions: filteredEntries.map((entry) => ({
                    label: entry.description ? `${entry.value}（${entry.description}）` : entry.value,
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: entry.value,
                    detail: `${lookupContext.length > 0 ? lookupContext.join('.') + '.' : ''}${parentKey}`,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column - typedValue.length,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    },
                  })),
                };
              }
            }
          }
        }

        return { suggestions: [] };
      },
    });

    disposablesRef.current.push(completionProvider);

    // Cmd+J (Mac) / Ctrl+J (Windows) で補完トリガー
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    });
    // Ctrl+Space (Windows/Linux用、MacでもIME設定次第で使える)
    editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Space, () => {
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    });

    // エディタのフォーカス
    editor.focus();

    // IME compositionイベントを監視
    const domNode = editor.getDomNode();
    if (domNode) {
      const handleCompositionStart = () => {
        isComposingRef.current = true;
      };
      const handleCompositionEnd = () => {
        isComposingRef.current = false;
        // composition終了時に保留中の値があれば反映
        if (pendingValueRef.current !== null) {
          onChange(pendingValueRef.current);
          pendingValueRef.current = null;
        }
      };

      domNode.addEventListener('compositionstart', handleCompositionStart);
      domNode.addEventListener('compositionend', handleCompositionEnd);

      // クリーンアップ用にdisposableを追加
      disposablesRef.current.push({
        dispose: () => {
          domNode.removeEventListener('compositionstart', handleCompositionStart);
          domNode.removeEventListener('compositionend', handleCompositionEnd);
        },
      });
    }
  }, [getContextPath, lookupDictionary, onChange]);

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        if (isComposingRef.current) {
          // IME composition中は保留
          pendingValueRef.current = newValue;
        } else {
          onChange(newValue);
        }
      }
    },
    [onChange]
  );

  // スニペット挿入用のパブリックメソッド
  const insertSnippetFn = useCallback((content: string, isBlock: boolean) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const position = editor.getPosition();
    if (!position) return;

    const model = editor.getModel();
    if (!model) return;

    if (isBlock) {
      // ブロックスニペット: 現在行を置換
      const lineContent = model.getLineContent(position.lineNumber);
      const indent = lineContent.match(/^\s*/)?.[0] || '';
      // 各行に現在のインデントを追加（スニペット内のインデント構造を維持）
      const indentedContent = content
        .split('\n')
        .map((line) => (line.trim() ? indent + line : line))
        .join('\n');

      const range = {
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: lineContent.length + 1,
      };

      editor.executeEdits('snippet-insert', [
        {
          range,
          text: indentedContent,
        },
      ]);
    } else {
      // 値スニペット: カーソル位置に挿入
      editor.executeEdits('snippet-insert', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: content,
        },
      ]);
    }

    editor.focus();
  }, []);

  // refを通じてinsertSnippetを公開
  useImperativeHandle(ref, () => ({
    insertSnippet: insertSnippetFn,
  }), [insertSnippetFn]);

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="yaml"
        theme="vs-dark"
        defaultValue={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'Consolas', 'Courier New', monospace",
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          padding: { top: 8 },
          wordBasedSuggestions: 'off',
          suggest: {
            showStatusBar: false,
          },
        }}
      />
    </div>
  );
});

export const YamlEditor = YamlEditorInner;
