# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイドです。詳細な要件は `SPEC.md` を参照してください。

> このプロジェクトのNext.jsは訓練データと異なる破壊的変更を含む可能性があります。実装前に `AGENTS.md` の注意書きを確認してください。

## プロジェクト概要

Anthropic Claude APIを利用したAIチャットボットのWebアプリケーション。ユーザー認証は行わず、匿名クライアントID単位で会話履歴を保存する。

## 技術スタック

- フロントエンド: Next.js (App Router) + TypeScript
- バックエンドAPI: Hono(Next.jsのAPI Routeにマウント)
- ORM / DB: Prisma + MongoDB
- AIエージェント: Mastra(`@mastra/core/agent`)
- AIモデル: Anthropic Claude API(`ANTHROPIC_API_KEY`が必要)
- デプロイ: Google Cloud Run(Dockerコンテナ、Next.jsは `output: "standalone"`)

## アーキテクチャ

- NextアプリとHono APIは同一プロジェクト・同一Cloud Runサービスにまとめる。
- Hono APIは `app/api/[[...route]]/route.ts` にマウントし、`hono/vercel` の `handle()` でNext.jsのRoute Handlerとして公開する。
- APIハンドラ内でMastraの `Agent`(model: `anthropic/claude-*`)を呼び出し、`agent.stream()` の結果をSSEでフロントに逐次返す。
- Prismaクライアントはバックエンド(Hono側ハンドラ)からのみ利用する。フロントから直接DBへはアクセスしない。
- ユーザー識別は認証なしのクライアントID(UUID、Cookie保持)で行う。会話・メッセージはこのIDに紐付けて保存する。

## ディレクトリ構成(想定)

```
app/
  api/[[...route]]/route.ts   # Hono APIのエントリポイント
  (chat UI用のページ・コンポーネント)
server/
  hono/                       # Honoのルーティング定義
  mastra/                     # Mastra Agent定義
prisma/
  schema.prisma
```

## データモデル

`Conversation`(clientId, title, timestamps) と `Message`(conversationId, role, content, timestamps)。MongoDBコネクタのため `id` は `@id @default(auto()) @map("_id") @db.ObjectId`、外部キー(`conversationId`)にも `@db.ObjectId` を付与する。詳細は `SPEC.md` の該当セクション、実装後は `prisma/schema.prisma` を正とする。

**Prisma ORM v7はMongoDBコネクタを含まない(2026年時点)ため、本プロジェクトは意図的にPrisma ORM v6系(6.19系)にピン留めしている。** `npx prisma validate` 等が表示する「v7へアップグレード」の案内には従わないこと。`package.json` の `prisma` / `@prisma/client` を安易に `npm update` や `@latest` で上げないよう注意する。接続先 `DATABASE_URL` は通常通り `schema.prisma` の `datasource` ブロック(`url = env("DATABASE_URL")`)で読み込み、Prisma Clientは `node_modules/@prisma/client` に生成され、コードからは通常通り `@prisma/client` からimportする。MongoDBの後継パスとしてPrisma Next(Early Access)があるが、pre-1.0でトランザクション機能が未成熟なため今回は採用しない。

会話データは**セッション中のみ**保持する。`Conversation.updatedAt` を基準にしたTTLインデックス(24時間)で自動失効させる。TTLインデックスはPrisma schemaでは表現できないため、`scripts/create-ttl-index.ts`(Prisma Clientの `$runCommandRaw` でMongoDBの `createIndexes` を直接実行)で作成する。新しい環境(別のAtlasクラスタなど)を構築した際は `node scripts/create-ttl-index.ts` を再実行すること。

## API(Hono, `/api` 配下)

- `GET /api/conversations` — クライアントIDに紐づく会話一覧
- `POST /api/conversations` — 新規会話作成
- `GET /api/conversations/:id/messages` — メッセージ一覧取得
- `POST /api/conversations/:id/messages` — メッセージ送信、Claude応答をSSEでストリーミング返却

## 環境変数

- `ANTHROPIC_API_KEY` — Claude APIキー
- `DATABASE_URL` — MongoDB接続文字列(Prisma用、`mongodb+srv://...`)
- `PORT` — Cloud Run用リッスンポート(既定8080)

## 開発時の注意点

- スコープ外の機能(ユーザー認証、ファイル/画像アップロード、複数AIプロバイダー対応、レート制限)は実装しない。要望があれば `SPEC.md` を更新してから着手する。ユーザー認証は将来的にも導入しない前提。
- ストリーミング応答はMastraの `agent.stream()` を使用する(旧来の `.generate()` による一括応答は使わない)。
- MongoDBコネクタは `prisma migrate` 系コマンドに対応していないため、スキーマ反映は `prisma db push` を使う(ローカル・デプロイパイプラインとも共通)。
- Cloud RunへのデプロイはDockerコンテナ経由。Next.jsは `next.config.ts` で `output: "standalone"` を設定すること。
