/* 폰 바텀시트 손잡이: 한 번 누르면 닫고, 아래로 끌어내리면 시트가 손을 따라 내려가다 놓을 때 닫거나 제자리로 (10-26).
   · 손잡이 요소에만 붙인다(CSS `touch-action:none` 필요 — 시트 본문은 세로 스크롤이라 건드리지 않는다).
   · 누르기는 손잡이에서 받고, 움직임·놓기는 window 에서 받는다(손가락이 손잡이 밖으로 나가도 이어지게).
   · pointerdown 은 위로 올려 보내지 않는다 — 사이드바의 '오른쪽으로 넘기기'(onSwipeRight)와 겹쳐 두 번 닫히지 않게.
   · enabled() 가 false 면(데스크톱 사이드바) 아무것도 안 한다. */
export interface PullOptions {
  enabled?: () => boolean;
  minDy?: number;       // 이만큼 내려 놓으면 닫는다
  flick?: number;       // 이보다 빠르게(px/ms) 아래로 튕기면 짧아도 닫는다
}

export function onPullDown(handle: HTMLElement, sheet: HTMLElement, close: () => void, o: PullOptions = {}): () => void {
  const minDy = o.minDy ?? 70, flick = o.flick ?? 0.5, TAP = 8;
  let id = -1, y0 = 0, t0 = 0, dy = 0, moved = false;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (o.enabled && !o.enabled())) return;
    e.stopPropagation(); e.preventDefault();
    id = e.pointerId; y0 = e.clientY; t0 = e.timeStamp; dy = 0; moved = false;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - y0);
    if (!moved && dy < TAP) return;
    if (!moved) { moved = true; sheet.style.transition = 'none'; document.body.classList.add('swiping'); }
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const dt = Math.max(1, e.timeStamp - t0), tap = !moved, shut = tap || dy >= minDy || dy / dt >= flick;
    off(); id = -1; document.body.classList.remove('swiping');
    sheet.style.transition = ''; sheet.style.transform = '';   // 인라인을 지우면 CSS 전환이 지금 자리에서 닫힘(또는 제자리)까지 이어 준다
    if (shut) close();
  };
  const cancel = () => { off(); id = -1; document.body.classList.remove('swiping'); sheet.style.transition = ''; sheet.style.transform = ''; };
  const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  handle.addEventListener('pointerdown', down);
  return () => { handle.removeEventListener('pointerdown', down); cancel(); };
}
