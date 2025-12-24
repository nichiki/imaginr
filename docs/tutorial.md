# チュートリアル

このチュートリアルでは、Imaginrを使って効率的にプロンプトを作成・管理する方法を学びます。

## はじめに

画像生成AIを使うとき、毎回ゼロからプロンプトを書いていませんか？

「前に作ったあのキャラクターをベースに、服装だけ変えたい」
「同じ構図で、髪の色だけ何パターンか試したい」

こんなとき、テキストをコピペして編集するのは面倒ですし、ミスも起きやすいです。

Imaginrは、プロンプトを**構造化されたYAML形式**で管理することで、この問題を解決します。

---

## Step 1: 最初のプロンプトを作る

まずは、最もシンプルなプロンプトから始めましょう。

### 従来の書き方（自然言語）

```
young Japanese woman, long straight hair, wearing t-shirt and jeans
```

これでも画像は生成できます。でも、このプロンプトには少し問題があります：

- 髪の長さを変えたいとき、どこを直せばいい？
- 服装だけ変えたバリエーションを作りたいけど、どこからどこまでが服装？
- 他のプロンプトと共通部分を使い回したいけど、どうやって？

現実的には、この程度の長さであれば困ることはないでしょう。ただしAIによる画像生成では、指定しなかったものはAIにお任せ（＝ランダム）になるため、自分の意図通りの生成結果を得ようと思うと、プロンプトはどんどん細かく複雑になっていく傾向があります。

### YAMLで書くと

**ファイル: `99_tutorial/01_getting_started/getting_started.yaml`**

```yaml
subject: person

demographics:
  gender: woman
  age: young
  ethnicity: Japanese

appearance:
  hair:
    length: long hair
    style: straight hair

outfit:
  top: t-shirt
  bottom: jeans
```

### ポイント

- YAMLは**階層構造**でデータを表現できます
- `appearance`の下に`hair`、その下に`length`と`style`...というように、入れ子にできます
- **どこに何が書いてあるか一目瞭然**です
- 「Merged YAML」タブで、最終的なYAMLの内容を確認できます

---

## Step 2: より詳細な構造化

もう少し詳細なプロンプトを作ってみましょう。

### 自然言語で書くと...

```
young Japanese woman with long straight chestnut hair and brown eyes, wearing yellow t-shirt and indigo jeans with purple hair ribbon, simple red background
```

一文が長くなると、どこに何が書いてあるかわかりにくくなりますよね。

### YAMLで書くと

**ファイル: `99_tutorial/02_structured/structured.yaml`**

```yaml
subject: person

demographics:
  gender: woman
  age: young
  ethnicity: Japanese

appearance:
  hair:
    length: long hair
    style: straight hair
    color: chestnut hair
  eyes:
    color: brown

outfit:
  top:
    type: t-shirt
    color: yellow
  bottom:
    type: jeans
    color: indigo
  accessories:
    - purple hair ribbon

environment:
  background: simple background
  color: red
```

### ポイント

- `accessories`は配列（リスト）です。`-`で複数のアイテムを列挙できます
- `outfit.top`のように、さらに細かく構造化することで、後から特定の部分だけを変更しやすくなります
- `environment`を追加して、背景も指定しました

### なぜ構造化するのか？

自然言語との比較でわかるように：

1. **どこに何が書いてあるか**が一目でわかる
2. **特定の部分だけ変更**しやすい（例：髪の色だけ変えたい）
3. **再利用**しやすい（次のStepで説明します）

### 構造は自由に決められます

「こんな構造を覚えなきゃいけないの？」と思うかもしれません。

**安心してください。構造は自分がわかりやすければOKです。**

例えば、「白いTシャツ」を表現するのに、以下のどの書き方でもOKです：

```yaml
# シンプルに1行で
outfit: white t-shirt
```

```yaml
# トップスとして分類
outfit:
  top: white t-shirt
```

```yaml
# 色と種類を分けて管理
outfit:
  top:
    type: t-shirt
    color: white
```

どれが正解ということはありません。**あなたが管理しやすい形**で書いてください。

- 色をよく変えるなら、`color`を分けておくと便利
- そこまで細かく管理しないなら、1行でシンプルに
- 後から構造を変えることもできます

#### アプリが提供するおすすめの書き方

「自由に書いていい」と言われても、最初は何をどう書けばいいかわからないですよね。

そこで、このアプリでは**辞書機能**を通じて、おすすめの構造を提案しています：

- エディタで入力中に**オートコンプリート**が表示されます
- 辞書には、よく使うキー名や値があらかじめ登録されています
- 辞書の提案に沿って書けば、自然と整理された構造になります

ただし、これはあくまで**ガイド**です。辞書にない書き方をしても全く問題ありません。

自分のワークフローに合わせて、自由にカスタマイズしてください。

---

## Step 3: 継承 - ベースを使い回す

ここからがImaginrの真骨頂です。

同じキャラクターで服装だけ変えたいとき、ファイルをコピーして編集していませんか？

**継承**を使えば、共通部分を1つのファイルにまとめて、差分だけを別ファイルに書けます。

