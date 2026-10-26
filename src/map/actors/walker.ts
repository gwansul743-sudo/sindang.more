/* 주민 — 큰 길을 걷다가 가끔 멈추고, 포인터가 다가오면 손을 흔든다. 화면에서 멀어지면 화면 바로 바깥 길로 옮겨져 다시 걸어 들어온다. */
import { el } from '../svg';
import { SW, FEET, SHADOW, mountFrames, type FrameSet, type Palette } from '../sprites/compose';
import { walkerFrames, type CharacterParts, type HairStyle } from '../sprites/frames';
import type { RoadGraph, GraphEdge } from './roadGraph';
import { HIT_TOP, HIT_H, overBody, HoverProbe, type Actor, type Frame, type Scene } from './scene';

export interface Look { style: HairStyle; bun?: boolean | number; bag?: boolean | number }
export interface WalkerPalette { skin: string[]; hair: string[]; top: string[]; pant: string[]; shoe: string[]; hat: string[]; bag: string[] }
export interface WalkerOptions { parts: CharacterParts; look: Look; col: Palette; graph: RoadGraph; edge: GraphEdge; flip: boolean; speed: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const CYCLE = [1, 2, 3, 2];   // 디딤 → 모음(살짝 올라감) → 반대 디딤 → 모음

/* 주민 색: 윗옷은 겹치지 않게 바깥에서 정해 주고, 나머지는 팔레트에서 뽑는다 */
export function walkerColors(pal: WalkerPalette, top: string, i: number, rand: () => number = Math.random): Palette {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
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

  /* 말을 거는 동안 멈춰 세우기(마을 사람 인터뷰, 10-23) — 붙잡혀 있는 동안은 걷지도, 화면 밖으로 옮겨지지도 않는다 */
  held = false;
  hitHalf = 5.5;                  /* 몸 판정 칸 가로 반폭(칸). 그려진 몸 가로 11칸 */
  hover = new HoverProbe();       /* 엔진이 hover.onHover 를 단다(대본 있는 주민만) */
  hold() { this.held = true; if (this.mode === 'walk') { this.mode = 'pause'; this.until = Infinity; } }
  release() { if (!this.held) return; this.held = false; if (this.mode === 'pause') this.until = 0; }
  /* 누를 수 있는 주민: 스프라이트 칸 전체를 덮는 투명 사각형(픽셀 사이 빈칸도 잡히게) + 손가락 커서. 이벤트는 엔진이 g 에 단다 */
  makeClickable() {
    if (this.g.classList.contains('wk-talk')) return;
    this.g.classList.add('wk-talk');
    const r = el('rect', { class: 'wk-hit', x: -this.hitHalf, y: -HIT_TOP, width: this.hitHalf * 2, height: HIT_H, fill: 'transparent' });   /* 그려진 몸(가로 11·세로 16칸)만 — 칸 전체(17×19)로 잡으면 옆 빈 곳에서도 대화가 떴다(10-23) */
    r.style.pointerEvents = 'visible';   /* 'all' 은 숨긴(visibility:hidden) 주민도 마우스를 받아, 이장님 대화 중 안 보이는 주민의 말풍선이 떴다(10-23) */ this.g.style.cursor = 'pointer'; this.g.insertBefore(r, this.g.firstChild);
  }

  /* 머리 위 빨간 세모(이장님과 같은 NPC 표시) — 시민이 구글폼으로 인터뷰를 남겨 생긴 주민에게만 붙인다(10-23 사용자 결정). 도안은 chief.json 의 mark */
  private mark: SVGGElement | null = null; private markB = -1;
  showMark(M: { outline: string; fill: string; shine: string; colors: { outline: string; fill: string; shine: string } }) {
    if (this.mark) return;
    this.mark = el('g', { class: 'wk-mark' }, this.g);
    el('path', { d: M.outline, fill: M.colors.outline }, this.mark); el('path', { d: M.fill, fill: M.colors.fill }, this.mark); el('path', { d: M.shine, fill: M.colors.shine }, this.mark);
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
    const { now, dt, V, s, P, live, still, kiosk, nearPx, lms, LK } = f, G = this.G;
    const mul = f.mul, q = f.q * mul, k = f.k * mul;   /* 배율은 엔진이 준다(전시 보드 위에서는 크게, 10-23). 이장님·고양이도 같이 */
    if (!still && !this.held) {
      const fx = (this.x - V.x) * s, fy = (this.y - V.y) * s;
      this.offT = fx < -nearPx || fx > V.pw + nearPx || fy < -nearPx || fy > V.ph + nearPx ? this.offT + dt : 0;
      if (this.offT > this.offLimit) { this.relocate(f, others); this.offT = 0; this.offLimit = rnd(1, 3.5); }
    }
    /* 포인터가 몸 판정 칸 위에 있나(화면 px) — 손 흔들기와 hover 말풍선이 같은 칸(10-26) */
    const sx = (this.x + this.ox - V.x) * s, sy = (this.y + this.oy - V.y) * s;
    const over = this.lastT !== 'off' && overBody(P, sx, sy, q, this.hitHalf), near = live && over;
    if (!near) this.armed = true;
    this.hover.step(over, P, now);
    if (near && this.mode !== 'wave' && (this.armed || (now - P!.t < 140 && now - this.waveEnd > 700))) { this.mode = 'wave'; this.waveStart = now; this.waveMin = now + 1200; this.armed = false; }
    /* 최소 1.2초는 흔들고, 포인터가 곁에서 움직이는 동안은 계속. 포인터가 2.4초 멈춰 있으면 다시 걷기 */
    if (this.mode === 'wave' && now > this.waveMin && !(near && now - P!.t < 2400)) { this.mode = 'walk'; this.waveEnd = now; }
    if (this.held && this.mode === 'walk') { this.mode = 'pause'; this.until = Infinity; }   /* 손인사가 끝나도 붙잡혀 있으면 계속 서 있기 */
    if (this.mode === 'pause' && now > this.until) { this.mode = 'walk'; this.nextPause = rnd(9, 24); }
    if (this.mode === 'walk' && !still) {
      this.nextPause -= dt;
      if (this.nextPause <= 0 && !this.held) {
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
    if (this.mark) { const mb = still ? 0 : Math.floor(now / 520) % 2; if (mb !== this.markB) { this.mark.setAttribute('transform', `translate(${-SW / 2},${-FEET - mb - hop})`); this.markB = mb; } }   /* 세모: 0.52초마다 한 칸 오르내림(이장님과 같은 박자) */
    f.place(this, sx, sy, this.mode === 'walk' && this.face === 'side' && this.dir < 0 ? -1 : 1, hop, mul);
  }
}

/* 주민 여럿을 길 위에 흩어 놓는다. 처음 다섯은 첫 랜드마크(집) 근처에서, 서로 46단위 이상 떨어뜨려 시작 */
export interface FixedLook extends Look { col?: Partial<Palette> }   /* 대본에 지정한 모습(10-23): 머리 모양·가방 + 색(팔레트 키 h·t·p·b·s·a·g). 빠진 색은 무작위 */
export interface SpawnOptions { graph: RoadGraph; parts: CharacterParts; palette: WalkerPalette; looks: Look[]; count: number; speed: number; home: { x: number; y: number }; fixed?: (FixedLook | undefined)[] }
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
    const fx = o.fixed?.[i], look: Look = fx ? { style: fx.style, bun: fx.bun, bag: fx.bag } : o.looks[i % o.looks.length], edge = spawnEdge(i < 5);
    const col = { ...walkerColors(o.palette, tops[i % tops.length], i), ...(fx?.col || {}) } as Palette;
    const w = new Walker(scene.layer, { parts: o.parts, look, col, graph: G, edge, flip: Math.random() < 0.5, speed: o.speed });
    scene.add(w); out.push(w);
  }
  return out;
}

/* 주민 한 명을 나중에 더하기(시민 인터뷰 주민, 10-23) — 모습은 seed 로 정해진다(같은 응답이면 늘 같은 사람).
   자리는 화면 밖 길부터(갑자기 눈앞에 생기지 않게), 없으면 아무 길. 뺄 때는 scene.remove */
export interface OneWalkerOptions { graph: RoadGraph; parts: CharacterParts; palette: WalkerPalette; looks: Look[]; speed: number; seed: number; offscreen?: (x: number, y: number) => boolean }
export function spawnWalker(scene: Scene, o: OneWalkerOptions): Walker {
  let a = o.seed || 1; const rand = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const look = o.looks[Math.floor(rand() * o.looks.length)], top = o.palette.top[Math.floor(rand() * o.palette.top.length)];
  const col = walkerColors(o.palette, top, Math.floor(rand() * 7), rand);
  const G = o.graph; let edge = G.edges[Math.floor(rand() * G.edges.length)];
  if (o.offscreen) for (let k = 0; k < 40; k++) { const e = G.randomEdge(), x = (G.nodes[e.a].x + G.nodes[e.b].x) / 2, y = (G.nodes[e.a].y + G.nodes[e.b].y) / 2; if (o.offscreen(x, y)) { edge = e; break; } }
  const w = new Walker(scene.layer, { parts: o.parts, look, col, graph: G, edge, flip: rand() < 0.5, speed: o.speed });
  scene.add(w); return w;
}
