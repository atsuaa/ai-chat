import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { CoreMessage } from "@mastra/core/llm";
import { prisma } from "@/server/db";
import { mastra } from "@/server/mastra";
import { clientIdMiddleware } from "./client-id";
import { MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_BYTES, parseImageDataUrl } from "@/app/lib/image";

type Variables = {
  clientId: string;
};

const TITLE_MAX_LENGTH = 30;
const IMAGE_ONLY_TITLE = "(画像)";

// リクエストで受け取った画像(Data URL文字列)を検証する。
// 不正な場合はエラーメッセージを返す(問題なければnull)。
function validateImages(images: string[]): string | null {
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return `画像は最大${MAX_IMAGES_PER_MESSAGE}枚まで添付できます`;
  }
  for (const image of images) {
    const parsed = parseImageDataUrl(image);
    if (!parsed) {
      return "対応していない画像形式です(PNG/JPEG/WebP/GIFのみ)";
    }
    if (parsed.byteLength > MAX_IMAGE_BYTES) {
      return `画像1枚あたりのサイズは${MAX_IMAGE_BYTES / (1024 * 1024)}MBまでです`;
    }
  }
  return null;
}

// テキスト本文と画像(Data URL文字列)からCoreMessageのcontentパート配列を組み立てる。
// Mastraのimageパートはmediaタイプの自動判別を行わず、mimeType未指定時はimage/jpeg扱いになるため、
// Data URLから実際のMIMEタイプを明示的に渡す必要がある。またmimeTypeを指定する場合、imageには
// "data:...;base64,"プレフィックスを含めない生のbase64文字列を渡す必要がある(プレフィックス込みで
// 渡すとそのままbase64データとして扱われ、不正な画像データとして送信されてしまう)。
function toUserContentParts(content: string, images: string[]) {
  return [
    ...(content ? [{ type: "text" as const, text: content }] : []),
    ...images.flatMap((image) => {
      const parsed = parseImageDataUrl(image);
      return parsed ? [{ type: "image" as const, image: parsed.base64, mimeType: parsed.mimeType }] : [];
    }),
  ];
}

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

  const body = await c.req.json<{ content?: string; images?: string[] }>();
  const content = body.content?.trim() ?? "";
  const images = body.images ?? [];

  if (!content && images.length === 0) {
    return c.json({ error: "content or images is required" }, 400);
  }

  const imageError = validateImages(images);
  if (imageError) {
    return c.json({ error: imageError }, 400);
  }

  // ストリーミング開始前に、ここまでの履歴(今回のユーザー発言を含まない)を取得しておく
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.create({
    data: { conversationId, role: "user", content, images },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      ...(conversation.title
        ? {}
        : { title: content ? content.slice(0, TITLE_MAX_LENGTH) : IMAGE_ONLY_TITLE }),
    },
  });

  const historyMessages: CoreMessage[] = history.map((m) =>
    m.role === "assistant"
      ? { role: "assistant" as const, content: m.content }
      : { role: "user" as const, content: toUserContentParts(m.content, m.images) },
  );

  const chatAgent = mastra.getAgent("chatAgent");
  const agentStream = await chatAgent.stream([
    ...historyMessages,
    { role: "user" as const, content: toUserContentParts(content, images) },
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
