import type { LayerCtx, Renderer } from './layers';

/* 구름·나무 이야기 겹 그림(10-28) — 해 이야기처럼 이야기를 열 때 받는다(첫 화면 무게). 자리는 모두 ctx.toBoard(위경도)로, 섬 밖은 kb-clip.
   · shade(구름): layer.show null(숨김) · "heatdays"(무더운 날 = 섬 길 위 작은 해 배지, 상자 막대그래프가 해 고르기) · "shade"(그늘길 리본).
     그늘길: 길 토막을 그늘 정도(0~1)로 네 묶음 → 묶음마다 천 리본(띠 path + 위에 가는 홈질 path). 낮 12시·오후 3시 두 벌을 한 번 만들어 opacity 로 바꿔 끼운다.
   · rest(나무): 아래 rest 머리 주석. */
const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent.appendChild(e); return e;
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const inPoly = (poly: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c; } return c; };
/* 햇볕(해 눈금 노랑, night.ts 노을) → 그늘(보드 바다 #7793b1 · 슈퍼 무늬 파랑 #5f7fa8). 묶음 0 = 그늘 0~0.25 … 3 = 0.75~1 */
const SHADE_COL = ['#f0a850', '#f2c070', '#7793b1', '#5f7fa8'], SHADE_W = 10;
const BADGE = 34, BADGE_MAX = 50, YEAR_MS = 600;   /* 해 배지 크기(보드 단위, 보드 전체 화면 1080p 에서 약 17px)·최대 개수 · 해마다 넘기는 시간 */

interface Seg { a: number[]; b: number[]; c: string; shade: Record<string, number> }
interface Climate { years: number[]; feel35: number[] }

