/* 주민 — 큰 길을 걷다가 가끔 멈추고, 포인터가 다가오면 손을 흔든다. 화면에서 멀어지면 화면 바로 바깥 길로 옮겨져 다시 걸어 들어온다. */
import { el } from '../svg';
import { SW, FEET, SHADOW, mountFrames, type FrameSet, type Palette } from '../sprites/compose';
import { walkerFrames, type CharacterParts, type HairStyle } from '../sprites/frames';
import type { RoadGraph, GraphEdge } from './roadGraph';
import type { Actor, Frame, Scene } from './scene';

export interface Look { style: HairStyle; bun?: boolean | number; bag?: boolean | number }
export interface WalkerPalette { skin: string[]; hair: string[]; top: string[]; pant: string[]; shoe: string[]; hat: string[]; bag: string[] }
export interface WalkerOptions { parts: CharacterParts; look: Look; col: Palette; graph: RoadGraph; edge: GraphEdge; flip: boolean; speed: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const CYCLE = [1, 2, 3, 2];   // 디딤 → 모음(살짝 올라감) → 반대 디딤 → 모음

/* 주민 색: 윗옷은 겹치지 않게 바깥에서 정해 주고, 나머지는 팔레트에서 뽑는다 */
export function walkerColors(pal: WalkerPalette, top: string, i: number): Palette {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  let hat = pick(pal.hat); if (hat === top) hat = '#f4e8b5';
  return { o: '#2b3f33', e: '#2b3028', c: '#ef9f8a', m: '#a5402f', s: pick(pal.skin), h: pick(i % 7 === 4 ? pal.hair.slice(4) : pal.hair.slice(0, 4)), t: top, p: pick(pal.pant), b: pick(pal.shoe), a: hat, g: pick(pal.bag) };
}

export class Walker implements Actor {
  g: SVGGElement; body: SVGGElement; fs: FrameSet;
  x: number; y: number; ox = 0; oy = 0; front = false; lastT = ''; lastB = '';
  private G: RoadGraph; private a: number; private b: number; private d: number; private len: number;
  private face = 'front'; private faceWant = 'front'; private faceT = 0; private dir = 1; private dirWant = 1;
  private mode: 'walk' | 'pause' | 'wave' = 'walk'; private until = 0; private nextPause = rnd(4, 16); private walkT = Math.random() * 4;
  private speed: number; private offT = 0; private offLimit = rnd(1, 3.5); private armed = true; private waveStart = 0; private waveMin = 0; private waveEnd = 0;

  constructor(parent: SVGGElement, o: WalkerOptions) {
    this.G = o.graph;
    this.g = el('g', { class: 'wk' }, parent);
    el('path', { d: SHADOW, fill: '#24382d', opacity: '.22', transform: `translate(${-SW / 2},${-FEET})` }, this.g);
    this.fs = mountFrames(this.g, walkerFrames(o.parts, o.look.style, o.look.bun, o.look.bag), o.col); this.body = this.fs.body;
    this.a = o.flip ? o.edge.b : o.edge.a; this.b = o.flip ? o.edge.a : o.edge.b; this.d = Math.random() * o.edge.l; this.len = o.edge.l;
    this.x = this.G.nodes[this.a].x; this.y = this.G.nodes[this.a].y; this.speed = o.speed * rnd(0.8, 1.2);
  }

  /* 다른 길 그래프로 옮겨 타기 — 전시 모드의 5길 울타리(안쪽 길만) ⇄ 평소의 큰 길. 보이지 않을 때 부른다(그 자리에서 순간이동) */
  setGraph(G: RoadGraph) {
    if (G === this.G || !G.edges.length) return;
    this.G = G; const e = G.randomEdge(); const flip = Math.random() < 0.5;
    this.a = flip ? e.b : e.a; this.b = flip ? e.a : e.b; this.d = Math.random() * e.l; this.len = e.l || 0.01; this.ox = 0; this.oy = 0;
    this.x = G.nodes[this.a].x; this.y = G.nodes[this.a].y; this.mode = 'walk'; this.nextPause = rnd(4, 16); this.offT = 0;
  }

