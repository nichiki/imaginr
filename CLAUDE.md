# Image Prompt Builder

画像生成AI向けのYAMLベースプロンプトビルダー。効率的なプロンプトの作成・管理を目的としている。

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
│       ├── dictionary/       # 辞書取得
│       ├── comfyui/          # ComfyUIワークフロー・プロキシ
│       ├── generate/         # 画像生成
│       └── images/           # 画像CRUD
├── components/
│   ├── yaml-editor.tsx       # Monacoエディタ + 補完機能
│   ├── file-tree.tsx         # ファイルツリー（左ペイン）
│   ├── snippet-panel.tsx     # スニペット管理（右ペイン）
│   ├── preview-panel.tsx     # プレビュー + 画像ギャラリー（下ペイン）
│   ├── variable-form.tsx     # 変数入力フォーム + プリセット管理
│   ├── settings-dialog.tsx   # ComfyUI設定ダイアログ
│   └── ui/                   # shadcn/uiコンポーネント
└── lib/
    ├── yaml-utils.ts         # YAMLマージ・プロンプト生成
    ├── variable-utils.ts     # 変数抽出・置換
    ├── storage.ts            # UI状態・ComfyUI設定の永続化
    ├── comfyui-api.ts        # ComfyUIクライアント
    ├── file-api.ts           # ファイルAPI
    ├── snippet-api.ts        # スニペットAPI
    └── dictionary-api.ts     # 辞書API

data/
├── templates/                # YAMLテンプレート
│   ├── global_base.yaml      # グローバル設定
│   ├── looks/                # ルック定義
│   └── shots/                # ショット定義
├── dictionary/               # オートコンプリート辞書
│   ├── standard/             # 標準辞書（6カテゴリ）
│   └── user/                 # ユーザーカスタム
├── snippets/                 # スニペット定義（ブロック形式のみ）
├── comfyui/                  # ComfyUIワークフロー（API形式JSON）
└── images/                   # 生成画像の保存先
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
│  Form    │ (Merged YAML / Prompt / Gallery) │
└──────────┴──────────────────────────────────┘
```

4ペインすべてリサイズ可能。状態はlocalStorageに永続化。
変数パネルはテンプレートに変数がある場合のみ表示。

## ComfyUI連携

### 実装済み機能
- **設定ダイアログ**: APIエンドポイント設定、接続テスト
- **ワークフロー管理**: 複数ワークフローの登録・切り替え
  - 各ワークフローにプロンプトノードID、サンプラーノードIDを紐付け
  - ノードプロパティのオーバーライド設定（画像サイズ、ステップ数など）
- **画像生成**: ポーリングベースのAPI通信（WebSocket不使用でシンプル化）
  - Next.js API Routeによるプロキシ（CORS回避）
- **画像保存**: 生成画像を`data/images/`に永続化（メタデータJSON付き）
- **ギャラリー**:
  - サムネイル一覧（6列グリッド）
  - 拡大表示（ビューポート90%サイズ）
  - キーボードナビゲーション（←→で移動、Escで閉じる）
  - 画像ダウンロード機能

### 関連ファイル
- `src/lib/comfyui-api.ts` - ComfyUIクライアント（プロキシ経由）
- `src/lib/storage.ts` - ワークフロー設定の型定義・永続化
- `src/app/api/comfyui/proxy/` - ComfyUI APIプロキシ
- `src/app/api/generate/route.ts` - 画像生成API
- `src/app/api/images/` - 画像CRUD API
- `src/components/preview-panel.tsx` - ギャラリーUI
- `src/components/settings-dialog.tsx` - 設定ダイアログ

### ワークフロー設定の構造
```typescript
interface WorkflowConfig {
  id: string;             // 一意のID
  file: string;           // ファイル名 (data/comfyui/ 以下)
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

### Phase 1: コンテンツ整備
- [ ] 辞書編集機能（UI上での追加・編集・削除）
- [ ] 辞書・テンプレート・スニペットのプリセット整備
- [ ] マニュアル・ドキュメント作成

### Phase 2: 画像管理の本格化
- [ ] SQLiteによるメタデータ管理
  - 生成日時、使用プロンプト、ワークフロー設定などを記録
  - 画像の検索・フィルタリング
  - プロンプトの抽出・再利用
- [ ] 画像のタグ付け・分類機能

### Phase 3: デスクトップアプリ化
- [ ] Tauriによるネイティブアプリ化
  - 軽量（Electronの10分の1以下のバンドルサイズ）
  - Rustバックエンドでパフォーマンス向上
  - tauri-plugin-sqlでSQLite統合
- [ ] ブランディング検討

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

- ファイル操作は`/data`ディレクトリ内に制限（セキュリティ）
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
