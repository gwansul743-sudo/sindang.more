/* 해 디오라마 속 주민(10-28) — 보드에서 걷던 그 사람들(시민 인터뷰 주민 먼저, 가게 주민, 7명까지)이 3D 골목을 걷는다.
   · 무대 그림과 같은 정사영(manifest.axon): 땅 위 점(지역 미터 x·y, z = 0) → 그림 px → 그림 칸(contain) px. 그림 칸 위 SVG 한 장에 사람 g 를 7개까지.
   · 길: 실제 길 선(sun-roads.json: roads.json 을 보드 섬 +30 m 로 자른 위경도, island = 보드 섬)을 지역 미터로 옮겨 섬 안 구간만 잇는다.
     15 m 보다 짧은 토막길은 뺀다. 큰 길(a·b)에서 더 자주 나타나고, 갈림길에서도 큰 길을 조금 더 고른다.
   · 모습: 보드 주민의 그림(g)을 통째로 복제(머리·옷 색·가방·초록 세모까지 같은 사람). 걷기 프레임은 그 안의 프레임 묶음을 차례로 보인다.
     크기는 사람 키 1.8 m × |perZ| × MUL 을 그림 칸 배율에 맞춰 정수 픽셀 칸으로(또렷하게).
   · hover → 보드와 같은 hook 말풍선, 누르면 같은 큰 대화 상자(가게 카드·카메라는 그대로). 말 거는 동안 그 사람은 멈춘다.
   · 무대가 다 들춰진 뒤에만 보이고, 나가기 시작하면 바로 숨긴다. 비교(두 그림) 장에선 숨긴다. 밤엔 테두리를 조금 밝게. */
import type { StoryPage } from './story';

export interface DioPerson { id: string; g: SVGGElement; body: SVGGElement; script: { id: string; hook: string; kind?: string } }
export interface DioVillagers {
  roster(): DioPerson[];
  hook(p: DioProxy, script: DioPerson['script']): boolean;
  talk(p: DioProxy, script: DioPerson['script']): void;
  talking(): boolean;
  done(): void;
}
export interface DioProxy { g: SVGGElement; x: number; y: number; ox: number; oy: number; hold(): void; release(): void }
interface Axon { origin: number[]; perX: number[]; perY: number[]; perZ: number[] }
interface Local { lat0: number; lng0: number; kx: number; ky: number }
interface RoadData { roads: Record<string, number[][][]>; island: number[][] }

const NS = 'http://www.w3.org/2000/svg';
const FRAMES = ['front0', 'front1', 'front2', 'front3', 'back0', 'back1', 'back2', 'back3', 'side0', 'side1', 'side2', 'side3', 'wave0', 'wave1'];
const CYCLE = [1, 2, 3, 2], SW = 17, FEET = 16, MUL = 8, SPEED = 7, MIN_COMP = 15, STEP = 6, MAX = 7;
const MAIN = new Set(['a', 'b']);

function inPoly(poly: number[][], x: number, y: number) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c; } return c; }

