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
- `Sidebar` はモバイル(`md`未満)ではオフキャンバス表示にしている(`isOpen`/`onClose`をpropsで受け取り、`fixed` + `translate-x`のトランジションで開閉。背後に半透明オーバーレイを表示しクリックで閉じる)。`md`以上では`md:static md:translate-x-0`で常時表示に戻る。
- `md`未満でのみ表示するヘッダー(`ChatApp.tsx`内、`md:hidden`)にハンバーガーボタンと選択中の会話タイトルを表示する。会話選択・新規作成時はモバイルでサイドバーを自動的に閉じる。タイトルの`truncate`はflexアイテムの既定`min-width: auto`により効かなくなるため、`h1`に`min-w-0 flex-1`を明示的に付与している。
- **(バグ修正)** 会話未選択の状態で入力欄から直接メッセージを送信すると、`handleSend`内の`setActiveConversationId`が`activeConversationId`監視の`useEffect`(`fetchMessages`呼び出し)を発火させ、そのGETがストリーミング中(ユーザーメッセージ保存後・アシスタントメッセージ保存前)に返ってくると`setMessages(list)`でローカルの楽観的更新(送信直後に追加したユーザー/アシスタントの吹き出し)を丸ごと上書きしてしまい、アシスタントの応答がストリームとしては届いているのに画面に一切表示されない不具合があった。`skipNextMessagesFetchRef`で「自分で作った直後の会話」については次の`fetchMessages`を1回だけスキップすることで修正。サイドバーの「新しい会話」ボタン経由(先に空の会話を作ってから送信)ではこの競合が起きないため、テスト時は両方の導線を確認すること。
- `MessageInput.tsx`の送信キー判定は、日本語入力などIME変換確定のEnterを送信と誤認しないよう`onCompositionStart`/`onCompositionEnd`で管理する`isComposingRef`と、ブラウザによってはcompositionendより先にkeydownが発火するケースへの保険として`event.keyCode === 229`(IME処理中を示す非推奨だが実用的な値)の両方をチェックしている。
- **(バグ修正)** `MessageList.tsx`のMarkdownコードブロック/インラインコードのスタイルは、以前はuser/assistant共通の固定配色(`bg-zinc-100 dark:bg-zinc-900`)だった。しかしuser吹き出しの背景はライト/ダークで反転する(`bg-zinc-900`/`dark:bg-zinc-100`)ため、user発言中のコードは背景色が反転せず文字色(継承されたuser吹き出しの文字色)と同化してほぼ読めなくなっていた。`getMarkdownComponents(isUser)`でuser側は`bg-white/20 text-inherit dark:bg-black/10`(吹き出し自体の背景色に対する半透明オーバーレイ)を使うことで、ライト/ダークどちらでも文字色との十分なコントラストを保ったまま区別をつけている。
- `MessageInput.tsx`のtextareaは、iOS Safariが「フォーカスしたinput/textareaのfont-sizeが16px未満だと自動的にズームインする」仕様への対策として、モバイル幅では`text-base`(16px)、`sm:`(640px)以上では元の`text-sm`(14px)に戻す構成にしている。`viewport`の`maximumScale`/`userScalable: false`でズーム自体を禁止する方法は手動ピンチズームまで奪いWCAG 1.4.4(Resize text)に抵触するアクセシビリティ上のアンチパターンのため採用していない。
- placeholderの文言(「メッセージを入力(Shift+Enterで改行)」)は、`placeholder`属性がCSSで出し分けできないため、`window.matchMedia("(max-width: 639px)")`(textareaのfont-size切り替えと同じ`sm`ブレークポイント基準)でJS側にモバイル判定を持たせ、640px未満では「メッセージを入力」(括弧書きを省略)を表示している。物理キーボード前提の「Shift+Enterで改行」がスマホでは意味をなさないための対応。
- **(バグ修正・調査メモ)** 同様の理由でuser発言中の地の文(`<p>`)も読みにくかった。`@tailwindcss/typography`の`prose`は**`.prose`コンテナ自体**に`color: var(--tw-prose-body)`(グレー系)を設定し、`p`等の子要素はそれを継承しているだけ — なので`p`要素個別に`text-inherit`を付けても、継承先は`.prose` divの色であり、その外側のuser吹き出しの`text-white`までは届かない(ブラウザで`getComputedStyle`と実験的なインラインスタイル上書きで実証済み)。また`prose-p:text-inherit`のようなproseのelement modifier構文(`prose-{element}:{utility}`)は、このプロジェクトの構成(Turbopack + Tailwind v4 + `@plugin`ディレクティブ経由の読み込み)では対応するCSSがビルドされず一切効かなかった(生成後のCSSに`prose-p:`という文字列が存在しないことを確認済み)。正しい修正は`.prose`コンテナ自体に`text-inherit`を付与すること(`MessageBubble`内、isUser時のみ)。proseのelement modifier構文に依存する実装は今後もこの環境では避け、必要なら`react-markdown`の`components`で個別要素に直接Tailwindユーティリティクラスを指定する方式(`pre`/`code`と同じやり方)を使うこと。

