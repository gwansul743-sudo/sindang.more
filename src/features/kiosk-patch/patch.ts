import './patch.css';

/* 전시 모드 '신당 5길' 천 조각 — 점선 구역의 바닥만 올리브색 거친 직물로 바꾸고, 켤 때 가장자리를 실로 감아 꿰매는 봉제 연출을 한다.
   끝나면 그 위에 와펜 스탬프(kiosk-stamps)가 찍힌다.
   · 직물: SVG <pattern>(평직, 실 2칸 굵기, 1칸 = 지도 1단위 픽셀) + 드문 밝은 올(specks). 길 층 '아래'에 끼워 길은 그대로 보인다.
   · 구역 안의 길: 같은 등급·색의 복사본을 구역 모양으로 잘라 굵게(px) 겹친다 → 전시 모드에서 길이 더 두껍게 보인다.
   · 가장자리: 가는 코드 실 + 일정 간격으로 가장자리를 비스듬히 감는 두꺼운 실(휘프 스티치). 바늘이 한 바퀴 돌며 한 땀씩 드러난다.
   · 연출(play): 가운데서 천이 둥글게 깔리고(clipPath 원 1.0s) 바늘이 외곽선을 돈다(1.4s). 1.7s 뒤 onDone. 끄면 0.5s 페이드. ?patch_slow=N 느리게. */

export interface PatchOptions { svg: SVGSVGElement; before: Element; polygon: [number, number][]; roads?: Record<string, string> }   // polygon: 지도 좌표. before: 길 층(이 앞에 끼운다)
export interface Frame { left: number; top: number; width: number; height: number }                   // 화면 좌표(clientX/Y)
export interface Patch { play(onDone?: () => void): void; set(on: boolean): void; update(scale: number): void; frame(): Frame | null }

const NS = 'http://www.w3.org/2000/svg';
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const REVEAL_MS = 1000 * SLOW, EDGE_MS = 1400 * SLOW, TOTAL_MS = 1700 * SLOW;
const STITCH_STEP = 3.4, STITCH_IN = 1.5, STITCH_OUT = 1.9, STITCH_SLANT = 0.9;   /* 지도 단위: 땀 간격, 안쪽·바깥쪽 길이, 비스듬한 정도 (10-21 약 0.6배로 — 전엔 5·2.6·3.2·1.5) */
const NEEDLE_PX = 6;                                                                 /* 바늘 한 변(px). 전엔 8 */
const ROAD_W: Record<string, number> = { a: 14, b: 9, c: 5, d: 3 };               /* 구역 안 길 굵기(px). 평소 8·5·2.4·1.25 */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
};
const inPoly = (poly: [number, number][], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c; }
  return c;
};

