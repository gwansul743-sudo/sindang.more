import type { LayerCtx, Renderer } from './layers';

/* 구름·나무 이야기 겹 그림(10-28) — 해 이야기처럼 이야기를 열 때 받는다(첫 화면 무게). 자리는 모두 ctx.toBoard(위경도)로, 섬 밖은 kb-clip.
   · shade(구름): 길 토막을 그늘 정도(0~1)로 네 묶음 → 묶음마다 path 하나(굵은 둥근 선). 낮 12시 묶음과 오후 3시 묶음을 한 번씩 만들어(path 8개)
     장의 layer.time 으로 opacity 를 바꿔 끼운다. layer.show: null(숨김) · "chart"(상자 안 체감 35℃ 막대그래프) · "shade".
   · rest(나무): 아래 rest 머리 주석. */
const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent.appendChild(e); return e;
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/* 햇볕(해 눈금 노랑, night.ts 노을) → 그늘(보드 바다 #7793b1 · 슈퍼 무늬 파랑 #5f7fa8). 묶음 0 = 그늘 0~0.25 … 3 = 0.75~1 */
const SHADE_COL = ['#f0a850', '#f2c070', '#7793b1', '#5f7fa8'], SHADE_W = 10;

interface Seg { a: number[]; b: number[]; c: string; shade: Record<string, number> }
interface Climate { years: number[]; feel35: number[] }

