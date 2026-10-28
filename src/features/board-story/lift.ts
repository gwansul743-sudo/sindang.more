/* 천을 들추면(10-28, 해 이야기) — 천 보드에서 3D 디오라마로 넘어가는 장면. 보는 사람이 자리를 잃지 않게:
   ① 위에서 똑바로 내려다본 렌더(trans_t00, 북쪽 위·건물 납작)를 천 보드의 길에 딱 겹쳐 놓고(같은 위경도 → 같은 화면 자리)
   ② 천(리넨·장식·단추·이름표)이 걷히며 길만 남은 위로 t00 이 떠오르고 ③ 영상(transition.webm, VP9 알파 1.6초)을 그 자리에서 틀며
   그림 자리도 보드에 맞춘 자리 → 무대 가운데(contain, 해 그림과 같은 자리)로 옮겨 간다 ④ 해 그림으로 바꿔 끼운다. 나갈 땐 거꾸로 영상(transition_rev).
   · 자리 맞추기: 둘 다 북쪽이 위인 정사영이라 가로·세로 축마다 1차식 하나(배율 + 평행이동)로 이어진다. 위경도 기준점 몇 개를
     보드 경로(위경도 → 지도 → board.toBoard → SVG → 화면)와 t00 의 aff(위경도 → 지역 미터 → 기준 그림 px, 1920×1440)로 각각 옮겨 축마다 맞춘다.
     영상·t00 은 1440×1080(기준의 0.75) — 기준 크기 상자(1920×1440)에 꽉 채워 놓아 aff 를 그대로 쓴다.
   · 움직임은 transform·opacity 만(영상 재생 시각에 맞춰 transform). 영상이 800ms 안에 재생되지 않으면(못 받음·오류·자동 재생 막힘)
     흐려지며 떠오르기로 — 멈추지 않는다. 동작 줄이기(prefers-reduced-motion)도 흐려지며 떠오르기.
   · ?patch_slow=N 이면 N배 느리게(영상은 playbackRate 1/N). */
export interface Aff { origin: number[]; perX: number[]; perY: number[]; perZ?: number[] }
export interface LocalFrame { lat0: number; lng0: number; kx: number; ky: number }
export interface TransVideo { video: string; video_rev: string; first: string; aff_t00: Aff }
export interface LiftOptions {
  stage: HTMLElement; host: HTMLElement; base: string;
  trans: TransVideo; size: number[]; local: LocalFrame;
  boardAt(lat: number, lng: number): [number, number] | null;   // 위경도 → #map 안 화면 px(천 보드 경로)
  containBox(): { x: number; y: number; w: number; h: number };  // 해 그림이 놓이는 칸(#map 안 px)
  fetchImg(src: string): Promise<boolean>;
}
export interface Lift { preload(): void; enter(onLanded: () => void): void; leave(then: () => void): void; kill(): void; check(lat: number, lng: number): { board: number[]; t00: number[] } | null }   // check: 맞춤 확인용(?lift_check)

const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const FADE_IN = 500, FADE_OUT = 450, WAIT_MS = 800;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
type T = { sx: number; sy: number; tx: number; ty: number };
const mtx = (t: T) => `matrix(${t.sx},0,0,${t.sy},${t.tx},${t.ty})`;
const lerp = (a: T, b: T, p: number): T => ({ sx: a.sx + (b.sx - a.sx) * p, sy: a.sy + (b.sy - a.sy) * p, tx: a.tx + (b.tx - a.tx) * p, ty: a.ty + (b.ty - a.ty) * p });

