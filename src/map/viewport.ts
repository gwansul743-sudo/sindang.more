/* 뷰포트 — 보고 있는 지도 범위(x, y, w, h: 지도 단위)와 화면 크기(pw, ph: px).
   팬·줌·핀치·휠, 이동 한계(clamp), 부드러운 이동(animateTo), 처음 화면(homeView), 창 크기 변경을 맡는다.
   그림을 어떻게 다시 그릴지는 모른다: viewBox 를 바꾼 뒤 onApply(scale) 를 부를 뿐이다.
   10-25 성능: viewBox 를 바꾸면 브라우저가 SVG 전체(요소 2,700여 개)를 다시 래스터한다(팬 중 프레임의 거의 전부).
   그래서 제스처·애니메이션 중에는 viewBox 를 그대로 두고 마지막으로 커밋한 그림을 CSS transform 으로만 옮기고(applyLive),
   멈출 때 한 번 viewBox 를 바꾼다(commit = apply).
   옮긴 만큼 가장자리가 비지 않게 SVG 를 칸보다 사방 BLEED 만큼 크게 그려 두고(칸 밖은 #map 의 overflow:hidden 이 자른다),
   그 여유를 넘어 빈 곳이 생길 참이면 제스처 중간에도 커밋한다. viewBox 속성 = 보는 범위(x, y, w, h)를 사방 그 여유만큼 넓힌 것. */
import type { Box } from './layers/land';

export interface ViewportOptions {
  map: HTMLElement;                   // 포인터 이벤트를 받는 칸
  svg: SVGSVGElement;                 // viewBox 를 바꿀 대상
  W: number;
  H: number;
  landBounds: Box;                    // 땅의 범위 — 이동 한계와 처음 화면의 기준
  focus: { x: number; y: number };    // 처음 화면의 중심
  onApply: (scale: number) => void;   // viewBox 가 바뀐 뒤 (커밋 때만 — 제스처 중엔 안 불린다)
  onLive?: () => void;                // 제스처 중 그림만 CSS transform 으로 옮겼을 때 (화면 px 로 붙는 HTML 말풍선 등을 따라 옮길 때)
  onActivity?: () => void;            // 사용자가 드래그·휠을 했을 때 (전시 모드의 '깨우기')
  keepViewOnResize?: () => boolean;   // 창 크기가 바뀔 때 보던 곳을 유지할지 (false 면 처음 화면으로)
  holdOnResize?: () => boolean;       // true 를 돌려주는 동안은 칸 크기가 바뀌어도 재배치하지 않는다 (옆 패널이 접히는 전환 중: 지도가 오른쪽으로 드러나거나 가려지기만)
}

export interface HomeView { x: number; y: number; s: number }

export interface Viewport {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly pw: number; readonly ph: number;
  readonly moved: boolean;            // 마지막 포인터 조작이 드래그였는지 (클릭과 구분)
  scale(): number;
  apply(): void;                      // = 커밋: 지금 보는 범위로 viewBox 를 바꾸고 transform 을 지운다
  fit(): void;
  homeView(pw?: number, ph?: number): HomeView;   // 칸 크기를 넘기면 그 크기일 때의 처음 화면 (사이드바가 접히는 중에 미리 계산할 때)
  resetHome(): void;
  clampView(x: number, y: number, w: number): [number, number, number];
  zoomAt(f: number, cx: number, cy: number): void;
  zoomSmooth(f: number, cx: number, cy: number, dur?: number): void;   // zoomAt 과 같되 부드럽게 (+/− 버튼)
  animateTo(tx: number, ty: number, tw: number, dur?: number, onDone?: () => void): void;   // onDone: 끝까지 간 뒤 한 번(중간에 끊기면 안 부름)
  centerOn(x: number, y: number, targetScale: number, offsetY?: number, onDone?: () => void): void;
  toMap(clientX: number, clientY: number): [number, number];   // 화면 px → 지도 좌표
  relayout(): void;
  stop(): void;   // 진행 중인 카메라 이동을 그 자리에서 멈춤(자동 순환 중 사람이 만졌을 때)
  destroy(): void;
}

