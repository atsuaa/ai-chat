"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Message } from "@/app/lib/types";

// ユーザー吹き出しは背景がライト/ダークで反転する(bg-zinc-900/dark:bg-zinc-100)ため、
// コードブロックの配色もそれに合わせて反転させないと文字色と背景色が同化してしまう。
function getMarkdownComponents(isUser: boolean): Components {
  const codeClass = isUser
    ? "bg-white/20 text-inherit dark:bg-black/10"
    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50";

  return {
    pre: ({ children }) => (
      <pre className={`overflow-x-auto rounded-md p-3 text-sm ${codeClass}`}>{children}</pre>
    ),
    code: ({ className, children, ...props }) => {
      if (!className) {
        return (
          <code className={`rounded px-1 py-0.5 text-sm ${codeClass}`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={`font-mono ${className}`} {...props}>
          {children}
        </code>
      );
    },
  };
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm leading-relaxed break-words sm:max-w-[75%] ${
          isUser
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
        }`}
      >
        {message.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.images.map((image, i) => (
              <a key={i} href={image} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt="添付画像"
                  className="h-32 w-32 rounded-md border border-zinc-300/50 object-cover dark:border-zinc-700/50"
                />
              </a>
            ))}
          </div>
        )}
        {message.content ? (
          <div
            className={`prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
              // proseプラグインは.prose自体にcolor(var(--tw-prose-body)、グレー系)を
              // 設定し、p等の子要素はそれを継承する仕組みのため、pを個別に上書きしても
              // 効果がない。user吹き出しでは.prose自体の色を親のtext-white/
              // dark:text-zinc-900に追従させることで、pタグを含む地の文を読めるようにする
              isUser ? "text-inherit" : ""
            }`}
          >
            <Markdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(isUser)}>
              {message.content}
            </Markdown>
          </div>
        ) : isUser || message.images.length > 0 ? null : (
          <span className="inline-flex gap-1 py-1" aria-label="応答を生成中">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </span>
        )}
      </div>
    </div>
  );
}

type Props = {
  messages: Message[];
};

export function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        メッセージを送信して会話を始めましょう
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
