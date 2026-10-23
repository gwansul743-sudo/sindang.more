import './board.css';
import { type XY, type Box, bboxOf, distToPoly, inPoly, pathOf, roadsInside, polylinePath, boardTransform, type BoardTransform, type HideShape, hiddenBy, cutHidden, mergeChains, extendToCoast, insideRuns } from './geometry';

/* 전시 보드 — 전시 모드를 켜면 섬이 통째로 '신당 5길' 천 섬이 된다. 모양·연출·톤은 시안 MORE_exhibition_dynamic_v2.html 그대로(10-23 사용자 결정, 낮/밤 구분 없음).
   길만 실제 길이다: 재단선(kiosk-cut.json) 안의 roads.json 길을 섬 덩어리에 맞춰 넣는다 — 큰 길(a·b)은 굵은 띠 + 양 가장자리 홈질, 골목(c)은 흰 띠 위 점선.
   · 좌표: 시안 캔버스(1774×887) 단위를 그대로 쓴다. 캔버스는 지도 좌표에 1:1 로, 캔버스 가운데가 섬 가운데에 오도록 놓는다(C). 가게·길 자리는 실제 좌표 → 재단선 상자를 섬 덩어리에 맞춘 변환(R) → 캔버스.
   · 연출(play): ⓪ 화면이 밤색으로 어두워지고(0.4s) ① 검은 화면 위에 빨간 재단선이 그려진 뒤(1.0s) ② 어둠 속에서 보드가 조각 자리에서 떠올라 섬만큼 펴지고 어둠이 걷힌다(1.5s) ③ 블랭킷 스티치·하늘·물결 ④ 길 홈질 ⑤ 집·나무 ⑥ 단추 ⑦ 제목 ⑧ onChief(이장님·말풍선·큰 상자는 엔진이) → 끝나면 rest(): 범례·주민.
   · 켜진 동안 html.kb-on: 섬 위 원래 층은 사라지고(1.1s) 바다는 시안 색. 엔진은 카메라(view)·이장님·주민 그래프(roadPath·land)만 맡는다. */

export interface BoardStore { id: string; name: string; x: number; y: number; category?: string; status?: string }
export interface BoardContent { hideRoads?: HideShape[]; title?: string; sub?: string; titleAt?: number[]; chiefAt?: number[]; props?: (string | number)[][]; sky?: (string | number)[][]; waves?: number[][] }
export interface BoardOptions {
  svg: SVGSVGElement; before: Element;            // 이 요소 앞에 끼운다(주민 층 앞)
  host: HTMLElement;                              // 범례(HTML)를 붙일 지도 칸
  cut: XY[];                                      // 재단선(지도 좌표) — 실이 도는 선이자, 보드에 넣을 실제 길·가게의 범위
  roads: Record<string, string>; landBounds: Box; content: BoardContent;
  onStore: (id: string) => void;
}
export interface BoardLand { polygon: XY[]; bounds: Box; contains(x: number, y: number): boolean }   // 주민 길 그래프용(actors/roadGraph 의 LandGeometry 와 같은 모양)
export interface Board {
  readonly on: boolean;
  view(): { x: number; y: number; w: number; h: number; iw: number };     // 카메라가 담을 지도 범위(캔버스 전체) + 섬 덩어리 폭(폰은 이 폭에 맞춘다)
  play(h: { onChief: () => void }): void;                     // 연출 시작. 제목 뒤 0.5s 에 onChief
  skip(): void;                                               // 연출 없이 바로 다 보이게(이장님 호출은 안 함)
  rest(): void;                                               // 범례·주민
  hide(): void;
  setStores(list: BoardStore[]): void; setFilter(cat: string | null): void; select(id: string | null): void;
  roadPath(): string;                                         // 지도 좌표의 길(주민 그래프)
  land: BoardLand;                                            // 섬 덩어리(지도 좌표)
  chiefAt(): XY;                                              // 이장님 자리(지도 좌표)
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element | null): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
};
export const CATS: Record<string, { n: string; sw: string }> = {
  sewing: { n: '봉제', sw: '#cfd9c8' }, supermarket: { n: '슈퍼', sw: '#bfd0e4' }, coffee: { n: '커피', sw: '#f1e4c8' },
  restaurant: { n: '음식점', sw: '#e8b3b1' }, wine: { n: '주점', sw: '#e7c9a8' }, etc: { n: '기타', sw: '#e4d6e6' },
};
const catOf = (s: BoardStore) => (s.category && CATS[s.category] ? s.category : 'etc');
const CW = 1774, CH = 887;                                   /* 시안 캔버스 */
const ISLAND = (() => { const cx = 887, cy = 452, rx = 560, ry = 300, n = 56, pts: XY[] = [];   /* 시안의 섬 덩어리 */
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, w = 1 + 0.06 * Math.sin(a * 5.3 + 1) + 0.045 * Math.sin(a * 9.1 + 2.2) + 0.03 * Math.sin(a * 13.7); pts.push([cx + Math.cos(a) * rx * w * (1 + 0.08 * Math.cos(a * 2)), cy + Math.sin(a) * ry * w]); }
  return pts; })();
