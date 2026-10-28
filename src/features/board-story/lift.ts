/* 천을 들추면(10-28, 해 이야기) — 천 보드에서 3D 디오라마로 넘어가는 장면. 보는 사람이 자리를 잃지 않게:
   ① 위에서 똑바로 내려다본 렌더(trans/t00, 북쪽 위·건물 납작)를 천 보드의 길에 딱 겹쳐 놓고(같은 위경도 → 같은 화면 자리)
   ② 천(리넨·장식·단추·이름표)이 걷히며 길만 남은 위로 t00 이 떠오르고 ③ t01…t27 을 넘기며(카메라가 기울고 건물이 솟는다)
   그림 자리도 보드에 맞춘 자리 → 무대 가운데(contain, 해 그림과 같은 자리)로 옮겨 간다 ④ 해 그림으로 바꿔 끼운다. 나갈 땐 거꾸로(빠르게).
   · 자리 맞추기: 둘 다 북쪽이 위인 정사영이라 가로·세로 축마다 1차식 하나(배율 + 평행이동)로 이어진다. 위경도 기준점 몇 개를
     보드 경로(위경도 → 지도 → board.toBoard → SVG → 화면)와 t00 의 aff(위경도 → 지역 미터 → 그림 px)로 각각 옮겨 축마다 맞춘다.
   · 그림은 <img> 두 장만 번갈아(이중 버퍼), 움직임은 transform·opacity 만. 프레임이 아직 안 왔으면 건너뛴다(멈추지 않는다).
     t00 을 1.5초 안에 못 받으면 예전 장면 전환(흐려지며 떠오름)으로. 동작 줄이기(prefers-reduced-motion)도 예전 전환.
   · ?patch_slow=N 이면 N배 느리게(보드 연출과 같은 확인용). */
export interface Aff { origin: number[]; perX: number[]; perY: number[]; perZ?: number[] }
export interface TransFrame { file: string; aff: Aff }
export interface LocalFrame { lat0: number; lng0: number; kx: number; ky: number }
export interface LiftOptions {
  stage: HTMLElement; host: HTMLElement; base: string;
  frames: TransFrame[]; local: LocalFrame;
  boardAt(lat: number, lng: number): [number, number] | null;   // 위경도 → #map 안 화면 px(천 보드 경로)
  containBox(): { x: number; y: number; w: number; h: number };  // 해 그림이 놓이는 칸(#map 안 px)
  fetchImg(src: string): Promise<boolean>;
}
export interface Lift { preload(): void; enter(onLanded: () => void): void; leave(then: () => void): void; kill(): void; readonly ready: boolean; check(lat: number, lng: number): { board: number[]; t00: number[] } | null }   // check: 맞춤 확인용(?lift_check)

const W = 1920, H = 1080;
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);
const FADE_IN = 500, MOVE = 1700, BACK = 1000, FADE_OUT = 450;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = 'cubic-bezier(.45,0,.25,1)';
const mtx = (t: { sx: number; sy: number; tx: number; ty: number }) => `matrix(${t.sx},0,0,${t.sy},${t.tx},${t.ty})`;

