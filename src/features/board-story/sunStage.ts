/* 해 디오라마 무대(10-28, TASK_12) — '세계' 상자 하나(기준 그림 크기 1920×1440) 안에 그림 두 장(이중 버퍼)과 전환 영상 둘을 두고,
   카메라 = CSS matrix(s,0,0,s,tx,ty) 하나로 모든 장면을 움직인다. 그림 px(기준) 좌표가 곧 세계 좌표라 겹쳐 그리는 SVG(건물 고르기·주민)도 같은 상자에 넣는다.
   · 보기(view): none(천 보드) · plan(위에서 본 신당, hi/top_today13) · axon(해 그림, 기울어진 보기) · zoom(axon 에서 고른 건물로 다가간 보기).
   · 전환
     보드 → plan : 위에서 본 첫 장면(trans_t00)을 보드 길에 맞춰(aff_t00, 축마다 배율·평행이동) 띄우고 천이 걷힌 뒤 무대 가운데로 옮겨 가며 hi 그림으로 바꿔 낀다(영상 없음)
     보드 ⇄ axon : 그 자리에서 영상(transition.webm / _rev)을 틀며 카메라를 보드 자리 ⇄ 무대 가운데로
     plan ⇄ axon : 무대 가운데 그대로 영상만
     plan → zoom : 영상을 틀며 고른 건물을 프레임마다(aff_frames[k], requestVideoFrameCallback) 화면 위 한 길로 끌고 가 무대 가운데에서 크게 — 건물이 흔들리지 않는다
     zoom → plan : 거꾸로 영상, 지금 카메라에서 plan 자리로 같은 방식
     zoom → axon : 카메라만 0.4초에 무대 가운데로, 그림은 바꿔 낀다
     plan/axon → 보드 : plan 은 카메라를 보드 자리로 되돌리고, axon 은 거꾸로 영상 — 끝에 천이 다시 덮인다
   · 이음매: 영상 첫 장 = 지금 그림, 끝 장 = 내릴 그림(미리 decode)이라 바꿔 끼울 때 0.25초 겹치기만. 그림은 decode 가 끝난 뒤에만 바꾼다(빈 장면 없음).
   · 영상이 800ms 안에 재생되지 않으면(못 받음·오류·막힘) 카메라만 움직이며 그림을 겹쳐 바꾸는 쪽으로 — 멈추지 않는다. 동작 줄이기도 같음.
   · 맞춤(TASK_16): 내려앉은 보기는 4:3 그림 전체가 아니라 섬이 보이는 칸(그림 알파 > 8 의 상자, 그림마다 한 번)을 무대 칸에 2.5 % 여백으로 맞춘다.
     plan 은 top_today13, axon(·zoom 의 1–3배 기준)은 hi 해 그림 한 장. plan ⇄ axon 영상 동안엔 두 맞춤 사이를 카메라로 잇는다. 보드 자리(t00)는 그대로.
   · 크기가 바뀌면(전체 화면·창 크기·TV, ResizeObserver) 전환이 끝나 가만히 있을 때 다시 맞춘다: plan·axon 은 새 맞춤으로,
     zoom 은 무대 가운데 점을 지키며 맞춤 배율 비율만큼. 칸이 0 크기일 때 잰 맞춤은 쓰지 않는다(마지막 정상 맞춤으로).
   · ?patch_slow=N 이면 N배 느리게. */
export interface Aff { origin: number[]; perX: number[]; perY: number[]; perZ?: number[] }
export interface LocalFrame { lat0: number; lng0: number; kx: number; ky: number }
export interface TransVideo { video: string; video_rev: string; first: string; aff_t00: Aff; aff_frames?: Aff[]; fps?: number }
export interface Cam { s: number; tx: number; ty: number }
export type View = 'none' | 'plan' | 'axon' | 'zoom';
export interface StageOpts {
  stage: HTMLElement; host: HTMLElement; area: HTMLElement; base: string; size: number[];
  trans: TransVideo; local: LocalFrame;
  boardAt(lat: number, lng: number): [number, number] | null;   // 위경도 → 무대(#map) 안 화면 px(천 보드 경로)
  fetchImg(src: string): Promise<boolean>;
  onCam?(c: Cam): void;                                         // 카메라가 움직일 때마다(겹쳐 그린 것 크기 맞추기)
}

