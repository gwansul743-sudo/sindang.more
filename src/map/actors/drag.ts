/* 주민 집어 옮기기(10-30) — 주민을 누른 채 6px 넘게 움직이면 집어 들고(지도는 끌리지 않는다), 놓으면 주민이 가장 가까운 길로 걸어 돌아간다(walker.ts grab·drop).
   움직이지 않고 떼면 평소 누르기(엔진의 click — 말풍선·대화)가 그대로. 옮긴 뒤 따라오는 click 은 여기서 삼킨다 */
import type { Viewport } from '../viewport';
import type { Walker } from './walker';

const SLOP = 6;   // 이만큼(px) 움직여야 집는다 — 지도 끌기(viewport)와 같은 문턱

export function makeDraggable(w: Walker, V: Viewport, o: { onGrab?: () => void } = {}) {
  let id = -1, start: [number, number] = [0, 0], off: [number, number] = [0, 0], ate = false;
  w.g.addEventListener('pointerdown', (e) => {
    if (id >= 0 || e.button > 0) return;
    id = e.pointerId; start = [e.clientX, e.clientY];
    const [mx, my] = V.toMap(e.clientX, e.clientY); off = [w.x - mx, w.y - my];
    V.skipPointer(e.pointerId);   // 이 손가락으로는 지도를 끌지 않는다
    try { w.g.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ }
  });
  w.g.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    if (!w.dragging) { if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) < SLOP) return; w.grab(); o.onGrab?.(); }
    const [mx, my] = V.toMap(e.clientX, e.clientY); w.dragTo(mx + off[0], my + off[1]);
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return; id = -1;
    if (w.dragging) { w.drop(); ate = true; setTimeout(() => { ate = false; }, 400); }
  };
  w.g.addEventListener('pointerup', up); w.g.addEventListener('pointercancel', up);
  w.g.addEventListener('click', (e) => { if (ate) { ate = false; e.stopImmediatePropagation(); e.stopPropagation(); } }, true);
}
