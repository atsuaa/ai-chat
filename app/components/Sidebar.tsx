"use client";

import type { Conversation } from "@/app/lib/types";

type Props = {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  isCreating: boolean;
};

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  isCreating,
}: Props) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isCreating ? "作成中..." : "＋ 新しい会話"}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
            会話はまだありません
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={`w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    conversation.id === activeConversationId
                      ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  {conversation.title || "無題の会話"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
