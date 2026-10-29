import { project, type Aff, type LocalFrame } from './sunStage';

/* 하늘을 나는 2호선(10-29, TASK_13 → TASK_19 → TASK_21) — 서쪽 끝 하늘에서 내려와 굴로 들어가 왕십리로 밑을 지나 동쪽에서 다시 하늘로 오르는 6량 열차.
   · 열차 둘이 쉬지 않고 돈다: A(서 → 동, subway_*.webm) · B(동 → 서, subway_*_rev.webm = A 를 거꾸로 튼 것, B 의 f 장 ≈ A 의 239 − f 장).
     둘 다 loop(16초씩 이어서), B 는 9초 어긋나(spec.rev_offset_s, REV_S) — 잰 값(TASK_21): A 가 화면에 보이는 장은 기울어진 보기 14–54 · 70–182, 위에서 본 보기 70–182
     (그 밖은 하늘 밖·섬 밖 굴 소매). 9초면 기울어진 보기엔 늘 하나 이상, 위에서 본 보기는 16초에 2.3초만 비고, 둘은 동쪽 굴(A 172 장, 왕십리로 밑)에서 보이게 엇갈린다.
     (0초 = 섬 한가운데서 엇갈리지만 위에서 본 보기가 16초에 7.7초 빔, 8초 = 거의 안 빔이지만 동쪽 입구 끝에서 겨우 엇갈림)
   · 보기마다 영상 한 벌: 기울어진 보기(axon·zoom) = xray + day/night(밤 프레임 18–21시면 night), 위에서 본 신당(plan) = top xray + top day(낮만, spec.top).
     xray(땅·건물에 가리지 않는 초록 실루엣, 낮 0.9 · 밤 0.7) 밑에 보이는 쪽(이미 가려진 열차, 1). 보이는 쪽은 자기 xray 에, B 의 xray 는 A 의 xray + 9초에 맞춘다(0.25초 넘게 어긋날 때만 — 매 프레임 되감으면 버벅인다).
     1440×1080 = 전환 영상과 같은 기준 상자 → 세계 상자 1920×1440 에 꽉(plan 도 top_today13 과 같은 자리). 그 보기 영상이 없으면(못 받음) 그 보기엔 열차가 없을 뿐.
   · 언제: 보기에 내려앉은 순간부터(arm) 닫힐 때까지 계속. 전환 영상이 도는 동안엔 멈췄다가(stop — 자리 그대로) 내려앉으면 이어서. 닫으면 src 를 놓는다.
     잰 값(TASK_21): 영상 4개가 도는 동안 가만히 있으면 Chrome 이 화면 갱신을 30 fps 로 낮춘다(영상만 바뀔 때의 절전 — 영상을 숨기면 60). 끌기·휠·전환은 59–60 · 52–54 fps.
     전시 모드(html.kb-on)에선 동작 줄이기를 따르지 않는다 — 열차는 꾸밈이 아니라 전시 내용이다(감독, TASK_19). 전시 모드 밖에서만 동작 줄이기면 틀지 않는다.
   · 자리: train_path.json(지역 m, 하늘 + 굴 중심선, 누적 길이). A 의 f 장 = 앞차 머리가 길이 S0 + (S1 − S0)·f/239 (S0 = −115, S1 = 전체 + 5). B 의 앞차 머리 = A 의 239 − f 장 꼬리(머리 − 열차 길이).
     굴 안(서쪽 입구 ~ 동쪽 입구, subway_path.json 의 둘째 점 ~ 끝 점)을 지나는 동안 들어온 입구에서 그 자리까지 초록 빛 자국(입구 쪽 70 px 은 옅게 시작)(굵은 옅은 선 + 가는 선, 둘 다 고정 — 필터 없음)을
     stroke-dashoffset 으로 늘이고, 굴을 나간 뒤 1.5초에 사라진다(한 바퀴 돌면 다시). 하늘에 있는 동안(위에서 본 보기는 화면에 보이는 74–178 장) 앞차 머리를 따라다니는 작은 천 꼬리표 '2호선'(열차마다 하나).
     plan 의 자국·꼬리표는 위에서 본 기준(aff_t00, 높이 없음). 굵기·글씨는 화면 크기로(카메라 배율로 나눔).
   · 다가간 보기(level 2)에선 열차 층(영상·자국·꼬리표)을 세 겹 흐림 막 위로(햇볕 지도·테두리 아래).
   · 상태는 세계 상자의 data-subway: idle · playing · blocked:reduced · error:이름. 앞의 둘이 아니면 화면엔 아무것도 없이 콘솔(info)에 한 번만. ?subway=now 는 동작 줄이기만 무시한다. */
