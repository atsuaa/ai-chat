import { PrismaClient } from "@prisma/client";

const TTL_SECONDS = 60 * 60 * 24; // 24時間、無操作の会話を自動失効させる

async function main() {
  const prisma = new PrismaClient();

  await prisma.$runCommandRaw({
    createIndexes: "Conversation",
    indexes: [
      {
        key: { updatedAt: 1 },
        name: "updatedAt_ttl",
        expireAfterSeconds: TTL_SECONDS,
      },
    ],
  });

  console.log(
    `TTLインデックスを作成しました: Conversation.updatedAt (expireAfterSeconds=${TTL_SECONDS})`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
