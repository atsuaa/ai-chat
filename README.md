# AIチャットボット

Anthropic Claude APIを利用したAIチャットボットのWebアプリケーション。ユーザー認証は行わず、匿名クライアントID単位で会話履歴を保存する(TTL 24時間で自動失効)。

技術スタックやアーキテクチャの詳細は `CLAUDE.md` / `SPEC.md` を参照。

## ローカル開発

### 前提条件

- Node.js 20.9以上(推奨: 24系)
- MongoDB Atlasのクラスタ(接続文字列)
- Anthropic APIキー

### セットアップ

```bash
npm install
cp .env.example .env
```

`.env` に以下を設定する。

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL="mongodb+srv://user:password@cluster.mongodb.net/ai-chat"
```

```bash
npx prisma generate   # Prisma Clientを生成
npx prisma db push    # スキーマをMongoDBへ反映(migrate系は非対応のためこちらを使う)
```

新しいAtlasクラスタを使う場合は、TTLインデックス(`Conversation.updatedAt` 基準、24時間)を1度だけ作成する。

```bash
node --env-file=.env scripts/create-ttl-index.ts
```

### 起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

### 開発時によく使うコマンド

```bash
npm run lint          # ESLint
npx tsc --noEmit       # 型チェック
npx prisma db push     # スキーマをMongoDBへ反映(migrate系は使わない)
```

## Docker化・Cloud Runへのデプロイ

このアプリはNext.jsの `output: "standalone"` を使ったDockerイメージとしてビルドし、Google Cloud Runにデプロイする想定。Next.jsとHono API(`app/api/[[...route]]/route.ts`)は同一コンテナ・同一サービスにまとまっている。

### 前提条件

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) がインストール・認証済み(`gcloud auth login`)
- 課金が有効なGCPプロジェクト
- ローカルにDockerが無くても、後述の `gcloud builds submit` を使えばCloud Build上でビルドできる(ローカルDockerがある場合は `docker build` でも可)

### 1. MongoDB Atlasのネットワークアクセス設定

Cloud RunはサーバーレスでリクエストごとにIPが変わりうるため、まずはシンプルに全許可で構成する。

1. Atlas管理画面 → Network Access → **Add IP Address** → `0.0.0.0/0`(Allow access from anywhere)を追加
2. 認証情報(ユーザー名・パスワード)は `DATABASE_URL` にのみ保持し、他に漏らさない

より厳格に制限したい場合は、Cloud RunにVPCコネクタ + Cloud NATで固定の送信IPを持たせ、そのIPのみをAtlasのアクセスリストに許可する構成に変更する(本プロジェクトでは未使用)。

### 2. GCP側の準備(初回のみ)

```bash
gcloud config set project YOUR_PROJECT_ID

# 必要なAPIを有効化
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# コンテナイメージ用のArtifact Registryリポジトリを作成
gcloud artifacts repositories create ai-chat \
  --repository-format=docker \
  --location=asia-northeast1
```

### 3. イメージのビルド&push

Cloud Build上でビルドするので、ローカルにDockerが無くても実行できる。

```bash
gcloud builds submit \
  --tag asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/ai-chat/ai-chat:latest
```

ローカルにDockerがある場合は代わりに以下でも良い。

```bash
docker build --platform linux/amd64 \
  -t asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/ai-chat/ai-chat:latest .
docker push asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/ai-chat/ai-chat:latest
```

### 4. Cloud Runへデプロイ

```bash
gcloud run deploy ai-chat \
  --image asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/ai-chat/ai-chat:latest \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "ANTHROPIC_API_KEY=sk-ant-...,DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/ai-chat"
```

`PORT` はCloud Runが実行時に自動で注入する(コンテナ側は8080でリッスンする前提。`Dockerfile` の `ENV PORT=8080` はデフォルト値でありCloud Run側の値で上書きされる)ため、明示的に渡す必要はない。

APIキーや接続文字列をコマンドライン引数に直書きしたくない場合は、[Secret Manager](https://cloud.google.com/run/docs/configuring/services/secrets) に登録し `--set-secrets` で参照する方法に置き換える。

新しいAtlasクラスタにはじめて接続する場合は、デプロイ後に1度だけTTLインデックス作成スクリプトをローカルから(`DATABASE_URL` を本番クラスタに向けて)実行する。

```bash
DATABASE_URL="mongodb+srv://..." node scripts/create-ttl-index.ts
```

### 5. 動作確認

デプロイ完了時に表示されるURL(`https://ai-chat-xxxxx-an.a.run.app` のような形式)にアクセスし、以下を確認する。

- 会話の新規作成・メッセージ送信・ストリーミング応答の表示
- 会話を切り替えて履歴が読み込まれること
- ページを再読み込みしてもCookie(`client_id`)により同じ会話一覧が見えること

### 再デプロイ

コードを変更した場合は、手順3(ビルド&push)・手順4(デプロイ)を再実行すればよい。イメージタグを固定(`:latest`)にしている場合、Cloud Runの新しいリビジョンとして自動的に切り替わる。

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Hono Documentation](https://hono.dev/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Mastra Documentation](https://mastra.ai/docs)
