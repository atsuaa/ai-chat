// フロント(添付時のバリデーション)とバックエンド(受信時のバリデーション)で共有する定数。
// 仕様は SPEC.md の「4.3 画像添付(マルチモーダル入力)」を参照。
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB(元ファイルサイズ基準)

const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;

export type ParsedImageDataUrl = {
  mimeType: string;
  base64: string;
  byteLength: number;
};

// "data:<mime>;base64,<...>" 形式かどうかを検証し、パースする。
// 不正な形式・非対応の画像形式の場合は null を返す。
export function parseImageDataUrl(value: string): ParsedImageDataUrl | null {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;

  const [, mimeType, base64] = match;
  // Base64は4文字で3バイトを表す。パディング("=")の数だけ末尾を減らす。
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const byteLength = (base64.length / 4) * 3 - padding;

  return { mimeType, base64, byteLength };
}
