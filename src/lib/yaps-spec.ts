// YAPS Specification embedded as a constant
// This is auto-generated from docs/YAPS.md

export const YAPS_SPEC = `# YAPS v1 仕様書 - Yet Another Prompt Schema

画像生成AIプロンプト用の構造化スキーマ仕様

---

## 概要

YAPS (Yet Another Prompt Schema) は、画像生成AIプロンプトを構造化するためのYAMLスキーマです。

### 特徴

- **必要なキーだけ使用** - 全てを埋める必要なし
- **シンプルと詳細の両立** - ざっくり指定も細かい指定も可能
- **LLMフレンドリー** - 意味が明確でAIが理解しやすい構造

### 基本的な使い方

\`\`\`yaml
# 最小限の例
subject: 1girl
pose:
  base: standing
outfit:
  costume: schoolgirl
quality: [masterpiece, best quality]
\`\`\`

---

## 基本構造

YAPS v1のトップレベルキー一覧:

| キー | 説明 | 必須 |
|------|------|------|
| \`subject\` | 被写体 | ○ |
| \`demographics\` | 人物属性（年齢・人種等） | - |
| \`pose\` | ポーズ・姿勢 | - |
| \`expression\` | 表情 | - |
| \`appearance\` | 外見・身体的特徴 | - |
| \`outfit\` | 服装・衣装 | - |
| \`environment\` | 背景・環境 | - |
| \`aesthetic\` | 画風・スタイル | - |
| \`mood\` | 雰囲気 | - |
| \`effects\` | 視覚エフェクト | - |
| \`lighting\` | 照明 | - |
| \`composition\` | 構図 | - |
| \`photography\` | 撮影技法 | - |
| \`quality\` | 品質タグ | △ |
| \`negative\` | ネガティブプロンプト | △ |
| \`interaction\` | 複数人の相互作用 | - |

### 共通パターン: \`base\` キー

多くのカテゴリで \`base\` キーを使用します。これは「そのカテゴリを一言で表す代表値」です。

\`\`\`yaml
pose:
  base: standing      # ← 全体としては「立っている」
  hands: peace sign   # ← 細かく指定したい部分だけ追加

lighting:
  base: dramatic      # ← 全体としては「ドラマチック」
  # 詳細が不要ならこれだけでOK
\`\`\`

---

## Subject - 被写体

### subject

**type**: \`string\`

被写体を指定します。人物・動物・物体・風景など。

\`\`\`yaml
# 人物（実写向け）
subject: person
subject: woman
subject: man

# 人物（イラスト向け）
subject: 1girl
subject: 1boy
subject: 2girls

# 人物以外
subject: cat
subject: cherry blossom tree
subject: cityscape
\`\`\`

### demographics

**type**: \`object\`

人物の属性を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`ethnicity\` | 人種・民族 | \`japanese\`, \`asian\`, \`caucasian\`, \`dark-skinned\` |
| \`race\` | ファンタジー種族 | \`human\`, \`elf\`, \`demon\`, \`angel\`, \`catgirl\`, \`kemonomimi\` |
| \`age\` | 年齢層 | \`child\`, \`teen\`, \`young\`, \`adult\`, \`mature\`, \`elderly\` |

---

## Pose - ポーズ

### pose

**type**: \`object\`

ポーズ・姿勢を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`base\` | 全体のポーズ | \`standing\`, \`sitting\`, \`lying\`, \`jumping\`, \`running\` |
| \`facing\` | 向き・視線方向 | \`facing viewer\`, \`looking back\`, \`profile\`, \`turned away\` |
| \`action\` | 動作 | \`walking\`, \`dancing\`, \`fighting\`, \`sleeping\`, \`eating\` |
| \`head\` | 頭の動き | \`head tilt\`, \`looking up\`, \`looking down\`, \`chin rest\` |
| \`arms\` | 腕の動き | \`arms up\`, \`arms crossed\`, \`arm behind head\`, \`reaching out\` |
| \`hands\` | 手の形 | \`hands on hips\`, \`peace sign\`, \`pointing\`, \`fist\`, \`open palm\` |
| \`legs\` | 脚の動き | \`crossed legs\`, \`legs together\`, \`one knee up\` |

---

## Expression - 表情

### expression

**type**: \`object\`

表情を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`emotion\` | 感情 | \`happy\`, \`sad\`, \`angry\`, \`embarrassed\`, \`surprised\`, \`shy\` |
| \`face\` | 表情名 | \`smile\`, \`frown\`, \`pout\`, \`smirk\`, \`tears\`, \`blush\` |
| \`eyes\` | 目の状態 | \`closed eyes\`, \`half-closed\`, \`heart eyes\`, \`crying\` |
| \`mouth\` | 口の状態 | \`open mouth\`, \`tongue out\`, \`lip bite\`, \`drooling\` |

---

## Appearance - 外見

### appearance

**type**: \`object\`

外見・身体的特徴を指定します。

#### hair（髪）

| キー | 説明 | 例 |
|------|------|------|
| \`length\` | 長さ | \`short\`, \`medium\`, \`long\`, \`very long\` |
| \`style\` | スタイル | \`ponytail\`, \`twintails\`, \`braid\`, \`bob\`, \`messy\`, \`straight\` |
| \`color\` | 色 | \`blonde\`, \`black\`, \`pink\`, \`blue\`, \`gradient\`, \`multicolored\` |
| \`bangs\` | 前髪 | \`blunt bangs\`, \`side swept\`, \`parted\`, \`curtain bangs\` |
| \`extras\` | 装飾 | \`ribbon\`, \`hairpin\`, \`hair ornament\`, \`flower\` |

#### 顔・肌

| キー | 説明 | 例 |
|------|------|------|
| \`eyes\` | 目の色・形 | \`blue\`, \`green\`, \`red\`, \`heterochromia\`, \`almond\`, \`droopy\` |
| \`skin\` | 肌 | \`pale\`, \`fair\`, \`tan\`, \`dark\`, \`freckles\` |
| \`face\` | 顔の形 | \`round face\`, \`oval face\`, \`sharp jaw\` |
| \`makeup\` | メイク | \`lipstick\`, \`eyeshadow\`, \`blush\`, \`natural makeup\` |

#### 体型

| キー | 説明 | 例 |
|------|------|------|
| \`build\` | 体格 | \`slim\`, \`athletic\`, \`curvy\`, \`muscular\`, \`petite\`, \`chubby\` |
| \`proportions\` | 頭身 | \`chibi\`, \`normal\`, \`model\`, \`8 heads tall\` |

#### extras（追加要素）

**type**: \`array\`

\`tattoo\`, \`wings\`, \`tail\`, \`elf ears\`, \`horns\`, \`halo\` など

---

## Outfit - 服装

### outfit

**type**: \`object\`

服装・衣装を指定します。

#### 一発指定（コスチューム・系統）

| キー | 説明 | 例 |
|------|------|------|
| \`costume\` | コスチューム | \`nurse\`, \`maid\`, \`witch\`, \`bunny girl\`, \`idol\`, \`schoolgirl\` |
| \`style\` | 系統 | \`casual\`, \`formal\`, \`fantasy\`, \`gothic\`, \`sporty\` |

#### アイテム別

| キー | 説明 | 例 |
|------|------|------|
| \`top\` | トップス | \`shirt\`, \`blouse\`, \`t-shirt\`, \`sweater\`, \`crop top\` |
| \`bottom\` | ボトムス | \`skirt\`, \`pants\`, \`shorts\`, \`jeans\` |
| \`dress\` | ドレス | \`wedding dress\`, \`evening gown\`, \`sundress\` |
| \`outerwear\` | アウター | \`jacket\`, \`coat\`, \`cardigan\`, \`cape\`, \`hoodie\` |
| \`legwear\` | レッグウェア | \`thighhighs\`, \`pantyhose\`, \`stockings\`, \`knee socks\` |
| \`footwear\` | 靴 | \`high heels\`, \`boots\`, \`sneakers\`, \`barefoot\`, \`sandals\` |
| \`headwear\` | 帽子類 | \`hat\`, \`crown\`, \`ribbon\`, \`hairband\`, \`beret\` |
| \`swimwear\` | 水着 | \`bikini\`, \`one-piece swimsuit\`, \`school swimsuit\` |
| \`underwear\` | 下着 | \`bra\`, \`panties\`, \`lingerie\` |
| \`accessories\` | アクセサリ | \`necklace\`, \`earrings\`, \`glasses\`, \`bag\`, \`watch\` |
| \`props\` | 持ち物 | \`sword\`, \`umbrella\`, \`book\`, \`phone\`, \`cup\` |

#### アイテムの属性

| キー | 説明 | 例 |
|------|------|------|
| \`type\` | アイテムの種類 | \`t-shirt\`, \`blazer\`, \`pleated skirt\` など |
| \`color\` | 色 | \`white\`, \`black\`, \`red\`, \`navy\`, \`colorful\` |
| \`material\` | 素材 | \`silk\`, \`leather\`, \`lace\`, \`denim\`, \`cotton\` |
| \`pattern\` | 柄 | \`stripes\`, \`plaid\`, \`polka dots\`, \`floral\` |
| \`fit\` | フィット感 | \`tight\`, \`loose\`, \`oversized\` |
| \`state\` | 状態 | \`wet\`, \`torn\`, \`disheveled\` |

---

## Environment - 環境

### environment

**type**: \`object\`

背景・環境を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`world\` | 世界観 | \`fantasy\`, \`sci-fi\`, \`modern\`, \`historical\`, \`cyberpunk\` |
| \`background\` | 背景タイプ | \`simple background\`, \`detailed background\`, \`gradient\`, \`white\` |
| \`location\` | 場所 | \`indoor\`, \`outdoor\`, \`beach\`, \`forest\`, \`city\`, \`castle\`, \`classroom\` |
| \`time\` | 時間帯 | \`day\`, \`night\`, \`sunset\`, \`dawn\`, \`golden hour\` |
| \`weather\` | 天気 | \`sunny\`, \`rainy\`, \`snowy\`, \`cloudy\`, \`foggy\` |
| \`season\` | 季節 | \`spring\`, \`summer\`, \`autumn\`, \`winter\` |
| \`props\` | 背景の小物 | \`chair\`, \`table\`, \`flowers\`, \`bookshelf\`, \`lamp\` |

---

## Aesthetic / Mood / Effects - スタイル

### aesthetic

**type**: \`object\`

画風・スタイルを指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`style\` | 画風 | \`anime\`, \`realistic\`, \`painterly\`, \`sketch\`, \`watercolor\`, \`oil painting\`, \`pixel art\`, \`3D render\` |
| \`medium\` | 画材 | \`digital art\`, \`traditional\`, \`mixed media\` |
| \`color_scheme\` | 色調 | \`warm tones\`, \`cool tones\`, \`pastel\`, \`vibrant\`, \`monochrome\` |

### mood

**type**: \`string\`

雰囲気・感情的トーンを指定します。

\`\`\`yaml
mood: cheerful      # cheerful, melancholic, dramatic, peaceful, dreamy, tense, eerie
\`\`\`

### effects

**type**: \`array\`

視覚エフェクトを指定します。

\`\`\`yaml
effects: [sparkles, bokeh, lens flare, particles, motion blur, chromatic aberration]
\`\`\`

---

## Lighting - 照明

### lighting

**type**: \`object\`

照明を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`base\` | 雰囲気 | \`professional\`, \`dramatic\`, \`soft\`, \`natural\`, \`studio\`, \`cinematic\` |
| \`source\` | 光源 | \`sunlight\`, \`moonlight\`, \`neon\`, \`candlelight\`, \`window light\` |
| \`technique\` | 技法 | \`high-key\`, \`low-key\`, \`Rembrandt\`, \`split lighting\`, \`butterfly\` |
| \`color\` | 色温度 | \`warm\`, \`cool\`, \`golden\`, \`blue hour\` |
| \`shadow\` | 影 | \`hard shadow\`, \`soft shadow\`, \`no shadow\`, \`rim light\` |

---

## Composition - 構図

### composition

**type**: \`object\`

構図を指定します。

| キー | 説明 | 例 |
|------|------|------|
| \`shot\` | 切り取り範囲 | \`full body\`, \`upper body\`, \`close-up\`, \`cowboy shot\`, \`bust shot\` |
| \`angle\` | カメラアングル | \`from above\`, \`from below\`, \`eye level\`, \`dutch angle\`, \`from behind\` |
| \`method\` | 構図技法 | \`rule of thirds\`, \`centered\`, \`symmetrical\`, \`golden ratio\`, \`negative space\` |

---

## Photography - 撮影技法

### photography

**type**: \`object\`

撮影技法を指定します。主に実写風の画像に使用。

| キー | 説明 | 例 |
|------|------|------|
| \`camera\` | カメラ種類 | \`DSLR\`, \`mirrorless\`, \`film camera\`, \`polaroid\`, \`smartphone\` |
| \`lens\` | レンズ | \`wide angle\`, \`telephoto\`, \`fisheye\`, \`macro\`, \`85mm portrait\` |
| \`film\` | フィルム感 | \`warm tones\`, \`grainy\`, \`faded\`, \`high contrast\` |

---

## Quality / Negative - 品質

### quality

**type**: \`array\`

品質向上タグを指定します。

\`\`\`yaml
quality: [masterpiece, best quality, highly detailed, 4k, 8k, absurdres]
\`\`\`

### negative

**type**: \`array\`

ネガティブプロンプト（除外したいもの）を指定します。

\`\`\`yaml
negative: [worst quality, low quality, bad anatomy, extra fingers, bad hands, watermark, blurry, signature]
\`\`\`

---

## 複数人の記述

2人以上の人物を描く場合の書き方。

### 基本構造

\`\`\`yaml
subject: 2girls

# キー名は自由（名前でもOK）
character_1:
  demographics:
    age: young
  appearance:
    hair:
      color: blonde
  pose:
    base: standing
  outfit:
    costume: schoolgirl

character_2:
  demographics:
    age: young
  appearance:
    hair:
      color: teal
  pose:
    base: sitting
  outfit:
    costume: idol

# 相互作用
interaction: holding hands, looking at each other
\`\`\`

### interaction の語彙

| カテゴリ | 例 |
|---------|------|
| 接触 | \`holding hands\`, \`hugging\`, \`kissing\`, \`hand on shoulder\` |
| 位置関係 | \`back to back\`, \`facing each other\`, \`side by side\` |
| アクション | \`fighting\`, \`dancing together\`, \`playing\` |
| 視線 | \`looking at each other\`, \`whispering\` |
`;
