/* 전시 보드의 기하 — 순수 계산. DOM 을 모른다.
   · 5길 다각형(지도 좌표)을 섬 크기로 균일 확대해 섬 한가운데에 놓는 변환(T) — "윤곽은 실제 5길 그대로, 크기는 지금 섬만큼"
   · 실제 길(roads.json) 가운데 다각형 안·가장자리(경계는 길 위에 붙여 그렸으므로 경계에 걸친 길도 넣는다)에 있는 토막만 골라 T 로 옮긴 path
   · 점(가게·장식)이 안인지, 경계에서 얼마나 떨어졌는지 */
export type XY = [number, number];
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface BoardTransform { s: number; cx: number; cy: number; ox: number; oy: number; to(x: number, y: number): XY; from(x: number, y: number): XY }

export function inPoly(poly: XY[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
const dSeg = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
};
/* 경계까지 거리(안이면 음수) */
export function distToPoly(poly: XY[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; d = Math.min(d, dSeg(x, y, p[0], p[1], q[0], q[1])); }
  return inPoly(poly, x, y) ? -d : d;
}
export const bboxOf = (pts: XY[]): Box => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });

/* 다각형을 섬 상자의 fill 배 크기로 균일 확대해 섬 상자 가운데에 — 다각형 상자 중심 ↔ 섬 상자 중심 */
export function boardTransform(poly: XY[], land: Box, fill = 0.9): BoardTransform {
  const pb = bboxOf(poly);
  const s = fill * Math.min((land.x1 - land.x0) / (pb.x1 - pb.x0), (land.y1 - land.y0) / (pb.y1 - pb.y0));
  const cx = (pb.x0 + pb.x1) / 2, cy = (pb.y0 + pb.y1) / 2, ox = (land.x0 + land.x1) / 2, oy = (land.y0 + land.y1) / 2;
  return { s, cx, cy, ox, oy, to: (x, y) => [ox + (x - cx) * s, oy + (y - cy) * s], from: (x, y) => [cx + (x - ox) / s, cy + (y - oy) / s] };
}

export const pathOf = (pts: XY[], close = true) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + (close ? 'Z' : '');

/* roads.json 의 path d(M/L 만) → 꺾은선 목록 */
export function polylines(d: string): XY[][] {
  const out: XY[][] = [];
  d.split('M').forEach((part) => { const n = (part.match(/-?\d+\.?\d*/g) || []).map(Number); const pl: XY[] = []; for (let i = 0; i + 1 < n.length; i += 2) pl.push([n[i], n[i + 1]]); if (pl.length > 1) out.push(pl); });
  return out;
}
/* 다각형 안(경계에서 tol 안쪽·바깥까지)에 있는 토막만 남긴다. 긴 선분은 잘라서 판정한다. 결과는 T 를 거친 꺾은선 */
export function roadsInside(d: string, poly: XY[], T: BoardTransform, tol = 2.5): XY[][] {
  const out: XY[][] = [];
  for (const pl of polylines(d)) {
    let cur: XY[] = [];
    const flush = () => { if (cur.length > 1) out.push(cur.map(([x, y]) => T.to(x, y))); cur = []; };
    for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, ay] = pl[i], [bx, by] = pl[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
      for (let k = 0; k < n; k++) {
        const x1 = ax + ((bx - ax) * k) / n, y1 = ay + ((by - ay) * k) / n, x2 = ax + ((bx - ax) * (k + 1)) / n, y2 = ay + ((by - ay) * (k + 1)) / n;
        const inside = distToPoly(poly, (x1 + x2) / 2, (y1 + y2) / 2) <= tol;
        if (inside) { if (!cur.length) cur.push([x1, y1]); cur.push([x2, y2]); } else flush();
      }
    }
    flush();
  }
  return out;
}
export const polylinePath = (pls: XY[][]) => pls.map((pl) => pathOf(pl, false)).join('');