export function createViewport(o: ViewportOptions): Viewport {
  const { map, svg, W, H, landBounds: b, focus } = o;
  let vw = W, vh = H, vx = 0, vy = 0, pw = 1, ph = 1;
  let zoomGoal: number | null = null;   // 버튼 줌 연타 중이면 '가려던 폭'에서 다시 곱한다 (한 번에 1.6배씩 정확히)
  let anim = 0, moved = false, flying = false;   // flying: animateTo/zoomSmooth 가 진행 중 (그동안 칸 크기 변경은 재배치하지 않는다)
  const stopAnim = () => { cancelAnimationFrame(anim); flying = false; zoomGoal = null; };

  function fit() { const r = map.getBoundingClientRect(); pw = r.width; ph = r.height; }   // 소수점 폭 그대로 (전환 중 칸 폭이 소수인데 정수로 재면 배율이 어긋나 1px 떨림)
  function scale() { return pw / vw; }
  /* SVG 를 칸보다 사방 BLEED(칸 크기의 비율)만큼 크게 — 여유 bx, by 는 정수 px (소수면 crispEdges 그림이 1px 씩 어긋난다).
     transform 의 기준점은 칸의 왼쪽 위 = SVG 안의 (bx, by) */
  const BLEED = 0.2;
  let bx = 0, by = 0, boxKey = '';
  function sizeBox() {
    bx = Math.round(BLEED * pw); by = Math.round(BLEED * ph);
    const key = `${bx} ${by} ${pw} ${ph}`; if (key === boxKey) return; boxKey = key;
    Object.assign(svg.style, { left: `${-bx}px`, top: `${-by}px`, width: `${pw + 2 * bx}px`, height: `${ph + 2 * by}px` });
  }
  /* 커밋된 보는 범위(마지막으로 viewBox 에 넣은 값)와, 지금 그림이 transform 으로만 옮겨져 있는지 */
  let cx0 = 0, cy0 = 0, cw0 = 0, live = false;
  function apply() {   // 커밋
    vh = (vw * ph) / pw; sizeBox();
    const s = scale();
    svg.setAttribute('viewBox', `${vx - bx / s} ${vy - by / s} ${vw + (2 * bx) / s} ${vh + (2 * by) / s}`);
    if (live) { svg.style.transform = ''; live = false; }
    cx0 = vx; cy0 = vy; cw0 = vw;
    o.onApply(scale());
  }
  /* 제스처·애니메이션 중 매 프레임: viewBox 는 그대로, 커밋값과의 차이만 transform 으로.
     칸 좌표의 점 p(커밋 때) → k·p + d 가 지금 범위의 점이 된다 (k = cw0/vw, d = (커밋 원점 − 지금 원점) × 지금 배율).
     그려 둔 SVG 상자(칸 좌표로 −bx … pw+bx)가 옮긴 뒤에도 칸을 다 덮는지 보고, 모자라면 그 자리에서 커밋 */
  function applyLive() {
    vh = (vw * ph) / pw;
    if (!(cw0 > 0)) { apply(); return; }
    const s = scale(), k = cw0 / vw, dx = (cx0 - vx) * s, dy = (cy0 - vy) * s;
    if (dx - k * bx > 0 || dx + k * (pw + bx) < pw || dy - k * by > 0 || dy + k * (ph + by) < ph) { apply(); return; }
    svg.style.transformOrigin = `${bx}px ${by}px`;
    svg.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
    live = true;
    o.onLive?.();
  }
  /* 처음 화면: 초점을 가운데에 두고, 섬 전체가 꽉 차는 줌보다 한 단계 가깝게 (좁은 화면에서는 0.75배까지만) */
  function homeView(w = pw, h = ph): HomeView {
    const f = Math.min(w / ((b.x1 - b.x0) * 1.1), h / ((b.y1 - b.y0) * 1.1));
    return { x: focus.x, y: focus.y, s: Math.max(0.75, f * 1.04) };
  }
  function resetHome() { const hv = homeView(); vw = pw / (hv.s / 1.12); vh = (vw * ph) / pw; vx = hv.x - vw / 2; vy = hv.y - vh / 2; clamp(); apply(); }
  /* 이동 한계 = 최대로 줌아웃했을 때 보이는 사각형(땅 가운데 기준, 땅 폭의 1.4배 또는 전체 폭의 1.5배).
     · 끝까지 축소하면 그 사각형이 화면과 일치해 땅이 한가운데에 고정됨
     · 확대할수록 화면이 작아져 그 사각형 안을 자유롭게 다닐 수 있음 (10-21, 전에는 땅 밖으로 화면의 25%까지만) */
  function clampView(x: number, y: number, w: number): [number, number, number] {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const wmax = Math.max(W * 1.5, bw * 1.4, (bh * 1.4 * pw) / ph), hmax = (wmax * ph) / pw;
    w = Math.max(pw / (pw >= 900 ? 92 : 36), Math.min(wmax, w));   /* 최대 확대: 1칸이 데스크톱(900px 이상) 92px, 폰 36px 될 때까지 (10-21. 전엔 36/14 → + 버튼 2번(×1.6²) 더. 그 전엔 전체 폭의 1/12 → 1/16 → 폭 기준으로) */
    const h = (w * ph) / pw, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const lox = cx - wmax / 2, hix = cx + wmax / 2 - w, loy = cy - hmax / 2, hiy = cy + hmax / 2 - h;
    return [lox < hix ? Math.max(lox, Math.min(hix, x)) : (lox + hix) / 2, loy < hiy ? Math.max(loy, Math.min(hiy, y)) : (loy + hiy) / 2, w];
  }
  function clamp() { [vx, vy, vw] = clampView(vx, vy, vw); vh = (vw * ph) / pw; }
  function zoomAt(f: number, cx: number, cy: number) {
    const s = scale(), mx = vx + cx / s, my = vy + cy / s;
    vw = vw / f; clamp(); const s2 = scale();
    vx = mx - cx / s2; vy = my - cy / s2; clamp(); apply();
  }
  /* 버튼 줌: 화면의 (cx, cy) 점을 고정한 채 배율이 시간에 따라 기하급수(로그 공간)로 변해 균일하게 보인다. 누르는 중에 또 누르면 현재 상태에서 이어진다 */
  function zoomSmooth(f: number, cx: number, cy: number, dur = 420) {
    cancelAnimationFrame(anim); flying = true;
    const s0 = scale(), mx = vx + cx / s0, my = vy + cy / s0;              // 고정할 지도 점
    const w0 = vw, tw = clampView(vx, vy, (zoomGoal ?? vw) / f)[2], t0 = performance.now();
    zoomGoal = tw;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - t0) / dur)), e = ease(t);   // rAF 타임스탬프는 프레임 시작 시각이라 t0 보다 이를 수 있다 → 음수면 한 프레임 역주행
      vw = w0 * Math.pow(tw / w0, e); vh = (vw * ph) / pw;
      const s = scale(); vx = mx - cx / s; vy = my - cy / s; clamp(); apply();
      if (t < 1) anim = requestAnimationFrame(step); else { zoomGoal = null; flying = false; }
    };
    anim = requestAnimationFrame(step);
  }
  function animateTo(tx: number, ty: number, tw: number, dur = 700, onDone?: () => void) {
    stopAnim(); flying = true; [tx, ty, tw] = clampView(tx, ty, tw);
    const x0 = vx, y0 = vy, w0 = vw, t0 = performance.now(), ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - t0) / dur)), e = ease(t);
      vx = x0 + (tx - x0) * e; vy = y0 + (ty - y0) * e; vw = w0 + (tw - w0) * e; apply();
      if (t < 1) anim = requestAnimationFrame(step); else { flying = false; onDone?.(); }
    };
    anim = requestAnimationFrame(step);
  }
  function centerOn(x: number, y: number, targetScale: number, offsetY = 0, onDone?: () => void) {
    const tw = pw / targetScale, th = (tw * ph) / pw;
    animateTo(x - tw / 2, y - th / 2 + offsetY / targetScale, tw, 700, onDone);
  }
  function toMap(clientX: number, clientY: number): [number, number] {
    const r = map.getBoundingClientRect(), s = scale();
    return [vx + (clientX - r.left) / s, vy + (clientY - r.top) / s];
  }

  /* 드래그·휠·핀치 */
  const ptrs = new Map<number, [number, number]>(); let lastDist = 0, downAt: [number, number] = [0, 0];
  const onDown = (e: PointerEvent) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; downAt = [e.clientX, e.clientY]; stopAnim(); o.onActivity?.(); };
  const onMove = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId)!; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { const s = scale(); vx -= (e.clientX - prev[0]) / s; vy -= (e.clientY - prev[1]) / s; clamp(); applyLive(); }
    else if (ptrs.size === 2) {
      const [a, c] = [...ptrs.values()]; const d = Math.hypot(a[0] - c[0], a[1] - c[1]);
      if (lastDist) { const r = map.getBoundingClientRect(); zoomAt(d / lastDist, (a[0] + c[0]) / 2 - r.left, (a[1] + c[1]) / 2 - r.top); }
      lastDist = d;
    }
    if (!moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) { moved = true; try { map.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ } }
  };
  const onUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastDist = 0; if (ptrs.size === 0 && live) apply(); };   // 손을 떼면 커밋
  const onWheel = (e: WheelEvent) => { e.preventDefault(); stopAnim(); const r = map.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top); o.onActivity?.(); };
  map.addEventListener('pointerdown', onDown); map.addEventListener('pointermove', onMove);
  map.addEventListener('pointerup', onUp); map.addEventListener('pointercancel', onUp);
  map.addEventListener('wheel', onWheel, { passive: false });

  /* 지도 칸의 크기가 바뀌면 다시 맞춤: 보던 곳과 줌 정도(풀샷 대비)를 유지 */
  function relayout() {
    const ow = pw, oh = ph, ok = ow > 2 && oh > 2, h0 = ok ? homeView().s : 1, s0 = ok ? scale() : 1, cx = vx + vw / 2, cy = vy + vh / 2;
    fit(); if (pw < 2 || ph < 2) { pw = ow; ph = oh; return; } if (pw === ow && ph === oh) return;
    /* 카메라가 날아가는 중(사이드바가 접히며 칸이 넓어질 때)에는 재배치하지 않는다: 왼쪽 가장자리를 고정한 채 오른쪽으로 더 드러나기만 하고,
       애니메이션의 마지막 프레임이 최종 칸 크기에 맞춘 목표로 떨어진다. 재배치와 애니메이션이 매 프레임 서로 덮어쓰면 화면이 흔들린다 */
    if (flying || o.holdOnResize?.()) { vw = pw / s0; apply(); return; }   // 배율과 왼쪽 가장자리를 그대로 두고(viewBox 폭만 칸에 맞춤) 오른쪽이 드러나거나 가려지게만
    if (!ok || !(o.keepViewOnResize?.() ?? true)) { resetHome(); return; }
    vw = pw / (homeView().s * (s0 / h0)); vh = (vw * ph) / pw; vx = cx - vw / 2; vy = cy - vh / 2; clamp(); apply();
  }
  window.addEventListener('resize', relayout);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(relayout) : null; ro?.observe(map);

  function destroy() {
    stopAnim(); ro?.disconnect(); window.removeEventListener('resize', relayout);
    map.removeEventListener('pointerdown', onDown); map.removeEventListener('pointermove', onMove);
    map.removeEventListener('pointerup', onUp); map.removeEventListener('pointercancel', onUp); map.removeEventListener('wheel', onWheel);
  }

  return {
    stop: stopAnim,
    get x() { return vx; }, get y() { return vy; }, get w() { return vw; }, get h() { return vh; },
    get pw() { return pw; }, get ph() { return ph; }, get moved() { return moved; },
    scale, apply, fit, homeView, resetHome, clampView, zoomAt, zoomSmooth, animateTo, centerOn, toMap, relayout, destroy,
  };
}
