"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Message } from "@/app/lib/types";

const markdownComponents: Components = {
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    if (!className) {
      return (
        <code
          className="rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800"
          {...props}
        >
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
        {message.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </Markdown>
          </div>
        ) : (
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