## Docker / デプロイ実装メモ(Phase 6)

- `Dockerfile` は `deps`(`npm ci`)→ `builder`(`prisma generate` + `next build`)→ `runner`(実行専用の軽量イメージ)の3ステージ構成。ベースは `node:24-slim`(Next.js 16は Node >=20.9 が必要)。
- `next.config.ts` に `output: "standalone"` を設定済み。`.next/standalone` には `.env` が含まれない(ビルド時に `.env` が存在しなくても `next build` は成功することをローカルで確認済み)ため、Dockerビルドコンテキストからは `.dockerignore` で `.env` を除外し、実行時の環境変数はCloud Run側の設定(`--set-env-vars` 等)からのみ注入する。
- Next.jsのfile tracingは `@prisma/client` が動的に読み込むクエリエンジンのバイナリを検出できないことがあるため、`runner` ステージで `node_modules/.prisma` と `node_modules/@prisma/client` を明示的にコピーしている。`prisma generate` は `builder` ステージ内(Linuxコンテナ内)で実行されるため、コンテナのプラットフォームに合ったバイナリが生成される。
- Debianベース(`slim`)のイメージにはOpenSSLがプリインストールされていないため、`builder` / `runner` の両方で `apt-get install -y openssl` を実行している(省くとPrismaがOpenSSL検出に失敗する警告を出す)。
- Cloud Runへの実デプロイは `gcloud` CLI(`gcloud builds submit` + `gcloud run deploy`)を使って実行済み。手順は `scripts/deploy.sh`(`.env` から `ANTHROPIC_API_KEY` / `DATABASE_URL` を読み込み、値をログに出力せずビルド&デプロイする)としてスクリプト化してある。MongoDB Atlasのネットワークアクセスは `0.0.0.0/0` で許可済み(反映まで数十秒〜数分のラグがあり、直後の接続はTLSエラーで一時的に失敗することがある)。

## CI/CD(GitHub Actions, Phase 8)

- GitHubリポジトリ: `atsuaa/ai-chat`(private)。`main` へのpushで `.github/workflows/deploy.yml` が自動的にCloud Runへデプロイする。
- GCPへの認証はサービスアカウントキーを使わず、Workload Identity Federation(`github-pool` / `github-provider`、`attribute-condition` で `atsuaa/ai-chat` リポジトリのみに限定)を使用。長期的な秘密鍵をGitHub側に置かない構成。
- デプロイ用サービスアカウント `github-actions-deployer@ma-ai-chat.iam.gserviceaccount.com` には `roles/run.admin`, `roles/artifactregistry.writer`, `roles/cloudbuild.builds.editor`, `roles/iam.serviceAccountUser`, `roles/storage.admin` を付与済み。
- ワークフローは `google-github-actions/auth@v3` → `google-github-actions/deploy-cloudrun@v3`(`source: .` でリポジトリのDockerfileから直接Cloud Buildでビルド&デプロイ、`scripts/deploy.sh` と同じ流れ)の2ステップ構成。`ANTHROPIC_API_KEY` / `DATABASE_URL` はGitHub Secrets、`GCP_PROJECT_ID` / `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` はGitHub Variables(非秘密情報)として登録済み。
- 新しい環境(別のGCPプロジェクトやリポジトリのフォーク等)でセットアップし直す場合の手順は `README.md` の「GitHub Actionsによる自動デプロイ」章にコマンド込みで記載している。

## 環境変数

- `ANTHROPIC_API_KEY` — Claude APIキー
- `DATABASE_URL` — MongoDB接続文字列(Prisma用、`mongodb+srv://...`)
- `PORT` — Cloud Run用リッスンポート(既定8080)

## 開発時の注意点

- スコープ外の機能(ユーザー認証、ファイル/画像アップロード、複数AIプロバイダー対応、レート制限)は実装しない。要望があれば `SPEC.md` を更新してから着手する。ユーザー認証は将来的にも導入しない前提。
- ストリーミング応答はMastraの `agent.stream()` を使用する(旧来の `.generate()` による一括応答は使わない)。
- MongoDBコネクタは `prisma migrate` 系コマンドに対応していないため、スキーマ反映は `prisma db push` を使う(ローカル・デプロイパイプラインとも共通)。
- Cloud RunへのデプロイはDockerコンテナ経由。Next.jsは `next.config.ts` で `output: "standalone"` を設定すること。
