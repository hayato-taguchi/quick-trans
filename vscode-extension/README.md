# Q-Trans VSCode/Cursor 拡張機能

テキスト選択時に即座に翻訳を表示するVSCode/Cursor拡張機能です。

## 機能

- **ホバー翻訳**: テキストを選択してホバーすると翻訳がポップアップ表示
- **コマンド翻訳**: `Cmd+Shift+T` (Mac) / `Ctrl+Shift+T` (Win) で翻訳
- **解説機能**: `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Win) で選択テキストの解説
- **コンテキスト認識**: ファイル名、言語、周囲のコードを考慮した翻訳
- **自動言語検出**: 日本語→英語、それ以外→日本語に自動翻訳

## セットアップ

### 1. Azure OpenAI の設定

この拡張機能は Azure OpenAI API を使用します。以下の情報が必要です：

- Azure OpenAI エンドポイント URL
- デプロイメント名
- API キー

### 2. 拡張機能の設定

1. `Cmd+,` (Mac) / `Ctrl+,` (Win) で設定を開く
2. `qtrans` で検索
3. 以下を設定：
   - `qtrans.azureEndpoint`: エンドポイント URL
   - `qtrans.azureDeployment`: デプロイメント名
   - `qtrans.azureApiKey`: API キー

## 使い方

### ホバー翻訳

1. 翻訳したいテキストを選択
2. 選択範囲にマウスをホバー
3. 翻訳結果がポップアップ表示

### コマンド翻訳

1. テキストを選択
2. `Cmd+Shift+T` (Mac) / `Ctrl+Shift+T` (Win)
3. 結果をコピーまたは置換可能

### 解説機能

1. 解説が欲しいコードやテキストを選択
2. `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Win)
3. サイドパネルに解説が表示

## 開発

### ビルド

```bash
cd vscode-extension
npm install
npm run compile
```

### 開発モード

```bash
npm run watch
```

### デバッグ

1. VSCode/Cursorでこのフォルダを開く
2. F5 キーでデバッグ開始
3. 新しいウィンドウで拡張機能をテスト

## Cursor との互換性

この拡張機能は Cursor でも動作します。Cursor の AI 機能とは別のショートカットキーを使用しているため、競合しません。

## 設定オプション

| 設定 | 説明 | デフォルト |
|------|------|---------|
| `qtrans.azureEndpoint` | Azure OpenAI エンドポイント URL | - |
| `qtrans.azureDeployment` | デプロイメント名 | - |
| `qtrans.azureApiVersion` | API バージョン | `2024-02-15-preview` |
| `qtrans.azureApiKey` | API キー | - |
| `qtrans.enableHoverTranslation` | ホバー翻訳の有効/無効 | `true` |
| `qtrans.maxTextLength` | 翻訳対象の最大文字数 | `300` |

## ライセンス

（ライセンスを追加してください）
