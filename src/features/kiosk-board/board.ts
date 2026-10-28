import './board.css';
import { type XY, type Box, bboxOf, distToPoly, inPoly, pathOf, roadsInside, polylinePath, boardTransform, type BoardTransform, type HideShape, hiddenBy, cutHidden, mergeChains, extendToCoast, insideRuns, nearHidden, polyLen } from './geometry';

/* 전시 보드 — 전시 모드를 켜면 섬이 통째로 '신당 5길' 천 섬이 된다. 모양·연출·톤은 시안 MORE_exhibition_dynamic_v2.html 그대로(10-23 사용자 결정, 낮/밤 구분 없음).
   길만 실제 길이다: 재단선(kiosk-cut.json) 안의 roads.json 길을 섬 덩어리에 맞춰 넣는다 — 큰 길(a·b)은 굵은 띠 + 양 가장자리 홈질, 골목(c)은 흰 띠 위 점선.
   · 좌표: 시안 캔버스(1774×887) 단위를 그대로 쓴다. 캔버스는 지도 좌표에 1:1 로, 캔버스 가운데가 섬 가운데에 오도록 놓는다(C). 가게·길 자리는 실제 좌표 → 재단선 상자를 섬 덩어리에 맞춘 변환(R) → 캔버스.
   · 연출(play): ⓪ 화면이 밤색으로 어두워지고(0.4s) ① 검은 화면 위에 빨간 재단선이 그려진 뒤(1.0s) ② 어둠 속에서 보드가 조각 자리에서 떠올라 섬만큼 펴지고 어둠이 걷힌다(1.5s) ③ 블랭킷 스티치·하늘·물결 ④ 길 홈질 ⑤ 집·나무 ⑥ 단추 ⑦ 제목 ⑧ onChief(이장님·말풍선·큰 상자는 엔진이) → 끝나면 rest(): 범례·주민.
   · 켜진 동안 html.kb-on: 섬 위 원래 층은 사라지고(1.1s) 바다는 시안 색. 엔진은 카메라(view)·이장님·주민 그래프(roadPath·land)만 맡는다. */

export interface BoardStore { id: string; name: string; x: number; y: number; category?: string; status?: string }
export interface BoardContent { hideRoads?: HideShape[]; hideMain?: HideShape[]; showRoads?: HideShape[]; route?: number[][]; title?: string; sub?: string; titleAt?: number[]; titleImg?: (string | number)[]; labelAt?: Record<string, number[]>; featured?: string[]; chiefAt?: number[]; props?: (string | number)[][]; sky?: (string | number)[][]; waves?: number[][] }
export interface BoardOptions {
  svg: SVGSVGElement; before: Element;            // 이 요소 앞에 끼운다(주민 층 앞)
  host: HTMLElement;                              // 범례(HTML)를 붙일 지도 칸
  cut: XY[];                                      // 재단선(지도 좌표) — 실이 도는 선이자, 보드에 넣을 실제 길·가게의 범위
  roads: Record<string, string>; landBounds: Box; content: BoardContent;
  onStore: (id: string) => void;
  onCluster?: (ids: string[], x: number, y: number) => void;   // (10-28 이후 안 부름 — 보드는 숫자 단추 대신 모아 붙인 단추. 엔진 호환용으로만 남김)
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
  focusList(): { id: string; x: number; y: number }[];        // 자동 순환용: 보이는(필터에 걸리지 않은) 단추 자리(지도 좌표), 왼쪽→오른쪽
  focus(id: string | null): void;                             // 자동 순환 중 강조(콩콩 뛰는 단추)
  roadPath(): string;                                         // 지도 좌표의 길(주민 그래프)
  land: BoardLand;                                            // 섬 덩어리(지도 좌표)
  chiefAt(): XY;                                              // 이장님 자리(지도 좌표)
  storyTargets(): { topic: string; el: SVGGraphicsElement }[];  // 이야기 상자(10-28, features/board-story): data-story 가 붙은 하늘·소품 그림
  storyLayer: SVGGElement;                                    // 이야기 겹 그림을 넣을 층(길 위, 장식·제목·단추 아래 — 10-28 건물 겹 그림 위로 집·나무가 보이게). 이야기가 닫히면 비운다
  toBoard(x: number, y: number): XY;                          // 지도 좌표(실제 자리) → 보드 캔버스(길과 같은 변환 R)
  islandPath: string;                                         // 섬 덩어리(캔버스 좌표) — 이야기가 열린 동안 보드만 살짝 어둡게
}
/* 이야기 상자(10-28): 그림 종류 → 이야기 주제(content/board-story/{주제}.json). 나무는 모두 '쉼', 구름 둘은 '구름' */
const STORY: Record<string, string> = { sewing: 'sewing', 'tree-g': 'rest', 'tree-d': 'rest', sun: 'sun', 'cloud-b': 'cloud', 'cloud-g': 'cloud', star: 'star' };

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element | null): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
};
export const CATS: Record<string, { n: string; sw: string }> = {
  sewing: { n: '봉제', sw: '#cfd9c8' }, supermarket: { n: '슈퍼', sw: '#bfd0e4' }, coffee: { n: '커피', sw: '#f1e4c8' },
  restaurant: { n: '음식점', sw: '#e8b3b1' }, wine: { n: '주점', sw: '#e7c9a8' }, etc: { n: '기타', sw: '#e4d6e6' },
};
/* 단추 그림(10-23, 사용자 제공 천 단추 4종 → public/board/btn-*.webp, 봉제는 10-28 민트 물방울 단추). 모두 240px 칸에 단추 원을 꽉 채운다. 없는 업종(슈퍼)은 예전 무늬 단추 */
const BTN_IMG: Record<string, string> = { coffee: '/board/btn-coffee.webp', restaurant: '/board/btn-restaurant.webp', wine: '/board/btn-wine.webp', etc: '/board/btn-etc.webp', sewing: '/board/btn-sewing.webp' };
const catOf = (s: BoardStore) => (s.category && CATS[s.category] ? s.category : 'etc');
const CW = 1774, CH = 887;                                   /* 시안 캔버스 */
const ISLAND = (() => { const cx = 887, cy = 452, rx = 560, ry = 300, n = 56, pts: XY[] = [];   /* 시안의 섬 덩어리 */
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, w = 1 + 0.06 * Math.sin(a * 5.3 + 1) + 0.045 * Math.sin(a * 9.1 + 2.2) + 0.03 * Math.sin(a * 13.7); pts.push([cx + Math.cos(a) * rx * w * (1 + 0.08 * Math.cos(a * 2)), cy + Math.sin(a) * ry * w]); }
  return pts; })();
