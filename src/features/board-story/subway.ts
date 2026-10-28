import { project, type Aff, type LocalFrame } from './sunStage';

/* 하늘을 나는 2호선(10-29, TASK_13 → TASK_19) — 서쪽 끝 하늘에서 내려와 굴로 들어가 왕십리로 밑을 지나 동쪽에서 다시 하늘로 오르는 6량 열차.
   · 영상 셋(VP9 알파, 1440×1080 = 전환 영상과 같은 기준 상자 → 세계 상자 1920×1440 에 꽉): xray(땅·건물에 가리지 않는 초록 실루엣, 낮 0.9 · 밤 0.7) 밑에
     day / night(땅·건물에 이미 가려진 열차, 1). 둘 다 같이 틀고, 보이는 쪽을 xray 시각에 맞춘다(1/30 초 넘게 어긋나면). 밤 프레임(18–21시)이면 night.
   · 언제: 기울어진 보기(axon·zoom)에 다 내려앉고 2초 뒤 첫 번, 그다음 20초마다. 전환 중엔 멈춘다(stop). 처음 내려앉은 뒤에야 받는다. 닫으면 src 를 놓는다.
     전시 모드(html.kb-on)에선 동작 줄이기를 따르지 않는다 — 열차는 꾸밈이 아니라 전시 내용이다(감독, TASK_19). 전시 모드 밖에서만 동작 줄이기면 틀지 않는다.
   · 자리: train_path.json(지역 m, 하늘 + 굴 중심선, 누적 길이). 영상 f 번째 장 = 앞차 머리가 길이 S0 + (S1 − S0)·f/239 (S0 = −115, S1 = 전체 + 5).
     굴 안(서쪽 입구 ~ 동쪽 입구, subway_path.json 의 둘째 점 ~ 끝 점 — 섬 밖 소매 구간은 빼고)을 지나는 동안 그 자리까지 초록 빛 자국(서쪽 끝은 입구에서 옅게 시작)(굵은 옅은 선 + 가는 선, 둘 다 고정 — 필터 없음)을 stroke-dashoffset 으로 늘이고, 굴을 나간 뒤 1.5초에 사라진다.
     하늘에 있는 동안(8–48 · 176–190 장) 앞차 머리를 따라다니는 작은 천 꼬리표 '2호선'. 굵기·글씨는 화면 크기로(카메라 배율로 나눔).
   · 다가간 보기(level 2)에선 열차 층(영상·자국·꼬리표)을 세 겹 흐림 막 위로(햇볕 지도·테두리 아래).
   · 상태는 세계 상자의 data-subway: idle · wait · playing · blocked:reduced · error:이름. 앞의 셋이 아니면 화면엔 아무것도 없이 콘솔(info)에 한 번만.
     ?subway=now 면 내려앉자마자 틀고 동작 줄이기도 무시한다. */
export interface SubwaySpec { day: string; night: string; xray: string; fps: number; duration: number; period_s?: number; visible_frames?: { sky_in?: number[]; underground?: number[]; sky_out?: number[] }; path?: string }
export interface SubwayOpts { world: HTMLElement; base: string; spec: SubwaySpec; axon: Aff; local: LocalFrame; island?: number[][]; night(): boolean; scale(): number; zoom?(): boolean }

const NOW = new URLSearchParams(location.search).get('subway') === 'now';
const FIRST_MS = NOW ? 0 : 2000, PERIOD_MS = 20000, RETRY_MS = 1000, FRAMES = 240, S0 = -115;
const SKY = [[8, 48], [176, 190]];
const NS = 'http://www.w3.org/2000/svg';
const reduced = () => !NOW && !document.documentElement.classList.contains('kb-on') && matchMedia('(prefers-reduced-motion: reduce)').matches;
const logged = new Set<string>();

