#!/usr/bin/env bash
# Google Cloud Runへのビルド&デプロイスクリプト。
# ANTHROPIC_API_KEY / DATABASE_URL は .env から読み込み、値をログに出力しない。
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env が見つかりません。.env.example を参考に作成してください。" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY が .env に設定されていません}"
: "${DATABASE_URL:?DATABASE_URL が .env に設定されていません}"

PROJECT_ID="$(gcloud config get-value project)"
REGION="asia-northeast1"
REPO="ai-chat"
SERVICE="ai-chat"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"
VPC_NETWORK="ai-chat-vpc"
VPC_SUBNET="ai-chat-subnet"

echo "==> Building and pushing image: ${IMAGE}"
gcloud builds submit --tag "${IMAGE}"

echo "==> Deploying to Cloud Run service: ${SERVICE} (region: ${REGION})"
# --network/--subnet/--vpc-egress=all-traffic: 送信トラフィックをai-chat-vpc経由のCloud NAT(固定IP)に
# 通し、MongoDB AtlasのIPアクセスリストをこの固定IPのみに絞れるようにするための設定。
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --network "${VPC_NETWORK}" \
  --subnet "${VPC_SUBNET}" \
  --vpc-egress all-traffic \
  --set-env-vars "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY},DATABASE_URL=${DATABASE_URL}"

echo "==> Done."
