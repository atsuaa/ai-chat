import { PrismaClient } from "@prisma/client";

// Next.jsの開発時HMRでモジュールが再評価されるたびに
// PrismaClientが再生成されるのを防ぐため、globalに保持する。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