  /* 화면에서 멀어진 주민을 화면 바로 바깥의 큰 길로 옮김 (보이지 않는 곳에서만) */
  private relocate(f: Frame, others: Actor[]) {
    const { V, s, q, nearPx } = f, G = this.G;
    const x0 = V.x, y0 = V.y, x1 = V.x + V.pw / s, y1 = V.y + V.ph / s, m = nearPx / s, padX = (9 * q + 4) / s, padT = 3 / s, padB = (17 * q + 4) / s, cand: { e: GraphEdge; d: number }[] = [];
    for (const e of G.edges) {
      const x = (G.nodes[e.a].x + G.nodes[e.b].x) / 2, y = (G.nodes[e.a].y + G.nodes[e.b].y) / 2;
      if (x < x0 - m || x > x1 + m || y < y0 - m || y > y1 + m) continue;                 /* 너무 멂 */
      if (x > x0 - padX && x < x1 + padX && y > y0 - padT && y < y1 + padB) continue;     /* 화면 안 — 눈앞에 갑자기 나타나면 안 됨 */
      if (others.some((o) => o !== this && Math.hypot(o.x - x, o.y - y) < 24)) continue;
      cand.push({ e, d: Math.max(x0 - x, x - x1, y0 - y, y - y1, 0) });
    }
    if (!cand.length) return;
    cand.sort((a, b) => a.d - b.d);
    const e = cand[Math.floor(Math.random() * Math.min(8, cand.length))].e, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const da = Math.hypot(G.nodes[e.a].x - cx, G.nodes[e.a].y - cy), db = Math.hypot(G.nodes[e.b].x - cx, G.nodes[e.b].y - cy);
    this.a = da > db ? e.a : e.b; this.b = da > db ? e.b : e.a; this.d = 0; this.len = e.l || 0.01; this.ox = 0; this.oy = 0;   /* 화면 쪽을 향해 출발 */
    this.x = G.nodes[this.a].x; this.y = G.nodes[this.a].y; this.mode = 'walk'; this.nextPause = rnd(6, 16);
  }

