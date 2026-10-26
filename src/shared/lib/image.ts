/* 사진 자동 축소(10-26) — 관리자는 폰·PC 원본을 그대로 고르고, 올리기 직전에 여기서 줄인다.
   · 긴 변 PHOTO_MAX(1600px) 안으로 줄이고 WebP(품질 0.82)로. 카드 포스터·폰 바텀시트·사진 크게 보기(전체 화면)까지 충분한 크기.
   · WebP 로 못 굽는 옛 브라우저는 JPEG(0.85, 흰 바탕). 사진 방향(EXIF 회전)은 브라우저가 맞춰 읽는다.
   · 줄인 결과가 원본보다 크면(이미 작은 사진) 원본을 그대로 쓴다.
   · 서버 이미지 변환(Supabase 유료 기능)·Edge Function 없이 — 무료 플랜·서버 없음 원칙(CLAUDE.md §9). */
export const PHOTO_MAX = 1600;
export const PHOTO_Q = 0.82;
/* 줄인 파일 이름 끝 표시. 이 표시가 없는 보관함 사진 = 아직 원본(관리 패널 '사진 용량 줄이기' 대상) */
export const SHRUNK_MARK = '-s';
export const isShrunk = (path: string) => new RegExp(`${SHRUNK_MARK}\\.(webp|jpe?g|png)$`, 'i').test(path);
export const extOf = (b: Blob) => (b.type === 'image/webp' ? 'webp' : b.type === 'image/png' ? 'png' : 'jpg');

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const b = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { src: b, w: b.width, h: b.height, done: () => b.close() };
  } catch {   /* createImageBitmap 이 없거나 못 읽는 형식 → <img> */
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch (e) { URL.revokeObjectURL(url); throw e; }
  }
}
const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

export async function shrinkPhoto(file: Blob, max = PHOTO_MAX, q = PHOTO_Q): Promise<Blob> {
  const im = await decode(file);
  try {
    const k = Math.min(1, max / Math.max(im.w, im.h)), w = Math.max(1, Math.round(im.w * k)), h = Math.max(1, Math.round(im.h * k));
    /* 많이 줄일 땐 반씩 나눠 줄여야 잔물결(계단)이 덜 생긴다 */
    let src: CanvasImageSource = im.src, sw = im.w, sh = im.h;
    while (sw / 2 >= w * 1.0001 && sh / 2 >= h) {
      const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
      const tg = t.getContext('2d')!; tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height);
      src = t; sw = t.width; sh = t.height;
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    let out = await toBlob(c, 'image/webp', q);
    if (!out || out.type !== 'image/webp') {   /* WebP 를 못 구우면 PNG 로 떨어진다 → JPEG(투명은 흰 바탕) */
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      out = await toBlob(c, 'image/jpeg', 0.85);
    }
    if (!out) return file;
    return out.size < file.size ? out : file;
  } finally { im.done(); }
}
