import './stamps.css';

/* 전시 모드 와펜 스탬프 — 전시 모드를 켜고 카메라가 전시 구역에 도착하면, 와펜 5장이 화면 위 정해진 자리에
   여권 도장처럼 탕·탕·탕 찍히고(지도가 살짝 흔들림), 잠깐 머문 뒤 '신당 5길' 이름표로 빨려 들어가 사라진다.
   순수한 인트로 장식: 클릭 안 되고(pointer-events none), 데이터와 무관. 지도 위 #stage 에 오버레이 div 하나로 산다.
   그림은 public/stamps/*.png (사용자 제공). 자리는 #map 칸의 비율 좌표(2026-10-16 전시 화면 스크린샷에 사용자가 표시한 1~5). */

export interface StampSpec { src: string; x: number; y: number; rot: number; m?: { x: number; y: number } }   // x·y: #map 칸 안의 비율(0~1), rot: 최종 기울기(도), m: 폰(지도 폭 600px 미만)에서의 자리
export interface StampOptions {
  map: HTMLElement;                             // 비율 좌표의 기준 칸(#map)
  target: () => { x: number; y: number } | null; // 빨려 들어갈 화면 좌표(clientX/Y). 없으면 그 자리에서 사라진다
  onArrive?: () => void;                         // 한 장이 이름표에 닿을 때(이름표 펄스)
  onDone?: () => void;                           // 마지막 장까지 빨려 들어가 연출이 끝났을 때(중간에 cancel 되면 안 부름)
  items?: StampSpec[];
}
export interface Stamps { play(): void; cancel(): void; readonly playing: boolean }

export const DEFAULT_STAMPS: StampSpec[] = [
  { src: '/stamps/sewing.png',      x: 0.196, y: 0.230, rot: -6 },
  { src: '/stamps/supermarket.png', x: 0.760, y: 0.193, rot: 5 },
  { src: '/stamps/coffee.png',      x: 0.150, y: 0.740, rot: -4 },
  { src: '/stamps/restaurant.png',  x: 0.496, y: 0.558, rot: 7 },
  { src: '/stamps/wine.png',        x: 0.892, y: 0.747, rot: -5, m: { x: 0.78, y: 0.80 } },   // 폰에선 오른쪽이 잘려서 왼쪽 아래로
];

const STAGGER = 220, SLAM = 420, LAND = 170, HOLD = 1100, SUCK = 650, SUCK_STAGGER = 90;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountStamps(stage: HTMLElement, o: StampOptions): Stamps {
  const items = o.items ?? DEFAULT_STAMPS;
  const layer = document.createElement('div'); layer.className = 'stamps'; layer.setAttribute('aria-hidden', 'true');
  stage.appendChild(layer);
  items.forEach((it) => { const im = new Image(); im.src = it.src; });   // 미리 받아 두기 — 첫 장만 늦게 뜨면 리듬이 깨진다

  let run = 0, playing = false, timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function size() { return Math.max(144, Math.min(336, o.map.clientWidth * 0.21)); }   // 10-16 사용자 요청으로 2배 (지도 폭의 21%, 144~336px)
  function place(el: HTMLElement, it: StampSpec, s: number) {
    const r = o.map.getBoundingClientRect(), sr = stage.getBoundingClientRect(), pos = r.width < 600 && it.m ? it.m : it;
    el.style.left = `${r.left - sr.left + r.width * pos.x - s / 2}px`;
    el.style.top = `${r.top - sr.top + r.height * pos.y - s / 2}px`;
    el.style.width = el.style.height = `${s}px`;
  }
  function shake() {
    o.map.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }],
      { duration: 90, easing: 'linear' });
  }
  function puff(el: HTMLElement) {
    const ring = document.createElement('i'); ring.className = 'stamp-puff';
    ring.style.left = el.style.left; ring.style.top = el.style.top; ring.style.width = ring.style.height = el.style.width;
    layer.appendChild(ring);
    ring.animate([{ transform: 'scale(.6)', opacity: .7 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    later(() => ring.remove(), 320);
  }

  function slam(el: HTMLElement, rot: number) {
    if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' }); return; }
    const sh = (b: number, y: number, a: number) => `drop-shadow(0 ${y}px ${b}px rgba(0,0,0,${a}))`;
    el.animate([
      { offset: 0,    opacity: 0, transform: `rotate(${rot + 14}deg) scale(2.2)`,            filter: sh(28, 18, .45), easing: 'cubic-bezier(.55,0,.9,.4)' },
      { offset: .14,  opacity: 1 },
      { offset: LAND / SLAM, opacity: 1, transform: `rotate(${rot - 3}deg) scale(.92)`,    filter: sh(4, 2, .35),   easing: 'cubic-bezier(.2,1.4,.3,1)' },
      { offset: .62,  opacity: 1, transform: `rotate(${rot + 1}deg) scale(1.05) scaleX(1.09)`, filter: sh(3, 2, .35) },
      { offset: 1,    opacity: 1, transform: `rotate(${rot}deg) scale(1)`,                  filter: sh(3, 2, .35) },   /* 마지막 키프레임에 opacity 를 빼면 CSS 기본값 0 으로 되돌아간다 */
    ], { duration: SLAM, fill: 'forwards' });
    later(() => { shake(); puff(el); }, LAND);
  }

  function suck(el: HTMLElement, rot: number, done: () => void) {
    const t = o.target();
    if (!t || reduced()) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }); later(done, 230); return; }
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = t.x - cx, dy = t.y - cy;
    /* 직선이 아니라 살짝 휜 길: 중간점을 진행 방향의 수직으로 비켜 놓아 소용돌이처럼 들어간다 */
    const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, bend = Math.min(90, len * 0.22) * (rot < 0 ? 1 : -1);
    const mx = dx * .5 + nx * bend, my = dy * .5 + ny * bend;
    el.animate([
      { offset: 0,   transform: `translate(0,0) rotate(${rot}deg) scale(1)`, opacity: 1, easing: 'cubic-bezier(.5,0,.8,.3)' },
      { offset: .45, transform: `translate(${mx}px,${my}px) rotate(${rot + 160}deg) scale(.62)`, opacity: 1, easing: 'cubic-bezier(.3,0,.7,.6)' },
      { offset: .92, opacity: .9 },
      { offset: 1,   transform: `translate(${dx}px,${dy}px) rotate(${rot + 540}deg) scale(.04)`, opacity: 0 },
    ], { duration: SUCK, fill: 'forwards' });
    later(done, SUCK);
  }

  function play() {
    cancel(); const my = ++run; playing = true;
    const s = size();
    const els = items.map((it, i) => {
      const el = document.createElement('img'); el.className = 'stamp'; el.src = it.src; el.alt = ''; el.draggable = false;
      place(el, it, s); layer.appendChild(el);
      later(() => { if (run === my) slam(el, it.rot); }, i * STAGGER);
      return el;
    });
    const landedAll = (items.length - 1) * STAGGER + SLAM;
    later(() => {
      if (run !== my) return;
      let left = els.length;
      els.forEach((el, i) => later(() => {
        if (run !== my) return;
        suck(el, items[i].rot, () => { if (run !== my) return; o.onArrive?.(); el.remove(); if (--left === 0) { playing = false; o.onDone?.(); } });
      }, i * SUCK_STAGGER));
    }, landedAll + HOLD);
  }
  function cancel() { run++; clearTimers(); playing = false; layer.replaceChildren(); }

  return { play, cancel, get playing() { return playing; } };
}
