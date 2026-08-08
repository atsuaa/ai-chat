"use client";

import { useRef, useState, type KeyboardEvent } from "react";

type Props = {
  onSend: (content: string) => void;
  disabled: boolean;
};

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  // 日本語などIMEでの変換確定Enterを送信のEnterと誤認しないためのフラグ。
  // ブラウザによってはcompositionendより先にkeydownが発火するため、
  // 予約語のkeyCode 229(IME処理中を示す)も併せて見る。
  const isComposingRef = useRef(false);

  const handleSend = () => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (isComposingRef.current || event.keyCode === 229) return;

    event.preventDefault();
    handleSend();
  };

  return (
    <div className="shrink-0 border-t border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          disabled={disabled}
          placeholder="メッセージを入力(Shift+Enterで改行)"
          rows={1}
          className="max-h-40 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          送信
        </button>
      </div>
    </div>
  );
}