export const shade: Renderer = async (c: LayerCtx) => {
  const [data, clim] = (await Promise.all([c.load(String(c.spec.data)), c.load(String(c.spec.chart))])) as [{ segs: Seg[] }, Climate];
  if (!c.alive()) return null;
  const P = (ll: number[]) => c.toBoard(ll[0], ll[1]);
  /* 그늘길 리본: 묶음마다 띠 + 홈질 */
  const times = ['summer_12', 'summer_15'];
  const root = el('g', { class: 'kb-shade', 'clip-path': 'url(#kb-clip)' }, c.root);
  const sets = times.map((t) => {
    const d = ['', '', '', ''];
    for (const s of data.segs) { const v = s.shade[t] ?? 0, k = Math.min(3, Math.floor(v * 4)), [x1, y1] = P(s.a), [x2, y2] = P(s.b); d[k] += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
    const g = el('g', { class: 'kb-shade-t', 'data-time': t }, root);
    d.forEach((dd, k) => { if (!dd) return; el('path', { class: 'band', d: dd, stroke: SHADE_COL[k], 'stroke-width': SHADE_W }, g); el('path', { class: 'stitch', d: dd }, g); });
    return g;
  });
  /* 지도 모서리 범례(그늘길 장): 파란 실 = 그늘, 노란 실 = 햇볕 */
  const mapKey = document.createElement('div'); mapKey.className = 'kb-map-key';
  mapKey.innerHTML = `<span><i style="background-color:${SHADE_COL[3]}"></i>파란 실 = 그늘</span><span><i style="background-color:${SHADE_COL[0]}"></i>노란 실 = 햇볕</span>`;
  c.host.appendChild(mapKey);
  /* 상자 범례 */
  const key = document.createElement('div'); key.className = 'kb-shade-key';
  key.innerHTML = '<span>그늘 많음</span>' + SHADE_COL.slice().reverse().map((col) => `<i style="background:${col}"></i>`).join('') + '<span>햇볕</span>';

  /* 무더운 날: 섬 길 위 해 배지(위치는 길 토막 가운데에서 씨앗 고정으로 뽑아 해가 바뀌어도 제자리) + 섬 전체 따뜻한 물들임 + 섬 위 큰 숫자 */
  const heat = el('g', { class: 'kb-heat' }, c.root), isl = c.island;
  const tint = el('path', { class: 'kb-heat-tint', d: isl.length ? isl.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z' : 'M0 0' }, heat);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cand = data.segs.map((s) => { const [x1, y1] = P(s.a), [x2, y2] = P(s.b); return [(x1 + x2) / 2, (y1 + y2) / 2]; }).filter(([x, y]) => !isl.length || inPoly(isl, x, y));
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const spots: number[][] = []; for (const q of cand) { if (spots.length >= BADGE_MAX) break; if (spots.every((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) > 36)) spots.push(q); }
  const badges = spots.map(([x, y]) => el('image', { class: 'kb-heat-b', href: '/board/sun.webp', x: (x - BADGE / 2).toFixed(1), y: (y - BADGE / 2).toFixed(1), width: BADGE, height: BADGE }, heat));
  const topY = isl.length ? Math.min(...isl.map((q) => q[1])) : 120, midX = isl.length ? isl.reduce((a, q) => a + q[0], 0) / isl.length : 887;
  const counter = el('text', { class: 'kb-heat-n', x: midX.toFixed(1), y: (topY - 26).toFixed(1) }, heat);
  const maxN = Math.max(...clim.feel35, 1);
  /* 막대그래프(상자): 해 고르기 — 누르면 그 해, 장을 열면 2016→2025 를 한 번 넘겨 보이고 장의 해에 멈춘다 */
  const chart = document.createElement('figure'); chart.className = 'kb-chart';
  const bars = document.createElement('div'); bars.className = 'kb-bars';
  bars.setAttribute('role', 'group'); bars.setAttribute('aria-label', '해를 고르세요: 체감온도 35℃ 넘는 날');
  const cols = clim.years.map((y, i) => {
    const col = document.createElement('button'); col.type = 'button'; col.className = 'kb-bar-c'; col.setAttribute('aria-label', `${y}년 ${clim.feel35[i]}일`);
    col.innerHTML = `<b>${clim.feel35[i]}</b><i style="height:${((clim.feel35[i] / maxN) * 84).toFixed(1)}px;animation-delay:${i * 50}ms"></i><span>${i ? "'" + String(y).slice(2) : y}</span>`;
    col.addEventListener('click', () => { stopPlay(); setYear(y); }); bars.appendChild(col); return col;
  });
  const cap = document.createElement('figcaption'); cap.textContent = '체감온도 35℃ 넘는 날(일) · 막대를 누르면 그해의 날만큼 섬에 해가 떠요'; chart.append(cap, bars);
  let playT = 0;
  function setYear(y: number) {
    const i = clim.years.indexOf(y); if (i < 0) return; const n = Math.min(BADGE_MAX, clim.feel35[i]);
    badges.forEach((b, k) => b.classList.toggle('on', k < n));
    tint.style.opacity = String(((0.25 * clim.feel35[i]) / maxN).toFixed(3));
    counter.textContent = `${y}년 · ${clim.feel35[i]}일`;
    cols.forEach((col, k) => col.classList.toggle('cur', clim.years[k] === y));
  }
  function stopPlay() { clearTimeout(playT); playT = 0; }
  function play(end: number) {   /* 2016 → 2025 한 번, 그다음 장의 해 */
    stopPlay(); if (reduced()) { setYear(end); return; }
    let k = 0; const step = () => { if (!c.alive()) return; if (k < clim.years.length) { setYear(clim.years[k++]); playT = window.setTimeout(step, YEAR_MS); } else { playT = 0; setYear(end); } };
    step();
  }

  /* 하늘의 구름은 이야기가 열린 동안 조금 더 흘러간다(translate — 원래 transform 흔들림과 겹쳐도 안 싸운다) */
  const drift = reduced() ? [] : [...document.querySelectorAll('.kb .kb-cloud-b,.kb .kb-cloud-g')].map((e, i) => e.animate([{ translate: '0 0' }, { translate: `${i ? -22 : 26}px 0` }], { duration: 5200 + i * 900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
  return {
    page(_i, p) {
      const L = (p.layer || {}) as { show?: string | null; time?: string; year?: number };
      stopPlay();
      root.classList.toggle('on', L.show === 'shade'); mapKey.classList.toggle('show', L.show === 'shade');
      sets.forEach((g, k) => g.classList.toggle('cur', times[k] === (L.time || 'summer_12')));
      heat.classList.toggle('on', L.show === 'heatdays');
      if (L.show === 'heatdays') { badges.forEach((b) => b.classList.remove('on')); play(L.year && clim.years.includes(L.year) ? L.year : clim.years[clim.years.length - 1]); }
      c.slot(L.show === 'heatdays' ? chart : L.show === 'shade' ? key : null);
      if (L.show === 'heatdays') { chart.classList.remove('grow'); void chart.offsetWidth; chart.classList.add('grow'); }
    },
    destroy() { stopPlay(); drift.forEach((a) => a.cancel()); mapKey.remove(); },
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
