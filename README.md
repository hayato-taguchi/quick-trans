# Q-Trans - クイック翻訳Chrome拡張機能

テキスト選択時に自動で翻訳チップを表示するChrome拡張機能です。

## プロジェクト構成

このプロジェクトはモノレポ構成で、以下の3つの主要コンポーネントで構成されています：

```
quick-translate/
├── extension/          # Chrome拡張機能 (WXT)
│   ├── wxt.config.ts
│   ├── entrypoints/
│   ├── src/
│   └── .output/chrome-mv3/   # ビルド後の読み込み対象
├── landing/            # ランディングページ（課金誘導LP）
└── backend/            # バックエンドサーバー
```

## セットアップ

### Chrome拡張機能

```bash
cd extension
npm install
npm run build
```

1. Chromeで `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extension/.output/chrome-mv3/` ディレクトリを選択

### バックエンドサーバー

```bash
cd backend
# 依存関係のインストール（使用するフレームワークに応じて）
npm install  # または pip install -r requirements.txt
```

### ランディングページ

```bash
cd landing
# 依存関係のインストール（使用するフレームワークに応じて）
npm install
```

## 開発

各ディレクトリで個別に開発を進めます。詳細は各ディレクトリのREADMEを参照してください。

## ライセンス

（ライセンスを追加してください）

