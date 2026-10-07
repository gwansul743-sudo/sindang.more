/* 뷰포트 — 보고 있는 지도 범위(x, y, w, h: 지도 단위)와 화면 크기(pw, ph: px).
   팬·줌·핀치·휠, 이동 한계(clamp), 부드러운 이동(animateTo), 처음 화면(homeView), 창 크기 변경을 맡는다.
   그림을 어떻게 다시 그릴지는 모른다: viewBox 를 바꾼 뒤 onApply(scale) 를 부를 뿐이다. */
import type { Box } from './layers/land';

export interface ViewportOptions {
  map: HTMLElement;                   // 포인터 이벤트를 받는 칸
  svg: SVGSVGElement;                 // viewBox 를 바꿀 대상
  W: number;
  H: number;
  landBounds: Box;                    // 땅의 범위 — 이동 한계와 처음 화면의 기준
  focus: { x: number; y: number };    // 처음 화면의 중심
  onApply: (scale: number) => void;   // viewBox 가 바뀐 뒤 (매 프레임일 수 있음)
  onActivity?: () => void;            // 사용자가 드래그·휠을 했을 때 (전시 모드의 '깨우기')
  keepViewOnResize?: () => boolean;   // 창 크기가 바뀔 때 보던 곳을 유지할지 (false 면 처음 화면으로)
}

export interface HomeView { x: number; y: number; s: number }

export interface Viewport {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly pw: number; readonly ph: number;
  readonly moved: boolean;            // 마지막 포인터 조작이 드래그였는지 (클릭과 구분)
  scale(): number;
  apply(): void;
  fit(): void;
  homeView(): HomeView;
  resetHome(): void;
  clampView(x: number, y: number, w: number): [number, number, number];
  zoomAt(f: number, cx: number, cy: number): void;
  animateTo(tx: number, ty: number, tw: number, dur?: number): void;
  centerOn(x: number, y: number, targetScale: number, offsetY?: number): void;
  toMap(clientX: number, clientY: number): [number, number];   // 화면 px → 지도 좌표
  relayout(): void;
  destroy(): void;
}

