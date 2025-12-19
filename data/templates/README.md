# テンプレートシステム設計

## コンセプト: 変化頻度による4層構造

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

## 各層の役割

| 層 | 何を置く | 例 |
|---|---|---|
| **01_base** | 絶対不変、全ブロックの順序定義 | quality タグ、ブロック構造 |
| **02_look** | 企画で固定するもの | 被写体、ロケ、カメラ、aesthetic |
| **03_layers** | 再利用パターン（横から合成） | lighting, pose, expression のパターン |
| **04_shot** | カット毎に変わるもの | composition, time, 背景詳細 |
| **${変数}** | 決めきれない・都度変えたい | hair_color, outfit_top 等 |

## ディレクトリ構造

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

## 継承の仕組み

### `_base`: 縦の継承（IS-A）

```yaml
# 04_shot/shot_01.yaml
_base: 02_look/summer_casual.yaml  # このショットはsummer_casualルックである

# 02_look/summer_casual.yaml
_base: 01_base/base.yaml           # このルックはbase構造を継承する
```

### `_layers`: 横の合成（HAS-A）

```yaml
# 04_shot/shot_01.yaml
_layers:
  - 03_layers/lighting/golden_hour.yaml   # このショットはこの照明を持つ
  - 03_layers/pose/standing.yaml          # このショットはこのポーズを持つ
```

## _layers vs Snippets

| | `_layers` | Snippets |
|---|---|---|
| **関係性** | 依存関係が残る | コピペして終わり |
| **更新時** | 元ファイル変更 → 全ショットに反映 | 挿入後は独立 |
| **用途** | 統一したい・一括変更したい | 出発点だけ欲しい |

### 判断基準

**「これ、後で一括で変えたくなる？」**

- YES → layers に外出し
- NO → snippets で十分（または直書き）

## 設計の強み

実際の撮影と違って、被写体もロケも自由に変えられる。
でも「この企画では固定」と決められる。

**何を固定して何を可変にするか、をデザインできる。**

- 超変わりやすいもの → 変数で残す
- パターン化できるもの → layers に外出し
- 企画で固定するもの → look で定義
- システム共通 → base で定義

## フィールド設計リファレンス

各フィールドをどの層で決めるかの目安。

**凡例:**
- 🔒 look: 企画で固定
- 🔄 layers: パターン化
- 📸 shot: カット毎
- ✏️ 変数: 毎回変える

| ブロック | フィールド | 推奨 | 理由 |
|---------|-----------|------|------|
| subject | - | 🔒 | 被写体は企画で決まる |
| demographics | gender, age, ethnicity | 🔒 | モデル固定 |
| appearance | hair.length, eyes, skin, build | 🔒 | 基本固定 |
| | hair.style | 📸/✏️ | カット毎に変えるかも |
| | hair.color | ✏️ | 色違いバリエーション |
| expression | type | ✏️ | 毎回変える |
| | eyes, mouth | 🔄/✏️ | パターン or 都度 |
| pose | base, direction | 🔄 | パターン化 |
| | action | 🔄/✏️ | 細かい動きは都度 |
| outfit | style | 🔒 | 企画テーマ |
| | top, bottom, dress, outerwear | 📸/✏️ | カット毎 |
| | footwear | 📸 | カット毎（あまり変えない） |
| | accessories | ✏️ | 小道具は毎回変えたい |
| aesthetic, mood | - | 🔒 | 企画の雰囲気 |
| photography | shot_with, lens, film, effects | 🔒 | 機材固定 |
| composition | - | 📸 | カット毎 |
| lighting | style, type, color, shadow | 🔄 | パターン化 |
| environment | location, setting | 🔒 | 企画でロケ固定 |
| | background, time, weather | 📸/🔄 | カット毎 or パターン |
| quality | - | 🔒 base | 常に固定 |
