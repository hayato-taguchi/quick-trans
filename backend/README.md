# バックエンドサーバー

Q-Trans のバックエンド API サーバーです。

## 技術スタック

推奨フレームワーク：

- Node.js + Express / Fastify
- Python + FastAPI / Flask
- Go + Gin / Echo

## セットアップ

### Node.js の場合

```bash
npm install
npm run dev
```

### Python の場合

```bash
pip install -r requirements.txt
uvicorn main:app --reload  # FastAPIの場合
```

## 環境変数

`.env` ファイルを作成して、必要な環境変数を設定してください：

```env
PORT=3000
DATABASE_URL=...
API_KEY=...
```

## デプロイ

- Vercel（Serverless Functions）
- Railway
- Render
- AWS Lambda
- Google Cloud Functions

など、お好みのホスティングサービスにデプロイできます。