export function createViewport(o: ViewportOptions): Viewport {
  const { map, svg, W, H, landBounds: b, focus } = o;
  let vw = W, vh = H, vx = 0, vy = 0, pw = 1, ph = 1;
  let anim = 0, moved = false;

  function fit() { pw = map.clientWidth; ph = map.clientHeight; }
  function scale() { return pw / vw; }
  function apply() {
    vh = (vw * ph) / pw;
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    o.onApply(scale());
  }
  /* 처음 화면: 초점을 가운데에 두고, 섬 전체가 꽉 차는 줌보다 한 단계 가깝게 (좁은 화면에서는 0.75배까지만) */
  function homeView(): HomeView {
    const f = Math.min(pw / ((b.x1 - b.x0) * 1.1), ph / ((b.y1 - b.y0) * 1.1));
    return { x: focus.x, y: focus.y, s: Math.max(0.75, f * 1.04) };
  }
  function resetHome() { const hv = homeView(); vw = pw / (hv.s / 1.12); vh = (vw * ph) / pw; vx = hv.x - vw / 2; vy = hv.y - vh / 2; clamp(); apply(); }
  /* 이동 한계를 땅 기준으로.
     · 확대했을 때: 땅 밖(바다)은 위·아래·좌·우 똑같이 화면의 25%까지 보임 (모바일은 카드가 아래를 덮으므로 아래쪽만 2배)
     · 축소할수록 그 여유가 줄어, 땅이 화면에 다 들어오는 풀샷에서는 땅이 화면 한가운데에 고정됨 */
  function clampView(x: number, y: number, w: number): [number, number, number] {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    w = Math.max(W / 12, Math.min(Math.max(W * 1.3, bw * 1.2, (bh * 1.2 * pw) / ph), w));
    const h = (w * ph) / pw, k = (v: number, bv: number) => Math.max(0, Math.min(1, (1.15 * bv - v) / (0.55 * bv)));
    const mx = Math.max((w - bw) / 2, 0.25 * w * k(w, bw)), my = Math.max((h - bh) / 2, 0.25 * h * k(h, bh));
    const mb = pw < 900 && my > (h - bh) / 2 ? my * 2 : my;
    const lox = b.x0 - mx, hix = b.x1 + mx - w, loy = b.y0 - my, hiy = b.y1 + mb - h;
    return [lox < hix ? Math.max(lox, Math.min(hix, x)) : (lox + hix) / 2, loy < hiy ? Math.max(loy, Math.min(hiy, y)) : (loy + hiy) / 2, w];
  }
  function clamp() { [vx, vy, vw] = clampView(vx, vy, vw); vh = (vw * ph) / pw; }
  function zoomAt(f: number, cx: number, cy: number) {
    const s = scale(), mx = vx + cx / s, my = vy + cy / s;
    vw = vw / f; clamp(); const s2 = scale();
    vx = mx - cx / s2; vy = my - cy / s2; clamp(); apply();
  }
  function animateTo(tx: number, ty: number, tw: number, dur = 700) {
    cancelAnimationFrame(anim); [tx, ty, tw] = clampView(tx, ty, tw);
    const x0 = vx, y0 = vy, w0 = vw, t0 = performance.now(), ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t);
      vx = x0 + (tx - x0) * e; vy = y0 + (ty - y0) * e; vw = w0 + (tw - w0) * e; apply();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function centerOn(x: number, y: number, targetScale: number, offsetY = 0) {
    const tw = pw / targetScale, th = (tw * ph) / pw;
    animateTo(x - tw / 2, y - th / 2 + offsetY / targetScale, tw);
  }
  function toMap(clientX: number, clientY: number): [number, number] {
    const r = map.getBoundingClientRect(), s = scale();
    return [vx + (clientX - r.left) / s, vy + (clientY - r.top) / s];
  }

  /* 드래그·휠·핀치 */
  const ptrs = new Map<number, [number, number]>(); let lastDist = 0, downAt: [number, number] = [0, 0];
  const onDown = (e: PointerEvent) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; downAt = [e.clientX, e.clientY]; cancelAnimationFrame(anim); o.onActivity?.(); };
  const onMove = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId)!; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { const s = scale(); vx -= (e.clientX - prev[0]) / s; vy -= (e.clientY - prev[1]) / s; clamp(); apply(); }
    else if (ptrs.size === 2) {
      const [a, c] = [...ptrs.values()]; const d = Math.hypot(a[0] - c[0], a[1] - c[1]);
      if (lastDist) { const r = map.getBoundingClientRect(); zoomAt(d / lastDist, (a[0] + c[0]) / 2 - r.left, (a[1] + c[1]) / 2 - r.top); }
      lastDist = d;
    }
    if (!moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) { moved = true; try { map.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ } }
  };
  const onUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastDist = 0; };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = map.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top); o.onActivity?.(); };
  map.addEventListener('pointerdown', onDown); map.addEventListener('pointermove', onMove);
  map.addEventListener('pointerup', onUp); map.addEventListener('pointercancel', onUp);
  map.addEventListener('wheel', onWheel, { passive: false });

  /* 지도 칸의 크기가 바뀌면 다시 맞춤: 보던 곳과 줌 정도(풀샷 대비)를 유지 */
  function relayout() {
    const ow = pw, oh = ph, ok = ow > 2 && oh > 2, h0 = ok ? homeView().s : 1, s0 = ok ? scale() : 1, cx = vx + vw / 2, cy = vy + vh / 2;
    fit(); if (pw < 2 || ph < 2) { pw = ow; ph = oh; return; } if (pw === ow && ph === oh) return;
    if (!ok || !(o.keepViewOnResize?.() ?? true)) { resetHome(); return; }
    vw = pw / (homeView().s * (s0 / h0)); vh = (vw * ph) / pw; vx = cx - vw / 2; vy = cy - vh / 2; clamp(); apply();
  }
  window.addEventListener('resize', relayout);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(relayout) : null; ro?.observe(map);

  function destroy() {
    cancelAnimationFrame(anim); ro?.disconnect(); window.removeEventListener('resize', relayout);
    map.removeEventListener('pointerdown', onDown); map.removeEventListener('pointermove', onMove);
    map.removeEventListener('pointerup', onUp); map.removeEventListener('pointercancel', onUp); map.removeEventListener('wheel', onWheel);
  }

  return {
    get x() { return vx; }, get y() { return vy; }, get w() { return vw; }, get h() { return vh; },
    get pw() { return pw; }, get ph() { return ph; }, get moved() { return moved; },
    scale, apply, fit, homeView, resetHome, clampView, zoomAt, animateTo, centerOn, toMap, relayout, destroy,
  };
}
