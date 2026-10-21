/* 주민이 걸을 수 있는 길 그래프 — 큰 길(roads.p.a·b) 중 땅 안쪽 구간만.
   긴 선분은 12단위로 잘게 나눠 해안 판정을 촘촘히 하고, 90단위보다 짧게 끊긴 토막길은 뺀다(제자리걸음 방지). */
import type { LandGeometry } from '../layers/land';

export interface GraphNode { x: number; y: number; nb: number[]; ok: boolean; comp: number }
export interface GraphEdge { a: number; b: number; l: number }
export interface RoadGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;                           // 간선 길이 합 (길이 비례 무작위 추출용)
  dist(a: number, b: number): number;
  nextNode(at: number, from: number): number;   // 교차로에서 다음 노드: 직진을 선호하는 무작위
  randomEdge(): GraphEdge;                 // 길이 비례 무작위 간선
}

const EDGE = 14;   // 해안선에서 띄울 여유

export interface GraphOptions { within?: (x: number, y: number) => boolean; minLen?: number }   // within: 이 안의 노드만(전시 모드의 5길 울타리). minLen: 토막길 최소 길이(기본 90)

export function buildRoadGraph(majorRoadPath: string, land: LandGeometry, opt: GraphOptions = {}): RoadGraph {
  const minLen = opt.minLen ?? 90;
  const safe = (x: number, y: number) => land.contains(x, y) && land.contains(x - EDGE, y) && land.contains(x + EDGE, y) && land.contains(x, y - EDGE - 8) && land.contains(x, y + EDGE) && (!opt.within || opt.within(x, y));
  const nodes: GraphNode[] = [], nodeAt = new Map<string, number>();
  const node = (x: number, y: number) => {
    const k = Math.round(x * 2) + ',' + Math.round(y * 2); let i = nodeAt.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, y, nb: [], ok: safe(x, y), comp: -1 }); nodeAt.set(k, i); }
    return i;
  };
  const link = (a: number, b: number) => { if (a === b) return; if (!nodes[a].nb.includes(b)) nodes[a].nb.push(b); if (!nodes[b].nb.includes(a)) nodes[b].nb.push(a); };
  majorRoadPath.split('M').forEach((part) => {
    const n = (part.match(/-?\d+\.?\d*/g) || []).map(Number); let prev = -1, px = 0, py = 0;
    for (let i = 0; i + 1 < n.length; i += 2) {
      const x = n[i], y = n[i + 1];
      if (prev < 0) { prev = node(x, y); px = x; py = y; continue; }
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 12));
      for (let k = 1; k <= steps; k++) { const cur = node(px + ((x - px) * k) / steps, py + ((y - py) * k) / steps); if (nodes[prev].ok && nodes[cur].ok) link(prev, cur); prev = cur; }
      px = x; py = y;
    }
  });
  const dist = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  /* 연결 성분별 길이 */
  let comps = 0; const compLen: number[] = [];
  nodes.forEach((n, i) => {
    if (n.comp >= 0 || !n.nb.length) return; const id = comps++; let len = 0; const st = [i]; n.comp = id;
    while (st.length) { const a = st.pop()!; nodes[a].nb.forEach((b) => { len += dist(a, b) / 2; if (nodes[b].comp < 0) { nodes[b].comp = id; st.push(b); } }); }
    compLen[id] = len;
  });
  const edges: GraphEdge[] = []; let total = 0;
  nodes.forEach((n, a) => { if (n.comp < 0 || compLen[n.comp] < minLen) return; n.nb.forEach((b) => { if (b > a) { const l = dist(a, b); edges.push({ a, b, l }); total += l; } }); });

  function nextNode(at: number, from: number) {
    const nb = nodes[at].nb.filter((n) => n !== from && nodes[n].comp === nodes[at].comp);
    if (!nb.length) return from;
    if (nb.length === 1) return nb[0];
    const dx = nodes[at].x - nodes[from].x, dy = nodes[at].y - nodes[from].y, dl = Math.hypot(dx, dy) || 1;
    const wts = nb.map((n) => { const ex = nodes[n].x - nodes[at].x, ey = nodes[n].y - nodes[at].y, c = (dx * ex + dy * ey) / (dl * (Math.hypot(ex, ey) || 1)); return 0.35 + Math.max(0, c) * Math.max(0, c) * 1.6; });
    let r = Math.random() * wts.reduce((p, c) => p + c, 0); for (let i = 0; i < nb.length; i++) { r -= wts[i]; if (r <= 0) return nb[i]; } return nb[0];
  }
  function randomEdge() { let r = Math.random() * total; for (const c of edges) { r -= c.l; if (r <= 0) return c; } return edges[0]; }
  return { nodes, edges, total, dist, nextNode, randomEdge };
}
