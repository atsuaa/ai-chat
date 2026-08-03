"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import {
  createConversation,
  fetchConversations,
  fetchMessages,
  sendMessageStream,
} from "@/app/lib/api";
import type { Conversation, Message } from "@/app/lib/types";

let tempIdCounter = 0;
function nextTempId(prefix: string) {
  tempIdCounter += 1;
  return `temp-${prefix}-${tempIdCounter}`;
}

export function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    fetchConversations()
      .then((list) => {
        setConversations(list);
        if (list.length > 0) {
          setActiveConversationId(list[0].id);
        }
      })
      .catch(() => setErrorMessage("会話一覧の取得に失敗しました"));
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;

    fetchMessages(activeConversationId)
      .then((list) => {
        // 選択中の会話が切り替わっていたら結果を破棄する
        if (activeConversationIdRef.current === activeConversationId) {
          setMessages(list);
        }
      })
      .catch(() => setErrorMessage("メッセージの取得に失敗しました"));
  }, [activeConversationId]);

  const handleCreate = useCallback(async () => {
    if (isSending) return;
    setIsCreatingConversation(true);
    setErrorMessage(null);
    try {
      const conversation = await createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setMessages([]);
      setActiveConversationId(conversation.id);
    } catch {
      setErrorMessage("会話の作成に失敗しました");
    } finally {
      setIsCreatingConversation(false);
    }
  }, [isSending]);

  const handleSelect = useCallback(
    (id: string) => {
      if (isSending || id === activeConversationId) return;
      setMessages([]);
      setErrorMessage(null);
      setActiveConversationId(id);
    },
    [isSending, activeConversationId],
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (isSending) return;
      setErrorMessage(null);

      let conversationId = activeConversationId;
      if (!conversationId) {
        setIsCreatingConversation(true);
        try {
          const conversation = await createConversation();
          conversationId = conversation.id;
          setConversations((prev) => [conversation, ...prev]);
          setActiveConversationId(conversation.id);
        } catch {
          setErrorMessage("会話の作成に失敗しました");
          return;
        } finally {
          setIsCreatingConversation(false);
        }
      }

      const userMessage: Message = {
        id: nextTempId("user"),
        conversationId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      const assistantMessageId = nextTempId("assistant");
      const assistantMessage: Message = {
        id: assistantMessageId,
        conversationId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsSending(true);

      // ユーザーメッセージの保存時にタイトルが設定されるため、成功/失敗に関わらず一覧を再取得する
      const refreshConversations = () => {
        fetchConversations()
          .then(setConversations)
          .catch(() => {
            // 一覧の再取得失敗はチャット継続に影響しないため無視する
          });
      };

      await sendMessageStream(conversationId, content, {
        onChunk: (text) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: m.content + text } : m,
            ),
          );
        },
        onDone: () => {
          setIsSending(false);
          refreshConversations();
        },
        onError: (message) => {
          setIsSending(false);
          setErrorMessage(message);
          // 応答なしで終わったアシスタントの吹き出し(入力中表示)を取り除く
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
          refreshConversations();
        },
      });
    },
    [isSending, activeConversationId],
  );

  return (
    <div className="flex h-full w-full">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        isCreating={isCreatingConversation}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </div>
        )}
        <MessageList messages={messages} />
        <MessageInput onSend={handleSend} disabled={isSending || isCreatingConversation} />
      </div>
    </div>
  );
}