export function mountLift(o: LiftOptions): Lift {
  const [W, H] = o.size;
  const wrap = document.createElement('div'); wrap.className = 'kb-dio-lw'; wrap.style.width = W + 'px'; wrap.style.height = H + 'px';
  const img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; img.draggable = false;
  const vid = (src: string) => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('aria-hidden', 'true'); v.dataset.src = o.base + src; return v; };
  const fwd = vid(o.trans.video), rev = vid(o.trans.video_rev);
  wrap.append(img, fwd, rev); o.stage.appendChild(wrap);
  let run = 0, raf = 0, timers: number[] = [], anims: Animation[] = [], loading = false, t00 = false;
  const at = (fn: () => void, ms: number) => { const my = run; timers.push(window.setTimeout(() => { if (my === run) fn(); }, ms * SLOW)); };
  const clear = () => { run++; cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; anims.forEach((a) => a.cancel()); anims = []; [fwd, rev].forEach((v) => v.pause()); };
  const show = (e: HTMLElement) => [img, fwd, rev].forEach((x) => x.classList.toggle('on', x === e));

  function preload() {   /* 해 이야기를 열 때: t00 그림 + 영상 둘 */
    if (loading) return; loading = true;
    void o.fetchImg(o.base + o.trans.first).then((ok) => { t00 = ok; if (ok) img.src = o.base + o.trans.first; });
    [fwd, rev].forEach((v) => { v.src = v.dataset.src!; v.load(); });
  }
  /* 기준 그림 px → #map px: 축마다 X = sx·u + tx. 기준점은 지역 원점 둘레 ±150 m 격자(보드 안) */
  function fitBoard(): T | null {
    const a = o.trans.aff_t00, L = o.local, us: number[][] = [], ps: number[][] = [];
    for (const [dx, dy] of [[-150, -100], [150, -100], [-150, 100], [150, 100], [0, 0]]) {
      const lat = L.lat0 + dy / L.ky, lng = L.lng0 + dx / L.kx, p = o.boardAt(lat, lng); if (!p) return null;
      us.push([a.origin[0] + dx * a.perX[0] + dy * a.perY[0], a.origin[1] + dx * a.perX[1] + dy * a.perY[1]]); ps.push(p);
    }
    const fit1 = (u: number[], p: number[]) => { const n = u.length, mu = u.reduce((s, v) => s + v, 0) / n, mp = p.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0; u.forEach((v, i) => { num += (v - mu) * (p[i] - mp); den += (v - mu) ** 2; }); const s = num / den; return [s, mp - s * mu]; };
    const [sx, tx] = fit1(us.map((u) => u[0]), ps.map((p) => p[0])), [sy, ty] = fit1(us.map((u) => u[1]), ps.map((p) => p[1]));
    return sx > 0 && sy > 0 ? { sx, sy, tx, ty } : null;
  }
  function fitContain(): T { const b = o.containBox(), k = Math.min(b.w / W, b.h / H); return { sx: k, sy: k, tx: b.x + (b.w - W * k) / 2, ty: b.y + (b.h - H * k) / 2 }; }
  /* 영상이 재생될 수 있을 때까지(WAIT_MS 넘으면 포기) */
  function whenPlayable(v: HTMLVideoElement, my: number, ok: () => void, no: () => void) {
    const t0 = performance.now();
    const step = () => { if (my !== run) return; if (v.readyState >= 3 && !v.error) ok(); else if (v.error || performance.now() - t0 > WAIT_MS * SLOW) no(); else raf = requestAnimationFrame(step); };
    step();
  }
  /* 영상을 0초부터 틀며 transform 을 from → to 로(재생 시각에 맞춰). 끝나면 done, 재생이 막히면 fail */
  function playMove(v: HTMLVideoElement, from: T, to: T, my: number, done: () => void, fail: () => void) {
    let fin = false; const end = () => { if (fin || my !== run) return; fin = true; cancelAnimationFrame(raf); wrap.style.transform = mtx(to); done(); };
    v.currentTime = 0; v.playbackRate = 1 / SLOW;
    v.play().then(() => {
      if (my !== run) return; show(v);
      const step = () => { if (my !== run || fin) return; const p = v.duration ? Math.min(1, v.currentTime / v.duration) : 0; wrap.style.transform = mtx(lerp(from, to, ease(p)));
        if (v.ended || p >= 1) { end(); return; } raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      at(end, (v.duration || 1.6) * 1000 + 1500);   /* 끝 이벤트가 안 와도 멈추지 않는다 */
    }).catch(() => { if (my === run) fail(); });
  }
  function fallback(on: boolean) { o.host.classList.toggle('kb-dio-on', on); o.stage.classList.toggle('show', on); }

  return {
    preload,
    check(lat, lng) {   /* 같은 위경도의 보드 화면 자리 vs 맞춰 놓은 t00 위 자리(#map px) */
      const tb = fitBoard(), p = o.boardAt(lat, lng), a = o.trans.aff_t00, L = o.local; if (!tb || !p) return null;
      const dx = (lng - L.lng0) * L.kx, dy = (lat - L.lat0) * L.ky, u = a.origin[0] + dx * a.perX[0] + dy * a.perY[0], v = a.origin[1] + dx * a.perX[1] + dy * a.perY[1];
      return { board: p, t00: [tb.sx * u + tb.tx, tb.sy * v + tb.ty] };
    },
    enter(onLanded) {
      clear(); const my = run; preload();
      o.stage.classList.remove('rev'); wrap.style.opacity = '';   /* 거꾸로 돌던 중에 다시 들어오면 그 정리가 취소되므로 여기서 */
      const plain = () => { if (my !== run) return; o.host.classList.remove('kb-dio-fab'); o.stage.classList.remove('lift'); wrap.style.opacity = ''; anims.forEach((a) => a.cancel()); anims = []; fallback(true); at(onLanded, 700); };   /* 예전 전환 */
      if (reduced()) { plain(); return; }
      whenPlayable(fwd, my, () => {
        const tb = t00 ? fitBoard() : null; if (!tb) { plain(); return; }
        const tc = fitContain();
        wrap.style.transform = mtx(tb); show(img);
        o.stage.classList.add('lift'); o.host.classList.add('kb-dio-fab');
        anims.push(wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN * SLOW, fill: 'forwards' }));
        at(() => playMove(fwd, tb, tc, my, () => {
          o.stage.classList.add('show'); onLanded();                                                                  /* 해 그림으로 바꿔 끼운다(0.35s) */
          at(() => { o.stage.classList.remove('lift'); wrap.style.opacity = ''; anims.forEach((a) => a.cancel()); anims = []; fwd.pause(); }, 400);
        }, plain), FADE_IN);
      }, plain);
    },
    leave(then) {
      clear(); const my = run;
      const plainOut = () => { if (my !== run) return; fallback(false); o.host.classList.remove('kb-dio-fab'); o.stage.classList.remove('lift', 'rev'); wrap.style.opacity = ''; at(() => then(), 400); };
      if (reduced() || !o.host.classList.contains('kb-dio-fab')) { plainOut(); return; }
      const tb = fitBoard(); if (!tb) { plainOut(); return; }
      const tc = fitContain();
      whenPlayable(rev, my, () => {
        wrap.style.transform = mtx(tc); wrap.style.opacity = '1'; rev.currentTime = 0; show(rev);
        o.stage.classList.remove('show'); o.stage.classList.add('lift', 'rev');
        playMove(rev, tc, tb, my, () => {
          o.host.classList.remove('kb-dio-fab'); show(img);                                                            /* 천이 다시 덮인다 */
          anims.push(wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT * SLOW, fill: 'forwards' }));
          at(() => { o.stage.classList.remove('lift', 'rev'); wrap.style.opacity = ''; anims.forEach((a) => a.cancel()); anims = []; then(); }, FADE_OUT);
        }, plainOut);
      }, plainOut);
    },
    kill() { clear(); o.host.classList.remove('kb-dio-fab', 'kb-dio-on'); img.removeAttribute('src'); [fwd, rev].forEach((v) => { v.removeAttribute('src'); v.load(); }); wrap.remove(); },
  };
}
