import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { CoreMessage } from "@mastra/core/llm";
import { prisma } from "@/server/db";
import { mastra } from "@/server/mastra";
import { clientIdMiddleware } from "./client-id";

type Variables = {
  clientId: string;
};

const TITLE_MAX_LENGTH = 30;

export const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.use("*", clientIdMiddleware);

app.get("/conversations", async (c) => {
  const clientId = c.get("clientId");

  const conversations = await prisma.conversation.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });

  return c.json(conversations);
});

app.post("/conversations", async (c) => {
  const clientId = c.get("clientId");

  const conversation = await prisma.conversation.create({
    data: { clientId },
  });

  return c.json(conversation, 201);
});

app.get("/conversations/:id/messages", async (c) => {
  const clientId = c.get("clientId");
  const conversationId = c.req.param("id");

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId },
  });

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return c.json(messages);
});

app.post("/conversations/:id/messages", async (c) => {
  const clientId = c.get("clientId");
  const conversationId = c.req.param("id");

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId },
  });

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const body = await c.req.json<{ content?: string }>();
  const content = body.content?.trim();

  if (!content) {
    return c.json({ error: "content is required" }, 400);
  }

  // ストリーミング開始前に、ここまでの履歴(今回のユーザー発言を含まない)を取得しておく
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.create({
    data: { conversationId, role: "user", content },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      ...(conversation.title ? {} : { title: content.slice(0, TITLE_MAX_LENGTH) }),
    },
  });

  const historyMessages: CoreMessage[] = history.map((m) =>
    m.role === "assistant"
      ? { role: "assistant" as const, content: m.content }
      : { role: "user" as const, content: m.content },
  );

  const chatAgent = mastra.getAgent("chatAgent");
  const agentStream = await chatAgent.stream([
    ...historyMessages,
    { role: "user" as const, content },
  ]);

  return streamSSE(c, async (stream) => {
    let assistantContent = "";

    try {
      for await (const chunk of agentStream.textStream) {
        assistantContent += chunk;
        await stream.writeSSE({
          event: "message",
          data: JSON.stringify({ text: chunk }),
        });
      }

      // Mastraはモデル呼び出しの失敗(APIキー不正・クレジット不足など)を例外にせず、
      // 内部でログした上で空のストリームを返すことがあるため、空応答もエラー扱いにする
      if (!assistantContent) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: "応答の生成に失敗しました" }),
        });
        return;
      }

      await prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: assistantContent,
        },
      });

      await stream.writeSSE({ event: "done", data: "" });
    } catch (err) {
      console.error(err);
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "応答の生成に失敗しました" }),
      });
    }
  });
});