/* 지역 미터 길 그래프: 노드(0.5 m 격자로 합침), 간선 = 이웃 노드 */
function buildGraph(data: RoadData, L: Local) {
  const toM = ([lat, lng]: number[]) => [(lng - L.lng0) * L.kx, (lat - L.lat0) * L.ky];
  const island = data.island.map(toM);
  const nodes: { x: number; y: number; nb: number[]; main: boolean; comp: number }[] = [], key = new Map<string, number>();
  const node = (x: number, y: number, main: boolean) => { const k = Math.round(x * 2) + ',' + Math.round(y * 2); let i = key.get(k); if (i === undefined) { i = nodes.length; nodes.push({ x, y, nb: [], main, comp: -1 }); key.set(k, i); } else if (main) nodes[i].main = true; return i; };
  for (const cls in data.roads) for (const line of data.roads[cls]) {
    const pts = line.map(toM); let prev = -1;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i === 0) { prev = inPoly(island, x, y) ? node(x, y, MAIN.has(cls)) : -1; continue; }
      const [px, py] = pts[i - 1], n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / STEP));
      for (let k = 1; k <= n; k++) {
        const qx = px + ((x - px) * k) / n, qy = py + ((y - py) * k) / n;
        if (!inPoly(island, qx, qy)) { prev = -1; continue; }
        const cur = node(qx, qy, MAIN.has(cls));
        if (prev >= 0 && prev !== cur) { if (!nodes[prev].nb.includes(cur)) nodes[prev].nb.push(cur); if (!nodes[cur].nb.includes(prev)) nodes[cur].nb.push(prev); }
        prev = cur;
      }
    }
  }
  /* 연결 성분 길이 — 15 m 미만 토막은 뺀다 */
  const len: number[] = [];
  nodes.forEach((n, i) => { if (n.comp >= 0 || !n.nb.length) return; const id = len.length; let l = 0; const st = [i]; n.comp = id;
    while (st.length) { const a = st.pop()!; for (const b of nodes[a].nb) { l += Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) / 2; if (nodes[b].comp < 0) { nodes[b].comp = id; st.push(b); } } } len[id] = l; });
  const ok = (i: number) => nodes[i].comp >= 0 && len[nodes[i].comp] >= MIN_COMP;
  const edges: [number, number, number][] = [];   /* a, b, 뽑힘 가중(큰 길 3 · 골목 1) × 길이 */
  nodes.forEach((n, a) => { if (!ok(a)) return; for (const b of n.nb) if (b > a && ok(b)) edges.push([a, b, Math.hypot(n.x - nodes[b].x, n.y - nodes[b].y) * (n.main && nodes[b].main ? 3 : 1)]); });
  const total = edges.reduce((s, e) => s + e[2], 0);
  return {
    nodes, edges,
    pick() { let r = Math.random() * total; for (const e of edges) { r -= e[2]; if (r <= 0) return e; } return edges[0]; },
    next(at: number, from: number) {   /* 직진·큰 길을 조금 더 */
      const nb = nodes[at].nb.filter((n) => n !== from && ok(n)); if (!nb.length) return from;
      const dx = nodes[at].x - nodes[from].x, dy = nodes[at].y - nodes[from].y, dl = Math.hypot(dx, dy) || 1;
      const w = nb.map((n) => { const ex = nodes[n].x - nodes[at].x, ey = nodes[n].y - nodes[at].y, c = Math.max(0, (dx * ex + dy * ey) / (dl * (Math.hypot(ex, ey) || 1))); return (0.35 + c * c * 1.6) * (nodes[n].main ? 1.6 : 1); });
      let r = Math.random() * w.reduce((s, v) => s + v, 0); for (let i = 0; i < nb.length; i++) { r -= w[i]; if (r <= 0) return nb[i]; } return nb[0];
    },
  };
}

