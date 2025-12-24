# Imaginr

画像生成AI向けのYAMLベースプロンプトビルダー。効率的なプロンプトの作成・管理を目的としている。

## 技術スタック

- **Framework**: Next.js 16 + React 19 + Tauri 2
- **Editor**: Monaco Editor (@monaco-editor/react)
- **YAML**: js-yaml
- **UI**: shadcn/ui (Radix UIベース) + Tailwind CSS v4
- **Icons**: lucide-react
- **Database**: SQLite (tauri-plugin-sql)
- **Desktop**: Tauri 2 (Windows対応済み、Mac対応予定)

## アーキテクチャ

Tauri専用のデスクトップアプリケーション。Next.js API Routesは使用せず、全てTauriプラグイン経由でファイルシステム・データベース・HTTPにアクセス。

### データ保存先
- **Windows**: `%APPDATA%/studio.imaginr/`
- **Mac**: `~/Library/Application Support/studio.imaginr/`

初回起動時にバンドルリソース（templates, dictionary, snippets）をAppDataにコピー。

## ディレクトリ構造

```
src/
├── app/
│   ├── page.tsx              # メインUI（状態管理・レイアウト）
│   └── layout.tsx            # ルートレイアウト
├── components/
│   ├── yaml-editor.tsx       # Monacoエディタ + 補完機能
│   ├── file-tree.tsx         # ファイルツリー（左ペイン）
│   ├── snippet-panel.tsx     # スニペット管理（右ペイン）
│   ├── prompt-panel.tsx      # プロンプト/ギャラリー（下ペイン中央）
│   ├── generation-panel.tsx  # 生成パネル（下ペイン右）
│   ├── variable-form.tsx     # 変数入力フォーム + プリセット管理
│   ├── settings-dialog.tsx   # 設定ダイアログ（ComfyUI、データフォルダ）
│   ├── image-viewer.tsx      # 画像拡大表示ダイアログ
│   ├── workflow-editor.tsx   # ワークフロー設定エディタ
│   └── ui/                   # shadcn/uiコンポーネント
└── lib/
    ├── yaml-utils.ts         # YAMLマージ・プロンプト生成
    ├── variable-utils.ts     # 変数抽出・置換
    ├── storage.ts            # UI状態・ComfyUI設定の永続化
    ├── comfyui-api.ts        # ComfyUIクライアント（HTTP直接通信）
    ├── file-api.ts           # ファイルAPI（Tauri fs plugin）
    ├── snippet-api.ts        # スニペットAPI（Tauri fs plugin）
    ├── dictionary-api.ts     # 辞書API（Tauri fs plugin）
    ├── image-api.ts          # 画像API（Tauri fs/sql plugin）
    ├── tauri-utils.ts        # Tauriパス管理ユーティリティ
    ├── init-data.ts          # 初回起動時のデータコピー
    └── db/
        ├── index.ts          # DB初期化
        ├── tauri-db.ts       # Tauri SQL操作
        └── migration.ts      # DBマイグレーション

src-tauri/                    # Tauri Rustバックエンド
├── src/
│   ├── lib.rs               # プラグイン初期化
│   └── main.rs              # エントリーポイント
├── capabilities/
│   └── default.json         # 権限設定
├── Cargo.toml               # Rust依存関係
└── tauri.conf.json          # Tauri設定

data/                         # バンドルリソース（初回起動時にAppDataへコピー）
├── templates/                # YAMLテンプレート
├── dictionary/
│   └── standard/             # 標準辞書
└── snippets/                 # スニペット定義
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
- **プリセット管理**: 変数セットを名前付きで保存/読み込み（localStorageに永続化）

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
npm run dev           # Next.js開発サーバー（ブラウザでは動作しない）
npm run tauri:dev     # Tauri開発モード（推奨）
npm run tauri:build   # プロダクションビルド
npm run lint          # ESLint実行
```

