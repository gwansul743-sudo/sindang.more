import type { StoryLayerSpec, StoryPage, StoryTopic } from './story';

/* 이야기 겹 그림(10-28) — 이야기가 열린 동안만 .kb-story-layer(보드 캔버스 좌표) 안에 그린다. 닫히면 story.ts 가 통째로 DOM 에서 지운다.
   렌더러 = (ctx) → { page(i, p) }: 열 때 한 번 불리고, 장이 바뀔 때마다 page() 로 상태만 바꾼다. 움직임은 opacity·scale 만(CSS). */
export interface LayerCtx {
  root: SVGGElement;                                       // 이 겹 그림의 자리(.kb-story-layer 안의 <g>)
  spec: StoryLayerSpec; topic: StoryTopic;
  go(i: number): void;                                     // 그 장으로
  alive(): boolean;                                        // 아직 이 이야기가 열려 있나(늦은 콜백 막기)
  later(fn: () => void, ms: number): void;                 // alive 일 때만 부르는 setTimeout
  load(name: string): Promise<unknown>;                    // content/board-story/ 의 데이터 파일(처음 쓸 때 받음)
  toBoard(lat: number, lng: number): [number, number];     // 실제 위경도 → 보드 캔버스(길과 같은 변환)
}
export interface LayerCtl { page(i: number, p: StoryPage): void }
export type Renderer = (c: LayerCtx) => LayerCtl | null | Promise<LayerCtl | null>;

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent.appendChild(e); return e;
};

/* 별자리(star): 하늘의 별 근처에 작은 별 일곱 개가 하나씩 떠오르고 홈질 선으로 이어진다. 장 1~7 ↔ 별 1~7(0·마지막 장은 모두 켬).
   지금 장의 별은 크고 밝게, 나머지는 0.5. 작은 별을 누르면 그 장으로(story.ts 가 data-page 를 본다). spec: { at: [[x, y] × 7], size } */
const constellation: Renderer = (c) => {
  const at = (c.spec.at as number[][]) || [], size = Number(c.spec.size) || 27, n = at.length;
  const g = el('g', { class: 'kb-const' }, c.root);
  el('path', { class: 'kb-const-line', d: at.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') }, g);
  const stars = at.map(([x, y], i) => {
    const s = el('g', { class: 'kb-const-star', 'data-page': i + 1, role: 'button', 'aria-label': `${i + 1}번째 별` }, g);
    el('circle', { cx: x, cy: y, r: Math.max(22, size * 0.8), fill: 'transparent' }, s);   /* 누르는 칸 */
    el('image', { href: '/board/star.webp', x: x - size / 2, y: y - size / 2, width: size, height: size }, s);
    return s;
  });
  stars.forEach((s, i) => c.later(() => s.classList.add('in'), 120 + i * 140));
  c.later(() => g.classList.add('lined'), 120 + n * 140);
  return { page(i) { const k = i >= 1 && i <= n ? i : 0; g.classList.toggle('pick', !!k); stars.forEach((s, j) => s.classList.toggle('cur', j + 1 === k)); } };
};

export const RENDERERS: Record<string, Renderer> = { constellation };
