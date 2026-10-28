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
  cover(el: HTMLElement | null): void;
  close(): void;                                           // 이야기 닫기(길잡이 '보드')                     // 상자 본문 자리를 잠시 이것으로(건물 카드). null 이면 본문으로
  hold(on: boolean): void;                                 // true 인 동안 이야기 45초 자동 닫기를 멈춘다(자동 재생 중)
  host: HTMLElement;                                       // #map — HTML 겹(디오라마 무대)을 붙일 칸
  island: number[][];                                      // 섬 덩어리(보드 캔버스 좌표)
  openPhoto(urls: string[], i: number, label: string): void;   // 사진 크게 보기
  toBoard(lat: number, lng: number): [number, number];     // 실제 위경도 → 보드 캔버스(길과 같은 변환)
  spots(): StoreSpot[];                                    // 보드 가게 단추 자리(캔버스) + 이름표 칸
  villagers: DioVillagers | null;                          // 보드에서 걷는 주민(해 디오라마 속을 같이 걷는다)
  top: SVGGElement | null;                                 // 단추·이름표 위 층(닫히면 story.ts 가 비운다)
  obstacles(): { x0: number; y0: number; x1: number; y1: number }[];   // 장식 칸(캔버스)
  camera: { focus(x: number, y: number, mul: number, dx?: number): void; restore(): void } | null;   // 카메라 잠깐 당기기(보드 캔버스) · 되돌리기
  /* 상자 접기(TASK_18, 해 이야기만): foldable(true) 면 왼쪽 손잡이·접힌 띠가 생긴다. fold(on) 은 이 장의 기본값 — 사람이 고른 것이 있으면(장이 바뀔 때까지) 무시.
     peek: 무대 폭은 그대로 두고 상자만 잠깐 편다(덮어 보이기). user: 사람이 고른 것처럼(지도 위 '자세히 ›') */
  foldable(on: boolean): void;
  fold(on: boolean, how?: { peek?: boolean; user?: boolean }): void;
}
export interface StoreSpot { id: string; name: string; x: number; y: number; r: number; lab: { x0: number; y0: number; x1: number; y1: number } | null }
export interface LayerCtl { page(i: number, p: StoryPage): void; destroy?(instant?: boolean): void; back?(): boolean }   // back: Esc·✕ 를 먼저 받는다(고른 건물 풀기) — true 면 이야기는 그대로   // destroy: SVG 밖(HTML)에 만든 것·타이머 정리. instant 가 아니면 나가는 장면을 보여도 된다
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
interface Outside { name: string; latlng: number[]; img?: string; cap?: string }
const WIND = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
const inPoly = (poly: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c; } return c; };
const buildingsAge: Renderer = async (c) => {
  const decades = (c.spec.decades as number[]) || [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010], unknown = String(c.spec.unknown ?? '정보 없음');
  const data = (await c.load(String(c.spec.data))) as { b: Building[] };
  if (!c.alive()) return null;
  const d: string[] = decades.map(() => ''); let dn = '';
  const cnt = decades.map(() => 0), sx = decades.map(() => 0), sy = decades.map(() => 0); let nUnknown = 0, lat0 = 0, lng0 = 0;   /* 연대별 수·가운데(지도 위 막대·캡션) */
  for (const b of data.b) {
    let mx = 0, my = 0, mn = 0;
    const ring = b.r.map((r) => r.map(([lat, lng], i) => { const [x, y] = c.toBoard(lat, lng); mx += x; my += y; mn++; if (!i) { lat0 += lat; lng0 += lng; } return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + 'Z').join('');
    if (b.y == null) { dn += ring; nUnknown++; continue; }
    let k = decades.length - 1; while (k > 0 && b.y < decades[k]) k--;   /* 1930 전은 1930년대에, 2020 뒤는 2010년대에 */
    d[k] += ring; cnt[k]++; if (mn) { sx[k] += mx / mn; sy[k] += my / mn; }
  }
  const rings0 = data.b.reduce((a, b) => a + b.r.length, 0) || 1, centre = [lat0 / rings0, lng0 / rings0];   /* 섬 가운데(위경도) — 건물 가운데들의 평균 */
  const g = el('g', { class: 'kb-age', 'clip-path': 'url(#kb-clip)' }, c.root);
  const paths = decades.map((dec, i) => el('path', { class: 'kb-age-d', d: d[i] || 'M0 0', fill: AGE_COLORS[Math.round((i * (AGE_COLORS.length - 1)) / Math.max(1, decades.length - 1))], 'data-dec': dec }, g));
  const none = el('path', { class: 'kb-age-none', d: dn || 'M0 0' }, g);
  /* 범례 띠: 연대 9칸 + 정보 없음 */
  const lg = document.createElement('ul'); lg.className = 'kb-age-legend';
  const item = (label: string, color: string | null) => { const li = document.createElement('li'), sw = document.createElement('i'); if (color) sw.style.background = color; li.append(sw, label); lg.appendChild(li); return li; };
  const items = decades.map((dec, i) => item(`${dec}년대`, paths[i].getAttribute('fill')));
  const liNone = item(unknown, null); liNone.className = 'none';
  c.slot(lg);
  /* 지도 위 연대 막대(왼쪽 아래 바다 위, 천 조각): 연대마다 막대 하나 + 건물 수. 누르면 그 연대만 잠깐(장이 바뀔 때까지) */
  const strip = document.createElement('div'); strip.className = 'kb-age-strip';
  const maxN = Math.max(...cnt, nUnknown, 1);
  strip.innerHTML = '<b>지어진 때</b><ol>' + decades.map((dec, i) => `<li data-k="${i}"><em>${cnt[i]}</em><i style="height:${((cnt[i] / maxN) * 100).toFixed(0)}%;background:${paths[i].getAttribute('fill')}"></i><span>${String(dec).slice(2)}</span></li>`).join('')
    + `<li class="none"><em>${nUnknown}</em><i style="height:${((nUnknown / maxN) * 100).toFixed(0)}%"></i><span>?</span></li></ol>`;
  ['pointerdown', 'wheel', 'click'].forEach((ev) => strip.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
  strip.querySelectorAll<HTMLElement>('li[data-k]').forEach((li) => li.addEventListener('click', () => { const dec = decades[+li.dataset.k!]; apply([dec, dec + 9]); }));
  c.host.appendChild(strip); requestAnimationFrame(() => strip.classList.add('show'));
  /* 떠 있는 캡션: 강조한 건물들의 가운데 위 '1930~40년대 · 62채' */
  const capG = el('g', { class: 'kb-age-cap' }, c.root), capR = el('rect', { rx: 4 }, capG), capT = el('text', {}, capG);
  const outG = el('g', { class: 'kb-age-out' }, c.root);
  function apply(h: unknown) {
    g.classList.toggle('on', h != null); lg.classList.toggle('off', h == null);
    const inRange = (dec: number) => h === 'all' || (Array.isArray(h) && dec + 9 >= h[0] && dec <= h[1]);
    paths.forEach((pa, i) => { const on = inRange(decades[i]); pa.classList.toggle('dim', !on); items[i].classList.toggle('dim', !on); });
    const noneOn = h === 'all'; none.classList.toggle('dim', !noneOn); liNone.classList.toggle('dim', !noneOn);
    strip.querySelectorAll<HTMLElement>('li[data-k]').forEach((li) => li.classList.toggle('hi', h != null && inRange(decades[+li.dataset.k!])));
    strip.querySelector('li.none')!.classList.toggle('hi', noneOn);
    const ks = decades.map((_, i) => i).filter((i) => h != null && inRange(decades[i])), n = ks.reduce((a, i) => a + cnt[i], 0) + (noneOn ? nUnknown : 0);
    if (!ks.length || !n) { capG.classList.remove('on'); return; }
    const cx = ks.reduce((a, i) => a + sx[i], 0) / Math.max(1, ks.reduce((a, i) => a + cnt[i], 0)), cy = ks.reduce((a, i) => a + sy[i], 0) / Math.max(1, ks.reduce((a, i) => a + cnt[i], 0));
    const first = decades[ks[0]], last = decades[ks[ks.length - 1]];
    capT.textContent = h === 'all' ? `모든 건물 · ${n}채` : first === last ? `${first}년대 · ${n}채` : `${first}~${String(last).slice(2)}년대 · ${n}채`;
    capT.setAttribute('x', cx.toFixed(1)); capT.setAttribute('y', (cy - 34).toFixed(1));
    const w = capT.textContent.length * 12.5 + 18; capR.setAttribute('x', (cx - w / 2).toFixed(1)); capR.setAttribute('y', (cy - 34 - 13).toFixed(1)); capR.setAttribute('width', w.toFixed(1)); capR.setAttribute('height', '26');
    capG.classList.remove('on'); void capG.getBoundingClientRect(); capG.classList.add('on');
  }
  /* 섬 밖 장소(layer.outside): 섬 가운데에서 그쪽 방향으로 섬 가장자리에 화살표 + '광희문 · 서쪽 약 1km' (+ 동그란 사진, 누르면 크게) */
  function outside(list: Outside[] | undefined) {
    outG.replaceChildren(); if (!list?.length || !c.island.length) return;
    const isl = c.island, ox = isl.reduce((a, q) => a + q[0], 0) / isl.length, oy = isl.reduce((a, q) => a + q[1], 0) / isl.length;
    list.forEach((pl, k) => {
      const dN = (pl.latlng[0] - centre[0]) * 110574, dE = (pl.latlng[1] - centre[1]) * 111320 * Math.cos((centre[0] * Math.PI) / 180), km = Math.hypot(dN, dE) / 1000;
      const brg = ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360, wind = WIND[Math.round(brg / 22.5) % 16];
      const dist = km < 1 ? Math.round(km * 10) / 10 : Math.round(km * 2) / 2, ux = dE / (Math.hypot(dN, dE) || 1), uy = -dN / (Math.hypot(dN, dE) || 1);
      let t = 0; while (t < 2000 && inPoly(isl, ox + ux * t, oy + uy * t)) t += 4;   /* 가운데에서 그 방향으로 섬 가장자리까지 */
      const ex = ox + ux * (t + 8), ey = oy + uy * (t + 8), a = Math.atan2(uy, ux), L = 46;
      const og = el('g', { class: 'kb-out', transform: `translate(${ex.toFixed(1)},${ey.toFixed(1)})` }, outG);
      el('path', { class: 'kb-out-arrow', d: `M0 0L${L} 0M${L - 11} -8L${L} 0L${L - 11} 8`, transform: `rotate(${((a * 180) / Math.PI).toFixed(1)})` }, og);
      const lx = ux * (L + 18), ly = uy * (L + 18), anchor = ux < -0.3 ? 'end' : ux > 0.3 ? 'start' : 'middle';
      const tx = el('text', { class: 'kb-out-lab', x: lx.toFixed(1), y: (ly + 5).toFixed(1), 'text-anchor': anchor }, og); tx.textContent = `${pl.name} · ${wind}쪽 약 ${dist}km`;
      if (pl.img) {
        const src = `/board/story/${c.topic.id}/${pl.img}`, id = `kb-out-clip-${k}`, cx = lx + (anchor === 'end' ? -36 : anchor === 'start' ? 36 : 0), cy = ly - 40, R = 26;
        el('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: R }, el('clipPath', { id }, og));
        const im = el('image', { class: 'kb-out-img', href: src, x: (cx - R).toFixed(1), y: (cy - R).toFixed(1), width: R * 2, height: R * 2, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }, og);
        el('circle', { class: 'kb-out-ring', cx: cx.toFixed(1), cy: cy.toFixed(1), r: R }, og);
        im.addEventListener('click', (e) => { e.stopPropagation(); c.openPhoto([src], 0, pl.cap || pl.name); });
      }
    });
  }
  return {
    page(_i, p) { const L = (p.layer || {}) as { highlight?: unknown; outside?: Outside[] }; apply(L.highlight ?? null); outside(L.outside); },
    destroy() { strip.remove(); },
  };
};

/* 해 디오라마는 코드가 커서 해 이야기를 열 때 받는다(첫 화면 무게, CLAUDE.md §8) */
const diorama: Renderer = async (c) => (await import('./sun')).diorama(c);

/* 구름(그늘길)·나무(쉼)도 이야기를 열 때 받는다 */
const shade: Renderer = async (c) => (await import('./cloudRest')).shade(c);
const rest: Renderer = async (c) => (await import('./cloudRest')).rest(c);

export const RENDERERS: Record<string, Renderer> = { constellation, 'buildings-age': buildingsAge, diorama, shade, rest };
