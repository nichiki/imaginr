# Image Prompt Builder

画像生成AI向けのYAMLベースプロンプトビルダー。ファッション撮影用ルックブック（30枚）の効率的なプロンプト管理を目的としている。

## 特徴

- **構造化プロンプト**: YAMLで階層的にプロンプトを管理
- **テンプレート継承**: `_base`と`_layers`による柔軟な継承システム
- **変数システム**: `${varName}`構文で動的な値を注入
- **オートコンプリート**: 辞書ベースの入力補完
- **ComfyUI連携**: ワークフローを使った画像生成と管理

## クイックスタート

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

## テンプレートシステム

### コンセプト: 変化頻度による4層構造

「変わりにくいもの」を上位に、「変わりやすいもの」を下位に配置する。

```
変わりにくい（上位で固定）
    │
    ▼
┌─────────────────────────────────────────┐
│ 01_base: システム（品質、ブロック順序）  │  ← 絶対変わらない
├─────────────────────────────────────────┤
│ 02_look: 企画レベル                      │  ← 撮影を通して固定
│   被写体、ロケ地、機材、aesthetic        │
├─────────────────────────────────────────┤
│ 04_shot: カットレベル                    │  ← ショット毎に変わる
│   構図、ポーズ、表情、時間帯、小道具     │
├─────────────────────────────────────────┤
│ ${変数}: ランタイム                      │  ← 毎回変わる・まだ決めてない
└─────────────────────────────────────────┘
    │
    ▼
変わりやすい（下位 or 変数で残す）
```

### 各層の役割

| 層 | 何を置く | 例 |
|---|---|---|
| **01_base** | 絶対不変、全ブロックの順序定義 | quality タグ、ブロック構造 |
| **02_look** | 企画で固定するもの | 被写体、ロケ、カメラ、aesthetic |
| **03_layers** | 再利用パターン（横から合成） | lighting, pose, expression のパターン |
| **04_shot** | カット毎に変わるもの | composition, time, 背景詳細 |
| **${変数}** | 決めきれない・都度変えたい | hair_color, outfit_top 等 |

### ディレクトリ構造

```
data/templates/
├── 01_base/
│   └── base.yaml              # 全ブロック定義（順序固定用）
├── 02_look/
│   └── [企画名].yaml          # 企画ごとのルック
├── 03_layers/
│   ├── lighting/              # 照明パターン
│   ├── pose/                  # ポーズパターン
│   └── expression/            # 表情パターン
└── 04_shot/
    └── [ショット名].yaml      # 個別ショット
```

### 継承の仕組み

#### `_base`: 縦の継承（IS-A）

```yaml
# 04_shot/shot_01.yaml
_base: 02_look/summer_casual.yaml  # このショットはsummer_casualルックである

# 02_look/summer_casual.yaml
_base: 01_base/base.yaml           # このルックはbase構造を継承する
```

#### `_layers`: 横の合成（HAS-A）

```yaml
# 04_shot/shot_01.yaml
_layers:
  - 03_layers/lighting/golden_hour.yaml   # このショットはこの照明を持つ
  - 03_layers/pose/standing.yaml          # このショットはこのポーズを持つ
```

### _layers vs Snippets

| | `_layers` | Snippets |
|---|---|---|
| **関係性** | 依存関係が残る | コピペして終わり |
| **更新時** | 元ファイル変更 → 全ショットに反映 | 挿入後は独立 |
| **用途** | 統一したい・一括変更したい | 出発点だけ欲しい |

**判断基準: 「これ、後で一括で変えたくなる？」**
- YES → layers に外出し
- NO → snippets で十分（または直書き）

## 変数システム

### 構文

```yaml
hair:
  color: ${hair_color|brown}    # デフォルト値付き
  style: ${hair_style}          # デフォルト値なし
```

### プリセット管理

変数セットを名前付きで保存・読み込み可能。localStorageに永続化される。

## ComfyUI連携

### セットアップ

1. 設定ダイアログでComfyUI APIのURLを入力（デフォルト: `http://127.0.0.1:8188`）
2. ComfyUIワークフローJSONをアップロード
3. プロンプトを注入するノードIDを指定

### 画像生成

- 生成された画像は`data/images/`に保存
- ギャラリービューでサムネイル一覧表示
- クリックで拡大表示、左右ナビゲーション対応

## 技術スタック

- **Framework**: Next.js 16 + React 19
- **Editor**: Monaco Editor (@monaco-editor/react)
- **YAML**: js-yaml
- **UI**: shadcn/ui (Radix UIベース) + Tailwind CSS v4
- **Icons**: lucide-react

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # ESLint実行
```

## ライセンス

MIT