### ベースファイル

**ファイル: `99_tutorial/03_inheritance/base.yaml`**

```yaml
subject: person

demographics:
  gender: woman
  age: young
  ethnicity: Japanese

appearance:
  hair:
    length: long hair
    style: straight hair
```

キャラクターの基本設定だけを定義します。

### 派生ファイル1: カジュアルな服装

**ファイル: `99_tutorial/03_inheritance/child1.yaml`**

```yaml
_base: 99_tutorial/03_inheritance/base.yaml

outfit:
  top: t-shirt
  bottom: jeans

pose:
  base: standing
  action: hands on hips
```

### 派生ファイル2: フォーマルな服装

**ファイル: `99_tutorial/03_inheritance/child2.yaml`**

```yaml
_base: 99_tutorial/03_inheritance/base.yaml

outfit:
  dress: evening dress
  legwear: stockings
  footwear: ankle strap heels

pose:
  base: standing
  action: hand in own hair
```

### ポイント

- `_base`で親ファイルを指定すると、その内容を**継承**します
- 子ファイルでは、**追加・上書きしたい部分だけ**を書きます
- base.yamlを修正すると、child1とchild2の両方に反映されます

### メリット

- **一箇所を直せば全部に反映**される
- **差分だけ管理**すればいいので、ファイルがシンプルに
- **バリエーション展開**が楽

---

## Step 4: レイヤー - パーツを組み合わせる

継承は「親子関係」でした。でも、もっと柔軟に「パーツを組み合わせたい」こともあります。

たとえば：
- 「ストリートウェア」の服装セット
- 「スタジオ撮影」の環境セット

これらを自由に組み合わせられたら便利ですよね。

### レイヤーファイル

**ファイル: `99_tutorial/04_layers_library/layers/streetwear.yaml`**

```yaml
outfit:
  top: hoodie
  bottom: oversized jogger pants
  shoes: sneakers
```

**ファイル: `99_tutorial/04_layers_library/layers/studio.yaml`**

```yaml
environment:
  background: studio background
  lighting: softbox lighting
```

### 組み合わせて使う

**ファイル: `99_tutorial/04_layers_library/child1.yaml`**

```yaml
_base: 99_tutorial/04_layers_library/base.yaml

_layers:
  - 99_tutorial/04_layers_library/layers/streetwear.yaml
  - 99_tutorial/04_layers_library/layers/studio.yaml

pose:
  base: standing
  action: peace sign
```

### ポイント

- `_layers`は配列で、複数のファイルを指定できます
- 上から順番に適用され、後のファイルが前のファイルを上書きします
- **適用順序**: `_base` → `_layers`（順番に） → 自分自身

### 使い分け

| 機能 | 用途 |
|------|------|
| `_base` | 「〇〇をベースに」という親子関係 |
| `_layers` | 「〇〇と△△を組み合わせる」というミックス |

---

## Step 5: 変数 - 動的に値を変える

最後に、**変数**を使って、同じテンプレートから異なるバリエーションを生成する方法を学びます。

**ファイル: `99_tutorial/05_variables/base.yaml`**

```yaml
subject: person

demographics:
  gender: ${gender}
  age: ${age}
  ethnicity: Japanese

appearance:
  hair:
    length: ${hair_length}
    style: ${hair_style}
```

**ファイル: `99_tutorial/05_variables/child.yaml`**

```yaml
_base: 99_tutorial/05_variables/base.yaml

outfit:
  top: t-shirt
  bottom: jeans

environment:
  background: simple background
  color: ${background_color}
```

### ポイント

- `${変数名}`の形式で変数を定義します
- ファイルを選択すると、画面左下に変数入力フォームが表示されます
- 値を入力すると、リアルタイムでYAMLに反映されます
- 継承やレイヤーを使った場合も問題なく使用できます（ただし、変数を固定値で上書きした場合は、変数ではなくなります）

### 便利な使い方

- **髪型を何パターンか試す**：`${hair_style}`を変えるだけ
- **背景色のバリエーション**：`${background_color}`を変えるだけ
- **同じ構図で男女両方作る**：`${gender}`を変えるだけ

### プリセット機能

よく使う変数の組み合わせは「プリセット」として保存できます。

1. 変数に値を入力
2. 「Save Preset」をクリック
3. 名前をつけて保存

次回からはプリセットを選ぶだけで、同じ設定を呼び出せます。

---

## まとめ

| 機能 | できること |
|------|-----------|
| YAML構造化 | プロンプトを整理して管理 |
| `_base` | 共通部分を継承して再利用 |
| `_layers` | パーツを自由に組み合わせ |
| `${変数}` | 動的に値を変更 |

これらを組み合わせることで、プロンプトの管理が格段に楽になります。

---

## 次のステップ

- 自分のキャラクターのベースファイルを作ってみましょう
- 服装や背景のレイヤーライブラリを作ってみましょう
- よく変える部分を変数にしてみましょう

Happy prompting!

---

## 参考資料

- [YAPS仕様書](YAPS.md) - 構造化スキーマの詳細（上級者向け）
