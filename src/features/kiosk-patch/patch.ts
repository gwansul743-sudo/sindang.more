import './patch.css';

/* 전시 모드 '신당 5길' 천 조각 — 점선 구역의 바닥만 펠트 천으로 바꾸고, 켤 때 봉제 연출을 한다. 끝나면 그 위에 와펜 스탬프(kiosk-stamps)가 찍힌다.
   · 천: SVG <pattern>(펠트 능직 결, 1칸 = 지도 1단위 픽셀)으로 채운 구역 path. 길 층 바로 위·장식(집·나무·점) 아래에 끼워 바닥만 덮는다.
   · 연출(play): 구역 가운데서 천이 둥글게 깔리고(clipPath 원), 바늘이 외곽선을 따라 한 바퀴 돌며 테두리 실이 그려지고(dashoffset), 끝에 점선 박음질이 드러난다.
   · 선 굵기는 줌과 무관하게 화면 px 유지(update). 끄면 0.5s 페이드. ?patch_slow=4 로 느리게(캡처용). */

export interface PatchOptions { svg: SVGSVGElement; after: Element; polygon: [number, number][] }   // polygon: 지도 좌표
export interface Frame { left: number; top: number; width: number; height: number }                   // 화면 좌표(clientX/Y)
export interface Patch { play(onDone?: () => void): void; set(on: boolean): void; update(scale: number): void; frame(): Frame | null }

const NS = 'http://www.w3.org/2000/svg';
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const REVEAL_MS = 1000 * SLOW, EDGE_MS = 1400 * SLOW, TOTAL_MS = 1700 * SLOW;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
};

export function mountPatch(o: PatchOptions): Patch {
  const pts = o.polygon, d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const cx = xs.reduce((a, b) => a + b, 0) / pts.length, cy = ys.reduce((a, b) => a + b, 0) / pts.length;
  const rMax = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 4;

  const g = el('g', { class: 'layer patch', 'aria-hidden': 'true' });
  o.after.parentNode!.insertBefore(g, o.after.nextSibling);
  const defs = el('defs', {}, g);
  /* 펠트 결: 6×6 칸 타일, (x+y)%3 사선 능직 — 밝은 실 한 줄·어두운 실 한 줄·바탕 한 줄 */
  const pat = el('pattern', { id: 'patch-cloth', width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { class: 'patch-base', width: 6, height: 6 }, pat);
  let hi = '', lo = '';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const k = (x + y) % 3; if (k === 0) hi += `M${x} ${y}h1v1h-1z`; else if (k === 1) lo += `M${x} ${y}h1v1h-1z`; }
  el('path', { class: 'patch-hi', d: hi }, pat); el('path', { class: 'patch-lo', d: lo }, pat);
  const clip = el('clipPath', { id: 'patch-reveal', clipPathUnits: 'userSpaceOnUse' }, defs);
  const circle = el('circle', { cx, cy, r: rMax }, clip);

  el('path', { class: 'patch-cloth', d, 'clip-path': 'url(#patch-reveal)' }, g);
  const edge = el('path', { class: 'patch-edge', d }, g);
  const stitch = el('path', { class: 'patch-stitch', d }, g);
  const needle = el('rect', { class: 'patch-needle', width: 1, height: 1 }, g);
  const L = edge.getTotalLength();

  let S = 1;
  function update(s: number) {
    S = s; const px = (v: number) => (v / s).toFixed(3);
    edge.setAttribute('stroke-width', px(3.6)); stitch.setAttribute('stroke-width', px(1.6)); stitch.setAttribute('stroke-dasharray', `${px(5)} ${px(3.5)}`);
    needle.setAttribute('width', px(8)); needle.setAttribute('height', px(8)); needle.setAttribute('stroke-width', px(1.2));
  }

  let run = 0, raf = 0, timers: number[] = [];
  const clear = () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; };
  const settle = () => { circle.setAttribute('r', String(rMax)); edge.style.strokeDasharray = ''; edge.style.strokeDashoffset = ''; needle.style.display = 'none'; };

  return {
    play(onDone) {
      const my = ++run; clear();
      g.classList.add('on', 'sewing'); g.classList.remove('stitched');
      if (reduced()) { settle(); g.classList.remove('sewing'); g.classList.add('stitched'); timers.push(window.setTimeout(() => { if (run === my) onDone?.(); }, 200)); return; }
      circle.setAttribute('r', '0'); edge.style.strokeDasharray = `${L}`; edge.style.strokeDashoffset = `${L}`; needle.style.display = 'inline';
      const t0 = performance.now();
      const step = (now: number) => {
        if (run !== my) return;
        const tr = Math.min(1, (now - t0) / REVEAL_MS), er = tr * tr * (3 - 2 * tr);   /* 천: 천천히 시작해 밀려 나가듯 */
        circle.setAttribute('r', String(rMax * er));
        const te = Math.min(1, (now - t0) / EDGE_MS);                                  /* 바늘: 일정한 속도로 한 바퀴 */
        edge.style.strokeDashoffset = `${L * (1 - te)}`;
        const p = edge.getPointAtLength(L * te), n = 8 / S;
        needle.setAttribute('x', (p.x - n / 2).toFixed(2)); needle.setAttribute('y', (p.y - n / 2).toFixed(2));
        if (te >= 1) { g.classList.add('stitched'); needle.style.display = 'none'; }
        if (tr < 1 || te < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      timers.push(window.setTimeout(() => { if (run !== my) return; g.classList.remove('sewing'); settle(); onDone?.(); }, TOTAL_MS));
    },
    set(on) { ++run; clear(); settle(); g.classList.remove('sewing'); g.classList.toggle('on', on); g.classList.toggle('stitched', on); },
    update,
    frame() { const m = o.svg.getScreenCTM(); return m ? { left: m.a * box.x + m.e, top: m.d * box.y + m.f, width: box.w * m.a, height: box.h * m.d } : null; },
  };
}
