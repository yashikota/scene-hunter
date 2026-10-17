/** サーバーが受け付ける写真の上限（presign の MAX_PHOTO_BYTES と同じ）。 */
const MAX_BYTES = 1_048_576;
const MIN_QUALITY = 0.4;

/** 長辺が maxSide を超えるときだけ、縦横比を保って縮める。 */
export function fitWithin(w: number, h: number, maxSide = 1280): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= maxSide) return { w, h };
  const scale = maxSide / long;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * canvas に描き直して JPEG にする。再エンコードで EXIF（位置情報など）は落ちる。
 * 上限を超えるときは品質を下げて作り直す。
 */
export async function encodeJpeg(
  src: CanvasImageSource,
  w: number,
  h: number,
  quality = 0.8,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(src, 0, 0, w, h);
  let q = quality;
  let blob = await toBlob(canvas, q);
  while (blob.size > MAX_BYTES && q > MIN_QUALITY) {
    q = Math.max(MIN_QUALITY, q - 0.1);
    blob = await toBlob(canvas, q);
  }
  return blob;
}

/** ファイルを読み込む。EXIF の向きは読み込み時に反映する（再エンコードで EXIF が消えるため）。 */
export function loadImageFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}
