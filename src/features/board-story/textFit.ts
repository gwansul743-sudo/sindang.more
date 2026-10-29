/* 꼬리표 글씨 폭(TASK_21) — 상자 크기를 글자 수 어림(0.86–0.9 em)이 아니라 그려진 글씨를 재서 정한다(getComputedTextLength: 실제 글꼴·굵기·자간, 그 text 의 사용자 단위).
   못 재면(아직 안 그려짐·숨김 = 0) 넉넉한 어림(한글 굵은 글씨 ≈ 1.05 em). 글꼴이 늦게 오면 폭이 바뀌므로 onFonts 로 한 번 더 맞춘다. */
export function textW(t: SVGTextElement, fontPx: number) {
  let w = 0; try { w = t.getComputedTextLength(); } catch { /* 없음 */ }
  return w > 0 ? w : (t.textContent || '').length * fontPx * 1.05;
}
export function onFonts(f: () => void) { const d = document as Document & { fonts?: FontFaceSet }; if (d.fonts && d.fonts.status !== 'loaded') void d.fonts.ready.then(f); }
