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

## ディレクトリ構成

```
app/
  api/[[...route]]/route.ts   # Hono APIのエントリポイント(hono/vercelのhandle()でマウント)
  components/                 # ChatApp / Sidebar / MessageList / MessageInput
  lib/                        # api.ts(fetch+SSEクライアント), types.ts
  page.tsx, layout.tsx, globals.css
server/
  db.ts                       # Prisma Clientのシングルトン
  hono/                       # app.ts(ルーティング), client-id.ts(クライアントIDミドルウェア)
  mastra/                     # agent.ts(chatAgent定義), index.ts(Mastraインスタンス登録)
prisma/
  schema.prisma
scripts/
  create-ttl-index.ts         # TTLインデックス作成(新環境構築時に1度実行)
Dockerfile, .dockerignore     # standalone出力を使ったマルチステージビルド
```

## データモデル

`Conversation`(clientId, title, timestamps) と `Message`(conversationId, role, content, timestamps)。MongoDBコネクタのため `id` は `@id @default(auto()) @map("_id") @db.ObjectId`、外部キー(`conversationId`)にも `@db.ObjectId` を付与する。詳細は `SPEC.md` の該当セクション、実装後は `prisma/schema.prisma` を正とする。

**Prisma ORM v7はMongoDBコネクタを含まない(2026年時点)ため、本プロジェクトは意図的にPrisma ORM v6系(6.19系)にピン留めしている。** `npx prisma validate` 等が表示する「v7へアップグレード」の案内には従わないこと。`package.json` の `prisma` / `@prisma/client` を安易に `npm update` や `@latest` で上げないよう注意する。接続先 `DATABASE_URL` は通常通り `schema.prisma` の `datasource` ブロック(`url = env("DATABASE_URL")`)で読み込み、Prisma Clientは `node_modules/@prisma/client` に生成され、コードからは通常通り `@prisma/client` からimportする。MongoDBの後継パスとしてPrisma Next(Early Access)があるが、pre-1.0でトランザクション機能が未成熟なため今回は採用しない。

会話データは**セッション中のみ**保持する。`Conversation.updatedAt` を基準にしたTTLインデックス(24時間)で自動失効させる。TTLインデックスはPrisma schemaでは表現できないため、`scripts/create-ttl-index.ts`(Prisma Clientの `$runCommandRaw` でMongoDBの `createIndexes` を直接実行)で作成する。新しい環境(別のAtlasクラスタなど)を構築した際は `node --env-file=.env scripts/create-ttl-index.ts` を再実行すること(`.env`は自動読み込みされないため `--env-file` が必須)。

## API(Hono, `/api` 配下)

- `GET /api/conversations` — クライアントIDに紐づく会話一覧
- `POST /api/conversations` — 新規会話作成
- `GET /api/conversations/:id/messages` — メッセージ一覧取得
- `POST /api/conversations/:id/messages` — メッセージ送信、Claude応答をSSEでストリーミング返却

### 実装メモ(Phase 3)

- クライアントIDは `server/hono/client-id.ts` のミドルウェアで発行・検証する。Cookie名は `client_id`(初回アクセス時に `crypto.randomUUID()` で発行、`httpOnly`, `sameSite=Lax`, 有効期限1年)。全ルートで `c.get("clientId")` として参照可能。
- `:id` のメッセージ系エンドポイントは、対象 `Conversation.clientId` がリクエストのクライアントIDと一致しない場合 `404` を返す(他クライアントの会話へのアクセスを防止)。
- `POST /api/conversations/:id/messages` のSSEは `hono/streaming` の `streamSSE()` を使用し、`event: "message"` で `data: JSON.stringify({ text: chunk })` を逐次送信、完了時に `event: "done"`、エラー時に `event: "error"` を送信する契約とする。フロント実装時はこのイベント名・データ形式に合わせること。
- 会話タイトルは未設定時、最初のユーザーメッセージ冒頭30文字を自動設定する(`server/hono/app.ts`)。
- Mastraはモデル呼び出し失敗(APIキー不正・クレジット不足など)を例外にせず、内部でログするだけで空のストリームを返すことがある。そのため `agentStream.textStream` を読み切った時点で応答が空文字列だった場合も `event: "error"` を送信する(`server/hono/app.ts`)。この場合ユーザーメッセージ自体は保存済みのまま、アシスタントメッセージは保存しない。

