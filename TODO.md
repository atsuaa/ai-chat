# 実行計画 / TODOリスト

`SPEC.md` / `CLAUDE.md` に基づく実装のToDoリスト。フェーズは基本的に上から順に進める(フェーズ内の並び替えは可)。

## Phase 0: プロジェクト初期化

- [ ] `create-next-app` でNext.js(App Router, TypeScript)プロジェクトを作成
- [ ] Git初期化・初回コミット
- [ ] ディレクトリ構成を作成(`server/hono/`, `server/mastra/`, `prisma/`)

## Phase 1: 依存パッケージ導入

- [ ] Hono関連: `hono`
- [ ] Prisma関連: `prisma`, `@prisma/client`
- [ ] Mastra: `npx mastra init` を実行(Mastra Observabilityは今回は不要のためスキップ可)
- [ ] Anthropic連携用パッケージ(Mastraの `anthropic/*` モデル指定に必要な依存を導入)
- [ ] `next.config.ts` に `serverExternalPackages: ["@mastra/*"]` を追加(Mastraパッケージをサーバーバンドル対象外にする)

## Phase 2: データベースセットアップ(MongoDB)

- [ ] `npx prisma init --datasource-provider mongodb` でPrismaを初期化
- [ ] `prisma/schema.prisma` に `Conversation` / `Message` モデルを実装(`SPEC.md` 5章の定義を反映、`@db.ObjectId` を忘れずに付与)
- [ ] MongoDB Atlasのクラスタを用意し、接続文字列を `.env` の `DATABASE_URL` に設定
- [ ] `npx prisma db push` でスキーマをMongoDBに反映(`migrate`系は非対応のため使わない)
- [ ] `npx prisma generate` でPrisma Clientを生成
- [ ] MongoDB側でTTLインデックスを作成(`Conversation.updatedAt` 基準、既定24時間で失効)

## Phase 3: バックエンドAPI実装(Hono + Mastra)

- [ ] `app/api/[[...route]]/route.ts` にHonoアプリをマウント(`hono/vercel` の `handle()` を使用)
- [ ] クライアントID発行・保持ロジックを実装(初回アクセス時にUUIDを発行しCookieにセット)
- [ ] `server/mastra/` にAnthropic Claudeを使うMastra `Agent` を定義
- [ ] `GET /api/conversations` — クライアントIDに紐づく会話一覧取得を実装
- [ ] `POST /api/conversations` — 新規会話作成を実装
- [ ] `GET /api/conversations/:id/messages` — メッセージ一覧取得を実装
- [ ] `POST /api/conversations/:id/messages` — メッセージ保存 + `agent.stream()` によるSSEストリーミング応答を実装
- [ ] 各エンドポイントでPrisma経由のDB読み書きを実装

## Phase 4: フロントエンド実装

- [ ] チャット画面のUI(メッセージ入力欄、送信ボタン、メッセージリスト)を実装
- [ ] SSEレスポンスを逐次受信し、画面に追記表示するストリーミング表示ロジックを実装
- [ ] メッセージのMarkdownレンダリング(コードブロック含む)を実装
- [ ] 会話一覧サイドバーを実装(会話の切り替え・再開)
- [ ] 新規会話作成のUI導線を実装

## Phase 5: ローカル動作確認

- [ ] メッセージ送信〜ストリーミング応答〜表示までの一連のフローを確認
- [ ] 会話を切り替えて履歴が正しく読み込まれることを確認
- [ ] TTL失効が意図通り動作することを確認(短いTTLに一時的に変更してテスト)
- [ ] APIエラー時(Claude API失敗時など)のフロント側エラーハンドリングを確認

## Phase 6: Docker化・Cloud Runデプロイ

- [ ] `next.config.ts` に `output: "standalone"` を設定
- [ ] Dockerfileを作成(standalone出力を使った軽量イメージ)
- [ ] Cloud Run用の環境変数(`ANTHROPIC_API_KEY`, `DATABASE_URL`, `PORT`)を設定
- [ ] MongoDB AtlasのネットワークアクセスをCloud Runからの接続用に設定(IPアクセスリスト or Private Endpoint)
- [ ] Cloud Runへ初回デプロイ
- [ ] 本番環境での一連の動作確認(送受信・履歴・TTL失効)

## Phase 7: 仕上げ

- [ ] READMEに開発手順(環境構築・起動コマンド)を記載
- [ ] `SPEC.md` / `CLAUDE.md` と実装の差分がないか最終確認・同期
