# syntax=docker/dockerfile:1

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=8080

COPY --from=builder --chown=node:node /app/public ./public

RUN mkdir .next && chown node:node .next

# output: "standalone" によるトレース済みファイルのみをコピーし、イメージを軽量化する
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Prisma Clientの生成物(クエリエンジンのバイナリ含む)はfile tracingで漏れることがあるため明示的にコピーする
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER node

EXPOSE 8080

CMD ["node", "server.js"]