export function mountDioWalkers(o: { pane: HTMLElement; axon: Axon; local: Local; size: number[]; data: RoadData; who: DioVillagers; onTalk: () => void; cell?: () => number; scale?: () => number }) {   // cell: 스프라이트 한 칸 = 세계 몇 단위(카메라가 당겨도 화면 크기를 지키게)
  const G = buildGraph(o.data, o.local);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'kb-dio-wk'); svg.setAttribute('aria-hidden', 'true');
  o.pane.appendChild(svg);
  const A = o.axon, toImg = (x: number, y: number) => [A.origin[0] + x * A.perX[0] + y * A.perY[0], A.origin[1] + x * A.perX[1] + y * A.perY[1]];
  type W = { p: DioPerson; g: SVGGElement; body: SVGGElement; frames: Element[]; shown: number; a: number; b: number; d: number; held: boolean; walkT: number; flip: number; face: string; proxy: DioProxy; sx: number; sy: number };
  let ws: W[] = [], raf = 0, last = 0, on = false, box = { k: 1, ox: 0, oy: 0, q: 1 };

  function measure() {
    const [IW, IH] = o.size, w = o.pane.clientWidth, h = o.pane.clientHeight, k = Math.min(w / IW, h / IH);   /* 그림 칸(contain) */
    box = { k, ox: (w - IW * k) / 2, oy: (h - IH * k) / 2, q: Math.max(1, Math.round((1.8 * Math.abs(A.perZ[1]) * MUL * k) / 18)) };
  }
  function spawn() {
    ws.forEach((w) => w.g.remove()); ws = [];
    if (!G.edges.length) return;
    const people = o.who.roster().slice(0, MAX);
    for (const p of people) {
      const g = p.g.cloneNode(true) as SVGGElement;
      const bi = [...p.g.children].indexOf(p.body), body = g.children[bi] as SVGGElement;   /* 몸 묶음은 지우기 전에(칸 순서가 바뀐다) */
      if (!body) continue;
      ['transform', 'display', 'data-script', 'style'].forEach((a) => g.removeAttribute(a));
      g.querySelectorAll('.wk-ring,.wk-hit').forEach((e) => e.remove());
      g.setAttribute('class', 'kb-dio-w' + (p.script.kind === 'form' ? ' form' : ''));
      const hit = document.createElementNS(NS, 'rect'); hit.setAttribute('class', 'kb-dio-hit'); hit.setAttribute('fill', 'transparent'); g.appendChild(hit);
      const e = G.pick(), flip = Math.random() < 0.5;
      [...body.children].forEach((f) => f.setAttribute('display', 'none'));   /* 복제할 때 보드에서 보이던 프레임까지 숨기고 시작 */
      const w: W = { p, g, body, frames: [...body.children], shown: -1, a: flip ? e[1] : e[0], b: flip ? e[0] : e[1], d: Math.random() * Math.hypot(G.nodes[e[0]].x - G.nodes[e[1]].x, G.nodes[e[0]].y - G.nodes[e[1]].y), held: false, walkT: Math.random() * 4, flip: 1, face: 'front', sx: 0, sy: 0,
        proxy: { g, x: 0, y: 0, ox: 0, oy: 0, hold: () => { w.held = true; }, release: () => { w.held = false; } } };
      hit.addEventListener('pointerenter', (ev) => { if ((ev as PointerEvent).pointerType === 'mouse') o.who.hook(w.proxy, p.script); });
      hit.addEventListener('click', (ev) => { ev.stopPropagation(); o.who.talk(w.proxy, p.script); o.onTalk(); });
      svg.appendChild(g); ws.push(w);
    }
  }
  function show(w: W, i: number) { if (w.shown === i) return; if (w.shown >= 0) w.frames[w.shown]?.setAttribute('display', 'none'); w.frames[i]?.removeAttribute('display'); w.shown = i; }
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const { k, ox, oy, q } = box; if (Math.abs(pxPerCell() - ppc) > 0.05) sizeHits();
    for (const w of ws) {
      const na = G.nodes[w.a], nb = G.nodes[w.b], L = Math.hypot(nb.x - na.x, nb.y - na.y) || 0.01;
      if (!w.held) { w.d += SPEED * dt; w.walkT += dt; while (w.d >= L) { w.d -= L; const n = G.next(w.b, w.a); w.a = w.b; w.b = n; break; } }
      const A2 = G.nodes[w.a], B2 = G.nodes[w.b], L2 = Math.hypot(B2.x - A2.x, B2.y - A2.y) || 0.01, t = Math.min(1, w.d / L2);
      const x = A2.x + (B2.x - A2.x) * t, y = A2.y + (B2.y - A2.y) * t;
      const [u, v] = toImg(x, y), [u2, v2] = toImg(B2.x, B2.y), du = u2 - u, dv = v2 - v;
      const sx = ox + u * k, sy = oy + v * k;
      if (w.held) show(w, FRAMES.indexOf('front0'));
      else { const face = Math.abs(du) > Math.abs(dv) * 1.2 ? 'side' : dv > 0 ? 'front' : 'back'; w.face = face; w.flip = face === 'side' && du < 0 ? -1 : 1;
        show(w, FRAMES.indexOf(face + CYCLE[Math.floor(w.walkT / 0.19) % 4])); }
      w.sx = sx; w.sy = sy; w.proxy.x = sx; w.proxy.y = sy;
      w.g.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)}) scale(${(o.cell ? o.cell() : q).toFixed(3)})`);
      w.body.setAttribute('transform', `translate(${w.flip < 0 ? SW / 2 : -SW / 2},${-FEET}) scale(${w.flip},1)`);
    }
    ws.slice().sort((a, b) => a.sy - b.sy).forEach((w, i) => { if (svg.children[i] !== w.g) svg.appendChild(w.g); });   /* 아래(앞)에 있는 사람이 위에 */
  }
  const onResize = () => { measure(); sizeHits(); };
  let ppc = 0;   /* 화면 px / 스프라이트 칸 — 바뀌면 누르는 칸을 다시(화면에서 44px 이상) */
  const pxPerCell = () => (o.cell && o.scale ? o.cell() * o.scale() : box.q);
  function sizeHits() { ppc = pxPerCell(); const hw = Math.max(6, 22 / ppc), hh = Math.max(18, 44 / ppc); ws.forEach((w) => { const r = w.g.querySelector('.kb-dio-hit')!; r.setAttribute('x', String(-hw)); r.setAttribute('width', String(hw * 2)); r.setAttribute('y', String(-FEET - (hh - 18) / 2)); r.setAttribute('height', String(hh)); }); }   /* 누르는 칸은 화면에서 44px 이상 */
  return {
    start() { if (on) return; on = true; measure(); spawn(); sizeHits(); svg.classList.add('on'); last = performance.now(); raf = requestAnimationFrame(tick); window.addEventListener('resize', onResize); },
    stop() { if (!on) return; on = false; cancelAnimationFrame(raf); svg.classList.remove('on'); window.removeEventListener('resize', onResize); if (ws.some((w) => w.held)) o.who.done(); ws.forEach((w) => w.g.remove()); ws = []; },
    page(_p: StoryPage, night: boolean) { svg.classList.toggle('night', night); },
    destroy() { this.stop(); svg.remove(); },
    get count() { return ws.length; },
  };
}
export type DioWalkers = ReturnType<typeof mountDioWalkers>;
