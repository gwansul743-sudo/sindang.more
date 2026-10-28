import type { StoryLayerSpec, StoryPage, StoryTopic } from './story';
import type { DioVillagers } from './dioWalkers';

/* 이야기 겹 그림(10-28) — 이야기가 열린 동안만 .kb-story-layer(보드 캔버스 좌표) 안에 그린다. 닫히면 story.ts 가 통째로 DOM 에서 지운다.
   렌더러 = (ctx) → { page(i, p) }: 열 때 한 번 불리고, 장이 바뀔 때마다 page() 로 상태만 바꾼다. 움직임은 opacity·scale 만(CSS). */
export interface LayerCtx {
  root: SVGGElement;                                       // 이 겹 그림의 자리(.kb-story-layer 안의 <g>)
  spec: StoryLayerSpec; topic: StoryTopic;
  go(i: number): void;                                     // 그 장으로
  alive(): boolean;                                        // 아직 이 이야기가 열려 있나(늦은 콜백 막기)
  later(fn: () => void, ms: number): void;                 // alive 일 때만 부르는 setTimeout
  load(name: string): Promise<unknown>;                    // content/board-story/ 의 데이터 파일(처음 쓸 때 받음)
  slot(el: HTMLElement | null): void;                      // 상자 본문 아래 칸(범례·조작 막대). 닫히면 story.ts 가 비운다
  hold(on: boolean): void;                                 // true 인 동안 이야기 45초 자동 닫기를 멈춘다(자동 재생 중)
  host: HTMLElement;                                       // #map — HTML 겹(디오라마 무대)을 붙일 칸
  toBoard(lat: number, lng: number): [number, number];     // 실제 위경도 → 보드 캔버스(길과 같은 변환)
  spots(): StoreSpot[];                                    // 보드 가게 단추 자리(캔버스) + 이름표 칸
  villagers: DioVillagers | null;                          // 보드에서 걷는 주민(해 디오라마 속을 같이 걷는다)
}
export interface StoreSpot { id: string; name: string; x: number; y: number; r: number; lab: { x0: number; y0: number; x1: number; y1: number } | null }
export interface LayerCtl { page(i: number, p: StoryPage): void; destroy?(instant?: boolean): void }   // destroy: SVG 밖(HTML)에 만든 것·타이머 정리. instant 가 아니면 나가는 장면을 보여도 된다
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

/* 건물 나이(sewing): 실제 건물 바닥(국토부 GIS건물통합정보, sewing-buildings.json)을 길과 같은 변환으로 보드에 놓고 지어진 연대별로 칠한다.
   요소는 연대마다 path 하나 + '정보 없음' 하나(약 10개) — 건물마다 하나씩 만들면 팬·줌이 무거워진다(CLAUDE.md §8). 섬 밖은 kb-clip 으로 자른다.
   색은 오래된 것 = 짙은 와인 → 빨강·테라코타 → 새것 = 보드 바탕에 가까운 크림(보드 팔레트 값). 장의 layer.highlight:
   null → 숨김 · [from, to](연도) → 그 연대만 또렷하게, 나머지 0.15 · "all" → 모두. spec: { data, decades, unknown } */
const AGE_COLORS = ['#7d2030', '#9b3d49', '#b23a48', '#c2444f', '#d9636a', '#e8b3b1', '#e7c9a8', '#f1e4c8', '#fbf3e2'];
interface Building { y: number | null; r: number[][][] }
const buildingsAge: Renderer = async (c) => {
  const decades = (c.spec.decades as number[]) || [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010], unknown = String(c.spec.unknown ?? '정보 없음');
  const data = (await c.load(String(c.spec.data))) as { b: Building[] };
  if (!c.alive()) return null;
  const d: string[] = decades.map(() => ''); let dn = '';
  for (const b of data.b) {
    const ring = b.r.map((r) => r.map(([lat, lng], i) => { const [x, y] = c.toBoard(lat, lng); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + 'Z').join('');
    if (b.y == null) { dn += ring; continue; }
    let k = decades.length - 1; while (k > 0 && b.y < decades[k]) k--;   /* 1930 전은 1930년대에, 2020 뒤는 2010년대에 */
    d[k] += ring;
  }
  const g = el('g', { class: 'kb-age', 'clip-path': 'url(#kb-clip)' }, c.root);
  const paths = decades.map((dec, i) => el('path', { class: 'kb-age-d', d: d[i] || 'M0 0', fill: AGE_COLORS[Math.round((i * (AGE_COLORS.length - 1)) / Math.max(1, decades.length - 1))], 'data-dec': dec }, g));
  const none = el('path', { class: 'kb-age-none', d: dn || 'M0 0' }, g);
  /* 범례 띠: 연대 9칸 + 정보 없음 */
  const lg = document.createElement('ul'); lg.className = 'kb-age-legend';
  const item = (label: string, color: string | null) => { const li = document.createElement('li'), sw = document.createElement('i'); if (color) sw.style.background = color; li.append(sw, label); lg.appendChild(li); return li; };
  const items = decades.map((dec, i) => item(`${dec}년대`, paths[i].getAttribute('fill')));
  const liNone = item(unknown, null); liNone.className = 'none';
  c.slot(lg);
  return { page(_i, p) {
    const h = (p.layer as { highlight?: unknown } | null | undefined)?.highlight ?? null;
    g.classList.toggle('on', h != null); lg.classList.toggle('off', h == null);
    const inRange = (dec: number) => h === 'all' || (Array.isArray(h) && dec + 9 >= h[0] && dec <= h[1]);
    paths.forEach((pa, i) => { const on = inRange(decades[i]); pa.classList.toggle('dim', !on); items[i].classList.toggle('dim', !on); });
    const noneOn = h === 'all'; none.classList.toggle('dim', !noneOn); liNone.classList.toggle('dim', !noneOn);
  } };
};

/* 해 디오라마는 코드가 커서 해 이야기를 열 때 받는다(첫 화면 무게, CLAUDE.md §8) */
const diorama: Renderer = async (c) => (await import('./sun')).diorama(c);

export const RENDERERS: Record<string, Renderer> = { constellation, 'buildings-age': buildingsAge, diorama };