const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const WAIT_MS = 800, FADE = 250;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mtx = (c: Cam) => `matrix(${c.s},0,0,${c.s},${c.tx},${c.ty})`;
const lerpCam = (a: Cam, b: Cam, p: number): Cam => { const s = a.s * (b.s / a.s) ** p; const q = Math.abs(b.s - a.s) > 1e-6 ? (s - a.s) / (b.s - a.s) : p; return { s, tx: a.tx + (b.tx - a.tx) * q, ty: a.ty + (b.ty - a.ty) * q }; };   /* 배율은 곱으로(자연스러운 줌), 자리는 배율 진행에 맞춰 */
export const project = (a: Aff, x: number, y: number, z = 0): [number, number] => [a.origin[0] + x * a.perX[0] + y * a.perY[0] + z * (a.perZ?.[0] || 0), a.origin[1] + x * a.perX[1] + y * a.perY[1] + z * (a.perZ?.[1] || 0)];

export function mountSunStage(o: StageOpts) {
  const [W, H] = o.size, FPS = o.trans.fps || 60;
  const world = document.createElement('div'); world.className = 'kb-dio-world'; world.style.width = W + 'px'; world.style.height = H + 'px';
  const imgs = [0, 1].map(() => { const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.draggable = false; world.appendChild(im); return im; });
  const vid = (src: string) => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('aria-hidden', 'true'); v.dataset.src = o.base + src; world.appendChild(v); return v; };
  const fwd = vid(o.trans.video), rev = vid(o.trans.video_rev);
  o.stage.appendChild(world);
  let cam: Cam = { s: 1, tx: 0, ty: 0 }, view: View = 'none', run = 0, raf = 0, timers: number[] = [], front = 0, shown = '', loading = false;
  const at = (fn: () => void, ms: number) => { const my = run; timers.push(window.setTimeout(() => { if (my === run) fn(); }, ms * SLOW)); };
  const clear = () => { run++; cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; [fwd, rev].forEach((v) => { v.pause(); v.classList.remove('on'); }); };
  const apply = (c: Cam) => { cam = c; world.style.transform = mtx(c); o.onCam?.(c); };

  function preload() { if (loading) return; loading = true; void o.fetchImg(o.base + o.trans.first); [fwd, rev].forEach((v) => { v.src = v.dataset.src!; v.load(); }); }
  /* 무대 칸(상자 왼쪽, #map 기준 px)에 맞춤: 섬 상자(없으면 그림 전체)를 2.5 % 여백으로. kind 를 안 주면 지금 보기의 것 */
  const good: Partial<Record<'plan' | 'axon', Cam>> = {};
  function contain(kind?: 'plan' | 'axon'): Cam {
    const K = kind || (view === 'plan' ? 'plan' : 'axon'), b = boxes[K] || [0, 0, W, H], bw = b[2] - b[0], bh = b[3] - b[1];
    const a = o.area.getBoundingClientRect(), r = o.stage.getBoundingClientRect();
    if (a.width < 40 || a.height < 40) return good[K] || cam;   /* 숨겨진·0 크기 칸에서 잰 맞춤은 쓰지 않는다 */
    const k = Math.min((a.width * 0.95) / bw, (a.height * 0.95) / bh);
    return (good[K] = { s: k, tx: a.left - r.left + a.width / 2 - k * (b[0] + bw / 2), ty: a.top - r.top + a.height / 2 - k * (b[1] + bh / 2) });
  }
  const areaBox = () => { const a = o.area.getBoundingClientRect(), r = o.stage.getBoundingClientRect(); return { x: a.left - r.left, y: a.top - r.top, w: a.width, h: a.height }; };
  /* 기준 px → 무대 px: 축마다 1차식 — 보드 길에 맞춘 카메라(배율은 두 축 평균. 두 정사영의 축 배율 차는 0.1% 미만) */
  function fitBoard(): Cam | null {
    const a = o.trans.aff_t00, L = o.local, us: number[][] = [], ps: number[][] = [];
    for (const [dx, dy] of [[-150, -100], [150, -100], [-150, 100], [150, 100], [0, 0]]) {
      const p = o.boardAt(L.lat0 + dy / L.ky, L.lng0 + dx / L.kx); if (!p) return null;
      us.push(project(a, dx, dy)); ps.push(p);
    }
    const fit1 = (u: number[], p: number[]) => { const n = u.length, mu = u.reduce((s, v) => s + v, 0) / n, mp = p.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0; u.forEach((v, i) => { num += (v - mu) * (p[i] - mp); den += (v - mu) ** 2; }); const s = num / den; return [s, mp - s * mu]; };
    const [sx, tx] = fit1(us.map((u) => u[0]), ps.map((p) => p[0])), [sy, ty] = fit1(us.map((u) => u[1]), ps.map((p) => p[1]));
    if (!(sx > 0 && sy > 0)) return null;
    const s = (sx + sy) / 2, mu = us.reduce((q, u) => [q[0] + u[0] / us.length, q[1] + u[1] / us.length], [0, 0]);   /* 같은 배율로: 기준점 무리 가운데가 제자리에 */
    return { s, tx: sx * mu[0] + tx - s * mu[0], ty: sy * mu[1] + ty - s * mu[1] };
  }
  /* 그림 바꿔 끼우기: 받고 decode 한 뒤에만(빈 장면 없음). fade 0 이면 바로 */
  let want = '';
  async function frame(src: string, fade = FADE): Promise<boolean> {
    if (src === shown && imgs[front].classList.contains('on')) { want = src; return true; }
    want = src; const my = run, ok = await o.fetchImg(src); if (!ok || my !== run || want !== src) return false;   /* 늦게 온 옛 부탁은 버린다(마지막 것만) */
    const back = imgs[1 - front]; if (back.getAttribute('src') !== src) back.src = src;
    try { await back.decode(); } catch { /* 이미 받은 그림이거나 그새 바뀜 */ }
    if (my !== run || want !== src || back !== imgs[1 - front] || back.getAttribute('src') !== src) return false;
    back.style.transition = fade ? `opacity ${fade * SLOW}ms ease` : 'none'; imgs[front].style.transition = fade ? `opacity ${fade * SLOW}ms ease` : 'none';
    back.classList.add('on'); const old = imgs[front]; front = 1 - front; shown = src;
    const off = () => { if (imgs[front] !== old) old.classList.remove('on'); };   /* 그새 다시 바뀌어 앞장이 됐으면 끄지 않는다(빈 장면 없음) */
    if (fade) at(off, fade); else off();
    return true;
  }
  function tween(to: Cam, ms: number, done?: () => void) {
    const my = run, from = { ...cam }, t0 = performance.now(), dur = Math.max(1, ms * SLOW);
    cancelAnimationFrame(raf);
    const step = () => { if (my !== run) return; const p = Math.min(1, (performance.now() - t0) / dur); apply(lerpCam(from, to, ease(p))); if (p < 1) raf = requestAnimationFrame(step); else done?.(); };
    if (reduced()) { apply(to); done?.(); return; }
    raf = requestAnimationFrame(step);
  }
  /* 영상 틀기: 재생될 수 있으면(800ms 안) 첫 장이 그려진 뒤 그림을 감추고, 프레임마다 camAt(진행, 프레임 번호)로 카메라. 끝 장 = 내릴 그림(미리 decode)이라 겹쳐 바꾼다 */
  function playVid(v: HTMLVideoElement, camAt: (p: number, k: number) => Cam, landing: string, done: () => void, fail: () => void) {
    const my = run, t0 = performance.now();
    if (reduced()) { fail(); return; }
    const wait = () => {
      if (my !== run) return;
      if (v.error || performance.now() - t0 > WAIT_MS * SLOW) { fail(); return; }
      if (v.readyState < 3) { raf = requestAnimationFrame(wait); return; }
      void o.fetchImg(landing).then(() => { const back = imgs[1 - front]; if (back.getAttribute('src') !== landing) back.src = landing; return back.decode().catch(() => undefined); });   /* 내릴 그림을 미리 */
      v.currentTime = 0; v.playbackRate = 1 / SLOW;
      let fin = false; const n = (o.trans.aff_frames?.length || 96) - 1;
      const end = () => { if (fin || my !== run) return; fin = true; apply(camAt(1, n)); void land(); };
      const land = async () => { const ok = await frame(landing, 0); if (my !== run) return; if (!ok) { done(); return; } v.style.transition = `opacity ${FADE * SLOW}ms ease`; v.classList.remove('on'); at(() => { v.style.transition = ''; done(); }, FADE); };
      const onFrame = (mt: number) => { if (my !== run || fin) return; const dur = v.duration || n / FPS, p = Math.min(1, mt / dur), k = Math.min(n, Math.round(mt * FPS)); apply(camAt(p, k)); if (v.ended || p >= 1) end(); };
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (t: number, m: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(v);
      v.play().then(() => {
        if (my !== run) return;
        if (rvfc) { let first = true; const cb = (_t: number, m: { mediaTime: number }) => { if (my !== run || fin) return; if (first) { first = false; v.style.transition = 'none'; v.classList.add('on'); imgs.forEach((im) => { im.style.transition = 'none'; im.classList.remove('on'); }); } onFrame(m.mediaTime); if (!fin) rvfc(cb); }; rvfc(cb); }
        else { v.style.transition = 'none'; v.classList.add('on'); imgs.forEach((im) => { im.style.transition = 'none'; im.classList.remove('on'); }); const loop = () => { if (my !== run || fin) return; onFrame(v.currentTime); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
        v.onended = () => end();
        at(end, (v.duration || 1.6) * 1000 + 1500);   /* 끝 이벤트가 안 와도 멈추지 않는다 */
      }).catch(() => { if (my === run) fail(); });
    };
    wait();
  }
  const fab = (on: boolean) => o.host.classList.toggle('kb-dio-fab', on);   /* 천(리넨·장식·단추…)을 걷기 */
  const show = (on: boolean) => { o.stage.classList.toggle('veil', on); world.classList.toggle('on', on); };
  let lastLanding: { before: number[]; after: number[] } | null = null;
  /* 전환이 끝났는지: 각 전환의 끝 콜백을 감싸 그 run 을 적어 둔다 */
  let idleRun = -1;
  const settle = (then: () => void) => { const my = run; return () => { if (my === run) { idleRun = run; noteArea(); } then(); }; };
  /* 크기 바뀜 → 가만히 있을 때 다시 맞춤(움직이는 중이면 조금 뒤에 다시 본다) */
  let rsT = 0;
  function refit() {
    clearTimeout(rsT);
    if (view === 'none') return;
    if (idleRun !== run) { rsT = window.setTimeout(refit, 250); return; }
    const K = view === 'plan' ? 'plan' : 'axon', a = o.area.getBoundingClientRect(); if (a.width < 40 || a.height < 40) return;
    const nf = contain(K);
    if (view !== 'zoom' || !lastArea) { apply(nf); noteArea(); return; }
    /* zoom: 옛 칸의 맞춤 배율과 새 맞춤 배율의 비율만큼, 옛 가운데가 보던 세계 점을 새 가운데로 */
    const b = boxes.axon || [0, 0, W, H], bw = b[2] - b[0], bh = b[3] - b[1], oldS = Math.min((lastArea[2] * 0.95) / bw, (lastArea[3] * 0.95) / bh);
    const r = o.stage.getBoundingClientRect(), ax = a.left - r.left + a.width / 2, ay = a.top - r.top + a.height / 2, ow = [lastArea[0] + lastArea[2] / 2, lastArea[1] + lastArea[3] / 2];
    const wx = (ow[0] - cam.tx) / cam.s, wy = (ow[1] - cam.ty) / cam.s, s = cam.s * (nf.s / oldS);
    apply({ s, tx: ax - s * wx, ty: ay - s * wy }); noteArea();
  }
  function noteArea() { const a = o.area.getBoundingClientRect(), r = o.stage.getBoundingClientRect(); if (a.width >= 40 && a.height >= 40) lastArea = [a.left - r.left, a.top - r.top, a.width, a.height];
  }
  let lastArea: number[] | null = null;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const a = o.area.getBoundingClientRect(), r = o.stage.getBoundingClientRect(); const cur = [a.left - r.left, a.top - r.top, a.width, a.height];
    if (lastArea && cur.every((v, i) => Math.abs(v - lastArea![i]) < 0.5)) return; if (view !== 'none' && lastArea) refit(); else if (a.width >= 40) lastArea = cur; }) : null;
  ro?.observe(o.area);
  /* 섬 상자(기준 px): 그림 알파를 작게 그려 > 8 인 칸 */
  const boxes: Partial<Record<'plan' | 'axon', number[]>> = {};
  let boxReady: Promise<unknown> = Promise.resolve();
  function alphaBox(src: string) {
    return new Promise<number[] | null>((ok) => {
      const im = new Image(); im.onload = () => {
        const w = 480, h = Math.round((480 * H) / W), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true })!;
        cx.drawImage(im, 0, 0, w, h); const d = cx.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        ok(x1 < 0 ? null : [(x0 / w) * W, (y0 / h) * H, ((x1 + 1) / w) * W, ((y1 + 1) / h) * H]); };
      im.onerror = () => ok(null); im.src = src; });
  }

  return {
    world, preload, contain, areaBox, frame, frontImg: () => imgs[front], get settled() { return idleRun === run; },
    /* 섬 상자를 셀 그림(위에서 본 · 기울어진) — 열 때 한 번 */
    setFit(src: { plan?: string; axon?: string }) {
      boxReady = Promise.all((['plan', 'axon'] as const).map((k) => (src[k] ? alphaBox(src[k]!).then((b) => { if (b) boxes[k] = b; }) : null)));
    },
    get cam() { return cam; }, get view() { return view; }, get lastLanding() { return lastLanding; },
    setCam(c: Cam) { apply(c); }, tween,
    check(lat: number, lng: number) { const tb = fitBoard(), p = o.boardAt(lat, lng); if (!tb || !p) return null; const L = o.local, [u, v] = project(o.trans.aff_t00, (lng - L.lng0) * L.kx, (lat - L.lat0) * L.ky); return { board: p, t00: [tb.s * u + tb.tx, tb.s * v + tb.ty] }; },
    /* 보드·axon → plan(위에서 본 신당) */
    toPlan(top: string, then0: () => void) {
      clear(); const then = settle(then0); preload(); const my = run, from = view; view = 'plan'; o.stage.hidden = false;
      if (from === 'none') {
        const tb = fitBoard();
        const plain = () => { if (my !== run) return; apply(contain('plan')); fab(true); show(true); void frame(top, 0).then(() => at(then, 300)); };
        if (!tb || reduced()) { void boxReady.then(plain); return; }
        void Promise.all([o.fetchImg(o.base + o.trans.first), o.fetchImg(top), boxReady]).then(async ([ok]) => {
          if (my !== run) return; if (!ok) { plain(); return; }
          apply(tb); await frame(o.base + o.trans.first, 0); if (my !== run) return;
          fab(true); world.classList.add('on');                                                            /* 위에서 본 첫 장면이 보드 길 위에 떠오른다 */
          at(() => { o.stage.classList.add('veil'); void frame(top, 600); tween(contain('plan'), 1100, () => at(then, 100)); }, 550);   /* 무대 가운데로 옮겨 가며 hi 그림으로 */
        });
        return;
      }
      const tc = contain('plan');
      if (from === 'axon') { const fa = contain('axon'); apply(fa); playVid(rev, (p) => lerpCam(fa, tc, ease(p)), top, then, () => { tween(tc, 700); void frame(top).then(() => then()); }); return; }
      apply(tc); void frame(top).then(() => then());
    },
    /* 보드·plan·zoom·axon → axon(해 그림, 무대 가운데) */
    toAxon(src: string, then0: () => void) {
      clear(); const then = settle(then0); preload(); const my = run, from = view; view = 'axon'; o.stage.hidden = false;
      const tc = contain('axon');
      if (from === 'none') {
        const tb = fitBoard();
        const plain = () => { if (my !== run) return; apply(tc); fab(true); show(true); void frame(src, 0).then(() => at(then, 300)); };
        if (!tb) { plain(); return; }
        void o.fetchImg(o.base + o.trans.first).then(async (ok) => {
          if (my !== run) return; if (!ok) { plain(); return; }
          apply(tb); await frame(o.base + o.trans.first, 0); if (my !== run) return; fab(true); world.classList.add('on');
          at(() => { o.stage.classList.add('veil'); playVid(fwd, (p) => lerpCam(tb, tc, ease(p)), src, then, () => { tween(tc, 700); void frame(src, 500).then(() => then()); }); }, 500);
        });
        return;
      }
      if (from === 'plan') { const fp = contain('plan'); apply(fp); playVid(fwd, (p) => lerpCam(fp, tc, ease(p)), src, then, () => { tween(tc, 700); void frame(src).then(() => then()); }); return; }
      if (from === 'zoom') { void frame(src); tween(tc, 400, then); return; }
      apply(tc); void frame(src).then(() => then());
    },
    /* plan → zoom: anchor(k) = 프레임 k 에서 건물 가운데(기준 px), Z = 끝 카메라 */
    zoomIn(anchor: (k: number) => number[], Z: Cam, src: string, then0: () => void) {
      clear(); const then = settle(then0); const my = run; view = 'zoom';
      const from = { ...cam }, n = (o.trans.aff_frames?.length || 96) - 1, a0 = anchor(0), A0 = [from.s * a0[0] + from.tx, from.s * a0[1] + from.ty], aN = anchor(n), A1 = [Z.s * aN[0] + Z.tx, Z.s * aN[1] + Z.ty];
      const camAt = (p: number, k: number): Cam => { const e = ease(p), s = from.s * (Z.s / from.s) ** e, A = [A0[0] + (A1[0] - A0[0]) * e, A0[1] + (A1[1] - A0[1]) * e], u = anchor(k); return { s, tx: A[0] - s * u[0], ty: A[1] - s * u[1] }; };
      playVid(fwd, camAt, src, () => { const u = anchor(n); lastLanding = { before: A1, after: [Z.s * u[0] + Z.tx, Z.s * u[1] + Z.ty] }; then(); },
        () => { if (my !== run) return; void frame(src, 500); tween(Z, 800, then); });
    },
    /* zoom → plan: 지금 카메라에서 거꾸로 */
    zoomOut(anchor: (k: number) => number[], top: string, then0: () => void) {
      clear(); const then = settle(then0); const my = run; view = 'plan';
      const from = { ...cam }, tc = contain('plan'), n = (o.trans.aff_frames?.length || 96) - 1, aN = anchor(n), A0 = [from.s * aN[0] + from.tx, from.s * aN[1] + from.ty], a0 = anchor(0), A1 = [tc.s * a0[0] + tc.tx, tc.s * a0[1] + tc.ty];
      const camAt = (p: number, j: number): Cam => { const e = ease(p), s = from.s * (tc.s / from.s) ** e, A = [A0[0] + (A1[0] - A0[0]) * e, A0[1] + (A1[1] - A0[1]) * e], u = anchor(n - j); return { s, tx: A[0] - s * u[0], ty: A[1] - s * u[1] }; };   /* 거꾸로 영상의 j 번째 = 앞 영상의 n−j 번째 */
      playVid(rev, camAt, top, then, () => { if (my !== run) return; void frame(top, 500); tween(tc, 800, then); });
    },
    /* plan·axon·zoom → 보드(천이 다시 덮인다) */
    toBoard(then: () => void) {
      clear(); const my = run, from = view; view = 'none';
      const tb = fitBoard(), finish = () => { if (my !== run) return; fab(false); show(false); at(() => { o.stage.hidden = true; then(); }, 450); };
      if (!tb || reduced()) { finish(); return; }
      if (from === 'plan') { o.stage.classList.remove('veil'); tween(tb, 900, finish); return; }
      const tc = contain('axon'); if (from === 'zoom') apply(tc);
      playVid(rev, (p) => lerpCam(tc, tb, ease(p)), o.base + o.trans.first, finish, () => { o.stage.classList.remove('veil'); tween(tb, 700, finish); });
    },
    kill() { clear(); ro?.disconnect(); clearTimeout(rsT); fab(false); o.stage.classList.remove('veil'); imgs.forEach((i) => i.removeAttribute('src')); [fwd, rev].forEach((v) => { v.removeAttribute('src'); v.load(); }); world.remove(); view = 'none'; },
  };
}
export type SunStage = ReturnType<typeof mountSunStage>;
