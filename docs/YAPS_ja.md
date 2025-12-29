# YAPS v1 仕様書 - Yet Another Prompt Schema

画像生成AIプロンプト用の構造化スキーマ仕様

---

## 目次

- [概要](#概要)
- [基本構造](#基本構造)
- [Subject - 被写体](#subject---被写体)
- [Pose - ポーズ](#pose---ポーズ)
- [Expression - 表情](#expression---表情)
- [Appearance - 外見](#appearance---外見)
- [Outfit - 服装](#outfit---服装)
- [Environment - 環境](#environment---環境)
- [Aesthetic / Mood / Effects - スタイル](#aesthetic--mood--effects---スタイル)
- [Lighting - 照明](#lighting---照明)
- [Composition - 構図](#composition---構図)
- [Photography - 撮影技法](#photography---撮影技法)
- [Quality / Negative - 品質](#quality--negative---品質)
- [複数人の記述](#複数人の記述)
- [設計思想](#設計思想)

---

## 概要

YAPS (Yet Another Prompt Schema) は、画像生成AIプロンプトを構造化するためのYAMLスキーマです。

### 特徴

- **必要なキーだけ使用** - 全てを埋める必要なし
- **シンプルと詳細の両立** - ざっくり指定も細かい指定も可能
- **LLMフレンドリー** - 意味が明確でAIが理解しやすい構造

### 基本的な使い方

```yaml
# 最小限の例
subject: 1girl
pose:
  base: standing
outfit:
  costume: schoolgirl
quality: [masterpiece, best quality]
```

---

## 基本構造

YAPS v1のトップレベルキー一覧:

| キー | 説明 | 必須 |
|------|------|------|
| `subject` | 被写体 | ○ |
| `demographics` | 人物属性（年齢・人種等） | - |
| `pose` | ポーズ・姿勢 | - |
| `expression` | 表情 | - |
| `appearance` | 外見・身体的特徴 | - |
| `outfit` | 服装・衣装 | - |
| `environment` | 背景・環境 | - |
| `aesthetic` | 画風・スタイル | - |
| `mood` | 雰囲気 | - |
| `effects` | 視覚エフェクト | - |
| `lighting` | 照明 | - |
| `composition` | 構図 | - |
| `photography` | 撮影技法 | - |
| `quality` | 品質タグ | △ |
| `negative` | ネガティブプロンプト | △ |
| `interaction` | 複数人の相互作用 | - |

### `base` キー（pose, lighting）

`pose` と `lighting` では、直接文字列で指定するか、`base` キーを使って指定できます。

```yaml
# 直接文字列（シンプル）
pose: standing

# base キー使用（上と同義）
pose:
  base: standing
```

詳細を追加したい場合は `base` キーを使います：

```yaml
pose:
  base: standing      # ← 全体としては「立っている」
  hands: peace sign   # ← 細かく指定したい部分だけ追加

lighting:
  base: dramatic      # ← 全体としては「ドラマチック」
  source: window light
```

---

## Subject - 被写体

### subject

**type**: `string`

被写体を指定します。人物・動物・物体・風景など。

```yaml
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
```

### demographics

**type**: `object`

人物の属性を指定します。

| キー | 説明 | 例 |
|------|------|------|
| `gender` | 性別 | `woman`, `man`, `girl`, `boy`, `androgynous` |
| `ethnicity` | 人種・民族 | `Japanese`, `Asian`, `Caucasian`, `African`, `Hispanic` |
| `race` | ファンタジー種族 | `human`, `elf`, `demon`, `angel`, `catgirl`, `kemonomimi` |
| `age` | 年齢層 | `teenage`, `young`, `young adult`, `middle-aged`, `elderly` |

```yaml
demographics:
  gender: woman
  ethnicity: Japanese
  race: elf
  age: young
```

> **Note**: `ethnicity` は現実の人種・民族、`race` はファンタジー種族を指します。

---

## Pose - ポーズ

### pose

**type**: `object`

ポーズ・姿勢を指定します。

| キー | 説明 | 例 |
|------|------|------|
| `base` | 全体のポーズ | `standing`, `sitting`, `lying`, `jumping`, `running` |
| `facing` | 向き・視線方向 | `facing viewer`, `looking back`, `profile`, `turned away` |
| `action` | 動作 | `walking`, `dancing`, `fighting`, `sleeping`, `eating` |
| `head` | 頭の動き | `head tilt`, `looking up`, `looking down`, `chin rest` |
| `arms` | 腕の動き | `arms up`, `arms crossed`, `arm behind head`, `reaching out` |
| `hands` | 手の形 | `hands on hips`, `peace sign`, `pointing at viewer`, `fist`, `open palm` |
| `legs` | 脚の動き | `crossed legs`, `legs together`, `one knee up` |

```yaml
# シンプル
pose:
  base: standing

# 詳細
pose:
  base: standing
  facing: looking back
  hands: peace sign
  head: head tilt
```

> **Note**: `facing` はモデルの向き、カメラアングル（from behind等）は `composition.angle` で指定します。

---

## Expression - 表情

### expression

**type**: `object`

表情を指定します。フラット構造で使いやすさを優先。

| キー | 説明 | 例 |
|------|------|------|
| `emotion` | 感情 | `happy`, `sad`, `angry`, `embarrassed`, `surprised`, `shy` |
| `face` | 表情名 | `smile`, `frown`, `pout`, `smirk`, `tears`, `blush` |
| `eyes` | 目の状態 | `closed eyes`, `half-closed eyes`, `heart-shaped pupils`, `wide-eyed` |
| `mouth` | 口の状態 | `open mouth`, `tongue out`, `biting lip`, `drooling` |

```yaml
expression:
  emotion: happy
  face: smile
  eyes: closed eyes
```

---

## Appearance - 外見

### appearance

**type**: `object`

外見・身体的特徴を指定します。

#### hair（髪）

| キー | 説明 | 例 |
|------|------|------|
| `length` | 長さ | `short hair`, `medium hair`, `long hair`, `very long hair` |
| `style` | スタイル | `ponytail`, `twintails`, `braid`, `bob cut`, `messy hair`, `straight hair` |
| `color` | 色 | `blonde hair`, `black hair`, `pink hair`, `blue hair`, `gradient hair`, `multicolored hair` |
| `texture` | 質感 | `silky`, `fluffy`, `smooth`, `glossy`, `wet` |
| `bangs` | 前髪 | `blunt bangs`, `swept bangs`, `parted bangs`, `side bangs` |
| `extras` | 装飾 | `ribbon`, `hair pin`, `hair ornament`, `hair flower` |

```yaml
appearance:
  hair:
    length: long hair
    style: ponytail
    color: blonde hair
    bangs: blunt bangs
    extras: [ribbon]
```

#### 顔・肌

| キー | 説明 | 例 |
|------|------|------|
| `eyes` | 目の色・形 | `blue eyes`, `green eyes`, `red eyes`, `heterochromia` |
| `skin` | 肌 | `pale skin`, `fair skin`, `tan skin`, `dark skin`, `freckles` |
| `face` | 顔の形 | `round face`, `oval face`, `strong jawline` |
| `makeup` | メイク | `red lipstick`, `smoky eyes`, `blush`, `natural makeup` |

#### 体型

| キー | 説明 | 例 |
|------|------|------|
| `build` | 体格 | `slim`, `athletic`, `curvy`, `muscular`, `petite`, `plump` |
| `proportions` | 頭身 | `chibi`, `normal`, `model proportions`, `8 heads tall` |

#### 部位別（必要な時のみ）

| キー | 説明 | 例 |
|------|------|------|
| `breast` | 胸 | `flat chest`, `small breasts`, `medium breasts`, `large breasts` |
| `hips` | 腰 | `wide hips`, `narrow hips` |
| `waist` | ウエスト | `slim waist`, `narrow waist` |
| `legs` | 脚 | `long legs`, `thick thighs`, `slender legs` |

#### extras（追加要素）

**type**: `array`

`tattoo`, `horns`, `halo`, `pointed ears`, `fangs` など

```yaml
appearance:
  hair:
    color: pink hair
    style: twintails
  eyes: heterochromia
  build: petite
  extras: [pointed ears, horns]
```

---

## Outfit - 服装

### outfit

**type**: `object`

服装・衣装を指定します。

#### ざっくり指定

```yaml
# 直接文字列
outfit: casual

# または style キー
outfit:
  style: casual
```

#### 一発指定（コスチューム・系統）

| キー | 説明 | 例 |
|------|------|------|
| `costume` | コスチューム | `nurse`, `maid`, `witch`, `bunny girl`, `idol`, `schoolgirl` |
| `style` | 系統 | `casual`, `formal`, `elegant`, `gothic`, `sporty` |

```yaml
# コスチュームで指定
outfit:
  costume: maid
```

#### アイテム別

| キー | 説明 | 例 |
|------|------|------|
| `top` | トップス | `shirt`, `blouse`, `t-shirt`, `sweater`, `crop top` |
| `bottom` | ボトムス | `skirt`, `pants`, `shorts`, `jeans` |
| `dress` | ドレス | `wedding dress`, `evening gown`, `sundress` |
| `outerwear` | アウター | `jacket`, `coat`, `cardigan`, `cape`, `hoodie` |
| `legwear` | レッグウェア | `thigh highs`, `pantyhose`, `stockings`, `knee socks` |
| `footwear` | 靴 | `high heels`, `boots`, `sneakers`, `barefoot`, `sandals` |
| `headwear` | 帽子類 | `hat`, `crown`, `ribbon`, `hairband`, `beret` |
| `swimwear` | 水着 | `bikini`, `one-piece swimsuit`, `school swimsuit` |
| `underwear` | 下着 | `bra`, `panties`, `lingerie` |
| `accessories` | アクセサリ | `necklace`, `earrings`, `glasses`, `bag`, `watch` |
| `props` | 持ち物 | `sword`, `umbrella`, `book`, `phone`, `cup` |

#### アイテムの属性

各アイテムを詳細に指定する場合、以下の属性を使用できます。

| キー | 説明 | 例 |
|------|------|------|
| `type` | アイテムの種類 | `t-shirt`, `blazer`, `pleated skirt` など |
| `color` | 色 | `white`, `black`, `red`, `navy`, `multicolor` |
| `color_scheme` | 配色 | `monochrome`, `complementary colors`, `pastel colors` |
| `material` | 素材 | `silk`, `leather`, `lace`, `denim`, `cotton` |
| `texture` | 質感 | `soft`, `smooth`, `glossy`, `matte`, `fluffy` |
| `pattern` | 柄 | `stripes`, `plaid`, `polka dots`, `floral` |
| `fit` | フィット感 | `tight`, `loose`, `oversized` |
| `state` | 状態 | `wet clothes`, `torn clothes`, `disheveled clothes` |
| `neckline` | ネックライン | `v-neck`, `off-shoulder`, `turtleneck` |
| `sleeve` | 袖 | `sleeveless`, `short sleeve`, `long sleeve` |
| `length` | 丈 | `mini`, `midi`, `maxi`, `cropped` |

#### 書き方パターン

```yaml
# シンプル
outfit:
  top: blazer
  bottom: pleated skirt

# 詳細指定
outfit:
  top:
    type: blazer
    color: navy
    material: wool
    fit: slim
  bottom:
    type: pleated skirt
    color: gray
    pattern: plaid
    length: mini
```

---

## Environment - 環境

### environment

**type**: `object`

背景・環境を指定します。

| キー | 説明 | 例 |
|------|------|------|
| `world` | 世界観 | `fantasy`, `sci-fi`, `modern`, `historical`, `cyberpunk`, `steampunk` |
| `background` | 背景タイプ | `simple background`, `gradient background`, `white background`, `black background` |
| `color` | 背景色・色調 | `gradient`, `monochrome`, `pastel`, `vivid`, `warm tones`, `cool tones` |
| `location` | 場所 | `indoors`, `outdoors`, `beach`, `forest`, `city`, `castle`, `classroom` |
| `time` | 時間帯 | `day`, `night`, `sunset`, `dawn`, `golden hour` |
| `weather` | 天気 | `sunny`, `rain`, `snow`, `cloudy`, `fog` |
| `season` | 季節 | `spring (season)`, `summer`, `autumn`, `winter` |
| `crowd` | 群衆 | `crowd`, `sparse crowd`, `empty` |
| `props` | 背景の小物 | `chair`, `table`, `flowers`, `bookshelf`, `lamp` |

```yaml
environment:
  world: fantasy
  location: castle
  time: sunset
  weather: cloudy
  props: [throne, candles]
```

> **Note**: `props` は背景にあるもの。手に持つものは `outfit.props` で指定します。

---

## Aesthetic / Mood / Effects - スタイル

### aesthetic

**type**: `object`

画風・スタイルを指定します。

| キー | 説明 | 例 |
|------|------|------|
| `style` | 画風 | `anime`, `realistic`, `painterly`, `sketch`, `watercolor`, `oil painting`, `pixel art`, `3D render` |
| `medium` | 画材 | `digital art`, `traditional`, `mixed media` |
| `color_scheme` | 色調 | `warm tones`, `cool tones`, `pastel colors`, `vibrant colors`, `monochrome` |

```yaml
aesthetic:
  style: anime
  medium: digital art
  color_scheme: pastel colors
```

> **Note**: アーティスト名は辞書に含めません。

### mood

**type**: `string`

雰囲気・感情的トーンを指定します。

```yaml
mood: joyful      # joyful, melancholic, dramatic, peaceful, serene, tense, eerie
```

### effects

**type**: `array`

視覚エフェクトを指定します。

```yaml
effects: [sparkles, bokeh, lens flare, particles, motion blur, chromatic aberration]
```

#### 判断基準

| 迷った時 | 分類先 |
|---------|-------|
| 「どう描くか」（技法） | `aesthetic` |
| 「どんな気分か」（雰囲気） | `mood` |
| 「後から載せるエフェクト」 | `effects` |

---

## Lighting - 照明

### lighting

**type**: `object`

照明を指定します。

| キー | 説明 | 例 |
|------|------|------|
| `base` | 雰囲気 | `professional`, `dramatic`, `soft`, `natural`, `studio`, `cinematic` |
| `source` | 光源 | `sunlight`, `moonlight`, `neon light`, `candlelight`, `window light` |
| `technique` | 技法 | `high-key`, `low-key`, `Rembrandt`, `split lighting`, `butterfly lighting` |
| `color` | 色温度 | `warm`, `cool`, `golden`, `blue hour` |
| `shadow` | 影 | `hard shadow`, `soft shadow`, `no shadow`, `rim light` |

```yaml
# シンプル（雰囲気だけ）
lighting:
  base: professional

# 詳細
lighting:
  base: dramatic
  source: window light
  technique: Rembrandt
  shadow: hard shadow
```

---

## Composition - 構図

### composition

**type**: `object`

構図を指定します。

| キー | 説明 | 例 |
|------|------|------|
| `shot` | 切り取り範囲 | `full body`, `upper body`, `close-up`, `cowboy shot`, `bust shot` |
| `angle` | カメラアングル | `from above`, `from below`, `eye level`, `dutch angle`, `from side` |
| `method` | 構図技法 | `rule of thirds`, `centered`, `symmetrical`, `golden ratio`, `diagonal` |

```yaml
composition:
  shot: upper body
  angle: from below
  method: rule of thirds
```

---

## Photography - 撮影技法

### photography

**type**: `object`

撮影技法を指定します。主に実写風の画像に使用。

| キー | 説明 | 例 |
|------|------|------|
| `shot_with` | 撮影機材 | `shot on DSLR`, `shot on mirrorless camera`, `shot on 35mm film`, `shot on Polaroid`, `shot on smartphone` |
| `lens` | レンズ | `24mm wide angle`, `200mm telephoto`, `fisheye lens`, `macro lens`, `85mm f/1.4` |
| `film` | フィルム | `Kodak Portra 400`, `Fuji Pro 400H`, `Cinestill 800T`, `Kodak Tri-X 400` |

```yaml
photography:
  shot_with: shot on 35mm film
  lens: 85mm f/1.4
  film: Kodak Portra 400
```

---

## Quality / Negative - 品質

### quality

**type**: `array`

品質向上タグを指定します。

```yaml
quality: [masterpiece, best quality, highly detailed, 4k, 8k, absurdres]
```

### negative

**type**: `array`

ネガティブプロンプト（除外したいもの）を指定します。

```yaml
negative: [worst quality, low quality, bad anatomy, extra fingers, bad hands, watermark, blurry, signature]
```

---

## 複数人の記述

2人以上の人物を描く場合の書き方。

### 基本構造

```yaml
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
```

### interaction の語彙

| カテゴリ | 例 |
|---------|------|
| 接触 | `holding hands`, `hugging`, `kissing`, `hand on shoulder` |
| 位置関係 | `back to back`, `facing each other`, `side by side` |
| アクション | `fighting`, `dancing together`, `playing` |
| 視線 | `looking at each other`, `whispering` |

---

## 設計思想

### 1. base パターン（pose, lighting）

`pose` と `lighting` では、直接文字列指定と `base` キー指定が同義です。

- シンプルに指定 → 直接文字列
- 詳細を追加したい → `base` キー + 他のキー

```yaml
# 直接文字列（シンプル）
pose: standing

# base キー使用（上と同義）
pose:
  base: standing

# 詳細を追加する場合
pose:
  base: standing
  hands: peace sign
```

### 2. outfit のアイテム詳細指定

outfit を個別のアイテムで詳細指定する場合、`type` キーでアイテムの種類を指定します。
`type` は outfit 内のアイテム専用キーです。

```yaml
# シンプル（直接文字列）
outfit:
  top: t-shirt

# 詳細指定（typeキー使用）
outfit:
  top:
    type: t-shirt
    color: white
    fit: oversized
```

### 3. props の配置

- `outfit.props` = 手に持っているもの（sword, umbrella...）
- `environment.props` = 背景にあるもの（chair, table...）

### 4. ethnicity vs race

- `ethnicity` = 現実の人種・民族（japanese, caucasian...）
- `race` = ファンタジー種族（elf, demon, catgirl...）

### 5. facing vs angle

- `pose.facing` = モデルの向き（facing viewer, looking back...）
- `composition.angle` = カメラアングル（from above, from behind...）

### 6. 辞書の語彙選定基準

**含める:**
- 画像生成AI特有の用語
- 効果がわかりにくい専門用語
- スタイル・技法系
- 「知らないと使えない」系

**含めない:**
- 一般名詞（bus, apple, dog）
- 誰でも思いつく単語
- アーティスト名
- 具体的すぎる組み合わせ

### 7. モデル固有タグ

モデルによっては特別なタグが必要な場合があります。YAPSはこれらを制限しません。トップレベルに自由にキーを追加できます。

```yaml
# Animagine-XL
rating: sensitive          # コンテンツレーティング
temporal: year 2020        # 時代設定

# Pony Diffusion
score_9, score_8_up         # 品質スコアタグ
source_anime               # ソース指定
```

これらはYAPSの標準キーではありませんが、必要に応じて辞書に追加すればオートコンプリートも利用できます。

---

## バージョン履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2024-12-24 | 初版リリース |
| v1.1 | 2024-12-28 | 辞書との同期・例示値の更新、`environment.color` 追加 |
| v1.2 | 2024-12-29 | `texture` キー追加（hair、outfit各アイテムの汎用質感属性） |

---

*YAPS - Yet Another Prompt Schema*
