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
│   ├── variable-form.tsx     # 変数入力フォーム + プリセット管理
│   └── ui/                   # shadcn/uiコンポーネント
└── lib/
    ├── yaml-utils.ts         # YAMLマージ・プロンプト生成
    ├── variable-utils.ts     # 変数抽出・置換
    ├── storage.ts            # UI状態の永続化
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

### 変数システム
- **構文**: `${varName}` または `${varName|defaultValue}`
- **処理**: `variable-utils.ts`で変数抽出・置換
- **プリセット管理**: 変数セットを名前付きで保存/読み込み
  - localStorageに変数名セットごとにキー付けして永続化
  - 「No preset」選択でフォームクリア
  - 💾ボタン: プリセット選択中は上書き、未選択時は新規保存ダイアログ

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
├──────────┼──────────────────────┴───────────┤
│ Variables│    PreviewPanel                  │
│  Form    │ (Merged YAML / Prompt Text)      │
└──────────┴──────────────────────────────────┘
```

4ペインすべてリサイズ可能。状態はlocalStorageに永続化。
変数パネルはテンプレートに変数がある場合のみ表示。

## ComfyUI連携

### 実装済み機能
- **設定ダイアログ**: APIエンドポイント、ワークフロー、ノードID設定
- **画像生成**: ポーリングベースのAPI通信（WebSocket不使用でシンプル化）
- **画像保存**: 生成画像を`data/images/`に永続化
- **ギャラリー**: サムネイル一覧（6列グリッド）、拡大表示、左右ナビゲーション

### 関連ファイル
- `src/lib/comfyui-api.ts` - ComfyUIクライアント
- `src/app/api/generate/route.ts` - 画像生成API
- `src/app/api/images/` - 画像CRUD API
- `src/components/preview-panel.tsx` - ギャラリーUI

## 今後の検討事項

### LLMエンハンサー（保留）

構造化YAMLを自然言語プロンプトに変換するLLMレイヤーの検討。

**想定フロー:**
```
YAML → (LLM変換) → 自然言語プロンプト → 画像生成AI
```

**メリット:**
- より自然で流暢なプロンプト生成
- コンテキストを踏まえた表現の最適化

**懸念:**
- 毎回のLLM呼び出しコスト（ローカルOllama利用で軽減可能）
- キャッシュ機構が必要（同一入力は再利用）
- 効果が不確定（構造化プロンプトでも十分な場合あり）

**結論:** 現時点では保留。基本機能の完成を優先。

## 注意事項

- ファイル操作は`/data`ディレクトリ内に制限（セキュリティ）
- 自動保存なし（Ctrl+Sで明示的に保存）