/* 숨길 자리(kiosk-board.json hideRoads, 캔버스 단위): [x, y, rx, ry] 타원 또는 [[x, y], …] 다각형 */
export type HideShape = number[] | number[][];
export function hiddenBy(shapes: HideShape[]): (x: number, y: number) => boolean {
  return (x, y) => shapes.some((h) => typeof h[0] === 'number'
    ? (() => { const [cx, cy, rx, ry] = h as number[]; return ((x - cx) / rx) ** 2 + ((y - cy) / (ry || rx)) ** 2 <= 1; })()
    : inPoly(h as XY[], x, y));
}
/* 꺾은선에서 숨길 자리에 든 토막을 잘라 낸다(선분 가운데로 판정). 잘리고 남은 조각이 minLen 보다 짧으면 꼬리처럼 보이니 같이 버린다 */
export function cutHidden(pls: XY[][], hidden: (x: number, y: number) => boolean, minLen = 30): XY[][] {
  const out: XY[][] = [], len = (pl: XY[]) => pl.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pl[i - 1][0], p[1] - pl[i - 1][1]) : 0), 0);
  for (const pl of pls) {
    const pieces: XY[][] = []; let cur: XY[] = [], cut = false;
    for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, ay] = pl[i], [bx, by] = pl[i + 1];
      if (hidden((ax + bx) / 2, (ay + by) / 2)) { cut = true; if (cur.length > 1) pieces.push(cur); cur = []; }
      else { if (!cur.length) cur.push(pl[i]); cur.push(pl[i + 1]); }
    }
    if (cur.length > 1) pieces.push(cur);
    out.push(...(cut ? pieces.filter((p) => len(p) >= minLen) : pieces));
  }
  return out;
}
/* 끝점이 맞닿은 토막을 한 줄로 잇는다 — 점선 박자가 토막마다 새로 시작해 어긋나 보이던 것을 없앤다.
   이음점에서 갈래가 여럿이면 가장 곧게 이어지는 쪽과 잇는다 */
export function mergeChains(pls: XY[][], tol = 1.5): XY[][] {
  const out = pls.map((p) => p.slice());
  const near = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  const dir = (a: XY, b: XY): XY => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (;;) {
    let best: { A: XY[]; B: XY[]; i: number; j: number; dot: number } | null = null;
    for (let i = 0; i < out.length; i++) for (const A of [out[i], out[i].slice().reverse()]) {
      const end = A[A.length - 1], td = dir(A[Math.max(0, A.length - 4)], end);
      for (let j = 0; j < out.length; j++) if (j !== i) for (const B of [out[j], out[j].slice().reverse()]) {
        if (!near(end, B[0])) continue;
        const hd = dir(B[0], B[Math.min(B.length - 1, 3)]), dot = td[0] * hd[0] + td[1] * hd[1];
        if (dot > 0.7 && (!best || dot > best.dot)) best = { A, B, i, j, dot };   /* 0.7 ≈ 45° 안쪽으로 꺾일 때만 잇는다(갈림길 옆가지는 따로) */
      }
    }
    if (!best) return out;
    out[best.i] = best.A.concat(best.B.slice(1)); out.splice(best.j, 1);
  }
}
/* 막다른 끝을 진행 방향으로 섬 밖까지 늘린다(maxLen 안에서 닿을 때만). 섬으로 잘리므로 길이 가장자리 실에 물려 끝난다 */
export function extendToCoast(pls: XY[][], island: XY[], others: XY[][], maxLen = 160, joinTol = 22): XY[][] {
  /* 이어진 끝 = 다른 길의 '중간'에 닿았거나(T자), 다른 길의 끝과 거의 맞붙음(ㄱ자). 왕복 두 줄처럼 끝끼리 나란히 떨어져 끝나는 건 막다른 끝으로 본다 */
  const d = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const isJoined = (p: XY, self: XY[]) => others.some((o) => o !== self && o.some((q) => { const nearEnd = Math.min(d(q, o[0]), d(q, o[o.length - 1])) < joinTol * 2; return nearEnd ? d(p, q) < 3 : d(p, q) < joinTol; }));
  const reach = (p: XY, from: XY): XY | null => {
    const l = Math.hypot(p[0] - from[0], p[1] - from[1]) || 1, dx = (p[0] - from[0]) / l, dy = (p[1] - from[1]) / l;
    for (let t = 2; t <= maxLen; t += 2) if (!inPoly(island, p[0] + dx * t, p[1] + dy * t)) return [p[0] + dx * (t + 30), p[1] + dy * (t + 30)];
    return null;
  };
  return pls.map((pl) => {
    let r = pl;
    const tail = r[r.length - 1], tailFrom = r[Math.max(0, r.length - 4)];
    if (!isJoined(tail, pl)) { const e = reach(tail, tailFrom); if (e) r = r.concat([e]); }
    const head = r[0], headFrom = r[Math.min(r.length - 1, 3)];
    if (!isJoined(head, pl)) { const e = reach(head, headFrom); if (e) r = [e as XY].concat(r); }
    return r;
  });
}
/* 꺾은선을 다각형 안쪽 토막들로 자른다(주민 길 그래프용) */
export function insideRuns(pls: XY[][], poly: XY[]): XY[][] {
  const out: XY[][] = [];
  for (const pl of pls) { let cur: XY[] = []; for (const p of pl) { if (inPoly(poly, p[0], p[1])) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } } if (cur.length > 1) out.push(cur); }
  return out;
}
