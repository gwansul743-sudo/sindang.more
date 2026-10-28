import type { LayerCtx, Renderer } from './layers';

/* 구름·나무 이야기 겹 그림(10-28) — 해 이야기처럼 이야기를 열 때 받는다(첫 화면 무게). 자리는 모두 ctx.toBoard(위경도)로, 섬 밖은 kb-clip.
   · shade(구름): layer.show null(숨김) · "heat_summer"(한여름 햇볕 노출 지도, 상자 막대그래프 = 해마다 더운 날) · "shade"(그늘길 리본).
     햇볕 노출 지도(TASK_17): 블렌더로 센 하지 하루(6–19시, 한 시간마다) 햇볕에 그대로 노출되는 시간 그림(위에서 본 카메라 = 전환 첫 장 trans_t00).
       보드 위 자리는 해 이야기의 첫 장면과 같다 — manifest 의 aff_t00(지역 m → 그림 px)과 ctx.toBoard(위경도 → 보드)로 그림 px → 보드 1차식을 맞춰(최소제곱) image 하나에 transform.
       섬 덩어리로 잘라(kb-clip) decode 뒤 0.6초에 나타난다. 왼쪽 아래 범례, 땅 위를 가리키면 '이 자리 한여름 하루 n시간'(값 그림, 시간 × 18 — 지붕은 회색이라 읽지 않는다),
       값 그림에서 자동으로 찾은 꼬리표 둘(12시간 넘는 가장 큰 땅 덩어리 · 4시간 이하가 가장 촘촘한 골목, 상자·범례를 피해서). 막대는 그해 날수만 짚고 지도는 바뀌지 않는다.
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
const YEAR_MS = 600;   /* 막대를 해마다 짚어 넘기는 시간 */

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

  /* 한여름 햇볕 노출 지도(TASK_17) — 처음 그 장을 열 때 받는다 */
  const heat = el('g', { class: 'kb-heat', 'clip-path': 'url(#kb-clip)' }, c.root);
  const heatImg = el('image', { class: 'kb-heat-map', width: 1920, height: 1440, preserveAspectRatio: 'none' }, heat);
  const calls = el('g', { class: 'kb-heat-calls' }, c.top || c.root);
  const heatKey = document.createElement('div'); heatKey.className = 'kb-map-key kb-heat-key'; c.host.appendChild(heatKey);
  const heatTag = document.createElement('div'); heatTag.className = 'kb-heat-tag'; heatTag.setAttribute('aria-hidden', 'true'); c.host.appendChild(heatTag);
  let H: { M: number[]; vals: Uint8Array; ground: Uint8Array } | null = null, heatLoad: Promise<boolean> | null = null, heatOn = false;
  function loadHeat() {
    return (heatLoad ||= (async () => {
      const base = '/board/sun/', m = await (await fetch(base + 'manifest.json')).json() as { local: { lat0: number; lng0: number; kx: number; ky: number }; transition: { aff_t00: { origin: number[]; perX: number[]; perY: number[] } };
        heat_summer_top: { image: string; values: string; legend: [number, string][] } };
      const hs = m.heat_summer_top, A = m.transition.aff_t00, L = m.local; if (!hs || !A || !L) return false;
      /* 그림 px → 보드: 지역 m 격자에서 (그림 px, 보드) 짝을 모아 1차식 최소제곱 */
      const rows: number[][] = [], bx: number[] = [], by: number[] = [];
      for (let dx = -400; dx <= 400; dx += 100) for (let dy = -300; dy <= 300; dy += 100) {
        const u = A.origin[0] + dx * A.perX[0] + dy * A.perY[0], v = A.origin[1] + dx * A.perX[1] + dy * A.perY[1], [x, y] = c.toBoard(L.lat0 + dy / L.ky, L.lng0 + dx / L.kx);
        rows.push([u, v, 1]); bx.push(x); by.push(y);
      }
      const solve = (t: number[]) => { const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
        rows.forEach((q, k) => { for (let i = 0; i < 3; i++) { r[i] += q[i] * t[k]; for (let j = 0; j < 3; j++) N[i][j] += q[i] * q[j]; } });
        const det = (M: number[][]) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
        const D = det(N); return [0, 1, 2].map((i) => det(N.map((row, a) => row.map((v, b) => (b === i ? r[a] : v)))) / D); };   /* 크라메르 */
      const [a, c2, e] = solve(bx), [b, d, f] = solve(by), M = [a, b, c2, d, e, f];
      const im = new Image(); im.src = base + hs.image; const vi = new Image(); vi.src = base + hs.values;
      await Promise.all([im.decode(), vi.decode()]); if (!c.alive()) return false;
      const px = (img: HTMLImageElement) => { const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1440; const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0, 1920, 1440); return cx.getImageData(0, 0, 1920, 1440).data; };
      const pv = px(vi), pc = px(im), n = 1920 * 1440, vals = new Uint8Array(n), ground = new Uint8Array(n);
      for (let k = 0; k < n; k++) { const q = k * 4, r = pc[q], g = pc[q + 1], bl = pc[q + 2]; vals[k] = pv[q]; ground[k] = pc[q + 3] > 128 && !(Math.max(r, g, bl) - Math.min(r, g, bl) < 20 && r > 200) ? 1 : 0; }   /* 지붕(옅은 회색)은 땅이 아니다 */
      H = { M, vals, ground };
      heatImg.setAttribute('transform', `matrix(${M.map((v) => +v.toFixed(6)).join(',')})`); heatImg.setAttribute('href', im.src);
      const mx = hs.legend[hs.legend.length - 1][0];
      heatKey.innerHTML = `<b>한여름 하루, 햇볕에 그대로 노출되는 시간</b><i class="bar" style="background:linear-gradient(90deg,${hs.legend.map(([h, col]) => `${col} ${((h / mx) * 100).toFixed(1)}%`).join(',')})"></i>`
        + `<span class="ticks">${[0, 3, 6, 9, 12, 14].map((h) => `<em style="left:${((h / mx) * 100).toFixed(1)}%">${h}${h === 14 ? '시간' : ''}</em>`).join('')}</span><small>하지(6월 21일) · 3D 모형 계산</small>`;
      return true;
    })());
  }
  /* 그림 px ↔ 보드 ↔ 화면 */
  const toB = (u: number, v: number) => { const M = H!.M; return [M[0] * u + M[2] * v + M[4], M[1] * u + M[3] * v + M[5]]; };
  const toRef = (x: number, y: number) => { const M = H!.M, det = M[0] * M[3] - M[1] * M[2], X = x - M[4], Y = y - M[5]; return [(M[3] * X - M[2] * Y) / det, (-M[1] * X + M[0] * Y) / det]; };
  const screenOf = (bx: number, by: number) => { const ctm = c.root.getScreenCTM(); if (!ctm) return null; const q = new DOMPoint(bx, by).matrixTransform(ctm); return [q.x, q.y]; };
  /* 꼬리표 둘: 값 그림을 4 px 칸으로 — 12시간 넘는 가장 큰 땅 덩어리의 가운데에 가까운 칸, 4시간 이하가 가장 촘촘한(9×9 칸) 골목 칸. 상자·범례·화면 밖은 피한다 */
  function placeCalls() {
    calls.replaceChildren(); if (!H) return;
    const S = 4, gw = 480, gh = 360, cell = new Int16Array(gw * gh).fill(-1);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const k = (y * S + 2) * 1920 + x * S + 2; if (H.ground[k]) cell[y * gw + x] = H.vals[k]; }
    const hr = c.host.getBoundingClientRect(), panel = (c.host.querySelector('.kb-story.show') as HTMLElement | null)?.getBoundingClientRect(), key = heatKey.getBoundingClientRect();
    const free = (gx: number, gy: number) => { const [bx, by] = toB(gx * S + 2, gy * S + 2), p = screenOf(bx, by); if (!p) return false; const [x, y] = p;
      const out = (r: DOMRect | undefined, m: number) => !!r && r.width > 0 && x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m;
      return x > hr.left + 60 && x < hr.right - 60 && y > hr.top + 110 && y < hr.bottom - 40 && !out(panel, 260) && !out(key, 60); };
    /* 뜨거운 덩어리 */
    const seen = new Uint8Array(gw * gh); let best: number[] = [];
    for (let k0 = 0; k0 < gw * gh; k0++) { if (seen[k0] || cell[k0] < 216) continue; const comp: number[] = [], q = [k0]; seen[k0] = 1;
      while (q.length) { const k = q.pop()!; comp.push(k); const x = k % gw, y = (k / gw) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const nk = ny * gw + nx; if (!seen[nk] && cell[nk] >= 216) { seen[nk] = 1; q.push(nk); } } }
      if (comp.filter((k) => free(k % gw, (k / gw) | 0)).length > best.length) best = comp.filter((k) => free(k % gw, (k / gw) | 0)); }
    const pick = (list: number[]) => { if (!list.length) return null; const mx = list.reduce((a, k) => a + (k % gw), 0) / list.length, my = list.reduce((a, k) => a + ((k / gw) | 0), 0) / list.length;
      return list.reduce((a, k) => ((k % gw - mx) ** 2 + (((k / gw) | 0) - my) ** 2 < (a % gw - mx) ** 2 + (((a / gw) | 0) - my) ** 2 ? k : a)); };
    const hot = pick(best);
    /* 그늘 골목: 4시간 이하 칸 밀도(적분 영상) */
    const I = new Int32Array((gw + 1) * (gh + 1)); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = cell[y * gw + x], w = v >= 0 && v <= 72 ? 1 : 0; I[(y + 1) * (gw + 1) + x + 1] = w + I[y * (gw + 1) + x + 1] + I[(y + 1) * (gw + 1) + x] - I[y * (gw + 1) + x]; }
    const R = 4, box = (x: number, y: number) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(gw, x + R + 1), y1 = Math.min(gh, y + R + 1); return I[y1 * (gw + 1) + x1] - I[y0 * (gw + 1) + x1] - I[y1 * (gw + 1) + x0] + I[y0 * (gw + 1) + x0]; };
    let cool = -1, cd = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = cell[y * gw + x]; if (v < 0 || v > 72) continue; const d = box(x, y);
      if (d > cd && (hot == null || Math.hypot(x - (hot % gw), y - ((hot / gw) | 0)) > 60) && free(x, y)) { cd = d; cool = y * gw + x; } }
    const sc = c.root.getScreenCTM()?.a || 1, FS = 14 / sc, TH = 28 / sc, PAD = 10 / sc, OFF = 46 / sc;   /* 화면 14 px 글씨 */
    const tag = (k: number | null, text: string, up: boolean) => {
      if (k == null || k < 0) return; const [bx, by] = toB((k % gw) * S + 2, ((k / gw) | 0) * S + 2), w = text.length * FS * 0.86 + 2 * PAD, tx = bx + OFF * 0.6, ty = up ? by - OFF - TH : by + OFF;
      const g = el('g', { class: 'kb-heat-call' }, calls);
      el('path', { class: 'ld', d: `M${bx.toFixed(1)} ${by.toFixed(1)}L${tx.toFixed(1)} ${(up ? ty + TH : ty).toFixed(1)}`, 'stroke-width': (1.4 / sc).toFixed(2) }, g);
      el('circle', { class: 'dt', cx: bx.toFixed(1), cy: by.toFixed(1), r: (3.5 / sc).toFixed(2), 'stroke-width': (1.4 / sc).toFixed(2) }, g);
      el('rect', { x: tx.toFixed(1), y: ty.toFixed(1), width: w.toFixed(1), height: TH.toFixed(1), rx: (4 / sc).toFixed(1), 'stroke-width': (1.5 / sc).toFixed(2) }, g);
      el('rect', { class: 'st', x: (tx + 3 / sc).toFixed(1), y: (ty + 3 / sc).toFixed(1), width: (w - 6 / sc).toFixed(1), height: (TH - 6 / sc).toFixed(1), rx: (3 / sc).toFixed(1), 'stroke-width': (1.2 / sc).toFixed(2), 'stroke-dasharray': `${(5 / sc).toFixed(1)} ${(3 / sc).toFixed(1)}` }, g);
      const t = el('text', { x: (tx + PAD).toFixed(1), y: (ty + TH / 2).toFixed(1), 'font-size': FS.toFixed(1) }, g); t.textContent = text;
    };
    tag(hot, '그늘 없는 길 · 하루 12시간 넘게 해', true); tag(cool, '건물 그늘 골목 · 4시간 이하', false);
  }
  /* 가리킨 자리 값(땅 위만) */
  function heatRead(e: PointerEvent) {
    if (!heatOn || !H || e.pointerType === 'touch' || (e.target as Element).closest?.('.kb-story,.kb-map-key,.kb-legend,button')) { heatTag.classList.remove('on'); return; }
    const ctm = c.root.getScreenCTM(); if (!ctm) return; const b = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()), [u, v] = toRef(b.x, b.y), ui = Math.floor(u), vi = Math.floor(v);
    if (ui < 0 || vi < 0 || ui >= 1920 || vi >= 1440 || !H.ground[vi * 1920 + ui] || (c.island.length && !inPoly(c.island, b.x, b.y))) { heatTag.classList.remove('on'); return; }
    const hr = c.host.getBoundingClientRect(), h = Math.round((H.vals[vi * 1920 + ui] / 18) * 10) / 10;
    heatTag.textContent = `이 자리 한여름 하루 ${h}시간`; heatTag.style.left = (e.clientX - hr.left).toFixed(0) + 'px'; heatTag.style.top = (e.clientY - hr.top).toFixed(0) + 'px'; heatTag.classList.add('on');
  }
  const offRead = () => heatTag.classList.remove('on');
  c.host.addEventListener('pointermove', heatRead, { passive: true }); c.host.addEventListener('pointerleave', offRead);
  const maxN = Math.max(...clim.feel35, 1);
  /* 막대그래프(상자): 해마다 더운 날 — 누르면 그 막대와 아래 한 줄만(지도는 그대로) */
  const chart = document.createElement('figure'); chart.className = 'kb-chart';
  const bars = document.createElement('div'); bars.className = 'kb-bars';
  bars.setAttribute('role', 'group'); bars.setAttribute('aria-label', '해를 고르세요: 체감온도 35℃ 넘는 날');
  const cols = clim.years.map((y, i) => {
    const col = document.createElement('button'); col.type = 'button'; col.className = 'kb-bar-c'; col.setAttribute('aria-label', `${y}년 ${clim.feel35[i]}일`);
    col.innerHTML = `<b>${clim.feel35[i]}</b><i style="height:${((clim.feel35[i] / maxN) * 84).toFixed(1)}px;animation-delay:${i * 50}ms"></i><span>${i ? "'" + String(y).slice(2) : y}</span>`;
    col.addEventListener('click', () => { stopPlay(); setYear(y); }); bars.appendChild(col); return col;
  });
  const cap = document.createElement('figcaption'); cap.textContent = '막대는 해마다 더운 날 수, 지도는 그 더위가 어디에 세게 떨어지는지예요';
  const yearLine = document.createElement('p'); yearLine.className = 'kb-heat-yr';
  chart.append(cap, bars, yearLine);
  let playT = 0;
  function setYear(y: number) {
    const i = clim.years.indexOf(y); if (i < 0) return;
    yearLine.textContent = `${y}년 · ${clim.feel35[i]}일`;
    cols.forEach((col, k) => col.classList.toggle('cur', clim.years[k] === y));
  }
  function stopPlay() { clearTimeout(playT); playT = 0; }
  function play(end: number) {   /* 2016 → 2025 한 번 짚어 보이고, 그다음 장의 해 */
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
      heatOn = L.show === 'heat_summer'; heatTag.classList.remove('on');
      if (!heatOn) { heat.classList.remove('on'); heatKey.classList.remove('show'); calls.replaceChildren(); }
      else void loadHeat().then((ok) => { if (!ok || !c.alive() || !heatOn) return; heat.classList.add('on'); heatKey.classList.add('show'); window.setTimeout(() => { if (c.alive() && heatOn) placeCalls(); }, 650); });   /* 꼬리표는 상자가 자리 잡은 뒤 */
      if (heatOn) play(L.year && clim.years.includes(L.year) ? L.year : clim.years[clim.years.length - 1]);
      c.slot(heatOn ? chart : L.show === 'shade' ? key : null);
      if (heatOn) { chart.classList.remove('grow'); void chart.offsetWidth; chart.classList.add('grow'); }
    },
    destroy() { stopPlay(); drift.forEach((a) => a.cancel()); mapKey.remove(); heatKey.remove(); heatTag.remove(); calls.remove(); heat.remove(); H = null;
      c.host.removeEventListener('pointermove', heatRead); c.host.removeEventListener('pointerleave', offRead); },
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