export interface SubwaySpec { day: string; night: string; xray: string; fps: number; duration: number; rev_offset_s?: number; train_m?: number; top?: { day: string; xray: string }; visible_frames?: { sky_in?: number[]; underground?: number[]; sky_out?: number[] }; path?: string }
export interface SubwayOpts { world: HTMLElement; base: string; spec: SubwaySpec; axon: Aff; top?: Aff; local: LocalFrame; island?: number[][]; night(): boolean; scale(): number; zoom?(): boolean }
type Mode = 'axon' | 'plan';

const NOW = new URLSearchParams(location.search).get('subway') === 'now';
const FRAMES = 240, S0 = -115, TRAIN_M = 115, SYNC_S = 0.25, REV_S = 9;
const SKY = [[8, 48], [176, 190]], SHOWN_TOP = [[74, 178]];   /* 꼬리표: 기울어진 보기는 하늘에 있는 동안, 위에서 본 보기는 화면에 보이는 동안(하늘은 위 카메라 밖) */
const NS = 'http://www.w3.org/2000/svg';
const reduced = () => !NOW && !document.documentElement.classList.contains('kb-on') && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rev = (src: string) => src.replace(/\.webm$/, '_rev.webm');
const logged = new Set<string>();
interface Path { uv: number[][]; len: number; u0: number; u1: number; l2: number[]; total: number }
interface Train { x: HTMLVideoElement; day: HTMLVideoElement; night: HTMLVideoElement | null; trail: SVGSVGElement; glow: SVGPathElement; core: SVGPathElement; tag: HTMLDivElement; back: boolean; lastT: number; left: boolean }

