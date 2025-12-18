# Image Prompt Builder

画像生成AI向けのYAMLベースプロンプトビルダー。ファッション撮影用ルックブック（30枚）の効率的なプロンプト管理を目的としている。

## 技術スタック

- **Framework**: Next.js 16 + React 19
- **Editor**: Monaco Editor (@monaco-editor/react)
- **YAML**: js-yaml
- **UI**: shadcn/ui (Radix UIベース) + Tailwind CSS v4
- **Icons**: lucide-react

## ディレクトリ構造

```
src/
├── app/
│   ├── page.tsx              # メインUI（状態管理・レイアウト）
│   ├── layout.tsx            # ルートレイアウト
│   └── api/                  # APIルート
│       ├── files/            # ファイルCRUD
│       ├── snippets/         # スニペットCRUD
│       └── dictionary/       # 辞書取得
├── components/
│   ├── yaml-editor.tsx       # Monacoエディタ + 補完機能
│   ├── file-tree.tsx         # ファイルツリー（左ペイン）
│   ├── snippet-panel.tsx     # スニペット管理（右ペイン）
│   ├── preview-panel.tsx     # プレビュー（下ペイン）
│   └── ui/                   # shadcn/uiコンポーネント
└── lib/
    ├── yaml-utils.ts         # YAMLマージ・プロンプト生成
    ├── file-api.ts           # ファイルAPI
    ├── snippet-api.ts        # スニペットAPI
    └── dictionary-api.ts     # 辞書API

data/
├── templates/                # YAMLテンプレート（52ファイル）
│   ├── global_base.yaml      # グローバル設定
│   ├── looks/                # ルック定義（8ファイル）
│   └── shots/                # ショット定義（40ファイル）
├── dictionary/               # オートコンプリート辞書
│   ├── standard/             # 標準辞書（6カテゴリ）
│   └── user/                 # ユーザーカスタム
└── snippets/                 # スニペット定義（ブロック形式のみ）
```

## コア機能

### YAMLマージシステム
- `_base`: 継承元ファイルパス
- `_layers`: 複数ファイルを順序付きでマージ
- 処理: _base解決 → _layers順次マージ → 自身をマージ

### プロンプト生成
`yaml-utils.ts`の`generatePromptText()`が構造化YAMLからテキストプロンプトを生成。

### オートコンプリート
- コンテキスト認識（親キーを遡行して辞書検索）
- ファイルパス補完（`_base`、`_layers`）
- 辞書ベースの値補完
- 手動トリガー: Cmd+J (Mac) / Ctrl+Space (Windows/Linux)

### スニペットパネル
- クリック: 編集ダイアログ
- ダブルクリック: エディタに挿入
- 右クリック: コンテキストメニュー

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # ESLint実行
```

## UIレイアウト

```
┌─────────────────────────────────────────────┐
│ Header                                      │
├──────────┬──────────────────────┬───────────┤
│ FileTree │     YamlEditor       │ Snippets  │
│          │     (Monaco)         │  Panel    │
├──────────┴──────────────────────┴───────────┤
│ PreviewPanel (Merged YAML / Prompt Text)    │
└─────────────────────────────────────────────┘
```

3ペインすべてリサイズ可能。状態はlocalStorageに永続化。

## 注意事項

- ファイル操作は`/data`ディレクトリ内に制限（セキュリティ）
- 自動保存なし（Ctrl+Sで明示的に保存）