export function mountSubway(o: SubwayOpts) {
  let made = false, x: HTMLVideoElement, day: HTMLVideoElement, night: HTMLVideoElement, tag: HTMLDivElement, trail: SVGSVGElement, glow: SVGPathElement, core: SVGPathElement;
  let run = 0, timer = 0, raf = 0, vis: HTMLVideoElement | null = null;
  /* 길: 지역 m(x, y, z) → 세계 상자 px, 굴 구간(z < 0)의 화면 길이 */
  let P: { uv: number[][]; cum: number[]; len: number; u0: number; u1: number; l2: number[]; total: number } | null = null;
  const fps = o.spec.fps || 15;
  function make() {
    if (made) return; made = true;
    const v = (src: string, cls: string) => { const e = document.createElement('video'); e.muted = true; e.defaultMuted = true; e.playsInline = true; e.setAttribute('muted', ''); e.setAttribute('playsinline', ''); e.preload = 'auto';   /* 자동 재생 규칙: 소리 없음·인라인을 src 보다 먼저 */
      e.className = 'kb-sub ' + cls; e.setAttribute('aria-hidden', 'true'); e.src = o.base + src; o.world.insertBefore(e, o.world.querySelector('.kb-dio-mask')); return e; };   /* 그림 위, 흐림 막 아래 */
    x = v(o.spec.xray, 'x'); day = v(o.spec.day, 'v'); night = v(o.spec.night, 'v');
    trail = document.createElementNS(NS, 'svg'); trail.setAttribute('class', 'kb-sub-trail'); trail.setAttribute('viewBox', '0 0 1920 1440'); trail.setAttribute('aria-hidden', 'true');
    glow = document.createElementNS(NS, 'path'); glow.setAttribute('class', 'g'); core = document.createElementNS(NS, 'path'); core.setAttribute('class', 'c'); trail.append(glow, core);
    o.world.insertBefore(trail, night.nextSibling);
    tag = document.createElement('div'); tag.className = 'kb-sub-tag'; tag.textContent = '2호선'; o.world.insertBefore(tag, trail.nextSibling);
    void Promise.all([fetch(o.base + (o.spec.path || 'subway/train_path.json')).then((r) => r.json()), fetch(o.base + 'subway/subway_path.json').then((r) => r.json()).catch(() => null)]).then(([d, portals]: [{ pts: number[][]; cum: number[] }, { path_world: number[][] } | null]) => {
      const uv = d.pts.map(([px, py, pz]) => project(o.axon, px, py, pz));
      /* 굴 구간: 입구 둘(서쪽 = 둘째 점, 동쪽 = 끝 점)에 가장 가까운 굴 속 점. 자료가 없으면 z < 0 전체 */
      const near = (w: number[]) => d.pts.reduce((b, q, i) => (q[2] < 0 && Math.hypot(q[0] - w[0], q[1] - w[1]) < Math.hypot(d.pts[b][0] - w[0], d.pts[b][1] - w[1]) ? i : b), d.pts.findIndex((q) => q[2] < 0));
      const pw = portals?.path_world; let u0 = d.pts.findIndex((q) => q[2] < 0), u1 = u0; d.pts.forEach((q, i) => { if (q[2] < 0) u1 = i; });
      if (pw && pw.length >= 3) { u0 = near(pw[1]); u1 = near(pw[pw.length - 1]); }
      const l2 = [0]; for (let i = u0 + 1; i <= u1; i++) l2.push(l2[l2.length - 1] + Math.hypot(uv[i][0] - uv[i - 1][0], uv[i][1] - uv[i - 1][1]));
      const total = l2[l2.length - 1], dd = uv.slice(u0, u1 + 1).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      [glow, core].forEach((e) => { e.setAttribute('d', dd); e.setAttribute('stroke-dasharray', `${total.toFixed(1)} ${(total + 10).toFixed(1)}`); e.setAttribute('stroke-dashoffset', total.toFixed(1)); });
      /* 서쪽 끝을 입구에서 옅게: 입구 → 굴 쪽 70 px 동안 0 → 1 (stroke 그러데이션, 정적) */
      const k0 = Math.min(uv.length - 1, u0 + 12), a = uv[u0], b = uv[k0], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ex = a[0] + ((b[0] - a[0]) / L) * 70, ey = a[1] + ((b[1] - a[1]) / L) * 70;
      const gid = 'kb-sub-fade-' + Math.random().toString(36).slice(2, 8), defs = document.createElementNS(NS, 'defs');
      defs.innerHTML = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"><stop offset="0" stop-color="#3cd26e" stop-opacity="0"/><stop offset="1" stop-color="#3cd26e"/></linearGradient>`;
      trail.prepend(defs); [glow, core].forEach((e) => e.setAttribute('stroke', `url(#${gid})`));
      P = { uv, cum: d.cum, len: d.cum[d.cum.length - 1], u0, u1, l2, total };
    }).catch(() => undefined);
  }
  /* 길이 S 의 자리: 누적 길이에서 찾아 보간 */
  function at(S: number) {
    const c = P!.cum; if (S <= 0) return { i: 0, t: 0 }; if (S >= P!.len) return { i: c.length - 2, t: 1 };
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= S) lo = m; else hi = m; }
    return { i: lo, t: (S - c[lo]) / Math.max(1e-6, c[lo + 1] - c[lo]) };
  }
  const posAt = (S: number) => { const { i, t } = at(S), a = P!.uv[i], b = P!.uv[Math.min(i + 1, P!.uv.length - 1)]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const revealAt = (S: number) => { const p = P!, { i, t } = at(S); if (i < p.u0) return 0; if (i >= p.u1) return p.total; const k = i - p.u0; return p.l2[k] + (p.l2[k + 1] - p.l2[k]) * t; };
  const state = (v: string) => {
    o.world.dataset.subway = v;
    if (!/^(idle|wait|playing)$/.test(v) && !logged.has(v)) { logged.add(v); console.info('[2호선]', v); }   /* 사람에겐 아무것도 안 보이고, 한 번만 */
  };
  function hide() { cancelAnimationFrame(raf); [x, day, night].forEach((e) => { if (!e) return; e.pause(); e.classList.remove('on'); }); trail?.classList.remove('on', 'fade'); tag?.classList.remove('on'); vis = null; }
  function place() {   /* 열차 층 자리: level 2 면 흐림 막 위(햇볕 지도 앞), 아니면 그림 바로 위 — 틀기 전에 옮긴다 */
    const ref = o.zoom?.() ? o.world.querySelector('.kb-dio-heat') || o.world.querySelector('.kb-dio-mask')?.nextSibling || null : o.world.querySelector('.kb-dio-mask');
    if (ref !== tag.nextSibling) [x, day, night, trail, tag].forEach((e) => o.world.insertBefore(e, ref));
  }
  function pass(retry = false) {
    const my = run; if (!made) return; if (reduced()) { state('blocked:reduced'); return; }
    const n = o.night(); vis = n ? night : day; x.classList.toggle('n', n);
    place();
    const both = [x, vis];
    both.forEach((e) => { e.currentTime = 0; });
    trail.classList.remove('on', 'fade');
    Promise.all(both.map((e) => e.play())).then(() => {
      if (my !== run) { both.forEach((e) => e.pause()); return; }
      both.forEach((e) => e.classList.add('on')); state('playing');
      let left = false;
      const sync = () => {
        if (my !== run || !vis) return;
        if (Math.abs(vis.currentTime - x.currentTime) > 1 / 30) vis.currentTime = x.currentTime;   /* xray 가 기준 */
        if (P) {
          const f = Math.min(FRAMES - 1, x.currentTime * fps), S = S0 + ((P.len + 5 - S0) * f) / (FRAMES - 1), k = 1 / Math.max(0.05, o.scale());
          const rv = revealAt(S);
          if (rv > 0 && !left) {
            trail.classList.add('on'); [glow, core].forEach((e) => e.setAttribute('stroke-dashoffset', (P!.total - rv).toFixed(1)));
            glow.setAttribute('stroke-width', (16 * k).toFixed(2)); core.setAttribute('stroke-width', (6 * k).toFixed(2));
            if (rv >= P.total) { left = true; trail.classList.add('fade'); }   /* 굴을 나가면 1.5초에 사라진다(CSS) */
          }
          const sky = SKY.some(([a, b]) => f >= a && f <= b);
          if (sky) { const [hx, hy] = posAt(S); tag.style.left = hx.toFixed(1) + 'px'; tag.style.top = hy.toFixed(1) + 'px'; tag.style.fontSize = (13 * k).toFixed(2) + 'px'; }
          tag.classList.toggle('on', sky);
        }
        if (x.ended) { both.forEach((e) => e.classList.remove('on')); tag.classList.remove('on'); vis = null; state('wait'); return; }
        raf = requestAnimationFrame(sync);
      };
      raf = requestAnimationFrame(sync);
    }).catch((err: Error) => {   /* 막히면(자동 재생 규칙·아직 못 받음) 1초 뒤 한 번 더, 그다음은 다음 차례에 */
      state('error:' + (err?.name || 'play')); vis = null;
      if (!retry && my === run) window.setTimeout(() => { if (my === run) { clearTimeout(timer); pass(true); } }, RETRY_MS);
    });
    clearTimeout(timer); timer = window.setTimeout(() => { if (my === run) pass(); }, PERIOD_MS);
  }
  return {
    /* 기울어진 보기에 내려앉았다: 받기 시작하고 2초 뒤 첫 번 */
    arm() { if (reduced()) { state('blocked:reduced'); return; } make(); run++; clearTimeout(timer); hide(); state('wait'); const my = run; timer = window.setTimeout(() => { if (my === run) pass(); }, FIRST_MS); },
    stop() { run++; clearTimeout(timer); if (made) hide(); state('idle'); },
    get playing() { return !!vis; },
    destroy() { run++; clearTimeout(timer); if (!made) return; hide(); [x, day, night].forEach((e) => { e.removeAttribute('src'); e.load(); e.remove(); }); trail.remove(); tag.remove(); },
  };
}
export type Subway = ReturnType<typeof mountSubway>;