export function mountSubway(o: SubwayOpts) {
  const fps = o.spec.fps || 15, DUR = o.spec.duration || FRAMES / fps, OFF = o.spec.rev_offset_s ?? REV_S, TL = o.spec.train_m ?? TRAIN_M;
  const top = o.spec.top || { day: 'subway/subway_top_day.webm', xray: 'subway/subway_top_xray.webm' };
  const sets: Partial<Record<Mode, Train[]>> = {}, paths: Partial<Record<Mode, Path>> = {};
  let cum: number[] | null = null, len = 0, mode: Mode | null = null, run = 0, raf = 0, on = false, nightNow = false;
  /* 길(지역 m)·입구: 한 번 받아 보기마다 투영 */
  let pathReady: Promise<{ pts: number[][]; u0: number; u1: number } | null> | null = null;
  const loadPath = () => (pathReady ||= Promise.all([fetch(o.base + (o.spec.path || 'subway/train_path.json')).then((r) => r.json()), fetch(o.base + 'subway/subway_path.json').then((r) => r.json()).catch(() => null)]).then(([d, portals]: [{ pts: number[][]; cum: number[] }, { path_world: number[][] } | null]) => {
    cum = d.cum; len = d.cum[d.cum.length - 1];
    /* 굴 구간: 입구 둘(서쪽 = 둘째 점, 동쪽 = 끝 점)에 가장 가까운 굴 속 점. 자료가 없으면 z < 0 전체 */
    const first = d.pts.findIndex((q) => q[2] < 0), near = (w: number[]) => d.pts.reduce((b, q, i) => (q[2] < 0 && Math.hypot(q[0] - w[0], q[1] - w[1]) < Math.hypot(d.pts[b][0] - w[0], d.pts[b][1] - w[1]) ? i : b), first);
    const pw = portals?.path_world; let u0 = first, u1 = u0; d.pts.forEach((q, i) => { if (q[2] < 0) u1 = i; });
    if (pw && pw.length >= 3) { u0 = near(pw[1]); u1 = near(pw[pw.length - 1]); }
    return { pts: d.pts, u0, u1 };
  }).catch(() => null));

  function video(src: string, cls: string) {
    const e = document.createElement('video'); e.muted = true; e.defaultMuted = true; e.playsInline = true; e.loop = true; e.setAttribute('muted', ''); e.setAttribute('playsinline', ''); e.preload = 'auto';   /* 자동 재생 규칙: 소리 없음·인라인을 src 보다 먼저 */
    e.className = 'kb-sub ' + cls; e.setAttribute('aria-hidden', 'true'); e.dataset.src = o.base + src; return e;
  }
  const load = (e: HTMLVideoElement) => { if (!e.getAttribute('src')) e.src = e.dataset.src!; };
  function make(m: Mode): Train[] {
    if (sets[m]) return sets[m]!;
    const mk = (back: boolean): Train => {
      const f = back ? rev : (s: string) => s;
      const x = video(f(m === 'plan' ? top.xray : o.spec.xray), 'x'), day = video(f(m === 'plan' ? top.day : o.spec.day), 'v'), night = m === 'plan' ? null : video(f(o.spec.night), 'v');
      const trail = document.createElementNS(NS, 'svg'); trail.setAttribute('class', 'kb-sub-trail'); trail.setAttribute('viewBox', '0 0 1920 1440'); trail.setAttribute('aria-hidden', 'true');
      const glow = document.createElementNS(NS, 'path'); glow.setAttribute('class', 'g'); const core = document.createElementNS(NS, 'path'); core.setAttribute('class', 'c'); trail.append(glow, core);
      const tag = document.createElement('div'); tag.className = 'kb-sub-tag'; tag.textContent = '2호선';
      [x, day, night, trail, tag].forEach((e) => e?.setAttribute('data-train', `${m}-${back ? 'B' : 'A'}`));   /* 어느 보기·어느 열차인지(확인용) */
      return { x, day, night, trail, glow, core, tag, back, lastT: -1, left: false };
    };
    const ts = (sets[m] = [mk(false), mk(true)]);
    void loadPath().then((d) => { if (d && sets[m] === ts) draw(m, ts, d); });
    return ts;
  }
  /* 보기의 자국 길: 굴 구간을 그 보기 기준 px 로. A 는 서쪽 입구에서, B 는 동쪽 입구에서 늘어난다(입구 쪽 70 px 은 옅게) */
  function draw(m: Mode, ts: Train[], d: { pts: number[][]; u0: number; u1: number }) {
    const aff = m === 'plan' ? o.top : o.axon; if (!aff) return;
    const uv = d.pts.map(([px, py, pz]) => project(aff, px, py, m === 'plan' ? 0 : pz)), { u0, u1 } = d;
    const l2 = [0]; for (let i = u0 + 1; i <= u1; i++) l2.push(l2[l2.length - 1] + Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]));
    const total = l2[l2.length - 1]; paths[m] = { uv, len, u0, u1, l2, total };
    for (const t of ts) {
      const seg = uv.slice(u0, u1 + 1); if (t.back) seg.reverse();
      const dd = seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      [t.glow, t.core].forEach((e) => { e.setAttribute('d', dd); e.setAttribute('stroke-dasharray', `${total.toFixed(1)} ${(total + 10).toFixed(1)}`); e.setAttribute('stroke-dashoffset', total.toFixed(1)); });
      const a = seg[0], b = seg[Math.min(seg.length - 1, 12)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ex = a[0] + ((b[0] - a[0]) / L) * 70, ey = a[1] + ((b[1] - a[1]) / L) * 70;
      const gid = 'kb-sub-fade-' + Math.random().toString(36).slice(2, 8), defs = document.createElementNS(NS, 'defs');
      defs.innerHTML = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"><stop offset="0" stop-color="#3cd26e" stop-opacity="0"/><stop offset="1" stop-color="#3cd26e"/></linearGradient>`;
      t.trail.prepend(defs); [t.glow, t.core].forEach((e) => e.setAttribute('stroke', `url(#${gid})`));
    }
  }
  /* 길이 S 의 자리: 누적 길이에서 찾아 보간 */
  function at(S: number) {
    const c = cum!; if (S <= 0) return { i: 0, t: 0 }; if (S >= len) return { i: c.length - 2, t: 1 };
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (c[k] <= S) lo = k; else hi = k; }
    return { i: lo, t: (S - c[lo]) / Math.max(1e-6, c[lo + 1] - c[lo]) };
  }
  const posAt = (P: Path, S: number) => { const { i, t } = at(S), a = P.uv[i], b = P.uv[Math.min(i + 1, P.uv.length - 1)]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const revealAt = (P: Path, S: number) => { const { i, t } = at(S); if (i < P.u0) return 0; if (i >= P.u1) return P.total; const k = i - P.u0; return P.l2[k] + (P.l2[k + 1] - P.l2[k]) * t; };
  const state = (v: string) => {
    o.world.dataset.subway = v;
    if (!/^(idle|playing)$/.test(v) && !logged.has(v)) { logged.add(v); console.info('[2호선]', v); }   /* 사람에겐 아무것도 안 보이고, 한 번만 */
  };
  const visOf = (t: Train) => (t.night && o.night() ? t.night : t.day);
  const els = (t: Train) => [t.x, t.day, ...(t.night ? [t.night] : []), t.trail, t.tag];
  function hide(ts?: Train[]) {
    for (const t of ts || []) { [t.x, t.day, t.night].forEach((e) => { if (!e) return; e.pause(); e.classList.remove('on'); }); t.trail.classList.remove('on', 'fade'); t.tag.classList.remove('on'); }
  }
  function place(ts: Train[]) {   /* 열차 층 자리: level 2 면 흐림 막 위(햇볕 지도 앞), 아니면 그림 바로 위 — 틀기 전에 옮긴다 */
    const ref = o.zoom?.() ? o.world.querySelector('.kb-dio-heat') || o.world.querySelector('.kb-dio-mask')?.nextSibling || null : o.world.querySelector('.kb-dio-mask');
    if (ts[1].tag.isConnected && ref === ts[1].tag.nextSibling) return;
    /* 겹 순서: xray 둘 → 보이는 쪽 → 자국 → 꼬리표 */
    for (const e of [...ts.map((t) => t.x), ...ts.flatMap((t) => [t.day, ...(t.night ? [t.night] : [])]), ...ts.map((t) => t.trail), ...ts.map((t) => t.tag)]) o.world.insertBefore(e, ref);
  }
  /* 한 열차의 한 프레임: 자국·꼬리표 */
  function frame(t: Train, P: Path | undefined, k: number, m: Mode) {
    const ct = t.x.currentTime;
    if (ct < t.lastT - 1) { t.left = false; t.trail.classList.remove('on', 'fade'); }   /* 한 바퀴 돌았다 */
    t.lastT = ct;
    if (!P || !cum) return;
    const f = Math.min(FRAMES - 1, ct * fps), fa = t.back ? FRAMES - 1 - f : f, head = S0 + ((len + 5 - S0) * fa) / (FRAMES - 1), S = t.back ? head - TL : head;   /* B 의 앞차 머리 = A 시각의 꼬리 */
    const rv = t.back ? P.total - revealAt(P, S) : revealAt(P, S);
    if (rv > 0 && !t.left) {
      t.trail.classList.add('on'); [t.glow, t.core].forEach((e) => e.setAttribute('stroke-dashoffset', (P.total - rv).toFixed(1)));
      t.glow.setAttribute('stroke-width', (16 * k).toFixed(2)); t.core.setAttribute('stroke-width', (6 * k).toFixed(2));
      if (rv >= P.total) { t.left = true; t.trail.classList.add('fade'); }   /* 굴을 나가면 1.5초에 사라진다(CSS) */
    }
    const sky = (m === 'plan' ? SHOWN_TOP : SKY).some(([a, b]) => fa >= a && fa <= b);
    if (sky) { const [hx, hy] = posAt(P, S); t.tag.style.left = hx.toFixed(1) + 'px'; t.tag.style.top = hy.toFixed(1) + 'px'; t.tag.style.fontSize = (13 * k).toFixed(2) + 'px'; }
    t.tag.classList.toggle('on', sky);
  }
  function start(m: Mode, my: number) {
    const ts = make(m); place(ts);
    const [A, B] = ts, n = (nightNow = m === 'axon' && o.night());
    ts.forEach((t) => { t.x.classList.toggle('n', n); [t.x, t.day, t.night].forEach((e) => e && e !== visOf(t) && e !== t.x && (e.pause(), e.classList.remove('on'))); });
    const all = ts.flatMap((t) => [t.x, visOf(t)]); all.forEach(load);
    if (A.x.currentTime === 0 && B.x.currentTime === 0) { B.x.currentTime = OFF; visOf(B).currentTime = OFF; }   /* 처음: B 는 9초 앞에서 */
    Promise.all(all.map((e) => e.play())).then(() => {
      if (my !== run) { all.forEach((e) => e.pause()); return; }
      all.forEach((e) => e.classList.add('on')); state('playing');
      const tick = () => {
        if (my !== run) return;
        if (m === 'axon' && o.night() !== nightNow) { run++; start(m, run); return; }   /* 낮 ⇄ 밤 프레임: 보이는 쪽만 바꿔 낀다(자리 그대로) */
        const vA = visOf(A), vB = visOf(B), d = (((A.x.currentTime + OFF - B.x.currentTime) % DUR) + DUR * 1.5) % DUR - DUR / 2;   /* B 는 A + 9초(한 바퀴 둘레로 잰 차) */
        if (Math.abs(d) > SYNC_S && !B.x.seeking) B.x.currentTime = (A.x.currentTime + OFF) % DUR;
        for (const [t, v] of [[A, vA], [B, vB]] as const) { const e = (((t.x.currentTime - v.currentTime) % DUR) + DUR * 1.5) % DUR - DUR / 2; if (Math.abs(e) > SYNC_S && !v.seeking) v.currentTime = t.x.currentTime; }   /* xray 가 기준 — 0.25초 넘게 어긋날 때만(15 fps 영상이라 1/30초 문턱이면 매 프레임 되감아 30 fps 로 떨어졌다) */
        const k = 1 / Math.max(0.05, o.scale()), P = paths[m];
        frame(A, P, k, m); frame(B, P, k, m);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch((err: Error) => { if (my === run) { state('error:' + (err?.name || 'play') + ':' + m); hide(ts); } });   /* 못 받음·막힘: 그 보기엔 열차 없음 */
  }
  return {
    /* 보기에 내려앉았다: 그 보기의 열차 둘을 (이어서) 튼다 */
    arm(m: Mode = 'axon') {
      if (reduced()) { state('blocked:reduced'); return; }
      if (m === 'plan' && !o.top) return;
      run++; cancelAnimationFrame(raf); if (mode && mode !== m) hide(sets[mode]); hide(sets[m]);
      mode = m; on = true; start(m, run);
    },
    /* 전환 영상 동안: 자리 그대로 멈춤 */
    stop() { run++; cancelAnimationFrame(raf); if (mode) hide(sets[mode]); on = false; state('idle'); },
    get playing() { return on && !!mode && !!sets[mode]?.[0].x.classList.contains('on'); },
    destroy() { run++; cancelAnimationFrame(raf); on = false; for (const ts of Object.values(sets)) { hide(ts); for (const t of ts!) els(t).forEach((e) => { if (e instanceof HTMLVideoElement && e.getAttribute('src')) { e.removeAttribute('src'); e.load(); } e.remove(); }); } },
  };
}
export type Subway = ReturnType<typeof mountSubway>;