## フロントエンド実装メモ(Phase 4)

- `app/components/ChatApp.tsx` がクライアント側の状態(会話一覧・選択中の会話・メッセージ・送信中フラグ)を集約するトップレベルのクライアントコンポーネント。`Sidebar` / `MessageList` / `MessageInput` を組み合わせる。
- `app/lib/api.ts` の `sendMessageStream()` はPOSTボディを送る必要があるため `EventSource` は使わず、`fetch` + `ReadableStream` で上記SSE契約(`event:` / `data:` 行)を自前パースしている。
- Markdownレンダリングは `react-markdown` + `remark-gfm`(`app/components/MessageList.tsx`)。コードブロックの見た目は `@tailwindcss/typography`(`prose`クラス、`app/globals.css` に `@plugin "@tailwindcss/typography";` を追加)に依存する。シンタックスハイライトは導入していない。
- 送信中(ストリーミング中)は会話の切り替え・新規作成を抑止する(`isSending` ガード)。エラーメッセージは会話切り替え時にクリアする。

## Docker / デプロイ実装メモ(Phase 6)

- `Dockerfile` は `deps`(`npm ci`)→ `builder`(`prisma generate` + `next build`)→ `runner`(実行専用の軽量イメージ)の3ステージ構成。ベースは `node:24-slim`(Next.js 16は Node >=20.9 が必要)。
- `next.config.ts` に `output: "standalone"` を設定済み。`.next/standalone` には `.env` が含まれない(ビルド時に `.env` が存在しなくても `next build` は成功することをローカルで確認済み)ため、Dockerビルドコンテキストからは `.dockerignore` で `.env` を除外し、実行時の環境変数はCloud Run側の設定(`--set-env-vars` 等)からのみ注入する。
- Next.jsのfile tracingは `@prisma/client` が動的に読み込むクエリエンジンのバイナリを検出できないことがあるため、`runner` ステージで `node_modules/.prisma` と `node_modules/@prisma/client` を明示的にコピーしている。`prisma generate` は `builder` ステージ内(Linuxコンテナ内)で実行されるため、コンテナのプラットフォームに合ったバイナリが生成される。
- Debianベース(`slim`)のイメージにはOpenSSLがプリインストールされていないため、`builder` / `runner` の両方で `apt-get install -y openssl` を実行している(省くとPrismaがOpenSSL検出に失敗する警告を出す)。
- Cloud Runへの実デプロイ(`gcloud builds submit` でのビルド、`gcloud run deploy`、MongoDB Atlasのネットワークアクセス設定)はこの開発環境に `docker` / `gcloud` CLIが無いため実行できていない。具体的な手順は `README.md` の「Docker化・Cloud Runへのデプロイ」章にまとめてあり、実行はユーザー側で行う。

## 環境変数

- `ANTHROPIC_API_KEY` — Claude APIキー
- `DATABASE_URL` — MongoDB接続文字列(Prisma用、`mongodb+srv://...`)
- `PORT` — Cloud Run用リッスンポート(既定8080)

## 開発時の注意点

- スコープ外の機能(ユーザー認証、ファイル/画像アップロード、複数AIプロバイダー対応、レート制限)は実装しない。要望があれば `SPEC.md` を更新してから着手する。ユーザー認証は将来的にも導入しない前提。
- ストリーミング応答はMastraの `agent.stream()` を使用する(旧来の `.generate()` による一括応答は使わない)。
- MongoDBコネクタは `prisma migrate` 系コマンドに対応していないため、スキーマ反映は `prisma db push` を使う(ローカル・デプロイパイプラインとも共通)。
- Cloud RunへのデプロイはDockerコンテナ経由。Next.jsは `next.config.ts` で `output: "standalone"` を設定すること。
