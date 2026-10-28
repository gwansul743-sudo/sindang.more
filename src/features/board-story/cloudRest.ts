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

/* 나무 — 쉼(rest, TASK_11 다시 그림): layer.show "places" · "walk" · "trees" · "proposals". 요소는 보이는 장에 필요한 묶음만 만들고 나머지는 DOM 에서 지운다(한 번에 40개 이하).
   · places: 공원·놀이터 = 실제 넓이의 초록 천 조각(홈질) + 벤치·미끄럼틀 그림, 화장실 = 와인 꼬리표 그림
   · walk: 쉴 곳까지 걷는 시간 네 묶음을 천 리본(띠 + 홈질)으로 — 3분 초록 · 5분 노랑 · 8분 주황 · 그 넘게 와인, 지도 모서리 범례
   · trees: 가로수마다 펠트 수관(반지름 = 키에서 2.5–4 m, 화면 5 px 이상), 초록 세 겹(path 셋) + 홈질 테두리(path 하나), 가로수가 없는 골목엔 점선 구역 + '골목 안 가로수 0그루'
   · proposals: 여덟 자리마다 시원한 그늘 원 + 보드 벤치 그림 + 작은 화분 + 번호 꼬리표, 열 때 차례로 톡. 누르거나 가리키면 '쉼터까지 n분 · 오후 그늘 n%' */
