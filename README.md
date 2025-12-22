# Imaginr

Prompt Builder for AI Image Generation

画像生成AI向けのYAMLベースプロンプト管理ツール。

## 特徴

- **構造化プロンプト**: YAMLで階層的にプロンプトを管理
- **テンプレート継承**: `_base`と`_layers`による柔軟な継承・合成システム
- **変数システム**: `${varName}`構文で動的な値の注入、プリセット保存
- **オートコンプリート**: 辞書ベースの入力補完
- **ComfyUI連携**: ワークフローを使った画像生成とギャラリー管理

## インストール

[Releases](https://github.com/nichiki/imaginr/releases)から最新版をダウンロードしてください。

- **Windows**: `.msi` または `.exe`
- **macOS**: `.dmg`

## ドキュメント

- [チュートリアル](docs/tutorial.md) - 初めての方向け、基本的な使い方を学ぶ
- [マニュアル](docs/manual.md) - 機能リファレンス、設計思想、ComfyUI連携

### 基本的な流れ

1. 左ペインでYAMLテンプレートを選択
2. 中央のエディタで編集
3. 変数がある場合は左下のフォームで値を入力
4. 「Generate」ボタンでComfyUIに送信して画像生成

### YAMLの書き方（簡単な例）

```yaml
subject: person

demographics:
  gender: woman
  age: young

appearance:
  hair:
    length: long hair
    color: ${hair_color}

outfit:
  top: t-shirt
  bottom: jeans
```

- `_base`: 他のファイルを継承
- `_layers`: 複数のファイルを合成
- `${変数名}`: 動的に値を変更

---

## 開発者向け

### 技術スタック

- **Desktop**: Tauri 2
- **Frontend**: Next.js 16 + React 19
- **Editor**: Monaco Editor
- **Database**: SQLite (tauri-plugin-sql)
- **UI**: shadcn/ui + Tailwind CSS v4

### 開発コマンド

```bash
# 依存関係のインストール
npm install

# 開発モード（Tauriデスクトップアプリとして起動）
npm run tauri:dev

# プロダクションビルド
npm run tauri:build

# Lint
npm run lint
```

### ディレクトリ構成

```
src/                  # Next.js フロントエンド
src-tauri/            # Tauri Rustバックエンド
data/                 # バンドルリソース（templates, dictionary, snippets）
docs/                 # ドキュメント
```

## ライセンス

MIT