const NEAR = 12, BTN_R = 24, BTN_K = 0.4, TICK_STEP = 13;   /* BTN_K: 단추 축소 배율(10-23 0.55 → 0.4) */
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const T0 = 400 + 300;    /* 어둠(0.4s) + 잠깐(0.3s) 뒤에 보드가 펴지기 시작한다. 빨간 재단선 그리기는 10-23 사용자 요청으로 뺐다(전엔 +1.0s) */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountBoard(o: BoardOptions): Board {
  const html = document.documentElement, c = o.content;
  /* 변환: 캔버스 → 지도(C, 1:1 평행이동), 실제 → 캔버스(R, 재단선 상자를 섬 덩어리 상자의 0.92 에 맞춤) */
  const cx0 = (o.landBounds.x0 + o.landBounds.x1) / 2, cy0 = (o.landBounds.y0 + o.landBounds.y1) / 2;
  const C = { x: cx0 - CW / 2, y: cy0 - CH / 2 };
  const toMap = ([x, y]: XY): XY => [x + C.x, y + C.y];
  const ib = bboxOf(ISLAND), R: BoardTransform = boardTransform(o.cut, ib, 0.92);
  const islandD = pathOf(ISLAND);

  const g = el('g', { class: 'layer kb', transform: `translate(${C.x.toFixed(1)},${C.y.toFixed(1)})`, 'aria-hidden': 'true' });
  o.before.parentNode!.insertBefore(g, o.before);
  const defs = el('defs', {}, g);
  el('path', { d: islandD }, el('clipPath', { id: 'kb-clip', clipPathUnits: 'userSpaceOnUse' }, defs));
  const glow = el('radialGradient', { id: 'kb-glow', cx: '50%', cy: '45%', r: '70%' }, defs);
  el('stop', { offset: 0, 'stop-color': '#fff8ea', 'stop-opacity': .33 }, glow); el('stop', { offset: 1, 'stop-color': '#fff8ea', 'stop-opacity': 0 }, glow);
  const pat = (id: string, w: number, bg: string, draw: (p: SVGPatternElement) => void) => { const p = el('pattern', { id, width: w, height: w, patternUnits: 'userSpaceOnUse' }, defs); el('rect', { width: w, height: w, fill: bg }, p); draw(p); };
  pat('kb-p-restaurant', 12, '#f3e3d8', (p) => { el('rect', { width: 6, height: 12, fill: '#d9636a', opacity: .55 }, p); el('rect', { width: 12, height: 6, fill: '#d9636a', opacity: .55 }, p); });
  pat('kb-p-wine', 9, '#f1e2c4', (p) => el('circle', { cx: 4.5, cy: 4.5, r: 1.7, fill: '#8c1e32' }, p));
  pat('kb-p-sewing', 9, '#e6ead8', (p) => el('rect', { width: 3.3, height: 9, fill: '#6f8a73', opacity: .7 }, p));
  pat('kb-p-supermarket', 12, '#dfe6ee', (p) => { el('rect', { width: 6, height: 12, fill: '#5f7fa8', opacity: .55 }, p); el('rect', { width: 12, height: 6, fill: '#5f7fa8', opacity: .55 }, p); });
  pat('kb-p-coffee', 6, '#f4e9d2', (p) => el('rect', { width: 3, height: 3, fill: '#e6d7b8' }, p));
  pat('kb-p-etc', 10, '#ece2ee', (p) => { el('circle', { cx: 5, cy: 5, r: 1.6, fill: '#8d6b95', opacity: .7 }, p); el('circle', { cx: 0, cy: 0, r: 1, fill: '#c9a9cf' }, p); });
  pat('kb-p-title', 14, '#f7e9ea', (p) => { el('rect', { width: 7, height: 14, fill: '#c2444f', opacity: .6 }, p); el('rect', { width: 14, height: 7, fill: '#c2444f', opacity: .6 }, p); });

  /* ⓪ 어둠: 지도 칸을 덮는 밤색 막(낮→밤 커튼 색). 그 위에 재단선이 그려지고 보드가 펴진 뒤 걷힌다 */
  const dark = document.createElement('div'); dark.className = 'kb-shade'; dark.setAttribute('aria-hidden', 'true'); o.host.appendChild(dark);
  /* 하늘·물결(바다 위, 보드 밖) */
  const skyG = el('g', { class: 'kb-sky' }, g);
  const skyEls = (c.sky || []).map(([kind, x, y, w]) => el('image', { class: 'kb-skyimg kb-' + kind, href: `/board/${kind}.webp`, x, y, width: w, height: +w * (kind === 'sun' ? 0.996 : kind === 'star' ? 1 : 0.7) }, skyG));
  const waveEls = (c.waves || []).map(([x, y]) => el('path', { class: 'kb-wave', d: `M${x} ${y} q 10 -8 20 0 t 20 0 t 20 0` }, skyG));

  /* 보드(펼쳐지는 덩어리): 그림자 → (clip) 바탕·리넨·빛 → 길 → 가장자리 → 장식 → 제목 → 단추 */
  const board = el('g', { class: 'kb-board' }, g);
  el('path', { class: 'kb-shadow', d: islandD, transform: 'translate(7,11)' }, board);
  const body = el('g', { 'clip-path': 'url(#kb-clip)' }, board);
  el('rect', { class: 'kb-base', x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0 }, body);
  const linen = el('image', { class: 'kb-cloth', x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0, preserveAspectRatio: 'none' }, body);
  el('rect', { x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0, fill: 'url(#kb-glow)' }, body);
  /* 길(실제): 큰 길 a·b = 굵은 띠 + 양 가장자리 홈질(띠보다 넓은 점선을 아래 깔아 끝만 보인다), 골목 c = 흰 띠 위 점선 */
  const roadsG = el('g', { class: 'kb-roads' }, body);
  /* 정돈(10-23): ① 숨길 자리(hideRoads, 골목만)를 잘라 내고 ② 맞닿은 토막을 한 줄로 이어 점선 박자를 맞추고 ③ 막다른 큰 길은 섬 가장자리까지 늘려 실에 물려 끝나게
     ④ 골목 점선은 큰 길 띠 안에서 가린다(mask) — 띠 위로 골목 점선이 지나가던 것 */
  const hidden = hiddenBy(c.hideRoads || []);
  const roadsOf = (keys: string[]) => keys.flatMap((k) => (o.roads[k] ? roadsInside(o.roads[k], o.cut, R, 2.5) : []));
  const alley = mergeChains(cutHidden(roadsOf(['c']), hidden));
  const main0 = mergeChains(roadsOf(['a', 'b'])), main = extendToCoast(main0, ISLAND, main0);
  const mainD = polylinePath(main), alleyD = polylinePath(alley);
  const mask = el('mask', { id: 'kb-alley-mask', maskUnits: 'userSpaceOnUse', x: ib.x0 - 50, y: ib.y0 - 50, width: ib.x1 - ib.x0 + 100, height: ib.y1 - ib.y0 + 100 }, defs);
  el('rect', { x: ib.x0 - 50, y: ib.y0 - 50, width: ib.x1 - ib.x0 + 100, height: ib.y1 - ib.y0 + 100, fill: '#fff' }, mask);
  if (mainD) el('path', { d: mainD, fill: 'none', stroke: '#000', 'stroke-width': 36, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);
  if (mainD) { el('path', { class: 'kb-stitch main', d: mainD }, roadsG); el('path', { class: 'kb-band main', d: mainD }, roadsG); }
  if (alleyD) { el('path', { class: 'kb-band alley', d: alleyD }, roadsG); el('path', { class: 'kb-stitch alley', d: alleyD, mask: 'url(#kb-alley-mask)' }, roadsG); }
  const roadMapD = polylinePath(insideRuns([...main, ...alley], ISLAND).map((pl) => pl.map(toMap)));
  /* 가장자리: 실 + 블랭킷 빗금(바늘 따라 드러남) */
  const edge = el('g', { class: 'kb-edge' }, board);
  el('path', { class: 'kb-edge-line', d: islandD }, edge);
  const ticks: { at: number; el: SVGLineElement }[] = [];
  { let tot = 0; const segs = ISLAND.map((p, i) => { const q = ISLAND[(i + 1) % ISLAND.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); tot += L; return { p, q, L }; }); let acc = 0;
    segs.forEach(({ p, q, L }) => { const nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L; for (let t = 4; t < L; t += TICK_STEP) { const x = p[0] + ((q[0] - p[0]) * t) / L, y = p[1] + ((q[1] - p[1]) * t) / L; ticks.push({ at: (acc + t) / tot, el: el('line', { class: 'kb-tick', x1: (x + nx * 5 + ((q[0] - p[0]) / L) * 2).toFixed(1), y1: (y + ny * 5 + ((q[1] - p[1]) / L) * 2).toFixed(1), x2: (x - nx * 8).toFixed(1), y2: (y - ny * 8).toFixed(1) }, edge) }); } acc += L; }); }
  /* 장식(아플리케, 시안 자리 그대로): [종류, x 가운데, y 발끝, 높이] */
  const propsG = el('g', { class: 'kb-props' }, board);
  const propEls = (c.props || []).map(([kind, x, y, h]) => { const w = +h * 0.84; return el('image', { class: 'kb-prop', href: `/board/${kind}.webp`, x: (+x - w / 2).toFixed(1), y: (+y - +h).toFixed(1), width: w.toFixed(1), height: h, preserveAspectRatio: 'xMidYMax meet' }, propsG); });
  /* 제목(천 글자) */
  const titleG = el('g', { class: 'kb-title' }, board); const [tx, ty] = c.titleAt || [470, 215];
  const t1 = el('text', { class: 'kb-t1', x: tx, y: ty, fill: 'url(#kb-p-title)' }, titleG); t1.textContent = c.title || '신당 5길';
  const t2 = el('text', { class: 'kb-t2', x: tx, y: ty }, titleG); t2.textContent = t1.textContent;
  if (c.sub) { const t3 = el('text', { class: 'kb-t3', x: tx + 4, y: ty + 33 }, titleG); t3.textContent = c.sub; }   /* 부제는 kiosk-board.json 에 sub 가 있을 때만 (10-23 사용자 요청으로 뺌) */

  /* 단추(가게 — 실제 자리) */
  const btnG = el('g', { class: 'kb-buttons' }, board);
  let btns: { id: string; cat: string; g: SVGGElement }[] = [], filter: string | null = null, selected: string | null = null;
  const inward = (x: number, y: number): XY => {   /* 섬 밖이면 가장 가까운 가장자리에서 안쪽으로 */
    if (inPoly(ISLAND, x, y)) return [x, y];
    let best = Infinity, px = x, py = y;
    for (let i = 0; i < ISLAND.length; i++) { const p = ISLAND[i], q = ISLAND[(i + 1) % ISLAND.length], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)); const ex = p[0] + t * dx, ey = p[1] + t * dy, dd = Math.hypot(x - ex, y - ey); if (dd < best) { best = dd; px = ex; py = ey; } }
    const L = Math.hypot(887 - px, 452 - py) || 1; return [px + ((887 - px) / L) * (BTN_R * BTN_K + 12), py + ((452 - py) / L) * (BTN_R * BTN_K + 12)];
  };
  let on = false, composed = false;
  function setStores(list: BoardStore[]) {
    btnG.innerHTML = ''; btns = [];
    list.filter((s) => distToPoly(o.cut, s.x, s.y) <= NEAR).forEach((s, i) => {
      const [x, y] = inward(...R.to(s.x, s.y)), cat = catOf(s);
      const pos = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, btnG);
      const bo = el('g', { class: 'kb-btn' + (s.status === 'up' ? ' up' : '') + (on && composed ? ' in' : ''), 'data-cat': cat, 'data-id': s.id }, pos);
      const b = el('g', { transform: `scale(${BTN_K})` }, bo);   /* 10-23 단추·이름표 작게(시안의 0.4배) — 안쪽 그룹에 배율, 바깥(.kb-btn)은 등장 애니메이션 */
      el('circle', { r: BTN_R + 1, class: 'kb-btn-shadow', transform: 'translate(2.5 4)' }, b);
      el('circle', { class: 'kb-rim', r: BTN_R, fill: `url(#kb-p-${cat})` }, b);
      el('circle', { class: 'kb-ring', r: 18 }, b);
      [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([hx, hy]) => el('circle', { class: 'kb-hole', cx: hx, cy: hy, r: 2.8 }, b));
      el('path', { class: 'kb-thr', d: 'M-6 -6 L6 6 M6 -6 L-6 6' }, b);
      const num = el('text', { class: 'kb-num', x: 0, y: 50 }, b); num.textContent = String(i + 1);
      const lab = el('text', { class: 'kb-lab', x: 0, y: -34 }, b); lab.textContent = s.name;
      bo.addEventListener('click', (e) => { e.stopPropagation(); o.onStore(s.id); });
      btns.push({ id: s.id, cat, g: bo });
    });
    applyBtnState(); renderLegend();
  }
  const applyBtnState = () => btns.forEach((b) => { b.g.classList.toggle('dim', !!filter && b.cat !== filter); b.g.classList.toggle('sel', b.id === selected); });

  /* 범례(HTML) */
  const legend = document.createElement('aside'); legend.className = 'kb-legend'; legend.setAttribute('aria-label', '신당 5길의 가게들');
  legend.innerHTML = '<h2>신당 5길의 가게들</h2><ul></ul><p class="kb-note">누르면 그 업종만 남아요 · 다시 누르면 전체</p>';
  o.host.appendChild(legend); const ul = legend.querySelector('ul')!;
  function renderLegend() {
    ul.innerHTML = '';
    Object.entries(CATS).forEach(([k, cc]) => { const n = btns.filter((b) => b.cat === k).length; if (!n && k !== 'etc') return;
      const li = document.createElement('li'); li.dataset.cat = k; li.className = filter === k ? 'active' : '';
      li.innerHTML = `<span class="sw" style="background:${cc.sw}"></span>${cc.n}<small>${n}</small>`; li.onclick = () => setFilter(filter === k ? null : k); ul.appendChild(li); });
  }
  function setFilter(cat: string | null) { filter = cat; applyBtnState(); ul.querySelectorAll('li').forEach((li) => li.classList.toggle('active', (li as HTMLElement).dataset.cat === filter)); }

  /* 리넨: 타일 사진을 캔버스에 깔아 큰 그림 하나로(<pattern> 은 줌아웃에서 줄무늬) */
  let linenReady = false;
  function loadLinen() {
    if (linenReady) return; linenReady = true;
    const im = new Image(); im.src = '/board/linen.webp';
    im.onload = () => { const w = ib.x1 - ib.x0, h = ib.y1 - ib.y0, px = 1.5, cv = document.createElement('canvas'); cv.width = Math.ceil(w * px); cv.height = Math.ceil(h * px);
      const ctx = cv.getContext('2d'); if (!ctx) return; const tile = 310 * px; for (let y = 0; y < cv.height; y += tile) for (let x = 0; x < cv.width; x += tile) ctx.drawImage(im, x, y, tile, tile);
      linen.setAttribute('href', cv.toDataURL('image/jpeg', 0.86)); linen.classList.add('ready'); };
  }

  /* 접힘 변환: 보드(캔버스 좌표)의 섬 덩어리 → 재단선 자리(캔버스 좌표로 옮긴 실제 자리) */
  const cb = bboxOf(o.cut), k = Math.min((cb.x1 - cb.x0) / (ib.x1 - ib.x0), (cb.y1 - cb.y0) / (ib.y1 - ib.y0)) / 0.92;
  const foldT = `translate(${((cb.x0 + cb.x1) / 2 - C.x).toFixed(1)}px,${((cb.y0 + cb.y1) / 2 - C.y).toFixed(1)}px) scale(${k.toFixed(4)}) translate(${(-(ib.x0 + ib.x1) / 2).toFixed(1)}px,${(-(ib.y0 + ib.y1) / 2).toFixed(1)}px)`;
  const fold = () => { board.style.transform = foldT; }, open = () => { board.style.transform = 'translate(0,0) scale(1)'; };

  let run = 0, timers: number[] = [], raf = 0;
  const at = (fn: () => void, t: number) => timers.push(window.setTimeout(fn, t * SLOW));
  const clear = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };
  const showAll = (yes: boolean) => { ticks.forEach((t) => t.el.classList.toggle('show', yes)); propEls.forEach((p) => p.classList.toggle('in', yes)); btns.forEach((b) => b.g.classList.toggle('in', yes)); titleG.classList.toggle('in', yes); skyEls.forEach((s) => s.classList.toggle('in', yes)); waveEls.forEach((w) => w.classList.toggle('in', yes)); composed = yes; };
  const reset = () => { clear(); g.classList.remove('on', 'cutting', 'arrived', 'roads-on', 'lift'); dark.classList.remove('on'); showAll(false); html.classList.remove('kb-on', 'kb-dark', 'kb-rest'); legend.classList.remove('show'); setFilter(null); selected = null; applyBtnState(); };
  const skip = () => { ++run; clear(); on = true; loadLinen(); g.classList.add('mounted', 'on', 'arrived', 'roads-on'); g.classList.remove('cutting', 'lift'); dark.classList.remove('on'); html.classList.add('kb-on'); html.classList.remove('kb-dark'); open(); showAll(true); };

  return {
    get on() { return on; }, land: { polygon: ISLAND.map(toMap), bounds: { x0: ib.x0 + C.x, y0: ib.y0 + C.y, x1: ib.x1 + C.x, y1: ib.y1 + C.y }, contains: (x, y) => inPoly(ISLAND, x - C.x, y - C.y) },
    view: () => ({ x: cx0, y: cy0, w: CW, h: CH, iw: ib.x1 - ib.x0 }),
    chiefAt: () => toMap([(c.chiefAt || [905, 430])[0], (c.chiefAt || [905, 430])[1]]),
    roadPath: () => roadMapD,
    play({ onChief }) {
      const my = ++run; reset(); on = true; loadLinen(); g.classList.add('mounted'); fold(); void (board as unknown as HTMLElement).getBoundingClientRect();
      if (reduced()) { skip(); at(onChief, 300); return; }
      /* ⓪ 화면이 밤색으로 어두워진다(0.35s). 어둠이 다 덮이면 옛 섬·바다는 그 아래서 바뀐다(html.kb-dark: 전환 없이 바로) */
      dark.classList.add('on');
      at(() => { if (my !== run) return; html.classList.add('kb-on', 'kb-dark'); g.classList.add('on'); }, 400);   /* ① 어둠이 다 덮이면 그 아래서 옛 섬·바다를 바꾼다(빨간 재단선은 그리지 않는다) */
      at(() => { if (my !== run) return; g.classList.add('lift'); open(); dark.classList.remove('on'); html.classList.remove('kb-dark'); }, T0);   /* ② 어둠이 걷히는(1.4s) 동안 보드가 윤곽 자리에서 떠올라 펴진다(1.5s) */
      at(() => { if (my !== run) return; g.classList.add('arrived');                                     /* ③ 가장자리 꿰매기 · 하늘 · 물결 */
        const t1 = performance.now(); const step = () => { if (my !== run) return; const p = Math.min(1, (performance.now() - t1) / (1300 * SLOW)); ticks.forEach((t) => { if (t.at <= p) t.el.classList.add('show'); }); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step);
        skyEls.forEach((s, i) => at(() => s.classList.add('in'), 200 + i * 150)); waveEls.forEach((w, i) => at(() => w.classList.add('in'), 300 + i * 90)); }, T0 + 1500);
      at(() => { if (my !== run) return; g.classList.add('roads-on'); }, T0 + 1500 + 1100);              /* ④ 길 홈질 */
      propEls.forEach((p, i) => at(() => { if (my === run) p.classList.add('in'); }, T0 + 1500 + 1900 + i * 110));   /* ⑤ 집·나무 */
      const tBtn = T0 + 1500 + 1900 + propEls.length * 110 + 200;
      btns.forEach((b, i) => at(() => { if (my === run) b.g.classList.add('in'); }, tBtn + i * 150));    /* ⑥ 단추 */
      const tTitle = tBtn + btns.length * 150 + 200;
      at(() => { if (my !== run) return; titleG.classList.add('in'); composed = true; }, tTitle);        /* ⑦ 제목 */
      at(() => { if (my === run) onChief(); }, tTitle + 500);                                             /* ⑧ 이장님(엔진) */
    },
    skip,
    rest() { html.classList.add('kb-rest'); legend.classList.add('show'); },
    hide() { ++run; on = false; reset(); g.classList.remove('mounted'); },
    setStores, setFilter, select(id) { selected = id; applyBtnState(); },
  };
}
