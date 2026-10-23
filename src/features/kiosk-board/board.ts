import './board.css';
import { type XY, type Box, type BoardTransform, boardTransform, bboxOf, distToPoly, inPoly, pathOf, roadsInside, polylinePath } from './geometry';

/* 전시 보드 — 전시 모드를 켜면 섬이 통째로 '신당 5길' 천 조각이 된다.
   · 윤곽: 실제 5길 다각형(kiosk-area.json, 길 위에 붙인 선)을 그대로 섬 크기로 균일 확대(geometry.boardTransform). 겉에 여백은 없다 — 다각형 경계가 곧 길이므로 가장자리에 그 길이 보인다.
   · 바닥: 리넨 사진 한 장(public/board/linen.webp 을 캔버스에 타일링해 큰 <image> 하나로 — <pattern> 타일은 줌아웃에서 줄무늬가 생긴다) + 블랭킷 스티치 가장자리.
   · 길: roads.json 의 **실제 길** 가운데 다각형 안·경계의 토막만. 크림색 아플리케 띠 + 양 가장자리 홈질(띠보다 넓은 점선을 아래 깔아 끝만 보인다).
   · 장식: props.json 의 집·나무 가운데 다각형 안에 있는 것 + content/map/kiosk-board.json 에 사용자가 둔 것(둘 다 사용자가 세운 자리뿐) → 아플리케 그림.
   · 가게: 다각형 안(경계 NEAR 안까지)의 가게를 업종별 무늬의 천 단추로. 누르면 onStore. 범례(HTML)로 업종을 고르면 나머지는 흐려진다.
   · 보드가 켜진 동안(html.kb-on) 섬 위의 원래 층(땅·길·장식·점·랜드마크·밤 층)은 CSS 로 숨긴다. 바다·하늘은 그대로.
   · 켜고 끄는 '연출'(자르기·펼치기·봉제·등장 순서)은 다음 조각(전시 전환)에서. 여기는 그리기와 상태뿐. ?board=1 로 바로 켜 볼 수 있다. */

export interface BoardStore { id: string; name: string; x: number; y: number; category?: string; status?: string }
export interface BoardDecor { kind: string; x: number; y: number; w: number; h: number }          // props.json 의 장식(왼쪽 위 + 폭·높이)
export interface BoardExtra { props?: { kind: string; lat: number; lng: number; h?: number }[]; title?: string; sub?: string }   // kiosk-board.json
export interface BoardOptions {
  svg: SVGSVGElement; before: Element;            // 이 요소 앞에 끼운다(주민 층 앞 = 권역 이름 층)
  host: HTMLElement;                              // 범례(HTML)를 붙일 지도 칸
  polygon: XY[]; roads: Record<string, string>; landBounds: Box;
  decor: BoardDecor[]; extra?: BoardExtra;
  proj: (lat: number, lng: number) => XY;
  onStore: (id: string) => void;
}
export interface Board {
  readonly on: boolean;
  readonly T: BoardTransform;
  show(): void; hide(): void;
  setStores(list: BoardStore[]): void;
  setFilter(cat: string | null): void;
  select(id: string | null): void;
  roadPath(): string;                               // 보드 좌표의 길(걷는 그래프용)
  storeAt(id: string): XY | null;                   // 단추 자리(보드 좌표)
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element | null): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
};
/* 업종 → 무늬·범례 색. 키는 stores.category 와 같다(없으면 etc) */
export const CATS: Record<string, { n: string; sw: string }> = {
  sewing: { n: '봉제', sw: '#cfd9c8' }, supermarket: { n: '슈퍼·마트', sw: '#bfd0e4' }, coffee: { n: '카페', sw: '#f1e4c8' },
  restaurant: { n: '음식점', sw: '#e8b3b1' }, wine: { n: '주점', sw: '#e7c9a8' }, etc: { n: '기타', sw: '#e4d6e6' },
};
const catOf = (s: BoardStore) => (s.category && CATS[s.category] ? s.category : 'etc');
const ROAD_W: Record<string, number> = { a: 34, b: 26, c: 17, d: 11 };   /* 보드 단위 띠 폭(시안 1774px 캔버스의 34·17 을 그대로 — 보드 폭이 비슷하다) */
const NEAR = 12;        /* 경계 바깥 이만큼(지도 단위)까지의 가게도 올린다 — 경계가 길이라 길 건너 가게도 '5길 가게' */
const BTN_R = 24, TICK_STEP = 13, TILE = 160;   /* 단추 반지름 · 블랭킷 스티치 간격 · 리넨 타일 한 변(보드 단위) */
const PROP_SRC: Record<string, string> = { house: 'house', 'house-blue': 'house', oak: 'tree-g', 'oak-dark': 'tree-d', pine: 'tree-d', 'tree-g': 'tree-g', 'tree-d': 'tree-d', sun: 'sun', 'cloud-b': 'cloud-b', 'cloud-g': 'cloud-g', star: 'star' };
const PROP_H: Record<string, number> = { house: 95, oak: 110, 'oak-dark': 100, pine: 100 };   /* 장식 종류별 기본 높이(보드 단위, 시안 값) */

