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