## UIレイアウト

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
├──────────┬──────────────────────────────────┬───────────┤
│ FileTree │         YamlEditor               │ Snippets  │
│          │         (Monaco)                 │  Panel    │
├──────────┼────────────────────────┬─────────┴───────────┤
│ Variables│  PromptPanel           │ GenerationPanel     │
│  Form    │ [Prompt] [Gallery]     │ Workflow / Generate │
└──────────┴────────────────────────┴─────────────────────┘
```

全ペインリサイズ可能。状態はlocalStorageに永続化。
ウィンドウ位置・サイズはwindow-stateプラグインで自動保存。

## ComfyUI連携

### 機能
- **設定ダイアログ**: APIエンドポイント設定、接続テスト
- **ワークフロー管理**: 複数ワークフローの登録・切り替え
  - 各ワークフローにプロンプトノードID、サンプラーノードIDを紐付け
  - ノードプロパティのオーバーライド設定（画像サイズ、ステップ数など）
- **画像生成**: ポーリングベースのAPI通信（Tauri HTTPプラグイン経由）
- **画像保存**: 生成画像をAppData/images/に永続化、SQLiteでメタデータ管理
- **ギャラリー**:
  - サムネイル一覧（6列グリッド）
  - 拡大表示（ビューポート90%サイズ）
  - キーボードナビゲーション（←→で移動、Escで閉じる）
  - 画像ダウンロード機能（ファイル保存ダイアログ）

### ワークフロー設定の構造
```typescript
interface WorkflowConfig {
  id: string;             // 一意のID
  file: string;           // ファイル名 (comfyui/ 以下)
  name: string;           // 表示名
  promptNodeId: string;   // プロンプトを挿入するノードID
  samplerNodeId: string;  // シードをランダム化するサンプラーノードID
  overrides: NodeOverride[]; // ノードプロパティの上書き設定
}

interface NodeOverride {
  nodeId: string;         // ノードID
  property: string;       // プロパティ名 (例: "width", "height", "steps")
  value: number | string; // 値
}
```

## 今後のロードマップ

### 完了
- [x] Mac版のビルド対応
- [x] 辞書編集機能（UI上での追加・編集・削除、保存形式の検討）

### v0.1.0リリースに向けて（優先順）
1. [X] アプリ名決定 + リポジトリ名変更・public化
2. [X] アイコンデザイン
3. [ ] 辞書・テンプレート・スニペットのプリセット整備
4. [X] マニュアル・ドキュメント作成
5. [X] CI/CD（GitHub Actionsでの自動ビルド・リリース）

### リリース後
- [ ] UI改善（複数タブ対応、エディタ分割、ペイン表示/非表示）

### 保留: LLMエンハンサー

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

- ファイル操作はAppDataディレクトリ内に制限（セキュリティ）
- 自動保存なし（Ctrl+Sで明示的に保存）

## コミットルール

コミットを行う際は以下のルールに従うこと：

1. **コミット前にlintを実行する**
   - `npm run lint` を実行してエラー・警告を確認

2. **eslint-disableコメントは禁止**
   - 個別の行やファイルで `// eslint-disable` を使用しない
   - lintが通らない場合、コードを修正して対応する

3. **lint問題が解決困難な場合は相談**
   - ルール自体が厳しすぎる場合は、コミュニティの対策を調査
   - 調査結果を報告し、対応方針を相談する
   - 行き当たりばったりの対応は禁止

4. **許容している警告**
   - `@next/next/no-img-element`: ComfyUI画像表示で`<img>`を使用（外部URLのためnext/imageは使用不可）

## ESLint注意事項

### カスタムフック抽出時のルール厳格化

`useXxx`という名前の関数（カスタムフック）は、コンポーネント内の同じコードよりも厳しいESLintルールが適用される。

**具体例**: `react-hooks/set-state-in-effect`
- コンポーネント内で`useEffect`内に同期的な`setState`があってもエラーにならない
- 同じコードを`useYamlMerge`等のカスタムフックに抽出するとエラーになる

**対策**:
- カスタムフック抽出前にlintで問題がないか確認
- 問題が発生した場合は、フック抽出を見送るか、eslint設定でルールを緩和
- 現在このルールについてはReactコミュニティで議論中（2025年1月時点）
