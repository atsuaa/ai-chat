"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_BYTES } from "@/app/lib/image";

type Props = {
  onSend: (content: string, images: string[]) => void;
  disabled: boolean;
};

// Tailwindのsmブレークポイント(640px)に合わせる。スマホ表示では物理キーボード前提の
// 「Shift+Enterで改行」表記が意味をなさない(むしろ紛らわしい)ため出し分ける。
const MOBILE_QUERY = "(max-width: 639px)";

const ACCEPT_ATTR = ALLOWED_IMAGE_MIME_TYPES.join(",");

type AttachedImage = {
  id: string;
  dataUrl: string;
  name: string;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 日本語などIMEでの変換確定Enterを送信のEnterと誤認しないためのフラグ。
  // ブラウザによってはcompositionendより先にkeydownが発火するため、
  // 予約語のkeyCode 229(IME処理中を示す)も併せて見る。
  const isComposingRef = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setAttachError(null);

    if (images.length + files.length > MAX_IMAGES_PER_MESSAGE) {
      setAttachError(`画像は最大${MAX_IMAGES_PER_MESSAGE}枚まで添付できます`);
      return;
    }

    const accepted: File[] = [];
    for (const file of files) {
      const isAllowedType = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
      if (!isAllowedType) {
        setAttachError("対応していない画像形式です(PNG/JPEG/WebP/GIFのみ)");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError(`画像1枚あたりのサイズは${MAX_IMAGE_BYTES / (1024 * 1024)}MBまでです`);
        continue;
      }
      accepted.push(file);
    }

    const dataUrls = await Promise.all(accepted.map(readAsDataUrl));
    setImages((prev) => [
      ...prev,
      ...accepted.map((file, i) => ({
        id: `${Date.now()}-${file.name}-${i}`,
        dataUrl: dataUrls[i],
        name: file.name,
      })),
    ]);
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSend = () => {
    const content = value.trim();
    if ((!content && images.length === 0) || disabled) return;
    onSend(
      content,
      images.map((img) => img.dataUrl),
    );
    setValue("");
    setImages([]);
    setAttachError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (isComposingRef.current || event.keyCode === 229) return;

    event.preventDefault();
    handleSend();
  };

  return (
    <div className="shrink-0 border-t border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl">
        {attachError && (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">{attachError}</p>
        )}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="group relative h-16 w-16 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="h-full w-full rounded-md border border-zinc-300 object-cover dark:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  aria-label={`${img.name}を削除`}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-white shadow hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || images.length >= MAX_IMAGES_PER_MESSAGE}
            aria-label="画像を添付"
            className="shrink-0 rounded-md border border-zinc-300 p-2 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M6 10.5V6a4 4 0 0 1 8 0v6a3 3 0 0 1-6 0V7.5a1 1 0 1 1 2 0V12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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
            placeholder={isMobile ? "メッセージを入力" : "メッセージを入力(Shift+Enterで改行)"}
            rows={1}
            // iOS Safariはフォーカスしたinput/textareaのfont-sizeが16px未満だと
            // 自動的にズームインする仕様があるため、モバイル幅ではtext-base(16px)にし、
            // sm以上(デスクトップ想定)でtext-smに戻している
            className="max-h-40 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || (!value.trim() && images.length === 0)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
