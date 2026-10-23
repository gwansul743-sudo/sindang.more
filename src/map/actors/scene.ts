/* 움직이는 것들의 무대 — 층 두 개(보통·랜드마크 앞), 포인터 추적, 매 프레임 틱, 화면에 놓기.
   주민·이장님·고양이는 Actor 로 들어오고, 무대는 "지금 프레임의 상황(Frame)"만 건넨다. */
import { el } from '../svg';
import { SW, FEET } from '../sprites/compose';
import type { Viewport } from '../viewport';
import type { LandmarksLayer } from '../layers/landmarks';

export interface Pointer { x: number; y: number; t: number }
export interface Actor { g: SVGGElement; body: SVGGElement; x: number; y: number; ox: number; oy: number; front: boolean; lastT: string; lastB: string; tick(f: Frame, others: Actor[]): void }
export interface Frame {
  now: number; dt: number; V: Viewport; s: number;
  q: number;        // 스프라이트 1칸 = 화면 q px
  k: number;        // 1칸 = 지도 단위 k
  R: number;        // 손 흔드는 거리(px)
  P: Pointer | null; live: boolean; still: boolean; kiosk: boolean;
  mul: number;      // 스프라이트 배율 보정(전시 보드 위에서는 크게). 엔진이 actorMul 로 준다
  nearPx: number;   // 화면 가장자리에서 이만큼(px) 넘게 벗어나면 '멀어진' 것
  lms: { x: number; y: number }[]; LK: number;   // 랜드마크 위치와 아이콘 배율
  place(a: Actor, sx: number, sy: number, flip: 1 | -1, hop: number, mul?: number): void;   // mul: 스프라이트 배율 보정(전시 모드의 주민·이장님·고양이 0.5). 전체 SVG가 crispEdges 라 반 픽셀도 번지지 않는다
  setFront(a: Actor, front: boolean): void;
}
export interface SceneOptions {
  svg: SVGSVGElement; map: HTMLElement; V: Viewport; landmarks: LandmarksLayer;
  before: Element;                 // 보통 층을 이 요소 앞에 (권역 이름 앞)
  frontBefore: Element;            // 앞 층을 이 요소 앞에 (가게 점 앞)
  isKiosk?: () => boolean;
  actorMul?: () => number;         // 주민·이장님·고양이 배율(기본 1)
}
export interface Scene { layer: SVGGElement; layerFront: SVGGElement; actors: Actor[]; add(a: Actor): void; start(): void; destroy(): void }

export function createScene(o: SceneOptions): Scene {
  const { svg, map, V } = o;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = el('g', { class: 'walkers', 'aria-hidden': 'true', 'pointer-events': 'none' }); svg.insertBefore(layer, o.before);
  /* 랜드마크 건물 '앞'을 지날 때 쓰는 층 (랜드마크 아이콘 위, 가게 점 아래). 건물 뒤를 지날 때는 원래 층에 있어 가려짐 */
  const layerFront = el('g', { class: 'walkers walkers-front', 'aria-hidden': 'true', 'pointer-events': 'none' }); svg.insertBefore(layerFront, o.frontBefore);
  /* 랜드마크 이름표는 주민보다 위로: 이름표만 별도 층으로 */
  const lmLabels = el('g', { class: 'layer lm-labels' }); svg.insertBefore(lmLabels, o.frontBefore);
  o.landmarks.items.forEach((l) => el('g', { class: 'lm', transform: l.g.getAttribute('transform')! }, lmLabels).appendChild(l.t));

  let P: Pointer | null = null;
  const track = (e: PointerEvent) => { const r = map.getBoundingClientRect(); P = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse') P = null; };
  map.addEventListener('pointermove', track, { passive: true }); map.addEventListener('pointerdown', track, { passive: true }); map.addEventListener('pointerleave', leave);

  const waveRadius = (q: number) => 36 + 11 * q;   /* 손 흔들기 판정 반지름(px). 10-16 조금 줄임(전 40+12q) */
  const pixelSize = (s: number) => (s < 1.15 ? 1 : Math.max(2, Math.min(5, Math.round(s * 0.8))));   /* 정수 → 또렷함 */
  const actors: Actor[] = [];

  /* 화면에 놓기: 화면 밖이면 생략, 안이면 정수 픽셀에 맞춤 */
  function place(a: Actor, sx: number, sy: number, flip: 1 | -1, hop: number, mul = 1) {
    const s = V.scale(), q = pixelSize(s) * mul, k = q / s;
    const vis = sx > -60 && sx < V.pw + 60 && sy > -20 && sy < V.ph + 90;
    if (!vis) { if (a.lastT !== 'off') { a.g.setAttribute('display', 'none'); a.lastT = 'off'; } return; }
    const tx = V.x + (Math.round(sx - (SW / 2) * q) + (SW / 2) * q) / s, ty = V.y + Math.round(sy) / s;
    const T = `translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${k.toFixed(5)})`;
    if (T !== a.lastT) { if (a.lastT === 'off') a.g.removeAttribute('display'); a.g.setAttribute('transform', T); a.lastT = T; }
    const Bt = flip + ',' + hop;
    if (Bt !== a.lastB) { a.body.setAttribute('transform', `translate(${flip < 0 ? SW / 2 : -SW / 2},${-FEET - hop}) scale(${flip},1)`); a.lastB = Bt; }
  }
  const setFront = (a: Actor, front: boolean) => { (front ? layerFront : layer).appendChild(a.g); };

  let raf = 0, last = performance.now();
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const s = V.scale(); if (!(s > 0) || V.pw < 10) return;
    const q = pixelSize(s), k = q / s;
    const f: Frame = { now, dt, V, s, q, k, R: waveRadius(q), P, live: !!P && !still, still, kiosk: !!o.isKiosk?.(), mul: o.actorMul?.() ?? 1, nearPx: 15 * q + 50, lms: o.landmarks.items, LK: o.landmarks.k(s), place, setFront };
    for (const a of actors) a.tick(f, actors);
  }
  return {
    layer, layerFront, actors,
    add: (a) => { actors.push(a); },
    start: () => { raf = requestAnimationFrame(tick); },
    destroy: () => { cancelAnimationFrame(raf); map.removeEventListener('pointermove', track); map.removeEventListener('pointerdown', track); map.removeEventListener('pointerleave', leave); },
  };
}
