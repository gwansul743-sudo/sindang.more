/* 오른쪽으로 '슥' 넘기는 제스처 감지. 마우스·터치·펜 공통(pointer 이벤트).
   · 가로로 minDx px 이상, 세로 흔들림은 가로의 60% 미만, maxMs 안에 끝나야 handler 를 한 번 부른다.
   · 누르기는 대상 요소에서 받지만, 움직임과 놓기는 window 에서 받는다 — 창 끝에 붙은 패널을 끌면 커서가 창 밖으로 나가기 때문.
   · 끄는 동안 패널이 손을 따라 오른쪽으로 밀리고(transform), 놓으면 제자리로 돌아오거나 handler 가 닫는다.
   · 글 입력 칸(input·textarea·select)에서 시작한 드래그는 글자 선택이므로 무시한다.
   · 대상 요소에는 CSS `touch-action: pan-y` 가 있어야 터치에서 가로 움직임이 브라우저 스크롤에 먹히지 않는다. */
export interface SwipeOptions {
  minDx?: number; maxMs?: number;
  follow?: boolean;                 // true 면 끄는 동안 요소를 transform 으로 밀어 준다
  onDrag?: (dx: number) => void;    // 직접 따라 움직이게 하고 싶을 때 (follow 대신)
  onEnd?: () => void;               // 끌기가 끝났을 때(닫히든 제자리든) 정리용
}

export function onSwipeRight(el: HTMLElement, handler: () => void, o: SwipeOptions = {}): () => void {
  const minDx = o.minDx ?? 70, maxMs = o.maxMs ?? 600, follow = o.follow ?? !o.onDrag;
  let id = -1, x0 = 0, y0 = 0, t0 = 0, dragging = false;
  const isField = (t: EventTarget | null) => t instanceof Element && !!t.closest('input,textarea,select,[contenteditable]');
  const reset = () => {
    id = -1;
    if (dragging) { dragging = false; document.body.classList.remove('swiping'); if (follow) { el.style.transition = ''; el.style.transform = ''; } o.onEnd?.(); }
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || isField(e.target)) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = e.timeStamp;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0, dy = Math.abs(e.clientY - y0);
    if (!dragging) {
      if (dx < 12 || dy > dx * 0.6) { if (dy > 12 && dy > dx) cancel(); return; }   // 세로로 먼저 움직이면 스크롤이므로 포기
      dragging = true; document.body.classList.add('swiping'); getSelection()?.removeAllRanges(); if (follow) el.style.transition = 'none';
    }
    if (follow) el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    o.onDrag?.(Math.max(0, dx));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0, dy = Math.abs(e.clientY - y0), ok = dx >= minDx && dy < dx * 0.6 && e.timeStamp - t0 <= maxMs;
    off(); reset();
    if (ok) handler();
  };
  const cancel = () => { off(); reset(); };
  const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  el.addEventListener('pointerdown', down);
  return () => { el.removeEventListener('pointerdown', down); off(); reset(); };
}