export const shade: Renderer = async (c: LayerCtx) => {
  const [data, clim] = (await Promise.all([c.load(String(c.spec.data)), c.load(String(c.spec.chart))])) as [{ segs: Seg[] }, Climate];
  if (!c.alive()) return null;
  const P = (ll: number[]) => c.toBoard(ll[0], ll[1]);
  const times = ['summer_12', 'summer_15'];
  const root = el('g', { class: 'kb-shade', 'clip-path': 'url(#kb-clip)' }, c.root);
  const sets = times.map((t) => {
    const d = ['', '', '', ''];
    for (const s of data.segs) { const v = s.shade[t] ?? 0, k = Math.min(3, Math.floor(v * 4)), [x1, y1] = P(s.a), [x2, y2] = P(s.b); d[k] += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
    const g = el('g', { class: 'kb-shade-t', 'data-time': t }, root);
    d.forEach((dd, k) => { if (dd) el('path', { d: dd, stroke: SHADE_COL[k], 'stroke-width': SHADE_W }, g); });
    return g;
  });
  /* 범례 띠 */
  const key = document.createElement('div'); key.className = 'kb-shade-key';
  key.innerHTML = '<span>그늘 많음</span>' + SHADE_COL.slice().reverse().map((col) => `<i style="background:${col}"></i>`).join('') + '<span>햇볕</span>';
  /* 막대그래프: 체감 35℃ 넘는 날(해마다). 2024 는 와인색. HTML 막대 — 상자 안 인라인 SVG 는 테마의 '#map svg'(칸 가득 펴기) 규칙을 받아 상자를 덮었다 */
  const chart = document.createElement('figure'); chart.className = 'kb-chart';
  const max = Math.max(...clim.feel35, 1), bars = document.createElement('div'); bars.className = 'kb-bars';
  bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', '체감온도 35℃ 넘는 날, ' + clim.years.map((y, i) => `${y}년 ${clim.feel35[i]}일`).join(', '));
  clim.years.forEach((y, i) => {
    const col = document.createElement('div'); col.className = 'kb-bar-c' + (y === 2024 ? ' hi' : '');
    col.innerHTML = `<b>${clim.feel35[i]}</b><i style="height:${((clim.feel35[i] / max) * 84).toFixed(1)}px;animation-delay:${i * 50}ms"></i><span>${i ? "'" + String(y).slice(2) : y}</span>`;
    bars.appendChild(col);
  });
  const cap = document.createElement('figcaption'); cap.textContent = '체감온도 35℃ 넘는 날(일)'; chart.append(cap, bars);

  /* 하늘의 구름은 이야기가 열린 동안 조금 더 흘러간다(translate — 원래 transform 흔들림과 겹쳐도 안 싸운다) */
  const drift = reduced() ? [] : [...document.querySelectorAll('.kb .kb-cloud-b,.kb .kb-cloud-g')].map((e, i) => e.animate([{ translate: '0 0' }, { translate: `${i ? -22 : 26}px 0` }], { duration: 5200 + i * 900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
  return {
    page(_i, p) {
      const L = (p.layer || {}) as { show?: string | null; time?: string };
      root.classList.toggle('on', L.show === 'shade');
      sets.forEach((g, k) => g.classList.toggle('cur', times[k] === (L.time || 'summer_12')));
      c.slot(L.show === 'chart' ? chart : L.show === 'shade' ? key : null);
      if (L.show === 'chart') { chart.classList.remove('grow'); void chart.offsetWidth; chart.classList.add('grow'); }
    },
    destroy() { drift.forEach((a) => a.cancel()); },
  };
};

/* 나무 — 쉼(rest): layer.show "places"(공원·놀이터 천 조각 + 화장실) · "walk"(쉴 곳까지 걷는 시간, 네 묶음) · "trees"(가로수 180그루, path 하나) ·
   "proposals"(그늘 쉼터 제안 여덟 자리, 방석 모양). 요소는 모두 합쳐 30개 이하 — 묶을 수 있는 것은 path 하나로. 공원 넓이는 실제 넓이 그대로의 원 */
const WALK_COL = ['#6f8a73', '#f2c070', '#f0a850', '#7d2030'], WALK_W = 7;   /* 3분 이하 초록(봉제 무늬) → 노랑 → 주황 → 와인 */
interface Place { name: string; kind: string; latlng: number[]; area: number | null }
interface WalkSeg { a: number[]; b: number[]; min: number }
interface Proposal { latlng: number[]; walk_min: number }
interface Tree { latlng: number[]; road?: string }
const circle = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0Z`;
const pill = (x: number, y: number, w: number, h: number, r: number) => `M${(x - w / 2 + r).toFixed(1)} ${(y - h / 2).toFixed(1)}h${(w - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}v${(h - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${-r} ${r}h${(-(w - 2 * r)).toFixed(1)}a${r} ${r} 0 0 1 ${-r} ${-r}v${(-(h - 2 * r)).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

export const rest: Renderer = async (c: LayerCtx) => {
  const [data, tdata] = (await Promise.all([c.load(String(c.spec.data)), c.load(String(c.spec.trees))])) as [{ places: Place[]; segs: WalkSeg[]; proposals: Proposal[] }, { trees: Tree[] }];
  if (!c.alive()) return null;
  const P = (ll: number[]) => c.toBoard(ll[0], ll[1]);
  /* 미터 → 보드 단위: 동서로 100 m 떨어진 두 점 */
  const ll0 = data.places[0]?.latlng || [37.565, 127.02], [ax, ay] = P(ll0), [bx, by] = P([ll0[0], ll0[1] + 100 / (111320 * Math.cos((ll0[0] * Math.PI) / 180))]), m = Math.hypot(bx - ax, by - ay) / 100;
  const root = el('g', { class: 'kb-rs', 'clip-path': 'url(#kb-clip)' }, c.root);
  /* 걷는 시간(네 묶음) — 맨 아래 */
  const walk = el('g', { class: 'kb-rs-walk' }, root), wd = ['', '', '', ''];
  for (const s of data.segs) { const k = s.min <= 3 ? 0 : s.min <= 5 ? 1 : s.min <= 8 ? 2 : 3, [x1, y1] = P(s.a), [x2, y2] = P(s.b); wd[k] += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
  wd.forEach((d, k) => el('path', { d: d || 'M0 0', stroke: WALK_COL[k], 'stroke-width': WALK_W }, walk));
  /* 공원·놀이터: 실제 넓이의 원(천 조각 + 홈질), 화장실 표시, 이름 둘 */
  const places = el('g', { class: 'kb-rs-places' }, root);
  const parks = data.places.filter((p) => (p.kind === 'park' || p.kind === 'playground') && p.area), patchD = parks.map((p) => { const [x, y] = P(p.latlng); return circle(x, y, Math.sqrt(p.area! / Math.PI) * m); }).join('');
  el('path', { class: 'kb-rs-patch', d: patchD || 'M0 0' }, places); el('path', { class: 'kb-rs-patch-st', d: patchD || 'M0 0' }, places);
  const park = data.places.find((p) => p.kind === 'park'), toilet = data.places.find((p) => p.kind === 'toilets');
  if (park) { const [x, y] = P(park.latlng), r = Math.sqrt((park.area || 0) / Math.PI) * m; el('text', { class: 'kb-rs-lab', x: x.toFixed(1), y: (y - r - 5).toFixed(1) }, places).textContent = park.name; }
  if (toilet) { const [x, y] = P(toilet.latlng), t = el('g', { class: 'kb-rs-wc', transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` }, places);
    el('path', { d: pill(0, 0, 14, 14, 3), fill: '#7d2030' }, t);   /* 화장실 그림: 와인 네모 + 크림 사람 둘 */
    el('path', { d: 'M-3.5 -4.2a1.3 1.3 0 1 0 .01 0ZM3.5 -4.2a1.3 1.3 0 1 0 .01 0ZM-4.8 -2.2h2.6v5.6h-2.6ZM2.2 -2.2h2.6l1 3.6h-1.4v2h-1.8v-2h-1.4Z', fill: '#fbf3e2' }, t);
    el('text', { class: 'kb-rs-lab', x: x.toFixed(1), y: (y + 18).toFixed(1) }, places).textContent = '화장실'; }
  /* 가로수: 점 180개를 path 하나로, 큰길 이름 둘(그 길 나무 무리의 가운데 위) */
  const trees = el('g', { class: 'kb-rs-trees' }, root), byRoad = new Map<string, number[][]>();
  el('path', { class: 'kb-rs-tree', d: tdata.trees.map((t) => { const [x, y] = P(t.latlng); if (t.road) (byRoad.get(t.road) || byRoad.set(t.road, []).get(t.road)!).push([x, y]); return circle(x, y, 2.6); }).join('') }, trees);
  [...byRoad].slice(0, 2).forEach(([name, pts]) => { const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    el('text', { class: 'kb-rs-road', x: cx.toFixed(1), y: (cy - 12).toFixed(1) }, trees).textContent = name; });
  /* 제안 여덟 자리: 방석(둥근 네모 + 안쪽 홈질) path 둘 + 번호 */
  const props = el('g', { class: 'kb-rs-props' }, root), pts = data.proposals.slice(0, 8).map((p) => P(p.latlng));
  el('path', { class: 'kb-rs-cush', d: pts.map(([x, y]) => pill(x, y, 28, 19, 5)).join('') }, props);
  el('path', { class: 'kb-rs-cush-st', d: pts.map(([x, y]) => pill(x, y, 22, 13, 3.5)).join('') }, props);
  pts.forEach(([x, y], i) => { el('text', { class: 'kb-rs-num', x: x.toFixed(1), y: (y + 0.5).toFixed(1) }, props).textContent = String(i + 1); });
  /* 상자 아래 칸: 걷는 시간 범례 / 공원·화장실 / 가로수 */
  const key = (html: string) => { const d = document.createElement('div'); d.className = 'kb-rs-key'; d.innerHTML = html; return d; };
  const walkKey = key(['걸어서 3분', '5분', '8분', '그 이상'].map((t, k) => `<i style="background:${WALK_COL[k]}"></i>${t}`).join(' '));
  const placeKey = key('<i class="patch"></i>공원·놀이터 <i class="wc"></i>공중화장실');
  const treeKey = key(`<i class="dot"></i>가로수 ${tdata.trees.length}그루`);
  return {
    page(_i, p) {
      const show = ((p.layer || {}) as { show?: string }).show || null;
      root.classList.toggle('on', !!show);
      places.classList.toggle('on', show === 'places' || show === 'walk' || show === 'proposals');
      walk.classList.toggle('on', show === 'walk' || show === 'proposals'); walk.classList.toggle('dim', show === 'proposals');
      trees.classList.toggle('on', show === 'trees'); props.classList.toggle('on', show === 'proposals');
      c.slot(show === 'walk' || show === 'proposals' ? walkKey : show === 'places' ? placeKey : show === 'trees' ? treeKey : null);
    },
  };
};
