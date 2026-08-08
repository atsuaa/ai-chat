# 実行計画 / TODOリスト

`SPEC.md` / `CLAUDE.md` に基づく実装のToDoリスト。フェーズは基本的に上から順に進める(フェーズ内の並び替えは可)。

## Phase 0: プロジェクト初期化

- [x] `create-next-app` でNext.js(App Router, TypeScript)プロジェクトを作成
- [x] Git初期化・初回コミット
- [x] ディレクトリ構成を作成(`server/hono/`, `server/mastra/`, `prisma/`)

## Phase 1: 依存パッケージ導入

- [x] Hono関連: `hono`
- [x] Prisma関連: `prisma`, `@prisma/client`
- [x] Mastra: `npx mastra init` を実行(Mastra Observabilityは今回は不要のためスキップ可)
- [x] Anthropic連携用パッケージ(Mastraのモデルルーター文字列 `anthropic/*` は `@mastra/core` 内蔵のルーティングで解決されるため、`@ai-sdk/anthropic` 等の追加インストールは不要と判断)
- [x] `next.config.ts` に `serverExternalPackages: ["@mastra/*"]` を追加(Mastraパッケージをサーバーバンドル対象外にする)

## Phase 2: データベースセットアップ(MongoDB)

- [x] `npx prisma init --datasource-provider mongodb` でPrismaを初期化
- [x] `prisma/schema.prisma` に `Conversation` / `Message` モデルを実装(`SPEC.md` 5章の定義を反映、`@db.ObjectId` を忘れずに付与)
- [x] **(想定外対応)** Prisma ORM v7にはMongoDBコネクタが存在しないと判明したため、v6.19系にダウングレード(`prisma.config.ts`廃止、`generator` を `prisma-client-js` に戻す)。詳細は `SPEC.md` 5章・`CLAUDE.md` の注記を参照
- [x] MongoDB Atlasのクラスタを用意し、接続文字列を `.env` の `DATABASE_URL` に設定
- [x] `npx prisma db push` でスキーマをMongoDBに反映(`migrate`系は非対応のため使わない)
- [x] `npx prisma generate` でPrisma Clientを生成(`node_modules/@prisma/client` に出力、v6のため)
- [x] MongoDB側でTTLインデックスを作成(`Conversation.updatedAt` 基準、24時間で失効。`scripts/create-ttl-index.ts` として実装・実行し、`listIndexes` で反映を確認済み)

## Phase 3: バックエンドAPI実装(Hono + Mastra)

- [x] `app/api/[[...route]]/route.ts` にHonoアプリをマウント(`hono/vercel` の `handle()` を使用)
- [x] クライアントID発行・保持ロジックを実装(初回アクセス時にUUIDを発行しCookieにセット)
- [x] `server/mastra/` にAnthropic Claudeを使うMastra `Agent` を定義
- [x] `GET /api/conversations` — クライアントIDに紐づく会話一覧取得を実装
- [x] `POST /api/conversations` — 新規会話作成を実装
- [x] `GET /api/conversations/:id/messages` — メッセージ一覧取得を実装
- [x] `POST /api/conversations/:id/messages` — メッセージ保存 + `agent.stream()` によるSSEストリーミング応答を実装
- [x] 各エンドポイントでPrisma経由のDB読み書きを実装

## Phase 4: フロントエンド実装

- [x] チャット画面のUI(メッセージ入力欄、送信ボタン、メッセージリスト)を実装
- [x] SSEレスポンスを逐次受信し、画面に追記表示するストリーミング表示ロジックを実装
- [x] メッセージのMarkdownレンダリング(コードブロック含む)を実装
- [x] 会話一覧サイドバーを実装(会話の切り替え・再開)
- [x] 新規会話作成のUI導線を実装

## Phase 5: ローカル動作確認

- [x] メッセージ送信〜ストリーミング応答〜表示までの一連のフローを確認
- [x] 会話を切り替えて履歴が正しく読み込まれることを確認
- [x] TTL失効が意図通り動作することを確認(短いTTLに一時的に変更してテスト)
- [x] APIエラー時(Claude API失敗時など)のフロント側エラーハンドリングを確認

## Phase 6: Docker化・Cloud Runデプロイ

- [x] `next.config.ts` に `output: "standalone"` を設定(ローカルビルドで出力内容を検証済み)
- [x] Dockerfileを作成(standalone出力を使った軽量イメージ。Cloud Build上でのビルド成功を確認済み)
- [x] Cloud Run用の環境変数(`ANTHROPIC_API_KEY`, `DATABASE_URL`, `PORT`)を設定(`scripts/deploy.sh`が`.env`から読み込み`--set-env-vars`で注入)
- [x] MongoDB AtlasのネットワークアクセスをCloud Runからの接続用に設定(`0.0.0.0/0`で許可、動作確認済み)
- [x] Cloud Runへ初回デプロイ(`scripts/deploy.sh`で実行、Service URL発行・疎通確認済み)
- [ ] 本番環境での一連の動作確認(送受信・履歴・TTL失効) — トップページの疎通(HTTP 200)のみ確認済み。実際のチャット送受信はブラウザでの確認が必要

## Phase 7: 仕上げ

- [x] READMEに開発手順(環境構築・起動コマンド)を記載
- [x] `SPEC.md` / `CLAUDE.md` と実装の差分がないか最終確認・同期

## Phase 8: CI/CD(GitHub Actions)

- [x] GitHubにprivateリポジトリを作成し初回push(`atsuaa/ai-chat`)
- [x] GCP側にWorkload Identity Federation(サービスアカウントキー不要)を設定し、GitHub Actions用サービスアカウントに必要ロールを付与
- [x] GitHub Secrets(`ANTHROPIC_API_KEY`, `DATABASE_URL`)・Variables(`GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`)を登録
- [x] `.github/workflows/deploy.yml`を作成(`main`へのpushで自動的にCloud Runへビルド&デプロイ)
- [x] 実際にワークフローが正常に完走することを確認(初回は`artifactregistry.repositories.create`権限不足で失敗、`cloud-run-source-deploy`リポジトリを事前作成して解決)
