import type { LayerCtx, Renderer } from './layers';

/* 구름·나무 이야기 겹 그림(10-28) — 해 이야기처럼 이야기를 열 때 받는다(첫 화면 무게). 자리는 모두 ctx.toBoard(위경도)로, 섬 밖은 kb-clip.
   · shade(구름): 길 토막을 그늘 정도(0~1)로 네 묶음 → 묶음마다 path 하나(굵은 둥근 선). 낮 12시 묶음과 오후 3시 묶음을 한 번씩 만들어(path 8개)
     장의 layer.time 으로 opacity 를 바꿔 끼운다. layer.show: null(숨김) · "chart"(상자 안 체감 35℃ 막대그래프) · "shade". */
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
  /* 막대그래프: 체감 35℃ 넘는 날(해마다). 2024 는 와인색. HTML 막대 — 상자의 CSS zoom 안에서 인라인 SVG 는 그려지는 자리와 누르는 칸이 어긋났다 */
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
