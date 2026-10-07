/* 땅(섬) 기하 — content/map/land.json 의 landPath(픽셀 외곽선 path d)에서 계산한다. DOM을 읽지 않는다.
   뷰포트의 이동 한계, 주민이 걸을 수 있는 범위, 밤 바다 장식이 모두 이것을 쓴다. */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export type Point = [number, number];

export interface LandGeometry {
  polygon: Point[];
  bounds: Box;                        // 외곽선 상자. y1 에는 절벽 두께 16 이 더해져 있다
  contains(x: number, y: number): boolean;
}

export function parseLandPath(d: string): Point[] {
  const n = (d.match(/-?\d+\.?\d*/g) || []).map(Number);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}

export function createLand(landPath: string, W: number, H: number): LandGeometry {
  const polygon = parseLandPath(landPath);
  let bounds: Box;
  if (polygon.length < 3) bounds = { x0: 0, y0: 0, x1: W, y1: H };
  else {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    bounds = { x0, y0, x1, y1: y1 + 16 };
  }
  const contains = (x: number, y: number) => {
    if (polygon.length < 3) return x > 20 && y > 20 && x < W - 20 && y < H - 20;
    let c = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [x1, y1] = polygon[i], [x2, y2] = polygon[j];
      if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
    }
    return c;
  };
  return { polygon, bounds, contains };
}