export function mountPatch(o: PatchOptions): Patch {
  const pts = o.polygon, d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const cx = xs.reduce((a, b) => a + b, 0) / pts.length, cy = ys.reduce((a, b) => a + b, 0) / pts.length;
  const rMax = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 6;

  const g = el('g', { class: 'layer patch', 'aria-hidden': 'true' });
  o.before.parentNode!.insertBefore(g, o.before);
  const defs = el('defs', {}, g);
  /* 삼베 타일 3×3: 가운데 줄·가운데 칸이 가로·세로 실(mid), 교차점은 밝음(light), 네 귀퉁이는 실 사이 틈(dark) */
  const pat = el('pattern', { id: 'patch-weave', width: 3, height: 3, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { class: 'patch-w-dark', width: 3, height: 3 }, pat);
  el('path', { class: 'patch-w-mid', d: 'M0 1h3v1h-3zM1 0h1v3h-1z' }, pat);
  el('path', { class: 'patch-w-light', d: 'M1 1h1v1h-1z' }, pat);
  const specks = el('pattern', { id: 'patch-specks', width: 13, height: 11, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { class: 'patch-speck', d: 'M1 2h1v1h-1zM7 0h1v1h-1zM11 5h1v1h-1zM4 7h1v1h-1zM9 9h1v1h-1zM0 10h1v1h-1z' }, specks);
  const clipReveal = el('clipPath', { id: 'patch-reveal', clipPathUnits: 'userSpaceOnUse' }, defs);
  const circle = el('circle', { cx, cy, r: rMax }, clipReveal);
  const clipArea = el('clipPath', { id: 'patch-area', clipPathUnits: 'userSpaceOnUse' }, defs);
  el('path', { d }, clipArea);

  /* 바닥: 그림자 → 직물 → 밝은 올 → 구역 안 굵은 길 → 가장자리 안쪽 그늘(두께감). 모두 원(reveal)으로 잘라 깔린다 */
  const body = el('g', { 'clip-path': 'url(#patch-reveal)' }, g);
  el('path', { class: 'patch-shadow', d, transform: 'translate(1.2,1.8)' }, body);
  el('path', { class: 'patch-cloth', d, fill: 'url(#patch-weave)' }, body);
  el('path', { d, fill: 'url(#patch-specks)' }, body);
  const inArea = el('g', { 'clip-path': 'url(#patch-area)' }, body);
  if (o.roads) for (const k of ['d', 'c', 'b', 'a']) if (o.roads[k]) el('path', { class: `rd rd-${k} patch-rd`, d: o.roads[k], style: `stroke-width:${ROAD_W[k]}px` }, inArea);
  el('path', { class: 'patch-inset', d, 'stroke-width': 5 }, inArea);

  /* 가장자리: 코드 실(바늘을 따라 그려짐) + 땀(한 땀씩 드러남) */
  const cord = el('path', { class: 'patch-cord', d, 'stroke-width': 0.6 }, g);
  const L = cord.getTotalLength();
  const stitches: { at: number; g: SVGGElement }[] = [];
  const sg = el('g', { class: 'patch-stitches' }, g);
  for (let s = STITCH_STEP / 2; s < L; s += STITCH_STEP) {
    const p = cord.getPointAtLength(s), p1 = cord.getPointAtLength(Math.max(0, s - 0.5)), p2 = cord.getPointAtLength(Math.min(L, s + 0.5));
    let tx = p2.x - p1.x, ty = p2.y - p1.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx; if (!inPoly(pts, p.x + nx * 1.5, p.y + ny * 1.5)) { nx = -nx; ny = -ny; }   /* n = 안쪽 방향 */
    const h = Math.sin(s * 12.9898) * 43758.5453, r1 = h - Math.floor(h), r2 = (h * 7.31) - Math.floor(h * 7.31);   /* 땀마다 조금씩 다르게(고정 난수) */
    const kin = STITCH_IN * (0.85 + r1 * 0.3), kout = STITCH_OUT * (0.85 + r2 * 0.3), sl = STITCH_SLANT * (0.7 + r1 * 0.6);
    const ax = p.x + nx * kin - tx * sl / 2, ay = p.y + ny * kin - ty * sl / 2;
    const bx = p.x - nx * kout + tx * sl / 2, by = p.y - ny * kout + ty * sl / 2;
    const one = el('g', { visibility: 'hidden' }, sg);
    const line = (cls: string, w: number, dx = 0, dy = 0) => el('line', { class: cls, x1: (ax + dx).toFixed(2), y1: (ay + dy).toFixed(2), x2: (bx + dx).toFixed(2), y2: (by + dy).toFixed(2), 'stroke-width': w }, one);
    line('patch-st-under', 1.3, 0.2, 0.3); line('patch-st', 0.9); line('patch-st-hi', 0.3, -0.15, -0.18);
    stitches.push({ at: s, g: one });
  }
  const needle = el('rect', { class: 'patch-needle', width: 1, height: 1 }, g);

  let S = 1;
  function update(s: number) { S = s; const px = (v: number) => (v / s).toFixed(3); needle.setAttribute('width', px(NEEDLE_PX)); needle.setAttribute('height', px(NEEDLE_PX)); needle.setAttribute('stroke-width', px(1)); }
  const showStitches = (upto: number) => stitches.forEach((st) => st.g.setAttribute('visibility', st.at <= upto ? 'visible' : 'hidden'));

  let run = 0, raf = 0, timers: number[] = [];
  const clear = () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; };
  const settle = () => { circle.setAttribute('r', String(rMax)); cord.style.strokeDasharray = ''; cord.style.strokeDashoffset = ''; needle.style.display = 'none'; showStitches(Infinity); };

  return {
    play(onDone) {
      const my = ++run; clear();
      g.classList.add('on', 'sewing');
      if (reduced()) { settle(); g.classList.remove('sewing'); timers.push(window.setTimeout(() => { if (run === my) onDone?.(); }, 200)); return; }
      circle.setAttribute('r', '0'); cord.style.strokeDasharray = `${L}`; cord.style.strokeDashoffset = `${L}`; needle.style.display = 'inline'; showStitches(-1);
      const t0 = performance.now();
      const step = (now: number) => {
        if (run !== my) return;
        const tr = Math.min(1, (now - t0) / REVEAL_MS), er = tr * tr * (3 - 2 * tr);   /* 천: 천천히 시작해 밀려 나가듯 */
        circle.setAttribute('r', String(rMax * er));
        const te = Math.min(1, (now - t0) / EDGE_MS);                                  /* 바늘: 일정한 속도로 한 바퀴 */
        cord.style.strokeDashoffset = `${L * (1 - te)}`; showStitches(L * te);
        const p = cord.getPointAtLength(L * te), n = NEEDLE_PX / S;
        needle.setAttribute('x', (p.x - n / 2).toFixed(2)); needle.setAttribute('y', (p.y - n / 2).toFixed(2));
        if (te >= 1) needle.style.display = 'none';
        if (tr < 1 || te < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      timers.push(window.setTimeout(() => { if (run !== my) return; g.classList.remove('sewing'); settle(); onDone?.(); }, TOTAL_MS));
    },
    set(on) { ++run; clear(); settle(); g.classList.remove('sewing'); g.classList.toggle('on', on); },
    update,
    frame() { const m = o.svg.getScreenCTM(); return m ? { left: m.a * box.x + m.e, top: m.d * box.y + m.f, width: box.w * m.a, height: box.h * m.d } : null; },
  };
}