export function mountBoard(o: BoardOptions): Board {
  const poly = o.polygon, T = boardTransform(poly, o.landBounds, 0.9);
  const bp = poly.map(([x, y]) => T.to(x, y)), bb = bboxOf(bp), d = pathOf(bp);
  const html = document.documentElement;

  const g = el('g', { class: 'layer kb', 'aria-hidden': 'true' });
  o.before.parentNode!.insertBefore(g, o.before);
  const defs = el('defs', {}, g);
  el('path', { d }, el('clipPath', { id: 'kb-clip', clipPathUnits: 'userSpaceOnUse' }, defs));
  const glow = el('radialGradient', { id: 'kb-glow', cx: '50%', cy: '45%', r: '70%' }, defs);
  el('stop', { offset: 0, 'stop-color': '#fff8ea', 'stop-opacity': .35 }, glow); el('stop', { offset: 1, 'stop-color': '#fff8ea', 'stop-opacity': 0 }, glow);
  /* 단추 천 무늬: 깅엄(음식점)·물방울(주점)·줄무늬(봉제)·체크(슈퍼)·민무늬(카페)·잔꽃(기타) */
  const pat = (id: string, w: number, bg: string, draw: (p: SVGPatternElement) => void) => { const p = el('pattern', { id, width: w, height: w, patternUnits: 'userSpaceOnUse' }, defs); el('rect', { width: w, height: w, fill: bg }, p); draw(p); };
  pat('kb-p-restaurant', 12, '#f3e3d8', (p) => { el('rect', { width: 6, height: 12, fill: '#d9636a', opacity: .55 }, p); el('rect', { width: 12, height: 6, fill: '#d9636a', opacity: .55 }, p); });
  pat('kb-p-wine', 9, '#f1e2c4', (p) => el('circle', { cx: 4.5, cy: 4.5, r: 1.7, fill: '#8c1e32' }, p));
  pat('kb-p-sewing', 9, '#e6ead8', (p) => el('rect', { width: 3.3, height: 9, fill: '#6f8a73', opacity: .7 }, p));
  pat('kb-p-supermarket', 12, '#dfe6ee', (p) => { el('rect', { width: 6, height: 12, fill: '#5f7fa8', opacity: .55 }, p); el('rect', { width: 12, height: 6, fill: '#5f7fa8', opacity: .55 }, p); });
  pat('kb-p-coffee', 6, '#f4e9d2', (p) => el('rect', { width: 3, height: 3, fill: '#e6d7b8' }, p));
  pat('kb-p-etc', 10, '#ece2ee', (p) => { el('circle', { cx: 5, cy: 5, r: 1.6, fill: '#8d6b95', opacity: .7 }, p); el('circle', { cx: 0, cy: 0, r: 1, fill: '#c9a9cf' }, p); });

  /* 물가: 낮의 얕은 물빛 띠(day.ts 의 .day-shore 와 같은 값)를 보드 윤곽 둘레에 — 원래 섬 둘레의 띠는 보드가 켜진 동안 숨긴다 */
  ([[60, '#bcdad034'], [34, '#c6e0d634'], [14, '#d2e8df3e'], [5, '#eef6f052']] as [number, string][]).forEach(([w, c]) => el('path', { class: 'kb-shore', d, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'miter', transform: 'translate(0,10)' }, g));
  /* 바닥: 그림자 → (clip) 바탕색 → 리넨 → 빛 → 밤 물들임 */
  el('path', { class: 'kb-shadow', d, transform: 'translate(7,11)' }, g);
  const body = el('g', { 'clip-path': 'url(#kb-clip)' }, g);
  el('rect', { class: 'kb-base', x: bb.x0, y: bb.y0, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0 }, body);
  const linen = el('image', { class: 'kb-cloth', x: bb.x0, y: bb.y0, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0, preserveAspectRatio: 'none' }, body);
  el('rect', { x: bb.x0, y: bb.y0, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0, fill: 'url(#kb-glow)' }, body);
  el('rect', { class: 'kb-night', x: bb.x0, y: bb.y0, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0 }, body);
  /* 길(실제 길만): 홈질(넓은 점선) 아래, 크림 띠 위 — 등급 순서 d·c·b·a. 보드 clip 으로 가장자리 길은 반쪽만 보인다(경계 = 길) */
  const roadsG = el('g', { class: 'kb-roads' }, body); let roadD = '';
  for (const k of ['d', 'c', 'b', 'a']) {
    if (!o.roads[k]) continue; const pls = roadsInside(o.roads[k], poly, T); if (!pls.length) continue;
    const pd = polylinePath(pls); roadD += pd;
    el('path', { class: 'kb-stitch', d: pd, 'stroke-width': ROAD_W[k] + 5.5 }, roadsG);
    el('path', { class: 'kb-band', d: pd, 'stroke-width': ROAD_W[k] }, roadsG);
  }
  /* 가장자리: 실 한 줄 + 블랭킷 빗금(안쪽으로) */
  const edge = el('g', { class: 'kb-edge' }, g);
  el('path', { class: 'kb-edge-line', d }, edge);
  for (let i = 0; i < bp.length; i++) {
    const p = bp[i], q = bp[(i + 1) % bp.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 4) continue;
    const tx = (q[0] - p[0]) / L, ty = (q[1] - p[1]) / L; let nx = -ty, ny = tx;
    if (!inPoly(bp, p[0] + tx * 2 + nx * 3, p[1] + ty * 2 + ny * 3)) { nx = -nx; ny = -ny; }   /* n = 안쪽 */
    for (let t = 4; t < L; t += TICK_STEP) {
      const x = p[0] + tx * t, y = p[1] + ty * t;
      el('line', { class: 'kb-tick', x1: (x - nx * 4 + tx * 2).toFixed(1), y1: (y - ny * 4 + ty * 2).toFixed(1), x2: (x + nx * 9).toFixed(1), y2: (y + ny * 9).toFixed(1) }, edge);
    }
  }
  /* 장식(아플리케): props.json 의 다각형 안 장식 + kiosk-board.json 의 추가 장식. 발끝 가운데 기준 */
  const propsG = el('g', { class: 'kb-props' }, g);
  const prop = (kind: string, x: number, y: number, h: number) => { const src = PROP_SRC[kind]; if (!src) return; el('image', { class: 'kb-prop', href: `/board/${src}.webp`, x: (x - h * 0.42).toFixed(1), y: (y - h).toFixed(1), height: h, width: (h * 0.84).toFixed(1), preserveAspectRatio: 'xMidYMax meet' }, propsG); };
  o.decor.filter((p) => inPoly(poly, p.x + p.w / 2, p.y + p.h * 0.9)).forEach((p) => { const [x, y] = T.to(p.x + p.w / 2, p.y + p.h); prop(p.kind, x, y, PROP_H[p.kind] || 90); });
  (o.extra?.props || []).forEach((p) => { const [mx, my] = o.proj(p.lat, p.lng); const [x, y] = T.to(mx, my); prop(p.kind, x, y, p.h || PROP_H[p.kind] || 90); });
  /* 제목: 보드 왼쪽 위(다각형 윗변은 상자 윗변 전체를 지나므로 안쪽이다) */
  const titleG = el('g', { class: 'kb-title' }, g);
  const tx0 = bb.x0 + (bb.x1 - bb.x0) * 0.06, ty0 = bb.y0 + (bb.y1 - bb.y0) * 0.19;   /* 왼쪽 위, 윗변 길과 첫 가로 골목 사이의 빈 자리 */
  const t1 = el('text', { class: 'kb-t1', x: tx0, y: ty0 }, titleG); t1.textContent = o.extra?.title || '신당 5길';
  const t2 = el('text', { class: 'kb-t2', x: tx0, y: ty0 }, titleG); t2.textContent = t1.textContent;
  const t3 = el('text', { class: 'kb-t3', x: tx0 + 4, y: ty0 + 30 }, titleG); t3.textContent = o.extra?.sub || 'SINDANG 5-GIL';

  /* 단추 */
  const btnG = el('g', { class: 'kb-buttons' }, g);
  let btns: { id: string; cat: string; g: SVGGElement; x: number; y: number }[] = [];
  let filter: string | null = null, selected: string | null = null;
  /* 경계 밖(NEAR 안) 가게는 가장 가까운 경계점에서 안쪽으로 밀어 넣는다 */
  const inward = (x: number, y: number): XY => {
    if (inPoly(bp, x, y)) return [x, y];
    let best = Infinity, px = x, py = y;
    for (let i = 0; i < bp.length; i++) { const p = bp[i], q = bp[(i + 1) % bp.length], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)); const cx = p[0] + t * dx, cy = p[1] + t * dy, dd = Math.hypot(x - cx, y - cy); if (dd < best) { best = dd; px = cx; py = cy; } }
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, L = Math.hypot(cx - px, cy - py) || 1;
    return [px + ((cx - px) / L) * (BTN_R + 10), py + ((cy - py) / L) * (BTN_R + 10)];
  };
  function setStores(list: BoardStore[]) {
    btnG.innerHTML = ''; btns = [];
    list.filter((s) => distToPoly(poly, s.x, s.y) <= NEAR).forEach((s) => {
      const [x, y] = inward(...T.to(s.x, s.y)), cat = catOf(s);
      const pos = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, btnG);
      const b = el('g', { class: 'kb-btn' + (s.status === 'up' ? ' up' : ''), 'data-cat': cat, 'data-id': s.id }, pos);
      el('circle', { r: BTN_R + 1, class: 'kb-btn-shadow', transform: 'translate(2.5 4)' }, b);
      el('circle', { class: 'kb-rim', r: BTN_R, fill: `url(#kb-p-${cat})` }, b);
      el('circle', { class: 'kb-ring', r: 18 }, b);
      [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([hx, hy]) => el('circle', { class: 'kb-hole', cx: hx, cy: hy, r: 2.8 }, b));
      el('path', { class: 'kb-thr', d: 'M-6 -6 L6 6 M6 -6 L-6 6' }, b);
      const lab = el('text', { class: 'kb-lab', x: 0, y: -34 }, b); lab.textContent = s.name;
      b.addEventListener('click', (e) => { e.stopPropagation(); o.onStore(s.id); });
      btns.push({ id: s.id, cat, g: b, x, y });
    });
    applyBtnState(); renderLegend();
  }
  function applyBtnState() { btns.forEach((b) => { b.g.classList.toggle('dim', !!filter && b.cat !== filter); b.g.classList.toggle('sel', b.id === selected); }); }

  /* 범례(HTML, 지도 칸 안) — 업종 칩. 누르면 그 업종만 또렷하게 */
  const legend = document.createElement('aside'); legend.className = 'kb-legend'; legend.setAttribute('aria-label', '가게 종류');
  legend.innerHTML = '<h2>가게 종류</h2><ul></ul><p class="kb-note">단추를 누르면 가게가 열려요</p>';
  o.host.appendChild(legend);
  const ul = legend.querySelector('ul')!;
  function renderLegend() {
    ul.innerHTML = '';
    Object.entries(CATS).forEach(([k, c]) => {
      const n = btns.filter((b) => b.cat === k).length; if (!n && k !== 'etc') return;
      const li = document.createElement('li'); li.dataset.cat = k; li.className = filter === k ? 'active' : '';
      li.innerHTML = `<span class="sw" style="background:${c.sw}"></span>${c.n}<small>${n}</small>`;
      li.onclick = () => setFilter(filter === k ? null : k);
      ul.appendChild(li);
    });
  }
  function setFilter(cat: string | null) { filter = cat; applyBtnState(); ul.querySelectorAll('li').forEach((li) => li.classList.toggle('active', (li as HTMLElement).dataset.cat === filter)); }

  /* 리넨: 타일 사진을 캔버스에 깔아 큰 그림 하나로 */
  let linenReady = false;
  function loadLinen() {
    if (linenReady) return; linenReady = true;
    const im = new Image(); im.src = '/board/linen.webp';
    im.onload = () => {
      const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0, px = 2;   /* 보드 1단위 = 2px */
      const c = document.createElement('canvas'); c.width = Math.ceil(w * px); c.height = Math.ceil(h * px);
      const ctx = c.getContext('2d'); if (!ctx) return;
      const tile = TILE * px; for (let y = 0; y < c.height; y += tile) for (let x = 0; x < c.width; x += tile) ctx.drawImage(im, x, y, tile, tile);
      linen.setAttribute('href', c.toDataURL('image/jpeg', 0.86)); linen.classList.add('ready');
    };
  }

  let on = false;
  return {
    get on() { return on; }, T,
    show() { on = true; loadLinen(); g.classList.add('on'); html.classList.add('kb-on'); legend.classList.add('show'); },
    hide() { on = false; g.classList.remove('on'); html.classList.remove('kb-on'); legend.classList.remove('show'); },
    setStores, setFilter,
    select(id) { selected = id; applyBtnState(); },
    roadPath: () => roadD,
    storeAt: (id) => { const b = btns.find((x) => x.id === id); return b ? [b.x, b.y] : null; },
  };
}