const WALK_COL = ['#6f8a73', '#f2c070', '#f0a850', '#7d2030'], WALK_W = 8;   /* 3분 이하 초록(봉제 무늬) → 노랑 → 주황 → 와인 */
const TREE_COL = ['#6f8a73', '#5f7d66', '#84a086'];   /* 보드 나무 초록 세 겹(봉제 무늬 초록 둘레) */
interface Place { name: string; kind: string; latlng: number[]; area: number | null }
interface WalkSeg { a: number[]; b: number[]; min: number }
interface Proposal { latlng: number[]; walk_min: number; shade15?: number }
interface Tree { latlng: number[]; road?: string; h?: number }
const circle = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0Z`;
const pill = (x: number, y: number, w: number, h: number, r: number) => `M${(x - w / 2 + r).toFixed(1)} ${(y - h / 2).toFixed(1)}h${(w - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}v${(h - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${-r} ${r}h${(-(w - 2 * r)).toFixed(1)}a${r} ${r} 0 0 1 ${-r} ${-r}v${(-(h - 2 * r)).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
function hull(pts: number[][]) {   /* 볼록 껍질(모노톤 체인) */
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], up: number[][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export const rest: Renderer = async (c: LayerCtx) => {
  const [data, tdata] = (await Promise.all([c.load(String(c.spec.data)), c.load(String(c.spec.trees))])) as [{ places: Place[]; segs: WalkSeg[]; proposals: Proposal[] }, { trees: Tree[] }];
  if (!c.alive()) return null;
  const P = (ll: number[]) => c.toBoard(ll[0], ll[1]);
  const ll0 = data.places[0]?.latlng || [37.565, 127.02], [ax, ay] = P(ll0), [bx, by] = P([ll0[0], ll0[1] + 100 / (111320 * Math.cos((ll0[0] * Math.PI) / 180))]), m = Math.hypot(bx - ax, by - ay) / 100;   /* 보드 단위 / m */
  const px = () => 1 / Math.max(0.05, c.root.getScreenCTM()?.a || 1);   /* 화면 1 px = 보드 몇 단위 */
  const root = el('g', { class: 'kb-rs on', 'clip-path': 'url(#kb-clip)' }, c.root);
  const groups: Record<string, SVGGElement | null> = { walk: null, walkLite: null, places: null, trees: null, props: null };
  /* 걷는 시간 리본(띠 + 홈질). lite = 띠만(쉼터 제안 장 밑에 옅게) */
  function buildWalk(lite = false) {
    const g = el('g', { class: 'kb-rs-walk' + (lite ? ' dim' : '') }, root), wd = ['', '', '', ''];
    for (const s of data.segs) { const k = s.min <= 3 ? 0 : s.min <= 5 ? 1 : s.min <= 8 ? 2 : 3, [x1, y1] = P(s.a), [x2, y2] = P(s.b); wd[k] += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
    wd.forEach((d, k) => { if (!d) return; el('path', { class: 'band', d, stroke: WALK_COL[k], 'stroke-width': WALK_W }, g); if (!lite) el('path', { class: 'stitch', d }, g); });
    return g;
  }
  /* 공원·놀이터·화장실 */
  function buildPlaces() {
    const g = el('g', { class: 'kb-rs-places' }, root);
    const parks = data.places.filter((p) => (p.kind === 'park' || p.kind === 'playground') && p.area), patchD = parks.map((p) => { const [x, y] = P(p.latlng); return circle(x, y, Math.sqrt(p.area! / Math.PI) * m); }).join('');
    el('path', { class: 'kb-rs-patch', d: patchD || 'M0 0' }, g); el('path', { class: 'kb-rs-patch-st', d: patchD || 'M0 0' }, g);
    const park = data.places.find((p) => p.kind === 'park'), toilet = data.places.find((p) => p.kind === 'toilets'), u = px();
    if (park) { const [x, y] = P(park.latlng), r = Math.sqrt((park.area || 0) / Math.PI) * m, s = 14 * u;
      el('text', { class: 'kb-rs-lab', x: x.toFixed(1), y: (y - r - 6 * u).toFixed(1), 'font-size': (13 * u).toFixed(1) }, g).textContent = park.name;
      /* 벤치 + 미끄럼틀 그림(와인 선) */
      el('path', { class: 'kb-rs-pic', d: `M${x - s * 1.6} ${y}h${s * 1.2}M${x - s * 1.5} ${y}v${s * 0.6}M${x - s * 0.5} ${y}v${s * 0.6}M${x - s * 1.6} ${y - s * 0.45}h${s * 1.2}`
        + `M${x + s * 0.3} ${y + s * 0.6}v${-s * 1.4}h${s * 0.4}l${s * 1.1} ${s * 1.4}M${x + s * 0.3} ${y - s * 0.4}h${s * 0.4}`, 'stroke-width': (2 * u).toFixed(2) }, g); }
    if (toilet) { const [x, y] = P(toilet.latlng), s = 1.4 * u, t = el('g', { class: 'kb-rs-wc', transform: `translate(${x.toFixed(1)},${(y + 26 * u).toFixed(1)}) scale(${s.toFixed(3)})` }, g);
      el('path', { d: pill(0, 0, 54, 20, 4), fill: '#7d2030' }, t);
      el('path', { d: 'M-20 -5a2 2 0 1 0 .01 0ZM-12 -5a2 2 0 1 0 .01 0ZM-22 -2h4v8h-4ZM-14 -2h4l1.5 5h-2v3h-3v-3h-2Z', fill: '#fbf3e2' }, t);
      el('text', { x: 6, y: 0.5, class: 'kb-rs-wct' }, t).textContent = '화장실'; }
    return g;
  }
  /* 가로수: 펠트 수관 + 가로수가 없는 골목 구역 */
  function buildTrees() {
    const g = el('g', { class: 'kb-rs-trees' }, root), u = px(), pts: number[][] = [];
    /* 펠트 결: 초록 세 톤이 섞인 작은 무늬(나무마다 조금씩 다른 톤으로 보이게, path 는 하나) */
    const pat = el('pattern', { id: 'kb-rs-felt', width: 9, height: 9, patternUnits: 'userSpaceOnUse' }, el('defs', {}, g));
    el('rect', { width: 9, height: 9, fill: TREE_COL[0] }, pat); el('circle', { cx: 2.5, cy: 2.5, r: 2.4, fill: TREE_COL[1] }, pat); el('circle', { cx: 7, cy: 6.5, r: 2.2, fill: TREE_COL[2] }, pat);
    let fd = '';
    /* 보기 쉽게 키운 수관(TASK_14): 반지름 = max(화면 13 px, 수관 2.2 배) — 큰길 가로수가 이어진 초록 띠가 된다(일부러) */
    tdata.trees.forEach((t) => { const [x, y] = P(t.latlng), rm = 2.5 + 1.5 * Math.max(0, Math.min(1, ((t.h || 8) - 5) / 12)), r = Math.max(13 * u, 2.2 * rm * m); pts.push([x, y]); fd += circle(x, y, r); });
    el('path', { class: 'kb-rs-crown-sh', d: fd, transform: `translate(${(2 * u).toFixed(2)},${(2 * u).toFixed(2)})` }, g);   /* 2 px 아래 진한 그림자(필터 없이) */
    el('path', { class: 'kb-rs-crown', d: fd, fill: 'url(#kb-rs-felt)' }, g);
    el('path', { class: 'kb-rs-crown-st', d: fd }, g);
    /* 가로수 0그루 골목: 가장 가까운 나무에서 25 m 넘게 떨어진 길 토막 가운데들의 볼록 껍질 */
    const far = data.segs.map((s) => { const [x1, y1] = P(s.a), [x2, y2] = P(s.b); return [(x1 + x2) / 2, (y1 + y2) / 2]; }).filter(([x, y]) => pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > 25 * m));
    const h = hull(far);
    if (h.length > 2) { const cx = h.reduce((a, q) => a + q[0], 0) / h.length, cy = h.reduce((a, q) => a + q[1], 0) / h.length;
      el('path', { class: 'kb-rs-zone', d: h.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + (x - cx) * 0.85).toFixed(1)} ${(cy + (y - cy) * 0.85).toFixed(1)}`).join('') + 'Z' }, g);
      el('text', { class: 'kb-rs-zone-t', x: cx.toFixed(1), y: cy.toFixed(1), 'font-size': (16 * u).toFixed(1) }, g).textContent = '골목 안 가로수 0그루'; }
    return g;
  }
  /* 그늘 쉼터 제안: 그늘 원(path 하나) + 벤치·화분 그림 + 번호 꼬리표, 누르거나 가리키면 꼬리표 */
  function buildProps() {
    const g = el('g', { class: 'kb-rs-props' }, root), u = px(), B = 30 * u, R = 34 * u, list = data.proposals.slice(0, 8), pts = list.map((p) => P(p.latlng));   /* 그늘 원 +30 %(TASK_14) */
    el('path', { class: 'kb-rs-shade', d: pts.map(([x, y]) => circle(x, y, R)).join('') }, g);
    /* 꼬리표는 보드 장식(나무 그림) 위로 — 단추·이름표 위 층(top)에 */
    const tip = el('g', { class: 'kb-rs-tip' }, c.top || g), tipR = el('rect', { rx: 4 * u }, tip), tipT = el('text', { 'font-size': (13 * u).toFixed(1) }, tip);
    pts.forEach(([x, y], i) => {   /* 자리마다 요소 셋(벤치·화분·번호) — 묶음 g 없이(요소 40개 아래로) */
      const s = el('image', { class: 'kb-rs-p', 'data-hit': '1', style: `--i:${i}`, href: '/board/bench.webp', x: (x - B * 0.6).toFixed(1), y: (y - B * 0.55).toFixed(1), width: (B * 1.17).toFixed(1), height: B.toFixed(1) }, g);
      el('image', { class: 'kb-rs-pp', style: `--i:${i}`, href: '/board/hedge.webp', x: (x + B * 0.38).toFixed(1), y: (y - B * 0.15).toFixed(1), width: (B * 0.5).toFixed(1), height: (B * 0.3).toFixed(1) }, g);
      el('text', { class: 'kb-rs-num kb-rs-pp', style: `--i:${i}`, x: (x - R * 0.95).toFixed(1), y: (y - R * 0.8).toFixed(1), 'font-size': (12 * u).toFixed(1) }, g).textContent = String(i + 1);
      const show = () => { const p = list[i], t = `쉼터까지 ${Math.round(p.walk_min)}분 · 오후 그늘 ${Math.round((p.shade15 ?? 0) * 100)}%`, w = t.length * 12.2 * u + 16 * u, h = 24 * u;
        tipR.setAttribute('x', (x - w / 2).toFixed(1)); tipR.setAttribute('y', (y - R - h - 6 * u).toFixed(1)); tipR.setAttribute('width', w.toFixed(1)); tipR.setAttribute('height', h.toFixed(1));
        tipT.setAttribute('x', x.toFixed(1)); tipT.setAttribute('y', (y - R - h / 2 - 6 * u).toFixed(1)); tipT.textContent = t; tip.classList.add('on'); };
      s.addEventListener('pointerenter', show); s.addEventListener('click', (e) => { e.stopPropagation(); show(); });
    });
    return g;
  }
  const builders: Record<string, () => SVGGElement> = { walk: () => buildWalk(), walkLite: () => buildWalk(true), places: buildPlaces, trees: buildTrees, props: buildProps };
  function want(names: string[]) { for (const k in groups) { const on = names.includes(k); if (on && !groups[k]) groups[k] = builders[k](); if (!on && groups[k]) { groups[k]!.remove(); groups[k] = null; if (k === 'props') c.top?.querySelector('.kb-rs-tip')?.remove(); } } }
  /* 지도 모서리 범례 */
  const mapKey = document.createElement('div'); mapKey.className = 'kb-map-key'; c.host.appendChild(mapKey);
  const keys: Record<string, string> = {
    places: '<span><i class="patch"></i>공원·놀이터</span><span><i class="wc"></i>공중화장실</span>',
    walk: ['걸어서 3분', '5분', '8분', '그 이상'].map((t, k) => `<span><i style="background-color:${WALK_COL[k]}"></i>${t}</span>`).join(''),
    trees: `<span><i class="tree"></i>가로수 ${tdata.trees.length}그루</span><span><i class="zone"></i>가로수 없는 골목</span>`,
    proposals: '<span><i class="bench"></i>그늘 쉼터 제안</span><span>누르면 걷는 시간·그늘</span>',
  };
  return {
    page(_i, p) {
      const show = ((p.layer || {}) as { show?: string }).show || null;
      want(show === 'places' ? ['places'] : show === 'walk' ? ['walk', 'places'] : show === 'trees' ? ['trees'] : show === 'proposals' ? ['walkLite', 'props'] : []);
      if (show === 'proposals' && groups.props) { groups.props.classList.remove('pop'); void groups.props.getBoundingClientRect(); groups.props.classList.add('pop'); }
      mapKey.innerHTML = show ? keys[show] || '' : ''; mapKey.classList.toggle('show', !!show);
      c.slot(null);
    },
    destroy() { mapKey.remove(); },
  };
};