  tick(f: Frame, others: Actor[]) {
    const { now, dt, V, s, R, P, live, still, kiosk, nearPx, lms, LK } = f, G = this.G;
    const mul = kiosk ? 0.5 : 1, q = f.q * mul, k = f.k * mul;   /* 전시 모드(10-21): 주민은 절반 크기 — 카메라가 1.6⁴까지 들어가 있어 원래 크기면 너무 크다. 이장님·고양이는 그대로 */
    if (!still) {
      const fx = (this.x - V.x) * s, fy = (this.y - V.y) * s;
      this.offT = fx < -nearPx || fx > V.pw + nearPx || fy < -nearPx || fy > V.ph + nearPx ? this.offT + dt : 0;
      if (this.offT > this.offLimit) { this.relocate(f, others); this.offT = 0; this.offLimit = rnd(1, 3.5); }
    }
    /* 포인터와의 거리(화면 px, 몸통 중심 기준) */
    const sx = (this.x + this.ox - V.x) * s, sy = (this.y + this.oy - V.y) * s;
    const pd = live && P ? Math.hypot(P.x - sx, P.y - (sy - 8 * q)) : Infinity, near = pd < R;
    if (pd > R * 1.4) this.armed = true;
    if (near && this.mode !== 'wave' && (this.armed || (now - P!.t < 140 && now - this.waveEnd > 700))) { this.mode = 'wave'; this.waveStart = now; this.waveMin = now + 1200; this.armed = false; }
    /* 최소 1.2초는 흔들고, 포인터가 곁에서 움직이는 동안은 계속. 포인터가 2.4초 멈춰 있으면 다시 걷기 */
    if (this.mode === 'wave' && now > this.waveMin && !(near && now - P!.t < 2400)) { this.mode = 'walk'; this.waveEnd = now; }
    if (this.mode === 'pause' && now > this.until) { this.mode = 'walk'; this.nextPause = rnd(9, 24); }
    if (this.mode === 'walk' && !still) {
      this.nextPause -= dt;
      if (this.nextPause <= 0) {
        if (kiosk && Math.random() < 0.5) { this.mode = 'wave'; this.waveStart = now; this.waveMin = now + rnd(1500, 2400); }   /* 전시 모드: 가끔 먼저 인사 */
        else { this.mode = 'pause'; this.until = now + rnd(1200, 3200); }
        this.nextPause = rnd(9, 24);
      } else {
        this.d += this.speed * dt; this.walkT += dt;
        let guard = 0; while (this.d >= this.len && guard++ < 8) { this.d -= this.len; const nx = G.nextNode(this.b, this.a); this.a = this.b; this.b = nx; this.len = G.dist(this.a, this.b) || 0.01; }
      }
    }
    const A = G.nodes[this.a], B = G.nodes[this.b], t = Math.min(1, this.d / this.len), dx = B.x - A.x, dy = B.y - A.y, dl = Math.hypot(dx, dy) || 1;
    this.x = A.x + dx * t; this.y = A.y + dy * t;
    /* 길 가운데가 아니라 진행 방향 오른쪽으로 살짝 — 마주 오는 사람과 비켜 걷기 */
    const tox = (-dy / dl) * 3 / s, toy = (dx / dl) * 3 / s, ease = Math.min(1, dt * 4); this.ox += (tox - this.ox) * ease; this.oy += (toy - this.oy) * ease;
    /* 바라보는 방향 (잔떨림 방지로 0.25초 유지돼야 바뀜) */
    const want = Math.abs(dx) > Math.abs(dy) * 0.9 ? 'side' : dy > 0 ? 'front' : 'back', wdir = dx < 0 ? -1 : 1;
    if (want !== this.faceWant || (want === 'side' && wdir !== this.dirWant)) { this.faceWant = want; this.dirWant = wdir; this.faceT = now; }
    if ((this.face !== this.faceWant || this.dir !== this.dirWant) && now - this.faceT > 250) { this.face = this.faceWant; if (want === 'side') this.dir = this.dirWant; }
    /* 프레임 */
    let hop = 0;
    if (this.mode === 'wave') { const wt = now - this.waveStart, fr = Math.floor(wt / 170) % 2; this.fs.show('wave' + fr); hop = wt < 110 ? 1 : wt < 230 ? 2 : wt < 330 ? 1 : 1 - fr; }   /* 폴짝 → 흔들며 까딱까딱 */
    else if (this.mode === 'pause' || still) this.fs.show('front0');
    else this.fs.show(this.face + CYCLE[Math.floor(this.walkT / 0.19) % 4]);
    /* 랜드마크 건물 발치(앞)에 있으면 앞 층으로 */
    let front = false; const fx = this.x + this.ox, fy = this.y + this.oy;
    for (const l of lms) { if (Math.abs(fx - l.x) < 18 * LK + 5 * k && fy > l.y - 2.5 * LK && fy < l.y + 2 * LK + 18 * k) { front = true; break; } }
    if (front !== this.front) { f.setFront(this, front); this.front = front; }
    f.place(this, sx, sy, this.mode === 'walk' && this.face === 'side' && this.dir < 0 ? -1 : 1, hop, mul);
  }
}

/* 주민 여럿을 길 위에 흩어 놓는다. 처음 다섯은 첫 랜드마크(집) 근처에서, 서로 46단위 이상 떨어뜨려 시작 */
export interface SpawnOptions { graph: RoadGraph; parts: CharacterParts; palette: WalkerPalette; looks: Look[]; count: number; speed: number; home: { x: number; y: number } }
export function spawnWalkers(scene: Scene, o: SpawnOptions): Walker[] {
  const G = o.graph, tops = o.palette.top.slice().sort(() => Math.random() - 0.5), out: Walker[] = [];   /* 적은 인원이니 윗옷 색이 겹치지 않게 */
  const spawnEdge = (nearHome: boolean) => {
    for (let tries = 0; tries < 60; tries++) {
      const e = G.randomEdge(), x = (G.nodes[e.a].x + G.nodes[e.b].x) / 2, y = (G.nodes[e.a].y + G.nodes[e.b].y) / 2;
      if (nearHome && Math.hypot(x - o.home.x, y - o.home.y) > 210) continue;
      if (scene.actors.some((w) => Math.hypot(w.x - x, w.y - y) < (tries < 40 ? 46 : 20))) continue;
      return e;
    }
    return G.edges[Math.floor(Math.random() * G.edges.length)];
  };
  for (let i = 0; i < o.count; i++) {
    const look = o.looks[i % o.looks.length], edge = spawnEdge(i < 5);
    const w = new Walker(scene.layer, { parts: o.parts, look, col: walkerColors(o.palette, tops[i % tops.length], i), graph: G, edge, flip: Math.random() < 0.5, speed: o.speed });
    scene.add(w); out.push(w);
  }
  return out;
}
