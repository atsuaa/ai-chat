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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  // handleSendが新規会話を作成した直後は、既にローカルにある楽観的更新
  // (送信直後に追加したユーザー/アシスタントの吹き出し)をサーバーからの
  // 空のメッセージ一覧で上書きしてしまわないよう、次のfetchMessagesを1回だけ抑止する
  const skipNextMessagesFetchRef = useRef(false);

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

    if (skipNextMessagesFetchRef.current) {
      skipNextMessagesFetchRef.current = false;
      return;
    }

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
      setIsSidebarOpen(false);
    } catch {
      setErrorMessage("会話の作成に失敗しました");
    } finally {
      setIsCreatingConversation(false);
    }
  }, [isSending]);

  const handleSelect = useCallback(
    (id: string) => {
      setIsSidebarOpen(false);
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
          skipNextMessagesFetchRef.current = true;
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

  const activeTitle =
    conversations.find((c) => c.id === activeConversationId)?.title || "無題の会話";

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        isCreating={isCreatingConversation}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="メニューを開く"
            className="shrink-0 rounded-md p-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {activeConversationId ? activeTitle : "AIチャットボット"}
          </h1>
        </header>
        {errorMessage && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </div>
        )}
        <MessageList messages={messages} />
        <MessageInput onSend={handleSend} disabled={isSending || isCreatingConversation} />
      </div>
    </div>
  );
}
