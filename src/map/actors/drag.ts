/* 주민 집어 옮기기(10-30) — 주민을 누른 채 6px 넘게 움직이면 집어 들고(지도는 끌리지 않는다), 놓으면 주민이 가장 가까운 길로 걸어 돌아간다(walker.ts grab·drop).
   움직이지 않고 떼면 평소 누르기(엔진의 click — 말풍선·대화)가 그대로. 옮긴 뒤 따라오는 click 은 여기서 삼킨다.
   움직임·떼기는 window 에서 받는다: 주민 g 는 랜드마크 앞·뒤 층을 오가며 DOM 에서 옮겨져 setPointerCapture 가 풀리고,
   그러면 떼기(pointerup)를 놓쳐 '집은 채'로 굳었다 — 누르지 않아도 마우스를 따라오고 다시 집히지도 않았다(10-30) */
import type { Viewport } from '../viewport';
import type { Walker } from './walker';

const SLOP = 6;   // 이만큼(px) 움직여야 집는다 — 지도 끌기(viewport)와 같은 문턱
/* 옮긴 뒤의 click 은 어디에 떨어지든(주민·지도 빈 곳) 한 번 삼킨다 — 지도 빈 곳 click 은 카드·말풍선을 닫는다. 주민은 교대로 들고 나니 리스너는 모두가 하나를 같이 쓴다 */
let eatUntil = 0, eater = false;
const eat = (e: MouseEvent) => { if (performance.now() < eatUntil) { eatUntil = 0; e.stopImmediatePropagation(); e.stopPropagation(); } };

export function makeDraggable(w: Walker, V: Viewport, o: { onGrab?: () => void } = {}) {
  if (!eater) { eater = true; window.addEventListener('click', eat, true); }
  let id = -1, start: [number, number] = [0, 0], off: [number, number] = [0, 0];
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { end(); return; }   // 단추가 이미 떨어져 있다(창 밖에서 뗐다 등) — 놓은 것으로
    if (!w.dragging) { if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) < SLOP) return; w.grab(); o.onGrab?.(); }
    const [mx, my] = V.toMap(e.clientX, e.clientY); w.dragTo(mx + off[0], my + off[1]);
  };
  const up = (e: PointerEvent) => { if (e.pointerId === id) end(); };
  function end() {
    id = -1;
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', end);
    if (w.dragging) { w.drop(); eatUntil = performance.now() + 400; }
  }
  w.g.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (id >= 0) end();   // 혹시 남아 있던 집기는 정리하고 새로
    id = e.pointerId; start = [e.clientX, e.clientY];
    const [mx, my] = V.toMap(e.clientX, e.clientY); off = [w.x - mx, w.y - my];
    V.skipPointer(e.pointerId);   // 이 손가락으로는 지도를 끌지 않는다
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', end);
  });
}
