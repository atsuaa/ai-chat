# AIチャットボット 仕様書

## 1. 概要

Anthropic Claude APIを利用したAIチャットボットのWebアプリケーション。
ユーザー認証は設けず、誰でもすぐに利用できるシンプルなチャットUIを提供する。

## 2. 提供形態

- Webアプリ(SPA的なチャットUI + バックエンドAPI)
- ユーザー認証: なし(匿名利用。ブラウザ単位でセッション/会話を識別)

## 3. 技術スタック

| 領域 | 技術 |
|---|---|
| フロントエンド | Next.js (App Router) + TypeScript |
| バックエンドAPI | Hono(Next.js App RouterのAPI Routeにマウント) |
| ORM / DB | Prisma + MongoDB |
| AIエージェント | Mastra |
| AIモデル | Anthropic Claude API |
| デプロイ先 | Google Cloud Run |

### 3.1 アーキテクチャ方針

- Next.jsとHonoは同一アプリ内にまとめ、単一のCloud Runサービスとしてデプロイする。
- `app/api/[[...route]]/route.ts` にHonoアプリをマウントし(`hono/vercel`アダプター、または `@hono/node-server` によるNode runtime対応)、REST/ストリーミングAPIを実装する。
- Mastraの `Agent` をHono側のAPIハンドラから呼び出し、Anthropic Claudeモデル(例: `anthropic/claude-sonnet-5`)で応答を生成する。
- ストリーミング応答は `agent.stream()` を使用し、SSE(Server-Sent Events)または `ReadableStream` でフロントエンドに逐次配信する。
- Prismaクライアントはバックエンド(Hono)側から利用し、Cloud Run上でMongoDB(MongoDB Atlasなど)に接続する。

## 4. 機能要件

### 4.1 チャット機能
- ユーザーがメッセージを送信すると、Claude(Mastra Agent経由)からの応答をストリーミングで受け取り、逐次画面に表示する。
- 送受信メッセージはMarkdown表示に対応する(コードブロックを含む)。

### 4.2 会話履歴の保存
- 会話(Conversation)とメッセージ(Message)をMongoDBに保存する。
- ユーザー認証がないため、会話はブラウザ生成のクライアントID(UUID、Cookieまたはlocalstorageで保持)単位で紐付ける。
- 会話一覧の表示・過去の会話の再開ができる。
- 保存は**セッション中のみ**とする。一定時間操作がなかった会話は自動的に削除する(MongoDBのTTLインデックスを利用、`updatedAt`基準で失効させる)。

### 4.3 非対象(スコープ外・意図的に未実装)
- ユーザー認証・アカウント管理(将来的にも導入しない前提)
- ファイル/画像アップロード
- 複数AIプロバイダーの切り替え
- レート制限・不正利用対策(匿名利用だが今回は実装しない)

## 5. データモデル(Prisma想定、MongoDBコネクタ)

```prisma
datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

model Conversation {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  clientId  String    // 匿名クライアント識別用ID
  title     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt // TTL失効判定の基準
  messages  Message[]

  @@index([clientId])
}
```

> **注記:** TTLインデックス(`updatedAt`を基準にした自動失効)はPrisma schemaの構文では表現できないため、Prisma管理外でMongoDB側に直接作成する(Atlas UI、`mongosh`、またはセットアップスクリプトで `db.Conversation.createIndex({ updatedAt: 1 }, { expireAfterSeconds: ... })` を実行)。

```prisma
model Message {
  id             String       @id @default(auto()) @map("_id") @db.ObjectId
  conversationId String       @db.ObjectId
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // "user" | "assistant"
  content        String
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}
```

## 6. API設計(Hono, `/api` 配下)

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/conversations` | クライアントIDに紐づく会話一覧を取得 |
| POST | `/api/conversations` | 新規会話を作成 |
| GET | `/api/conversations/:id/messages` | 会話内のメッセージ一覧を取得 |
| POST | `/api/conversations/:id/messages` | メッセージを送信し、Claudeの応答をストリーミングで返す(SSE) |

## 7. 環境変数

| 変数名 | 説明 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude APIキー |
| `DATABASE_URL` | MongoDB接続文字列(Prisma用、`mongodb+srv://...`) |
| `PORT` | Cloud Run用リッスンポート(既定8080) |

## 8. デプロイ

- Dockerイメージをビルドし、Google Cloud Runにデプロイする。
- Next.jsは `output: "standalone"` でビルドし、軽量なコンテナイメージを作成する。
- MongoDBはMongoDB Atlasを想定(Cloud RunからAtlasへネットワーク経由で接続。IPアクセスリストまたはPrivate Endpointを設定)。
- MongoDBコネクタはマイグレーション履歴を持たないため、スキーマ反映には `prisma db push` を使用する(`prisma migrate` 系コマンドは非対応)。

## 9. 今後の検討事項

- 特になし。以下は本仕様書で確定済み。
  - レート制限・不正利用対策: 今回は実装しない(4.3参照)
  - 会話データの保持期間: セッション中のみ(4.2参照)。TTLの具体的な失効時間(既定24時間を想定)は実装時に調整可
  - 将来的なユーザー認証: 導入しない前提
