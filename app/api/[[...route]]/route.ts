import { handle } from "hono/vercel";
import { app } from "@/server/hono/app";

// PrismaはEdge Runtimeで動作しないため、Node.js runtimeを明示する
export const runtime = "nodejs";

export const GET = handle(app);
export const POST = handle(app);