const NEAR = 12, BTN_R = 24, BTN_K = 0.7, TICK_STEP = 13;   /* BTN_K: 단추 배율(10-23 0.55 → 0.4 → 0.55 → 0.7) */
const MINOR_K = 0.5, BUND_K = 0.78, TOUCH = 0.94, GAP = 1.5;   /* 10-28 위계: 작은 단추(강조 아닌 가게)는 큰 단추의 0.5배, 묶인 큰 단추는 0.78배, 묶음 안 단추 간격(1 = 딱 맞닿음, 작으면 살짝 포개 꿰맨 듯) */
const MINOR_HIT = 14, LAB_FS = 15, LAB_PX = 8, LAB_PY = 5, MINOR_FS = 10;   /* 작은 단추 누르는 칸 반지름 · 이름표 글자 크기·안쪽 여백 · 작은 이름 글씨 크기(캔버스 단위) */
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
  const skyEls = (c.sky || []).map(([kind, x, y, w]) => el('image', { class: 'kb-skyimg kb-' + kind, href: `/board/${kind}.webp`, x, y, width: w, height: +w * (kind === 'sun' ? 0.996 : kind === 'star' ? 1 : 0.7), ...(STORY[kind] ? { 'data-story': STORY[kind] } : {}) }, skyG));
  const waveEls = (c.waves || []).map(([x, y]) => el('path', { class: 'kb-wave', d: `M${x} ${y} q 10 -8 20 0 t 20 0 t 20 0` }, skyG));

  /* 보드(펼쳐지는 덩어리): 그림자 → (clip) 바탕·리넨·빛 → 길 → 가장자리 → 장식 → 제목 → 단추 */
  const board = el('g', { class: 'kb-board' }, g);
  el('path', { class: 'kb-shadow', d: islandD, transform: 'translate(7,11)' }, board);
  const body = el('g', { 'clip-path': 'url(#kb-clip)' }, board);
  el('rect', { class: 'kb-base', x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0 }, body);
  const linen = el('image', { class: 'kb-cloth', x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0, preserveAspectRatio: 'none' }, body);
  el('rect', { class: 'kb-tint', x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0 }, body);   /* 리넨 위 옅은 베이지(10-23) */
  el('rect', { x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0, fill: 'url(#kb-glow)' }, body);
  /* 길(실제): 큰 길 a·b = 굵은 띠 + 양 가장자리 홈질(띠보다 넓은 점선을 아래 깔아 끝만 보인다), 골목 c = 흰 띠 위 점선 */
  const roadsG = el('g', { class: 'kb-roads' }, body);
  /* 정돈(10-23): ① 숨길 자리(hideRoads, 골목만)를 잘라 내고 ② 맞닿은 토막을 한 줄로 이어 점선 박자를 맞추고 ③ 막다른 큰 길은 섬 가장자리까지 늘려 실에 물려 끝나게
     ④ 골목 점선은 큰 길 띠 안에서 가린다(mask) — 띠 위로 골목 점선이 지나가던 것 */
  /* showRoads(10-28): 숨긴 자리 안이라도 이 띠 안의 토막은 다시 그린다 — 해안 쪽 골목 셋만 되살리고 붙은 가지는 계속 숨긴다 */
  const hid0 = hiddenBy(c.hideRoads || []), shown = hiddenBy(c.showRoads || []), hidden = (x: number, y: number) => hid0(x, y) && !shown(x, y);
  const roadsOf = (keys: string[]) => keys.flatMap((k) => (o.roads[k] ? roadsInside(o.roads[k], o.cut, R, 2.5) : []));
  const alley = mergeChains(cutHidden(roadsOf(['c']), hidden));
  /* 큰 길: hideMain 자리를 잘라 내고, 그 자리에 붙어 남은 짧은 조각(60 미만)은 버리고, 잘린 끝은 해안까지 늘리지 않는다 */
  const hidMain = hiddenBy(c.hideMain || []), nearMain = nearHidden(hidMain);
  const main0 = mergeChains(cutHidden(roadsOf(['a', 'b']), hidMain)).filter((pl) => polyLen(pl) >= 60 || !(nearMain(pl[0]) || nearMain(pl[pl.length - 1])));
  const main = extendToCoast(main0, ISLAND, main0, 160, 22, nearMain);
  const mainD = polylinePath(main), alleyD = polylinePath(alley);
  if (mainD) { el('path', { class: 'kb-stitch main', d: mainD }, roadsG); el('path', { class: 'kb-band main', d: mainD }, roadsG); }
  if (alleyD) el('path', { class: 'kb-band alley', d: alleyD }, roadsG);   /* 골목은 흰 띠만 — 점선은 10-23 사용자 요청으로 뺐다(정신없어 보임) */
  /* 동선(10-28): 정해 둔 길 가운데에만 연한 빨간 점선. 큰 길 띠(폭 24)·홈질(폭 29) 안으로 점선이 삐져나오지 않게
     2 단위로 촘촘히 짚어 큰 길 중심선에서 ROUTE_GAP 안쪽인 곳은 빼고 그린다(끝은 띠 가장자리에서, 가운데서 큰 길을 건너면 그 자리만 비운다) */
  if (c.route && c.route.length > 1) {
    const ROUTE_GAP = 16, r = c.route as XY[];
    const segD = (p: XY, a: XY, b: XY) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    const onMain = (p: XY) => main.some((pl) => pl.some((q, i) => i > 0 && segD(p, pl[i - 1], q) < ROUTE_GAP));
    const runs: XY[][] = []; let cur: XY[] = [];
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) { const q: XY = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]; if (onMain(q)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(q); }
    }
    if (cur.length > 1) runs.push(cur);
    if (runs.length) el('path', { class: 'kb-route', d: polylinePath(runs) }, roadsG);
  }
  const roadMapD = polylinePath(insideRuns([...main, ...alley], ISLAND).map((pl) => pl.map(toMap)));
  /* 가장자리: 실 + 블랭킷 빗금(바늘 따라 드러남) */
  const edge = el('g', { class: 'kb-edge' }, board);
  el('path', { class: 'kb-edge-line', d: islandD }, edge);
  const ticks: { at: number; el: SVGLineElement }[] = [];
  { let tot = 0; const segs = ISLAND.map((p, i) => { const q = ISLAND[(i + 1) % ISLAND.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); tot += L; return { p, q, L }; }); let acc = 0;
    segs.forEach(({ p, q, L }) => { const nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L; for (let t = 4; t < L; t += TICK_STEP) { const x = p[0] + ((q[0] - p[0]) * t) / L, y = p[1] + ((q[1] - p[1]) * t) / L; ticks.push({ at: (acc + t) / tot, el: el('line', { class: 'kb-tick', x1: (x + nx * 5 + ((q[0] - p[0]) / L) * 2).toFixed(1), y1: (y + ny * 5 + ((q[1] - p[1]) / L) * 2).toFixed(1), x2: (x - nx * 8).toFixed(1), y2: (y - ny * 8).toFixed(1) }, edge) }); } acc += L; }); }
  /* 장식(아플리케, 시안 자리 그대로): [종류, x 가운데, y 발끝, 높이] */
  const storyLayer = el('g', { class: 'kb-story-layer' }, board);   /* 이야기 겹 그림(10-28): 비어 있다가 이야기가 열린 동안만 */
  const propsG = el('g', { class: 'kb-props' }, board);
  const PROP_W: Record<string, number> = { bench: 1.17, 'bench-s': 1.63, sewing: 1.55, sign: 0.74, hedge: 1.65, 'house-check': 0.9 };   /* 그림 가로:세로(기본 0.84 = 집·나무). 벤치+가로등('펠트 패치워크' 3행 4~5열, 10-26)은 가로로 넓다. 팻말·덤불은 '학교 캠퍼스 펠트' 4행 8·9열(10-26). bench-s 는 가로등 없는 벤치만, sewing 은 학교 자리의 천 재봉틀(10-26 사용자 제공). house-check 는 '펠트 패치워크' 1행 1열 집(10-26) */
  const propEls = (c.props || []).map(([kind, x, y, h]) => { const w = +h * (PROP_W[kind] ?? 0.84); return el('image', { class: 'kb-prop', href: `/board/${kind}.webp`, x: (+x - w / 2).toFixed(1), y: (+y - +h).toFixed(1), width: w.toFixed(1), height: h, preserveAspectRatio: 'xMidYMax meet', ...(STORY[kind] ? { 'data-story': STORY[kind] } : {}) }, propsG); });
  /* 제목(천 글자) */
  const titleG = el('g', { class: 'kb-title' }, board); const [tx, ty] = c.titleAt || [470, 215];
  if (c.titleImg) {   /* 제목 그림(10-26 사용자 제공): [주소, 왼쪽, 위, 폭, 높이, 기울기(도, 선택)] 캔버스 단위. 없으면 아래 천 글자 */
    const [href, ix, iy, iw, ih, deg = 0] = c.titleImg;
    const im = el('image', { class: 'kb-timg', href, x: ix, y: iy, width: iw, height: ih, transform: `rotate(${deg} ${+ix + +iw / 2} ${+iy + +ih / 2})` }, titleG); im.setAttribute('aria-label', c.title || '신당 5길');
  } else {
    const t1 = el('text', { class: 'kb-t1', x: tx, y: ty, fill: 'url(#kb-p-title)' }, titleG); t1.textContent = c.title || '신당 5길';
    const t2 = el('text', { class: 'kb-t2', x: tx, y: ty }, titleG); t2.textContent = t1.textContent;
  }
  if (c.sub) { const t3 = el('text', { class: 'kb-t3', x: tx + 4, y: ty + 33 }, titleG); t3.textContent = c.sub; }   /* 부제는 kiosk-board.json 에 sub 가 있을 때만 (10-23 사용자 요청으로 뺌) */

  /* 단추(가게 — 실제 자리). 위계(10-28): kiosk-board.json featured(가게 이름 목록, 전시 1회용 — DB 칸 아님)에 든 가게는 큰 단추 + 천 이름표, 나머지는 작은 단추 + 작은 이름 글씨.
     이름은 띄어쓰기를 빼고 비교하고, 세 글자 이상이면 한쪽이 다른 쪽을 품어도 같은 가게로 본다('우리들깨' = '우리들깨칼국수').
     · 큰 단추끼리 겹치면 숫자 단추로 합치지 않는다 — 실제 자리들의 가운데로 모아 맞닿게 붙인다(2곳 나란히 · 3곳 세모 · 4곳 이상 둥글게, BUND_K 만큼 작게).
       모은 묶음끼리 또 닿으면 하나로 합치지 않고 묶음째 밀어 띄운다(동네 모양을 덜 뭉갠다).
       보드는 단추·이름표가 지도와 같이 커져 확대해도 겹침이 풀리지 않으므로 자리는 캔버스 단위로 한 번 정한다(가게가 바뀔 때만 — 업종 필터는 자리를 바꾸지 않는다).
     · 큰 단추 이름표는 빈 자리를 찾아 놓는다(placeLabels): 혼자 선 단추는 위가 먼저, 묶음은 각 단추가 놓인 바깥 방향. 단추에서 떨어지면 빨간 홈질 실로 잇는다.
       손으로 정하려면 kiosk-board.json labelAt: { "가게 이름": [dx, dy] } — 단추 가운데에서 이름표 가운데까지(캔버스 단위).
     · 작은 단추는 큰 단추·이름표를 피해 살짝 비켜 서고, 이름 글씨도 빈 자리를 찾는다(위가 먼저, 단추에 붙여서).
     · featured 목록이 비어 있으면 전부 큰 단추 — 예전 모습 */
  const btnG = el('g', { class: 'kb-buttons' }, board);
  const minorG = el('g', {}, btnG), leadG = el('g', {}, btnG), featG = el('g', {}, btnG), labG = el('g', {}, btnG), minorLabG = el('g', {}, btnG);
  type Btn = { id: string; name: string; cat: string; feat: boolean; img: boolean; ox: number; oy: number; x: number; y: number; k: number; r: number; bund: boolean; bc?: XY;
    pos: SVGGElement; g: SVGGElement; inner: SVGGElement; lab: SVGGElement; lw: number; lh: number; lx: number; ly: number; lead?: SVGLineElement };
  let btns: Btn[] = [], filter: string | null = null, selected: string | null = null;
  const inward = (x: number, y: number): XY => {   /* 섬 밖이면 가장 가까운 가장자리에서 안쪽으로 */
    if (inPoly(ISLAND, x, y)) return [x, y];
    let best = Infinity, px = x, py = y;
    for (let i = 0; i < ISLAND.length; i++) { const p = ISLAND[i], q = ISLAND[(i + 1) % ISLAND.length], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)); const ex = p[0] + t * dx, ey = p[1] + t * dy, dd = Math.hypot(x - ex, y - ey); if (dd < best) { best = dd; px = ex; py = ey; } }
    const L = Math.hypot(887 - px, 452 - py) || 1; return [px + ((887 - px) / L) * (BTN_R * BTN_K + 12), py + ((452 - py) / L) * (BTN_R * BTN_K + 12)];
  };
  const radius = (b: Btn) => (b.img ? BTN_R * 1.25 : BTN_R + 1) * b.k;   /* 단추 동그라미 반지름(캔버스 단위) — 그림 단추는 그림이 원보다 조금 크다 */
  const norm = (n: string) => n.replace(/\s+/g, '').toLowerCase();
  const measure = (() => { const cx = document.createElement('canvas').getContext('2d');
    return (t: string, fs: number) => { if (!cx) return t.length * fs; cx.font = `700 ${fs}px ${getComputedStyle(html).getPropertyValue('--font-ui').trim() || 'sans-serif'}`; return cx.measureText(t).width - t.length * fs * 0.025; }; })();
  const labW = (t: string, feat: boolean) => (feat ? Math.ceil(measure(t, LAB_FS)) + LAB_PX * 2 : Math.ceil(measure(t, MINOR_FS)) + 4);
  let on = false, composed = false, btnsOn = false;   /* btnsOn: 단추는 이장님 대화가 끝난 뒤(rest)에 보인다(10-23) */
  function setStores(list: BoardStore[]) {
    [minorG, leadG, featG, labG, minorLabG].forEach((e) => { e.innerHTML = ''; }); btns = [];
    const inside = list.filter((s) => distToPoly(o.cut, s.x, s.y) <= NEAR), favs = (c.featured || []).map(norm).filter(Boolean);
    const isFav = (n: string) => { const k = norm(n); return favs.some((f) => f === k || (Math.min(f.length, k.length) >= 3 && (k.includes(f) || f.includes(k)))); };
    inside.forEach((s) => {
      const [x, y] = inward(...R.to(s.x, s.y)), cat = catOf(s), feat = favs.length ? isFav(s.name) : true, img = !!BTN_IMG[cat];
      const pos = el('g', {}, feat ? featG : minorG);
      const bo = el('g', { class: 'kb-btn' + (feat ? '' : ' minor') + (s.status === 'up' ? ' up' : '') + (on && btnsOn ? ' in' : ''), 'data-cat': cat, 'data-id': s.id }, pos);
      const inner = el('g', {}, bo);   /* 배율은 layout 이 준다(큰·묶음·작은). 바깥(.kb-btn)은 등장 애니메이션 */
      el('circle', { r: BTN_R + 1, class: 'kb-btn-shadow', transform: 'translate(2.5 4)' }, inner);
      if (img) {   /* 그림 단추: 고를 때·비출 때 테두리는 그림 둘레의 점선 원(.kb-rim, 평소엔 안 보임) */
        const S = BTN_R * 2.5; el('image', { class: 'kb-img', href: BTN_IMG[cat], x: -S / 2, y: -S / 2, width: S, height: S }, inner);
        el('circle', { class: 'kb-rim kb-rim-img', r: BTN_R + 6 }, inner);
      } else {
        el('circle', { class: 'kb-rim', r: BTN_R, fill: `url(#kb-p-${cat})` }, inner);
        el('circle', { class: 'kb-ring', r: 18 }, inner);
        [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([hx, hy]) => el('circle', { class: 'kb-hole', cx: hx, cy: hy, r: 2.8 }, inner));
        el('path', { class: 'kb-thr', d: 'M-6 -6 L6 6 M6 -6 L-6 6' }, inner);
      }
      if (!feat) el('circle', { class: 'kb-hit', r: MINOR_HIT / (BTN_K * MINOR_K) }, inner);   /* 작은 단추도 손가락으로 누르기 쉽게(보이지 않는 칸) */
      /* 이름표: 큰 단추는 크림 천 조각 + 안쪽 홈질 + 이름, 작은 단추는 작은 이름 글씨만(외곽선). 캔버스 단위, 배율 없음 */
      const lw = labW(s.name, feat), lh = feat ? LAB_FS + LAB_PY * 2 : MINOR_FS + 3;
      const lab = el('g', { class: 'kb-lg' + (feat ? '' : ' minor') }, feat ? labG : minorLabG);
      if (feat) {
        el('rect', { class: 'kb-tag', x: -lw / 2, y: -lh / 2, width: lw, height: lh, rx: 3 }, lab);
        el('rect', { class: 'kb-tag-st', x: -lw / 2 + 2.5, y: -lh / 2 + 2.5, width: lw - 5, height: lh - 5, rx: 1.5 }, lab);
      }
      const t = el('text', { class: feat ? 'kb-lab' : 'kb-lab kb-lab-s', x: 0, y: 0.5 }, lab); t.textContent = s.name;
      const b: Btn = { id: s.id, name: s.name, cat, feat, img, ox: x, oy: y, x, y, k: BTN_K, r: 0, bund: false, pos, g: bo, inner, lab, lw, lh, lx: 0, ly: 0 };
      if (feat) b.lead = el('line', { class: 'kb-lead' }, leadG);
      bo.addEventListener('click', (e) => { e.stopPropagation(); o.onStore(s.id); });
      lab.addEventListener('click', (e) => { e.stopPropagation(); o.onStore(s.id); });   /* 이름표도 누를 수 있다(전시장 손가락엔 이름표가 더 큰 단추) */
      btns.push(b);
    });
    layout(); applyBtnState(); renderLegend();
  }

  /* ── 자리 정하기 ── */
  const near = (a: Btn, c: Btn, ax: number, ay: number, cx: number, cy: number) => Math.hypot(ax - cx, ay - cy) < a.r + c.r + GAP;
  function arrange(grp: Btn[]) {   /* 묶음 하나: 실제 자리들의 가운데로 모아 맞닿게 */
    grp.forEach((b) => { b.k = grp.length > 1 ? BTN_K * BUND_K : BTN_K; b.r = radius(b); b.bund = grp.length > 1; b.bc = undefined; b.x = b.ox; b.y = b.oy; });
    if (grp.length < 2) return;
    const n = grp.length, cx = grp.reduce((t, b) => t + b.ox, 0) / n, cy = grp.reduce((t, b) => t + b.oy, 0) / n, r = grp[0].r;
    const chord = 2 * r * TOUCH, rho = n === 2 ? chord / 2 : chord / (2 * Math.sin(Math.PI / n));
    const spread = Math.max(...grp.map((b) => Math.hypot(b.ox - cx, b.oy - cy)));
    const a0 = n === 2 ? (spread > 1 ? Math.atan2(grp[1].oy - grp[0].oy, grp[1].ox - grp[0].ox) : 0) : -Math.PI / 2;   /* 둘은 나란히(실제로 떨어져 있으면 그 방향으로), 셋 이상은 위 꼭짓점부터 */
    const slots: XY[] = grp.map((_, i) => [cx + Math.cos(a0 + (i * 2 * Math.PI) / n) * rho, cy + Math.sin(a0 + (i * 2 * Math.PI) / n) * rho]);
    const ang = (b: Btn) => (Math.hypot(b.ox - cx, b.oy - cy) > 1 ? Math.atan2(b.oy - cy, b.ox - cx) : 0);
    const mem = grp.slice().sort((p, q) => ang(p) - ang(q) || (p.name < q.name ? -1 : 1));
    let best = 0, bestCost = Infinity;   /* 실제 자리와 가장 덜 어긋나게 돌려 맞춘다 */
    for (let s = 0; s < n; s++) { const cost = mem.reduce((t, b, i) => t + Math.hypot(b.ox - slots[(i + s) % n][0], b.oy - slots[(i + s) % n][1]), 0); if (cost < bestCost) { bestCost = cost; best = s; } }
    mem.forEach((b, i) => { [b.x, b.y] = slots[(i + best) % n]; });
  }
  const boxOfCircle = (x: number, y: number, r: number): Box => ({ x0: x - r * 0.9, y0: y - r * 0.9, x1: x + r * 0.9, y1: y + r * 0.9 });
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const labBox = (b: Btn, lx = b.lx, ly = b.ly): Box => ({ x0: lx - b.lw / 2, y0: ly - b.lh / 2, x1: lx + b.lw / 2, y1: ly + b.lh / 2 });
  const fixedBoxes = (): Box[] => {   /* 이름표가 피할 고정물: 제목, 이장님 */
    const out: Box[] = [];
    if (c.titleImg) { const [, ix, iy, iw, ih] = c.titleImg.map(Number); out.push({ x0: ix, y0: iy, x1: ix + iw, y1: iy + ih }); } else out.push({ x0: tx - 10, y0: ty - 70, x1: tx + 330, y1: ty + 12 });
    const [hx, hy] = c.chiefAt || [905, 430]; out.push({ x0: hx - 16, y0: hy - 40, x1: hx + 16, y1: hy + 6 });
    return out;
  };
  const propBoxes: Box[] = (c.props || []).map(([kind, x, y, h]) => { const w = +h * (PROP_W[kind] ?? 0.84) * 0.8; return { x0: +x - w / 2, y0: +y - +h * 0.85, x1: +x + w / 2, y1: +y }; });
  /* 실이 서로 엇갈리거나 남의 단추·이름표를 지나가면 어느 이름표가 어느 단추인지 헷갈린다 → 비용을 크게 */
  const cross = (a: XY, b: XY, p: XY, q: XY) => { const d = (u: XY, v: XY, w: XY) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]); return d(a, b, p) * d(a, b, q) < 0 && d(p, q, a) * d(p, q, b) < 0; };
  const segDist = (p: XY, a: XY, b: XY) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const segBox = (a: XY, b: XY, r: Box) => { const c4: XY[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]; return c4.some((p, i) => cross(a, b, p, c4[(i + 1) % 4])); };
  function placeLabels() {
    const feat = btns.filter((b) => b.feat), placed: Box[] = [], segs: [XY, XY][] = [], fixed = fixedBoxes(), manual = c.labelAt || {};
    const order = [...feat.filter((b) => b.bund), ...feat.filter((b) => !b.bund).sort((p, q) => p.x - q.x)];   /* 묶음(자리가 좁다)부터, 그다음 왼쪽부터 */
    for (const b of order) {
      const m = manual[b.name];
      if (m) { b.lx = b.x + m[0]; b.ly = b.y + m[1]; placed.push(labBox(b)); segs.push([[b.x, b.y], [b.lx, b.ly]]); continue; }
      const bc = b.bund && b.bc ? b.bc : null;
      const base = bc ? Math.atan2(b.y - bc[1], b.x - bc[0]) : -Math.PI / 2;
      const dirs = bc ? [0, -0.5, 0.5, -1, 1, -1.5, 1.5].map((d) => base + d) : [-90, 90, 0, 180, -45, -135, 45, 135].map((d) => (d * Math.PI) / 180);
      let best: [number, number, number] | null = null;
      dirs.forEach((a, di) => {
        const ux = Math.cos(a), uy = Math.sin(a), ext = Math.abs(ux) * b.lw / 2 + Math.abs(uy) * b.lh / 2;
        for (const extra of bc ? [10, 20, 32, 48, 66] : [0, 10, 22, 36, 54]) {
          const lx = b.x + ux * (b.r + 3 + ext + extra), ly = b.y + uy * (b.r + 3 + ext + extra), box = labBox(b, lx, ly);
          let cost = di * 30 + extra * 4;
          const sg: [XY, XY] = [[b.x, b.y], [lx, ly]];
          for (const [p, q] of segs) if (cross(sg[0], sg[1], p, q)) cost += 900;            /* 실끼리 엇갈림 */
          for (const [p, q] of segs) if (segBox(p, q, box)) cost += 500;                      /* 남의 실이 이 이름표를 지나감 */
          for (const r of placed) if (segBox(sg[0], sg[1], r)) cost += 500;                   /* 이 실이 남의 이름표를 지나감 */
          for (const q of feat) if (q !== b && segDist([q.x, q.y], sg[0], sg[1]) < q.r * 0.8) cost += 400;   /* 이 실이 남의 단추를 지나감 */
          for (const q of feat) cost += overlap(box, boxOfCircle(q.x, q.y, q.r)) * 12;
          for (const p of placed) cost += overlap(box, p) * 12;
          for (const f of fixed) cost += overlap(box, f) * 12;
          for (const q of btns) if (!q.feat) cost += overlap(box, boxOfCircle(q.x, q.y, q.r)) * 0.5;   /* 작은 단추는 나중에 비켜 선다 */
          for (const p of propBoxes) cost += overlap(box, p) * 0.6;
          for (const [px, py] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]) if (!inPoly(ISLAND, px, py)) cost += 2500;
          if (!best || cost < best[0]) best = [cost, lx, ly];
        }
      });
      [, b.lx, b.ly] = best!; placed.push(labBox(b)); segs.push([[b.x, b.y], [b.lx, b.ly]]);
    }
    return placed;
  }
  function placeMinorLabels(featRects: Box[]) {   /* 작은 이름 글씨: 단추에 붙여 위·아래·오른쪽·왼쪽 중 덜 겹치는 곳 */
    const placed: Box[] = [], fixed = fixedBoxes(), manual = c.labelAt || {};
    for (const b of btns.filter((q) => !q.feat).sort((p, q) => p.x - q.x)) {
      const m = manual[b.name];
      if (m) { b.lx = b.x + m[0]; b.ly = b.y + m[1]; placed.push(labBox(b)); continue; }
      let best: [number, number, number] | null = null;
      [[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([ux, uy], di) => {
        for (const extra of [0, 4, 9]) {
          const lx = b.x + ux * (b.r + 1.5 + b.lw / 2 + extra), ly = b.y + uy * (b.r + 1.5 + b.lh / 2 + extra), box = labBox(b, lx, ly);
          let cost = di * 8 + extra * 3;
          for (const q of btns) if (q !== b) cost += overlap(box, boxOfCircle(q.x, q.y, q.r)) * (q.feat ? 12 : 6);
          for (const r of featRects) cost += overlap(box, r) * 12;
          for (const r of placed) cost += overlap(box, r) * 8;
          for (const f of fixed) cost += overlap(box, f) * 12;
          for (const p of propBoxes) cost += overlap(box, p) * 0.3;
          for (const [px, py] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]) if (!inPoly(ISLAND, px, py)) cost += 2500;
          if (!best || cost < best[0]) best = [cost, lx, ly];
        }
      });
      [, b.lx, b.ly] = best!; placed.push(labBox(b));
    }
  }
  function relaxMinor(rects: Box[]) {   /* 작은 단추: 큰 단추·서로·이름표에서 비켜 서기(조금씩 밀어내기) */
    const minor = btns.filter((b) => !b.feat), all = btns;
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (const m of minor) {
        for (const q of all) {
          if (q === m) continue; const dx = m.x - q.x, dy = m.y - q.y, d = Math.hypot(dx, dy), need = m.r + q.r + GAP;
          if (d >= need) continue;
          const a = d > 0.01 ? Math.atan2(dy, dx) : ((m.id.charCodeAt(0) * 37 + m.id.charCodeAt(1)) % 360) * (Math.PI / 180), push = q.feat ? need - d : (need - d) / 2;
          m.x += Math.cos(a) * push; m.y += Math.sin(a) * push; if (!q.feat) { q.x -= Math.cos(a) * push; q.y -= Math.sin(a) * push; } moved = true;
        }
        for (const r of rects) {
          const e = m.r + GAP; if (m.x <= r.x0 - e || m.x >= r.x1 + e || m.y <= r.y0 - e || m.y >= r.y1 + e) continue;
          const opts: XY[] = [[r.x0 - e - m.x, 0], [r.x1 + e - m.x, 0], [0, r.y0 - e - m.y], [0, r.y1 + e - m.y]];
          const [dx, dy] = opts.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]))[0]; m.x += dx; m.y += dy; moved = true;
        }
      }
      if (!moved) break;
    }
  }
  function layout() {
    btns.forEach((b) => { b.k = b.feat ? BTN_K : BTN_K * MINOR_K; b.r = radius(b); b.x = b.ox; b.y = b.oy; b.bund = false; });
    /* ① 큰 단추 묶음: 실제 자리에서 겹치는 것끼리 → 모아 붙인 뒤 다른 묶음·단추와 또 겹치면 합쳐서 다시 */
    const feat = btns.filter((b) => b.feat);
    let groups: Btn[][] = [];
    { const seen = new Set<Btn>(); for (const a of feat) { if (seen.has(a)) continue; const grp = [a]; seen.add(a); for (let i = 0; i < grp.length; i++) for (const q of feat) if (!seen.has(q) && near(grp[i], q, grp[i].ox, grp[i].oy, q.ox, q.oy)) { grp.push(q); seen.add(q); } groups.push(grp); } }
    groups.forEach(arrange);
    const mid = (g: Btn[]): XY => [g.reduce((t, b) => t + b.x, 0) / g.length, g.reduce((t, b) => t + b.y, 0) / g.length];
    for (let it = 0; it < 120; it++) {   /* 묶음(또는 혼자 선 큰 단추)끼리 닿으면 묶음째 반반 밀어 띄운다 */
      let moved = false;
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        let need = 0; for (const a of groups[i]) for (const q of groups[j]) need = Math.max(need, a.r + q.r + GAP - Math.hypot(q.x - a.x, q.y - a.y));
        if (need <= 0) continue;
        const [ax, ay] = mid(groups[i]), [qx, qy] = mid(groups[j]), d = Math.hypot(qx - ax, qy - ay), ux = d > 0.01 ? (qx - ax) / d : 1, uy = d > 0.01 ? (qy - ay) / d : 0, h = Math.min(need, 6) / 2 + 0.1;
        groups[i].forEach((b) => { b.x -= ux * h; b.y -= uy * h; }); groups[j].forEach((b) => { b.x += ux * h; b.y += uy * h; }); moved = true;
      }
      if (!moved) break;
    }
    groups.forEach((g) => { if (g.length > 1) { const m = mid(g); g.forEach((b) => { b.bc = m; }); } });
    /* ② 작은 단추가 큰 단추에서 비켜 서고 → ③ 큰 단추 이름표 → ④ 작은 단추가 이름표에서도 비켜 선다 → ⑤ 작은 이름 글씨 */
    relaxMinor([]); const rects = placeLabels(); relaxMinor(rects); placeMinorLabels(rects);
    btns.forEach((b) => {
      b.pos.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`); b.inner.setAttribute('transform', `scale(${b.k.toFixed(3)})`);
      b.lab.setAttribute('transform', `translate(${b.lx.toFixed(1)} ${b.ly.toFixed(1)})`);
      if (b.lead) {   /* 실: 단추 가장자리에서 이름표 가장자리까지 — 이름표가 단추에 붙어 있으면 숨긴다 */
        const dx = b.lx - b.x, dy = b.ly - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const t = Math.min(Math.abs(ux) > 1e-6 ? b.lw / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? b.lh / 2 / Math.abs(uy) : Infinity), len = d - t - b.r;
        const show = len > 6; b.lead.classList.toggle('none', !show);
        b.lead.setAttribute('x1', (b.x + ux * (b.r - 2)).toFixed(1)); b.lead.setAttribute('y1', (b.y + uy * (b.r - 2)).toFixed(1));
        b.lead.setAttribute('x2', (b.lx - ux * (t - 2)).toFixed(1)); b.lead.setAttribute('y2', (b.ly - uy * (t - 2)).toFixed(1));
      }
    });
  }
  document.fonts?.ready.then(() => { if (btns.length) { btns.forEach((b) => { b.lw = labW(b.name, b.feat); const [r1, r2] = b.lab.querySelectorAll('rect'); if (r1 && r2) { r1.setAttribute('x', String(-b.lw / 2)); r1.setAttribute('width', String(b.lw)); r2.setAttribute('x', String(-b.lw / 2 + 2.5)); r2.setAttribute('width', String(b.lw - 5)); } }); layout(); } });   /* 글꼴이 늦게 오면 이름 폭을 다시 재고 자리도 다시 */
  const parts = (b: Btn) => [b.g, b.lab, ...(b.lead ? [b.lead] : [])];
  const applyBtnState = () => {
    btns.forEach((b) => { const off = !!filter && b.cat !== filter, sel = b.id === selected; parts(b).forEach((e) => { e.classList.toggle('dim', off); e.classList.toggle('sel', sel); }); });
  };
  const shownBtns = () => btns.slice().sort((a, b) => a.x - b.x);   /* 등장(rest) 순서: 왼쪽부터 */

  /* 범례(HTML). 접힌 알약 ↔ 펼친 카드(10-26, 'voice chat' 펼침 모션을 천 톤으로): 접히면 제목 옆에 업종 단추가 겹쳐 한 줄로 서고(앞 4개 + '+N'),
     펴지면 칸이 커지며 단추가 하나씩 조금씩 늦게 3열 격자 자리로 날아가고 이름·가게 수가 뒤따라 나타난다. 자리는 JS 가 계산해 left/top 으로 주고 CSS transition 이 옮긴다(board.css .kb-legend).
     제목(또는 접힌 알약 아무 데)을 누르면 접기·펴기, 펼친 상태에서 업종을 누르면 그 업종만(다시 누르면 전체). 처음엔 데스크톱 펼침, 폰 접힘(지도 아래를 가려서) */
  const legend = document.createElement('aside'); legend.className = 'kb-legend'; legend.setAttribute('aria-label', '신당 5길의 가게들');
  legend.innerHTML = '<h2><button type="button" class="kb-fold" aria-expanded="true"><span class="kb-ttl">신당 5길의 가게들</span><span class="kb-chev" aria-hidden="true">▾</span></button></h2>'
    + '<i class="kb-div" aria-hidden="true"></i><ul></ul><span class="kb-more" aria-hidden="true"></span><p class="kb-note">누르면 그 업종만 남아요 · 다시 누르면 전체</p><i class="kb-probe" aria-hidden="true"></i>';
  o.host.appendChild(legend); const ul = legend.querySelector('ul')!;
  const foldBtn = legend.querySelector<HTMLButtonElement>('.kb-fold')!, ttl = legend.querySelector<HTMLElement>('.kb-ttl')!, more = legend.querySelector<HTMLElement>('.kb-more')!, probe = legend.querySelector<HTMLElement>('.kb-probe')!;
  const folded = () => legend.classList.contains('kb-folded');
  const setFold = (f: boolean) => { legend.classList.toggle('kb-folded', f); foldBtn.setAttribute('aria-expanded', String(!f)); layoutLegend(); };
  foldBtn.addEventListener('click', (e) => { e.stopPropagation(); setFold(!folded()); });
  legend.addEventListener('click', (e) => { if (folded()) { e.stopPropagation(); setFold(false); } });   /* 접힌 알약은 어디를 눌러도 펼친다 */
  /* 크기(범례 안 px, zoom 전). 데스크톱도 폰과 같은 크기(10-26 사용자 요청), 다른 건 안내 문구 줄뿐(폰은 숨김) */
  const LG = { wide: { W: 216, pad: 12, head: 38, btn: 34, cell: 60, row: 6, note: 20, cH: 40, cBtn: 22, cStep: 14, cShow: 3 },
               narrow: { W: 216, pad: 12, head: 38, btn: 34, cell: 60, row: 6, note: 0, cH: 40, cBtn: 22, cStep: 14, cShow: 3 } };
  function layoutLegend() {
    const L = window.innerWidth < 900 ? LG.narrow : LG.wide, items = [...ul.children] as HTMLElement[], n = items.length, f = folded();
    const k = probe.getBoundingClientRect().width / 100 || 1;   /* 화면 배율(zoom:var(--ui)) — 제목 폭을 범례 안 px 로 */
    const tw = Math.ceil(ttl.getBoundingClientRect().width / k), x0 = L.pad + 2 + tw + 10, shown = Math.min(n, L.cShow), extra = n - shown;
    const cols = 3, rows = Math.ceil(n / cols), colW = (L.W - L.pad * 2) / cols;
    const W = f ? x0 + L.cBtn + L.cStep * Math.max(0, shown - 1) + (extra ? 30 : 6) + 26 : L.W;
    const H = f ? L.cH : L.head + 12 + rows * L.cell + (rows - 1) * L.row + 8 + L.note;
    legend.style.width = W + 'px'; legend.style.height = H + 'px'; legend.style.borderRadius = f ? L.cH / 2 + 'px' : '6px';
    legend.style.setProperty('--hd', (f ? L.cH : L.head) + 'px');
    more.textContent = extra ? '+' + extra : ''; more.style.left = x0 + L.cBtn + L.cStep * Math.max(0, shown - 1) + 6 + 'px';
    items.forEach((li, i) => {
      const s = f ? L.cBtn : L.btn, c = i % cols, r = Math.floor(i / cols);
      const x = f ? x0 + Math.min(i, shown - 1) * L.cStep : L.pad + c * colW + (colW - L.btn) / 2;
      const y = f ? (L.cH - L.cBtn) / 2 : L.head + 12 + r * (L.cell + L.row);
      li.style.left = x + 'px'; li.style.top = y + 'px'; li.style.setProperty('--s', s + 'px'); li.style.setProperty('--cw', colW + 'px');
      li.style.opacity = f && i >= shown ? '0' : '1'; li.style.zIndex = String(f ? L.cShow - i : 1);
      li.style.transitionDelay = (f ? (n - 1 - i) * 20 : i * 30) + 'ms'; li.style.setProperty('--ld', f ? '0ms' : 150 + i * 30 + 'ms');
      li.tabIndex = f ? -1 : 0;
    });
  }
  setFold(window.innerWidth < 900);
  window.addEventListener('resize', layoutLegend);
  document.fonts?.addEventListener?.('loadingdone', layoutLegend);   /* 손글씨체(제목)가 늦게 오면 제목 폭이 바뀐다(index.html 글꼴은 나중에 받음) */
  function renderLegend() {
    ul.innerHTML = '';
    Object.entries(CATS).forEach(([k, cc]) => { const n = btns.filter((b) => b.cat === k).length; if (!n && k !== 'etc') return;
      const li = document.createElement('li'); li.dataset.cat = k; li.className = filter === k ? 'active' : ''; li.setAttribute('role', 'button');
      li.innerHTML = `<span class="sw${BTN_IMG[k] ? ' img' : ''}" style="${BTN_IMG[k] ? `background-image:url(${BTN_IMG[k]})` : `background:${cc.sw}`}"></span><span class="lb">${cc.n}<small>${n}</small></span>`;
      li.onclick = (e) => { if (folded()) return; e.stopPropagation(); setFilter(filter === k ? null : k); };
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } };
      ul.appendChild(li); });
    layoutLegend();
  }
  /* 업종 고르기(10-28): 자리는 그대로, 다른 업종은 모션 없이 바로 흐려지고(.dim), 다시 보이게 된 단추만 '톡' 생긴다(.pop, 왼쪽부터 차례로).
     보이는 채로 남는 단추의 pop 은 떼지 않는다 — 떼면 처음 등장용 kb-slam 이 다시 돈다 */
  const visible = (b: Btn) => !(filter && b.cat !== filter);
  function setFilter(cat: string | null) {
    if (filter !== cat) {
      const before = new Set(btns.filter(visible).map((b) => b.id)); filter = cat;
      btns.forEach((b) => { if (!visible(b)) { b.g.classList.remove('pop'); b.g.style.animationDelay = ''; } });
      applyBtnState();
      btns.filter((b) => visible(b) && !before.has(b.id)).sort((a, b) => a.x - b.x).forEach((b, i) => { if (!b.g.classList.contains('in')) return; void b.g.getBBox(); b.g.style.animationDelay = `${Math.min(i * 35, 350)}ms`; b.g.classList.add('pop'); });
    } else applyBtnState();
    ul.querySelectorAll('li').forEach((li) => li.classList.toggle('active', (li as HTMLElement).dataset.cat === filter)); }
  /* 리넨: 타일 사진을 캔버스에 깔아 큰 그림 하나로(<pattern> 은 줌아웃에서 줄무늬) */
  let linenReady = false;
  function loadLinen() {
    if (linenReady) return; linenReady = true;
    const im = new Image(); im.src = '/board/linen.webp';
    im.onload = () => { const w = ib.x1 - ib.x0, h = ib.y1 - ib.y0, px = 1.5, cv = document.createElement('canvas'); cv.width = Math.ceil(w * px); cv.height = Math.ceil(h * px);
      const ctx = cv.getContext('2d'); if (!ctx) return; const tile = 250 * px;   /* 리넨 한 칸(캔버스 단위). 10-23 310 → 250 조금 촘촘하게, 바다(board.css)와 같게 */ for (let y = 0; y < cv.height; y += tile) for (let x = 0; x < cv.width; x += tile) ctx.drawImage(im, x, y, tile, tile);
      linen.setAttribute('href', cv.toDataURL('image/jpeg', 0.86)); linen.classList.add('ready'); };
  }

  /* 접힘 변환: 보드(캔버스 좌표)의 섬 덩어리 → 재단선 자리(캔버스 좌표로 옮긴 실제 자리) */
  const cb = bboxOf(o.cut), k = Math.min((cb.x1 - cb.x0) / (ib.x1 - ib.x0), (cb.y1 - cb.y0) / (ib.y1 - ib.y0)) / 0.92;
  const foldT = `translate(${((cb.x0 + cb.x1) / 2 - C.x).toFixed(1)}px,${((cb.y0 + cb.y1) / 2 - C.y).toFixed(1)}px) scale(${k.toFixed(4)}) translate(${(-(ib.x0 + ib.x1) / 2).toFixed(1)}px,${(-(ib.y0 + ib.y1) / 2).toFixed(1)}px)`;
  const fold = () => { board.style.transform = foldT; }, open = () => { board.style.transform = 'translate(0,0) scale(1)'; };

  let run = 0, timers: number[] = [], raf = 0;
  const at = (fn: () => void, t: number) => timers.push(window.setTimeout(fn, t * SLOW));
  const clear = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };
  const showAll = (yes: boolean) => { ticks.forEach((t) => t.el.classList.toggle('show', yes)); propEls.forEach((p) => p.classList.toggle('in', yes)); titleG.classList.toggle('in', yes); skyEls.forEach((s) => s.classList.toggle('in', yes)); waveEls.forEach((w) => w.classList.toggle('in', yes)); composed = yes; };
  const reset = () => { clear(); btnsOn = false; btns.forEach((b) => parts(b).forEach((e) => e.classList.remove('in', 'focus', 'show'))); g.classList.remove('on', 'cutting', 'arrived', 'roads-on', 'lift'); dark.classList.remove('on'); showAll(false); html.classList.remove('kb-on', 'kb-dark', 'kb-rest', 'kb-gone'); legend.classList.remove('show'); setFilter(null); btns.forEach((b) => { b.g.classList.remove('pop'); b.g.style.animationDelay = ''; }); selected = null; applyBtnState(); };   /* pop 이 남으면 다음 등장(rest)이 kb-slam 대신 kb-pop 이 된다 */
  const skip = () => { ++run; clear(); on = true; loadLinen(); g.classList.add('mounted', 'on', 'arrived', 'roads-on'); g.classList.remove('cutting', 'lift'); dark.classList.remove('on'); html.classList.add('kb-on'); html.classList.remove('kb-dark'); open(); showAll(true); const my = run; at(() => { if (my === run) html.classList.add('kb-gone'); }, 1200); };   /* 옛 층이 사라진(1.1s) 뒤 아예 뺀다(kb-gone) */

  return {
    get on() { return on; }, land: { polygon: ISLAND.map(toMap), bounds: { x0: ib.x0 + C.x, y0: ib.y0 + C.y, x1: ib.x1 + C.x, y1: ib.y1 + C.y }, contains: (x, y) => inPoly(ISLAND, x - C.x, y - C.y) },
    view: () => ({ x: cx0, y: cy0, w: CW, h: CH, iw: ib.x1 - ib.x0 }),
    chiefAt: () => toMap([(c.chiefAt || [905, 430])[0], (c.chiefAt || [905, 430])[1]]),
    roadPath: () => roadMapD,
    storyTargets: () => [...g.querySelectorAll<SVGGraphicsElement>('[data-story]')].map((e) => ({ topic: e.dataset.story!, el: e })),
    storyLayer, islandPath: islandD, toBoard: (x, y) => R.to(x, y),
    play({ onChief }) {
      const my = ++run; reset(); on = true; loadLinen(); g.classList.add('mounted'); fold(); void (board as unknown as HTMLElement).getBoundingClientRect();
      if (reduced()) { skip(); at(onChief, 300); return; }
      /* ⓪ 화면이 밤색으로 어두워진다(0.35s). 어둠이 다 덮이면 옛 섬·바다는 그 아래서 바뀐다(html.kb-dark: 전환 없이 바로) */
      dark.classList.add('on');
      at(() => { if (my !== run) return; html.classList.add('kb-on', 'kb-dark', 'kb-gone'); g.classList.add('on'); }, 400);   /* ① 어둠이 다 덮이면 그 아래서 옛 섬·바다를 바꾼다(빨간 재단선은 그리지 않는다) */
      at(() => { if (my !== run) return; g.classList.add('lift'); open(); dark.classList.remove('on'); html.classList.remove('kb-dark'); }, T0);   /* ② 어둠이 걷히는(1.4s) 동안 보드가 윤곽 자리에서 떠올라 펴진다(1.5s) */
      at(() => { if (my !== run) return; g.classList.add('arrived');                                     /* ③ 가장자리 꿰매기 · 하늘 · 물결 */
        const t1 = performance.now(); const step = () => { if (my !== run) return; const p = Math.min(1, (performance.now() - t1) / (1300 * SLOW)); ticks.forEach((t) => { if (t.at <= p) t.el.classList.add('show'); }); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step);
        skyEls.forEach((s, i) => at(() => s.classList.add('in'), 200 + i * 150)); waveEls.forEach((w, i) => at(() => w.classList.add('in'), 300 + i * 90)); }, T0 + 1500);
      at(() => { if (my !== run) return; g.classList.add('roads-on'); }, T0 + 1500 + 1100);              /* ④ 길 홈질 */
      propEls.forEach((p, i) => at(() => { if (my === run) p.classList.add('in'); }, T0 + 1500 + 1900 + i * 110));   /* ⑤ 집·나무 */
      const tTitle = T0 + 1500 + 1900 + propEls.length * 110 + 200;                                        /* ⑥ 단추는 여기서 안 띄운다 — 이장님 대화가 끝난 뒤 rest() 에서 */
      at(() => { if (my !== run) return; titleG.classList.add('in'); composed = true; }, tTitle);        /* ⑦ 제목 */
      at(() => { if (my === run) onChief(); }, tTitle + 500);                                             /* ⑧ 이장님(엔진) */
    },
    skip,
    rest() { html.classList.add('kb-rest'); legend.classList.add('show'); if (btnsOn) return; btnsOn = true; const my = run; let fi = 0, mi = 0; shownBtns().forEach((b) => { const t = b.feat ? 250 + fi++ * 120 : 400 + mi++ * 40; at(() => { if (my === run) parts(b).forEach((e) => e.classList.add('in')); }, t); }); },   /* 큰 단추는 왼쪽부터 탕탕, 작은 단추는 그 사이로 촘촘히 */   /* ⑨ 범례·주민·단추(차례로 탕탕) */
    hide() { ++run; on = false; reset(); g.classList.remove('mounted'); },
    setStores, setFilter, select(id) { selected = id; applyBtnState(); },
    focusList: () => btns.filter((b) => !filter || b.cat === filter).sort((a, b) => a.x - b.x).map((b) => { const [x, y] = toMap([b.x, b.y]); return { id: b.id, x, y }; }),
    focus(id) { btns.forEach((b) => parts(b).forEach((e) => e.classList.toggle('focus', b.id === id))); },   /* 비추는 단추는 콩콩, 작은 단추는 이름표도 */
  };
}
