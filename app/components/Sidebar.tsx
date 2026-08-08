"use client";

import type { Conversation } from "@/app/lib/types";

type Props = {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  isCreating,
  isOpen,
  onClose,
}: Props) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform duration-200 ease-in-out dark:border-zinc-800 dark:bg-zinc-950 md:static md:z-auto md:w-64 md:translate-x-0 md:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isCreating ? "作成中..." : "＋ 新しい会話"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="shrink-0 rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-200 md:hidden dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
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
    </>
  );
}