export function mountLift(o: LiftOptions): Lift {
  const wrap = document.createElement('div'); wrap.className = 'kb-dio-lw';
  const imgs = [0, 1].map(() => { const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.draggable = false; wrap.appendChild(im); return im; });
  o.stage.appendChild(wrap);
  const srcs = o.frames.map((f) => o.base + f.file);
  const got = new Set<number>();
  let run = 0, raf = 0, front = 0, timers: number[] = [], anims: Animation[] = [], loading = false;
  const at = (fn: () => void, ms: number) => { const my = run; timers.push(window.setTimeout(() => { if (my === run) fn(); }, ms * SLOW)); };
  const clear = () => { run++; cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; anims.forEach((a) => a.cancel()); anims = []; };

  function preload() {
    if (loading) return; loading = true;
    (async () => { for (let i = 0; i < srcs.length; i++) if (await o.fetchImg(srcs[i])) got.add(i); })();
  }
  /* 그림 px → #map px: 축마다 X = sx·u + tx. 기준점은 지역 원점 둘레 ±150 m 격자(보드 안). */
  function fitBoard() {
    const a = o.frames[0].aff, L = o.local, us: number[][] = [], ps: number[][] = [];
    for (const [dx, dy] of [[-150, -100], [150, -100], [-150, 100], [150, 100], [0, 0]]) {
      const lat = L.lat0 + dy / L.ky, lng = L.lng0 + dx / L.kx, p = o.boardAt(lat, lng); if (!p) return null;
      us.push([a.origin[0] + dx * a.perX[0] + dy * a.perY[0], a.origin[1] + dx * a.perX[1] + dy * a.perY[1]]); ps.push(p);
    }
    const fit1 = (u: number[], p: number[]) => { const n = u.length, mu = u.reduce((s, v) => s + v, 0) / n, mp = p.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0; u.forEach((v, i) => { num += (v - mu) * (p[i] - mp); den += (v - mu) ** 2; }); const s = num / den; return [s, mp - s * mu]; };
    const [sx, tx] = fit1(us.map((u) => u[0]), ps.map((p) => p[0])), [sy, ty] = fit1(us.map((u) => u[1]), ps.map((p) => p[1]));
    return sx > 0 && sy > 0 ? { sx, sy, tx, ty } : null;
  }
  function fitContain() { const b = o.containBox(), k = Math.min(b.w / W, b.h / H); return { sx: k, sy: k, tx: b.x + (b.w - W * k) / 2, ty: b.y + (b.h - H * k) / 2 }; }
  async function showFrame(i: number) {
    const my = run, back = imgs[1 - front]; back.src = srcs[i];
    try { await back.decode(); } catch { return; }
    if (my !== run) return;
    back.classList.add('on'); imgs[front].classList.remove('on'); front = 1 - front;
  }
  /* 프레임 넘기기: dur 동안 from → to(번호), 받은 것만 */
  function play(from: number, to: number, dur: number) {
    const my = run, t0 = performance.now(); let last = -1;
    const step = () => { if (my !== run) return; const p = Math.min(1, (performance.now() - t0) / (dur * SLOW)); let i = Math.round(from + (to - from) * p);
      while (i !== from && !got.has(i)) i += from < to ? -1 : 1;   /* 아직 안 온 프레임은 가장 가까운 앞 프레임으로 */
      if (i !== last && got.has(i)) { last = i; void showFrame(i); }
      if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  const ready = () => got.has(0);
  function fallback(on: boolean) { o.host.classList.toggle('kb-dio-on', on); o.stage.classList.toggle('show', on); }

  return {
    get ready() { return ready(); }, preload,
    check(lat, lng) {   /* 같은 위경도의 보드 화면 자리 vs 맞춰 놓은 t00 위 자리(#map px) */
      const tb = fitBoard(), p = o.boardAt(lat, lng), a = o.frames[0].aff, L = o.local; if (!tb || !p) return null;
      const dx = (lng - L.lng0) * L.kx, dy = (lat - L.lat0) * L.ky, u = a.origin[0] + dx * a.perX[0] + dy * a.perY[0], v = a.origin[1] + dx * a.perX[1] + dy * a.perY[1];
      return { board: p, t00: [tb.sx * u + tb.tx, tb.sy * v + tb.ty] };
    },
    enter(onLanded) {
      clear(); const my = run; preload();
      const t0 = performance.now();
      const go = () => {
        if (my !== run) return;
        const tb = !reduced() && ready() ? fitBoard() : null;
        if (!tb) { fallback(true); at(onLanded, 700); return; }   /* 예전 전환 */
        const tc = fitContain();
        imgs.forEach((im) => im.classList.remove('on')); front = 0; imgs[0].src = srcs[0]; imgs[0].classList.add('on');
        wrap.style.transform = mtx(tb);
        o.stage.classList.add('lift'); o.host.classList.add('kb-dio-fab');
        anims.push(wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN * SLOW, fill: 'forwards' }));
        at(() => {
          play(0, srcs.length - 1, MOVE);
          anims.push(wrap.animate([{ transform: mtx(tb) }, { transform: mtx(tc) }], { duration: MOVE * SLOW, easing: ease, fill: 'forwards' }));
        }, FADE_IN);
        at(() => { o.stage.classList.add('show'); onLanded(); }, FADE_IN + MOVE);                       /* 해 그림으로 바꿔 끼운다(0.35s) */
        at(() => { o.stage.classList.remove('lift'); anims.forEach((a) => a.cancel()); anims = []; }, FADE_IN + MOVE + 400);
      };
      /* t00(과 되도록 전부)을 1.5초까지 기다린다 */
      const wait = () => { if (my !== run) return; if (got.size === srcs.length || performance.now() - t0 > 1500 * SLOW) go(); else raf = requestAnimationFrame(wait); };   /* 1.5초가 지나면 받은 것만으로(t00 도 없으면 go 가 예전 전환으로) */
      wait();
    },
    leave(then) {
      clear(); const my = run;
      const tb = !reduced() && ready() && o.host.classList.contains('kb-dio-fab') ? fitBoard() : null;
      if (!tb) { fallback(false); o.host.classList.remove('kb-dio-fab'); at(() => then(), 400); return; }
      const tc = fitContain(), last = srcs.length - 1;
      imgs.forEach((im) => im.classList.remove('on')); front = 0; imgs[0].src = srcs[got.has(last) ? last : 0]; imgs[0].classList.add('on');
      wrap.style.transform = mtx(tc); wrap.style.opacity = '1';
      o.stage.classList.remove('show'); o.stage.classList.add('lift', 'rev');
      play(last, 0, BACK);
      anims.push(wrap.animate([{ transform: mtx(tc) }, { transform: mtx(tb) }], { duration: BACK * SLOW, easing: ease, fill: 'forwards' }));
      at(() => { o.host.classList.remove('kb-dio-fab'); anims.push(wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT * SLOW, fill: 'forwards' })); }, BACK);   /* 천이 다시 덮인다 */
      at(() => { if (my !== run) return; o.stage.classList.remove('lift', 'rev'); wrap.style.opacity = ''; anims.forEach((a) => a.cancel()); anims = []; then(); }, BACK + FADE_OUT);
    },
    kill() { clear(); o.host.classList.remove('kb-dio-fab', 'kb-dio-on'); imgs.forEach((im) => im.removeAttribute('src')); wrap.remove(); },
  };
}
