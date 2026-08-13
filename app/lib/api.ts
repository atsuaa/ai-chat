import type { Conversation, Message } from "./types";

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) {
    throw new Error("会話一覧の取得に失敗しました");
  }
  return res.json();
}

export async function createConversation(): Promise<Conversation> {
  const res = await fetch("/api/conversations", { method: "POST" });
  if (!res.ok) {
    throw new Error("会話の作成に失敗しました");
  }
  return res.json();
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) {
    throw new Error("メッセージの取得に失敗しました");
  }
  return res.json();
}

type StreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

// POSTボディを送る必要があるためEventSourceは使わず、fetch + ReadableStreamで
// SSE(event/dataフィールド)を自前でパースする。
export async function sendMessageStream(
  conversationId: string,
  content: string,
  images: string[],
  { onChunk, onDone, onError }: StreamCallbacks,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, images }),
    });
  } catch {
    onError("サーバーへの接続に失敗しました");
    return;
  }

  if (!res.ok || !res.body) {
    onError("メッセージの送信に失敗しました");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const { event, data } = parseSSEEvent(rawEvent);

      if (event === "message") {
        try {
          const parsed = JSON.parse(data) as { text: string };
          onChunk(parsed.text);
        } catch {
          // 不正な形式のデータは無視する
        }
      } else if (event === "done") {
        onDone();
        return;
      } else if (event === "error") {
        try {
          const parsed = JSON.parse(data) as { message: string };
          onError(parsed.message);
        } catch {
          onError("応答の生成に失敗しました");
        }
        return;
      }
    }
  }
}

function parseSSEEvent(rawEvent: string): { event: string; data: string } {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  return { event, data: dataLines.join("\n") };
}
