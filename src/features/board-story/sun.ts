import type { LayerCtl, LayerCtx, Renderer, StoreSpot } from './layers';
import { mountSunStage, project, type Aff, type Cam, type LocalFrame, type TransVideo } from './sunStage';
import { mountDioWalkers, type DioWalkers } from './dioWalkers';
import { mountSelect, type Bld } from './select';

/* 해 이야기(10-28) — layer.type "diorama". 장의 layer 칸: view "diorama" | "board", date, hour, autoplay, stores, diagram, mode.
   · 세 단계(TASK_12, 감독 최종 흐름) — mode "select" 인 장:
     0 보드 → 1 위에서 본 신당(plan, hi/top_today13): 천이 걷히고 보드 길에 맞춘 위에서 본 장면이 무대 가운데로. 가리키면 바닥 윤곽 + '용도 · n층 · n년', 누르면 고르기
     1 → 2 건물(zoom): 영상(위 → 기울어진 보기)을 틀며 고른 건물로 다가가 hi/today_HH 에 내려앉고, 건물·이웃·반경 50 m·꼬리표·카드가 차례로.
       시간은 저절로 흐른다(1.2초에 한 시간, 8→21시, 마지막에서 1.5초 쉬고 처음부터). 막대로 직접, 끄는 동안 멈춤.
       끌기 = 옮기기, 휠 = 확대(1–3배, 커서 기준), 다른 건물 누르기 = 그 건물로(0.3초에 가운데로, 영상 없음).
     한 단계 위로: ✕ · Esc · 길잡이(보드 › 위에서 본 신당 › 건물) · '‹ 위에서 보기' · 45초 무입력(story.ts).
   · 그 밖의 디오라마 장: 기울어진 전체 보기(1× 해 그림, 날짜 탭 하지·오늘·동지 + 시각 막대 + 해 높이), 건물을 누르면 그 자리에서 고르기(다가가지 않음).
     밤 프레임이면 무대 바탕이 밤 파랑 + 별.
   · board + stores: 보드로 돌아와 가게 단추 옆 해 눈금(TASK_07).
   · 무대·전환은 sunStage.ts, 고르기는 select.ts, 디오라마 속 주민은 dioWalkers.ts. 닫히면(destroy) 모두 DOM 에서 지운다. 그림 내용(픽셀)에 기대지 않는다. */
interface Frame { h: number; elev: number; az: number; file: string; night?: boolean }
interface Manifest { dates: Record<string, string>; frames: Record<string, Frame[]>; size?: number[]; local?: LocalFrame; transition?: Partial<TransVideo>; idmap?: { file: string }; axon?: Aff;
  hi?: { top: string; idmap_top: string; idmap_axon: string; today: string[] } }
interface DaySun { hours: number; of: number; slots: string; start: string }
interface StoreSun { id: string; name: string; [day: string]: DaySun | string | unknown }
interface PageL { view?: 'diorama' | 'board'; date?: string; hour?: number; autoplay?: boolean; stores?: string; diagram?: string; mode?: string }

const DATES = ['summer', 'today', 'winter'];   /* 춘분은 건물 자료가 없어 뺐다(TASK_12) */
const STEP_MS = 900, LIVE_MS = 1200, LOOP_REST_MS = 1500, ZMAX = 3;
const SUN = '#f0a850', SHADE = '#9a7a60';                 /* 해 눈금: 해 = 밤 하늘 노을 노랑(night.ts), 그늘 = 범례 안내 글자 회갈색(board.css .kb-note) */
const NS = 'http://www.w3.org/2000/svg';
/* 일조 사선 단면(10-28, 「건축법 시행령」 제86조): 높이 10 m 까지는 북쪽 땅 경계에서 1.5 m, 그 위는 높이의 1/2 이상 떨어진다.
   크기는 CSS 에서 px 로 — 테마의 '#map svg'(지도 SVG 를 칸 가득 펴는 규칙)가 상자 안 SVG 에도 걸리므로 덮어써야 한다 */
function setbackSVG(): SVGSVGElement {
  const M = 6, G = 150, LX = 214, y = (h: number) => G - h * M, x = (d: number) => LX - d * M;
  const steps = [[19, 9.5], [16, 8], [13, 6.5], [10, 1.5]].map(([h, d], i, a) => `H${x(d)}` + (i < a.length - 1 ? `V${y(a[i + 1][0])}` : '')).join('');   /* 지붕(19 m)에서 층(3 m)마다 h/2 선 안쪽으로 내려와 10 m 에서 1.5 m 벽으로 */
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'kb-setback'); svg.setAttribute('viewBox', '0 0 300 172');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '일조 사선: 높이 10미터까지는 북쪽 땅 경계에서 1.5미터, 그 위는 높이의 절반 이상 떨어져 계단처럼 물러난다');
  svg.innerHTML = `<g class="sb-sun"><circle cx="34" cy="26" r="11"/><path d="M34 8v-5M34 44v5M16 26h-5M52 26h5M21 13l-3-3M47 39l3 3M47 13l3-3M21 39l-3 3"/></g>`
    + `<path class="sb-ray" d="M46 34L${x(9.5)} ${y(19)}L${LX + 50} ${G}M46 34L${x(6.5)} ${y(10)}L${LX + 22} ${G}"/>`
    + `<path class="sb-guide" d="M${LX} ${G}L${x(12.5)} ${y(25)}"/>`
    + `<path class="sb-bldg" d="M${x(14)} ${G}V${y(19)}${steps}V${G}Z"/>`
    + `<path class="sb-lot" d="M${LX} ${G + 6}V${y(24)}"/><path class="sb-ground" d="M6 ${G}H294"/>`
    + `<path class="sb-dim" d="M${x(1.5)} ${G - 8}H${LX}M${LX + 8} ${G}V${y(10)}"/>`
    + `<text x="${(x(1.5) + LX) / 2}" y="${G - 12}" class="sb-t c">1.5m</text>`
    + `<text x="${LX + 12}" y="${(G + y(10)) / 2 + 4}" class="sb-t">10m</text>`
    + `<text x="${x(10.5) - 6}" y="${y(21) - 4}" class="sb-t e">높이의 1/2</text>`
    + `<text x="${LX + 6}" y="${G + 16}" class="sb-t">북쪽 이웃 땅</text>`;
  return svg;
}
const hourLabel = (h: number) => (h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`);
const short = (label: string) => label.split(' · ').pop() || label;
/* 그림 받기: 같은 주소는 한 번만. 성공·실패를 기억한다 */
const loaded = new Map<string, Promise<boolean>>();
function fetchImg(src: string): Promise<boolean> {
  let p = loaded.get(src);
  if (!p) { p = new Promise<boolean>((ok) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(true); im.onerror = () => { loaded.delete(src); ok(false); }; im.src = src; }); loaded.set(src, p); }
  return p;
}
let alive: (() => void) | null = null;   /* 앞 이야기의 무대가 아직 거꾸로 돌아가는 중이면 새로 열 때 바로 치운다 */

export const diorama: Renderer = async (c: LayerCtx) => {
  const base = String(c.spec.base || '/board/sun/');
  const m = (await (await fetch(String(c.spec.manifest || base + 'manifest.json'))).json()) as Manifest;
  if (!c.alive()) return null;
  const SW = m.size?.[0] || 1920, SH = m.size?.[1] || 1080, tr = m.transition;
  if (!tr?.video || !tr.video_rev || !tr.first || !tr.aff_t00 || !m.local) return null;
  const dates = DATES.filter((d) => m.frames[d]?.length);
  const hiOk = !!(m.hi && m.axon && m.idmap && tr.aff_frames?.length);
  const planAff = tr.aff_frames?.[0] || tr.aff_t00;

  /* 무대(HTML, #map 안): 바다색 막 · 밤 막 · 별 · 무대 칸(contain 기준) · 세계 상자(그림·영상·겹쳐 그리기) · 길잡이 */
  alive?.();
  const stage = document.createElement('div'); stage.className = 'kb-dio'; stage.hidden = true; stage.setAttribute('aria-hidden', 'true');
  const veil = document.createElement('div'); veil.className = 'kb-dio-veil'; stage.appendChild(veil);
  const dusk = document.createElement('div'); dusk.className = 'kb-dio-dusk'; stage.appendChild(dusk);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [0, 1].forEach((k) => { const s = document.createElement('div'); s.className = 'kb-dio-stars s' + k;
    s.style.boxShadow = Array.from({ length: 28 }, () => `${(rnd() * 100).toFixed(1)}vw ${(rnd() * 55).toFixed(1)}vh 0 ${rnd() < 0.2 ? 1 : 0}px #fbf3e2`).join(','); stage.appendChild(s); });
  const area = document.createElement('div'); area.className = 'kb-dio-panes'; stage.appendChild(area);
  const crumbs = document.createElement('nav'); crumbs.className = 'kb-dio-crumbs'; crumbs.setAttribute('aria-label', '길잡이'); crumbs.hidden = true;
  crumbs.innerHTML = '<button type="button" data-l="0">보드</button><i>›</i><button type="button" data-l="1">위에서 본 신당</button><i class="z">›</i><b class="z">건물</b>';
  const upBtn = document.createElement('button'); upBtn.type = 'button'; upBtn.className = 'kb-dio-up'; upBtn.textContent = '‹ 위에서 보기'; upBtn.hidden = true;
  c.host.appendChild(stage);
  const st = mountSunStage({ stage, host: c.host, area, base, size: [SW, SH], trans: tr as TransVideo, local: m.local, fetchImg,
    boardAt: (lat, lng) => { const ctm = c.root.getScreenCTM(); if (!ctm) return null; const [x, y] = c.toBoard(lat, lng), q = new DOMPoint(x, y).matrixTransform(ctm), r = stage.getBoundingClientRect(); return [q.x - r.left, q.y - r.top]; },
    onCam: () => camMoved() });
  stage.append(crumbs, upBtn);
  st.preload();

  let date = dates.includes('today') ? 'today' : dates[0], idx = 0, view: 'diorama' | 'board' | null = null, level = 0, flow = false, pageL: PageL = {};
  let timer = 0, liveT = 0, live = false, gaugeG: SVGGElement | null = null, preloadRun = 0;
  let walkers: DioWalkers | null = null, talkT = 0, camHeld = false, hiQueued = false;

  /* 건물 고르기 */
  const select = hiOk ? mountSelect({ world: st.world, size: [SW, SH], plan: planAff, axon: m.axon!, idmapPlan: base + m.hi!.idmap_top, idmapAxon: base + m.idmap!.file,
    load: () => c.load('sun-buildings.json') as Promise<{ b: Bld[] }>, cover: (el) => c.cover(el), date: () => (level === 2 ? 'today' : date), scale: () => st.cam.s }) : null;
  if (select) { void fetchImg(base + m.hi!.top); void select.ensure('plan'); }   /* 위에서 본 그림 + 그 idmap 을 먼저 */
  if (new URLSearchParams(location.search).has('lift_check')) Object.assign(window, { __liftCheck: (lat: number, lng: number) => st.check(lat, lng), __liftLocal: m.local,
    __sun: () => ({ view: st.view, cam: st.cam, landing: st.lastLanding, level, contain: st.contain(), sel: select?.selected?.i ?? -1 }) });   /* 확인용 */

  /* 조작 막대(상자 아래 칸) */
  const ctl = document.createElement('div'); ctl.className = 'kb-dio-ctl';
  const tabs = document.createElement('div'); tabs.className = 'kb-dio-tabs'; tabs.setAttribute('role', 'tablist');
  const tabEls = dates.map((d) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = short(m.dates[d] || d); b.setAttribute('role', 'tab'); b.onclick = () => { stop(); setDate(d); }; tabs.appendChild(b); return b; });
  const row = document.createElement('div'); row.className = 'kb-dio-row';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'kb-dio-play'; play.onclick = () => (timer ? stop() : start());
  const range = document.createElement('input'); range.type = 'range'; range.className = 'kb-dio-hour'; range.min = '0'; range.step = '1'; range.setAttribute('aria-label', '시각');
  range.addEventListener('input', () => { const v = +range.value; if (level === 2) { pauseLive(); setIdx(v); } else { stop(); setIdx(v); } });   /* 값을 먼저 읽는다 — stop() 이 다시 그리며 막대를 옛 값으로 되돌린다 */
  range.addEventListener('pointerdown', () => { if (level === 2) pauseLive(); });
  range.addEventListener('pointerup', () => { if (level === 2) resumeLive(); });
  row.append(play, range);
  const read = document.createElement('div'); read.className = 'kb-dio-read';
  ctl.append(tabs, row, read);
  const hint = document.createElement('p'); hint.className = 'kb-dio-hint'; hint.textContent = '건물에 마우스를 올리면 이름이, 누르면 그 건물로 다가가요.';
  const keyRow = document.createElement('div'); keyRow.className = 'kb-sun-key';   /* 보드 장(해 눈금)의 범례 한 줄 */
  keyRow.innerHTML = `<i style="background:${SUN}"></i>해가 드는 10분 <i style="background:${SHADE}"></i>그늘`;
  const keyDate = document.createElement('b'); keyRow.prepend(keyDate);

  const camBack = () => { if (camHeld) { camHeld = false; c.camera?.restore(); } };   /* 해 눈금 장에서 당긴 카메라 되돌리기 */
  /* 시각: level 2 는 hi(오늘), 그 밖은 1× 날짜 프레임 */
  const hiList = (): Frame[] => (m.hi?.today || []).map((f) => { const h = +(/_(\d+)\./.exec(f)?.[1] || 0); const meta = (m.frames.today || []).find((q) => q.h === h); return { h, elev: meta?.elev ?? 0, az: meta?.az ?? 0, file: f, night: meta?.night ?? h >= 18 }; });
  const frames = (d: string): Frame[] => (level === 2 ? hiList() : m.frames[d] || []);
  const frameAt = (d: string, h: number) => { const fs = frames(d); let best = 0; fs.forEach((f, i) => { if (Math.abs(f.h - h) < Math.abs(fs[best].h - h)) best = i; }); return best; };
  const isNight = () => !!frames(date)[idx]?.night;

  /* 디오라마 속 주민(dioWalkers.ts): 기울어진 보기(axon·zoom)에서만, 다 내려앉은 뒤. 크기는 화면에서 거의 일정하게 */
  async function people(on: boolean) {
    if (!on || !c.villagers || !m.axon || !m.local) { walkers?.stop(); return; }
    if (!walkers) {
      const data = (await c.load('sun-roads.json')) as Parameters<typeof mountDioWalkers>[0]['data'];
      if (!c.alive() || walkers) return;
      walkers = mountDioWalkers({ pane: st.world, axon: { perZ: [0, 0], ...m.axon } as Parameters<typeof mountDioWalkers>[0]["axon"], local: m.local, size: [SW, SH], data, who: c.villagers, cell: () => Math.min(3, Math.max(1, Math.round(1.9 * st.cam.s))) / st.cam.s, scale: () => st.cam.s,
        onTalk: () => { stop(); pauseLive(); c.hold(true); clearInterval(talkT); talkT = window.setInterval(() => { if (!c.alive() || !c.villagers!.talking()) { clearInterval(talkT); if (c.alive()) { c.hold(false); if (level === 2) resumeLive(); } } }, 400); } });
    }
    walkers.start(); walkers.page({ h: '', body: '' }, isNight());
  }
  function preload(list: string[]) {   /* 하나씩 차례로(지금 보이는 것은 frame 이 먼저 받는다) */
    const my = ++preloadRun;
    (async () => { for (const f of list) { if (!c.alive() || my !== preloadRun) return; await fetchImg(base + f); } })();
  }
  function paint(show = true) {
    if (!c.alive()) return;
    const f = frames(date)[idx];
    if (f) {
      if (show && (st.view === 'axon' || st.view === 'zoom')) void st.frame(base + f.file);
      read.innerHTML = f.night ? `<b>${hourLabel(f.h)} · 해 진 뒤</b> · 밤` : `<b>${hourLabel(f.h)}</b> · 해 높이 ${Math.round(f.elev)}°`;
    }
    stage.classList.toggle('night', !!f?.night && (st.view === 'axon' || st.view === 'zoom')); walkers?.page({ h: '', body: '' }, !!f?.night);
    tabEls.forEach((b, i) => { const on = dates[i] === date; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    tabs.hidden = level === 2; play.hidden = level === 2;
    range.max = String(Math.max(0, frames(date).length - 1)); range.value = String(idx);
    play.textContent = timer ? '❚❚' : '▶'; play.setAttribute('aria-label', timer ? '멈춤' : '재생');
  }
  function setDate(d: string) { const h = frames(date)[idx]?.h ?? 12; date = d; idx = frameAt(d, h); preload(frames(d).map((f) => f.file)); paint(); select?.refresh(); }   /* 고른 건물은 그대로, 날짜 값만 다시 */
  function setIdx(i: number) { idx = Math.max(0, Math.min(frames(date).length - 1, i)); paint(); }
  /* 재생(▶, 기울어진 전체 보기): 저녁까지 돌고 마지막 장면에서 1.5초 쉬었다가 처음부터. 재생 중엔 이야기 45초 자동 닫기를 멈춘다 */
  const tick = () => { if (!c.alive() || !timer) { stop(); return; } setIdx(idx >= frames(date).length - 1 ? 0 : idx + 1); timer = window.setTimeout(tick, idx >= frames(date).length - 1 ? STEP_MS + LOOP_REST_MS : STEP_MS); };
  function start() { if (timer || !c.alive()) return; c.hold(true); timer = window.setTimeout(tick, STEP_MS); paint(); }
  function stop() { if (!timer) return; clearTimeout(timer); timer = 0; c.hold(false); if (c.alive()) paint(); }
  /* level 2: 시간이 저절로 흐른다(1.2초에 한 시간). 45초 자동 닫기는 막지 않는다 — 가만히 두면 한 단계씩 물러난다 */
  const liveTick = () => { if (!c.alive() || !live || level !== 2) return; setIdx(idx >= frames(date).length - 1 ? 0 : idx + 1); liveT = window.setTimeout(liveTick, idx >= frames(date).length - 1 ? LIVE_MS + LOOP_REST_MS : LIVE_MS); };
  function startLive() { live = true; clearTimeout(liveT); liveT = window.setTimeout(liveTick, LIVE_MS); }
  function pauseLive() { clearTimeout(liveT); }
  function resumeLive() { if (live && level === 2) { clearTimeout(liveT); liveT = window.setTimeout(liveTick, LIVE_MS); } }
  function stopLive() { live = false; clearTimeout(liveT); }

  const frameSrc = () => { const f = frames(date)[idx]; return f ? base + f.file : ''; };
  function setLevel(l: number) {
    level = l; stage.dataset.level = String(l); crumbs.hidden = !flow || l === 0; upBtn.hidden = l !== 2;
    stage.classList.toggle('live', view === 'diorama');
  }
  function slotFor() {
    if (view === 'board') { c.slot(pageL.stores ? keyRow : null); return; }
    if (flow && level === 1) { c.slot(hint); return; }
    if (pageL.diagram === 'setback' && level !== 2) { const fig = document.createElement('figure'); fig.className = 'kb-setback-fig'; fig.appendChild(setbackSVG()); const box = document.createElement('div'); box.append(fig, ctl); c.slot(box); return; }
    c.slot(ctl);
  }
  const anchorOf = (b: Bld) => (k: number) => project(tr!.aff_frames![k] || m.axon!, b.c[0], b.c[1], b.h / 2);
  /* 건물로 다가갈 끝 카메라: 건물 + 반경 50 m 가 무대의 60 % 를 채우게(1–3배), 건물 가운데가 무대 가운데에 */
  function zoomCam(b: Bld): Cam {
    const a = st.areaBox(), tc = st.contain(), pts = Array.from({ length: 32 }, (_, j) => { const t = (j / 32) * Math.PI * 2; return project(m.axon!, b.c[0] + Math.cos(t) * b.near.r, b.c[1] + Math.sin(t) * b.near.r, 0); });
    pts.push(project(m.axon!, b.c[0], b.c[1], b.h));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const s = Math.max(tc.s, Math.min(tc.s * ZMAX, 0.6 * Math.min(a.w / bw, a.h / bh))), u = project(m.axon!, b.c[0], b.c[1], b.h / 2);
    return { s, tx: a.x + a.w / 2 - s * u[0], ty: a.y + a.h / 2 - s * u[1] };
  }
  /* 1 → 2: 고른 건물로 */
  async function pick(i: number) {
    if (!select || level !== 1 || st.view !== 'plan') return;
    await select.ensure('axon'); const b = select.building(i); if (!b || !c.alive() || level !== 1) return;
    select.hoverAt(-1e5, -1e5); stage.classList.remove('kb-pick');
    date = 'today'; setLevel(2); idx = frameAt('today', pageL.hour ?? 14);
    const src = frameSrc(); paint(false); slotFor();
    if (!hiQueued) { hiQueued = true; preload(hiList().map((f) => f.file)); }
    st.zoomIn(anchorOf(b), zoomCam(b), src, () => { if (!c.alive() || level !== 2) return; select.setMode('axon'); select.select(i); select.enter(); paint(); void people(true); startLive(); });
  }
  /* 2 → 1: 위에서 본 신당으로 */
  function zoomOut() {
    const b = select?.selected; stopLive(); walkers?.stop(); select?.clear(); select?.setMode('plan');
    setLevel(1); slotFor(); stage.classList.remove('night');
    const done = () => { if (c.alive() && level === 1) select?.setMode('plan'); };
    if (b) st.zoomOut(anchorOf(b), base + m.hi!.top, done); else st.toPlan(base + m.hi!.top, done);
  }
  function enterView() {
    if (flow && hiOk) {   /* plan(level 1) — 이미 zoom 이면 그대로 */
      if (st.view === 'zoom' && level === 2) { setLevel(2); slotFor(); paint(); return; }
      walkers?.stop(); stage.classList.remove('night'); select?.clear(); select?.setMode('plan');
      setLevel(1); slotFor(); st.toPlan(base + m.hi!.top, () => undefined); return;
    }
    stopLive(); select?.clear(); select?.setMode('axon');
    const wasZoom = level === 2; setLevel(0);
    if (wasZoom) idx = frameAt(date, pageL.hour ?? 12);   /* 다가간 보기에서 오면 hi 목록 → 1× 목록으로 자리 다시 */
    slotFor(); paint(false);
    st.toAxon(frameSrc(), () => { if (!c.alive() || view !== 'diorama') return; paint(); void people(true); if (pageL.autoplay) start(); });
  }

  /* 무대 위 포인터: 가리키기 · 누르기 · 끌기(level 2 옮기기) · 휠(level 2 확대) */
  let down: { x: number; y: number; cam: Cam; moved: boolean } | null = null, hraf = 0;
  const onUI = (e: Event) => !!(e.target as Element).closest?.('.kb-dio-crumbs,.kb-dio-up,.kb-dio-hit');
  stage.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (onUI(e)) return; stop(); down = { x: e.clientX, y: e.clientY, cam: { ...st.cam }, moved: false }; if (level === 2) { try { stage.setPointerCapture(e.pointerId); } catch { /* 없음 */ } } });
  stage.addEventListener('pointermove', (e) => {
    if (down && level === 2 && st.view === 'zoom' && (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)) { down.moved = true; st.setCam(clampCam({ ...down.cam, tx: down.cam.tx + e.clientX - down.x, ty: down.cam.ty + e.clientY - down.y })); return; }
    if (!select || e.pointerType === 'touch' || onUI(e) || (st.view !== 'plan' && st.view !== 'zoom' && st.view !== 'axon')) return;
    cancelAnimationFrame(hraf); const { clientX: x, clientY: y } = e;
    hraf = requestAnimationFrame(() => { const i = select.hoverAt(x, y); stage.classList.toggle('kb-pick', i >= 0); });
  }, { passive: true });
  stage.addEventListener('pointerup', (e) => {
    const d = down; down = null; if (!d || d.moved || onUI(e) || !select) return;
    if (level === 1) { void select.ensure('plan').then(() => { const i = select.idAt(e.clientX, e.clientY); if (i >= 0) void pick(i); }); return; }
    if (st.view !== 'zoom' && st.view !== 'axon') return;
    void select.ensure('axon').then(() => { const i = select.idAt(e.clientX, e.clientY); if (i < 0 || !select.select(i)) return; select.enter();
      if (level === 2) { const b = select.building(i)!, a = st.areaBox(), u = project(m.axon!, b.c[0], b.c[1], b.h / 2), cm = st.cam; st.tween(clampCam({ s: cm.s, tx: a.x + a.w / 2 - cm.s * u[0], ty: a.y + a.h / 2 - cm.s * u[1] }), 300); } });
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('pointerleave', () => { cancelAnimationFrame(hraf); select?.hoverAt(-1e5, -1e5); stage.classList.remove('kb-pick'); });
  stage.addEventListener('wheel', (e) => { e.stopPropagation(); if (level !== 2 || st.view !== 'zoom') return; e.preventDefault();
    const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, cm = st.cam, tc = st.contain(), s = Math.min(tc.s * ZMAX, Math.max(tc.s, cm.s * Math.exp(-e.deltaY * 0.0015)));
    st.setCam(clampCam({ s, tx: px - ((px - cm.tx) * s) / cm.s, ty: py - ((py - cm.ty) * s) / cm.s })); }, { passive: false });
  stage.addEventListener('click', (e) => e.stopPropagation());
  /* 그림 칸을 벗어나지 않게: 무대 가운데가 늘 그림 안에 */
  function clampCam(cm: Cam): Cam { const a = st.areaBox(), cx = a.x + a.w / 2, cy = a.y + a.h / 2; return { s: cm.s, tx: Math.min(cx, Math.max(cx - cm.s * SW, cm.tx)), ty: Math.min(cy, Math.max(cy - cm.s * SH, cm.ty)) }; }
  let craf = 0; function camMoved() { cancelAnimationFrame(craf); craf = requestAnimationFrame(() => select?.redraw()); }
  crumbs.addEventListener('click', (e) => { const l = (e.target as Element).closest?.('[data-l]'); if (!l) return; e.stopPropagation(); if (!api.back!()) c.close(); });   /* 길잡이: 한 단계 위로 */
  upBtn.addEventListener('click', (e) => { e.stopPropagation(); if (level === 2) zoomOut(); });

  /* 해 눈금(보드 장, 10-28 정리): 단추·이름표 위 층(top)에. 자리는 이름표처럼 욕심쟁이 배치, 떨어져 놓이면 홈질 실로 잇는다.
     글씨가 화면에서 12px 보다 작으면 카메라를 가게들 쪽으로 한 단계(×1.6) 당겼다가 이 장을 떠나면 되돌린다 */
  async function gauges(day: string | undefined) {
    gaugeG?.remove(); gaugeG = null;
    if (!day) return;
    const data = (await c.load('sun-stores.json')) as { stores: StoreSun[] };
    if (!c.alive() || view !== 'board') return;
    const spots = c.spots(), byId = new Map(spots.map((s) => [s.id, s])), byName = new Map(spots.map((s) => [s.name, s]));
    const BW = 34, BH = 6, FS = 10, TW = 38, W = BW + 3 + TW, H = 12, MIN_PX = 12;   /* TW: '0.7시간' 글씨 폭 + 여유 */
    type B = { x0: number; y0: number; x1: number; y1: number };
    const fixed: B[] = [...spots.flatMap((s) => [{ x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r }, ...(s.lab ? [s.lab] : [])]), ...c.obstacles()];
    const placed: B[] = [], over = (a: B, b: B) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    gaugeG = document.createElementNS(NS, 'g'); gaugeG.setAttribute('class', 'kb-sun-gauges'); (c.top || c.root).appendChild(gaugeG);
    const leads = document.createElementNS(NS, 'path'); leads.setAttribute('class', 'kb-sun-lead'); gaugeG.appendChild(leads); let leadD = '';
    const mine = data.stores.map((s0) => ({ s0, d: s0[day] as DaySun | undefined, s: byId.get(s0.id) || byName.get(s0.name) })).filter((q): q is { s0: StoreSun; d: DaySun; s: StoreSpot } => !!q.d && !!q.s);
    mine.sort((a, b) => a.s.x - b.s.x);
    for (const { d, s } of mine) {
      let best: [number, number] = [s.x - W / 2, s.y + s.r + 2], bc = Infinity, bd = 0;
      [2, 9, 18, 30].forEach((gap, gi) => [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([ux, uy], k) => {
        const x = ux > 0 ? s.x + s.r + gap : ux < 0 ? s.x - s.r - gap - W : s.x - W / 2, y = uy > 0 ? s.y + s.r + gap : uy < 0 ? s.y - s.r - gap - H : s.y - H / 2, b = { x0: x, y0: y, x1: x + W, y1: y + H };
        const cost = fixed.reduce((a, q) => a + over(b, q), 0) + placed.reduce((a, q) => a + over(b, q) * 8, 0) + gi * 60 + k * 6;
        if (cost < bc) { bc = cost; best = [x, y]; bd = gap; } }));
      placed.push({ x0: best[0], y0: best[1], x1: best[0] + W, y1: best[1] + H });
      if (bd > 2) { const gx = Math.max(best[0], Math.min(s.x, best[0] + W)), gy = Math.max(best[1], Math.min(s.y, best[1] + H)), a = Math.atan2(gy - s.y, gx - s.x);
        leadD += `M${(s.x + Math.cos(a) * s.r).toFixed(1)} ${(s.y + Math.sin(a) * s.r).toFixed(1)}L${gx.toFixed(1)} ${gy.toFixed(1)}`; }
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'kb-sun-g' + (d.hours ? '' : ' zero')); g.setAttribute('transform', `translate(${best[0].toFixed(1)},${best[1].toFixed(1)})`);
      const n = d.slots.length || 1, cw = BW / n; let sun = '';
      for (let i = 0; i < n; ) { if (d.slots[i] !== '1') { i++; continue; } let j = i; while (j < n && d.slots[j] === '1') j++; sun += `M${(i * cw).toFixed(2)} ${(H - BH) / 2}h${((j - i) * cw).toFixed(2)}v${BH}h${(-(j - i) * cw).toFixed(2)}Z`; i = j; }   /* 해 드는 칸을 이어 한 path 로 */
      g.innerHTML = `<rect class="kb-sun-bar" x="0" y="${(H - BH) / 2}" width="${BW}" height="${BH}" rx="1" fill="${SHADE}"/>` + (sun ? `<path d="${sun}" fill="${SUN}"/>` : '')
        + `<text x="${BW + 3}" y="${H / 2}" font-size="${FS}">${d.hours}시간</text>`;
      gaugeG.appendChild(g);
    }
    leads.setAttribute('d', leadD || 'M0 0');
    const sc = c.root.getScreenCTM()?.a ?? 1;   /* 보드 1단위 = 화면 px */
    if (FS * sc < MIN_PX && mine.length && c.camera) { const cx = mine.reduce((a, q) => a + q.s.x, 0) / mine.length, cy = mine.reduce((a, q) => a + q.s.y, 0) / mine.length; const hr = c.host.getBoundingClientRect(), pr = (c.host.querySelector('.kb-story.show') as HTMLElement | null)?.getBoundingClientRect(), lr = (c.host.querySelector('.kb-legend.show') as HTMLElement | null)?.getBoundingClientRect();
      const L = lr ? lr.right - hr.left : 0, R = pr ? pr.left - hr.left : hr.width;   /* 범례(왼쪽)와 상자(오른쪽) 사이 칸의 가운데로 */
      c.camera.focus(cx, cy, 1.6, hr.width / 2 - (L + R) / 2); camHeld = true; }
    keyDate.textContent = short(m.dates[day] || day) + ' ';
  }

  const api: LayerCtl = {
    back: () => { if (level === 2) { zoomOut(); return true; } return !!select?.clear(); },   /* ✕·Esc·길잡이·45초: 한 단계 위로 */
    page(_i, p) {
      const L = (p.layer || {}) as PageL; pageL = L;
      stop(); gaugeG?.remove(); gaugeG = null; camBack();
      view = L.view === 'board' ? 'board' : 'diorama'; flow = view === 'diorama' && L.mode === 'select' && hiOk;
      if (view === 'board') { stopLive(); walkers?.stop(); select?.clear(); setLevel(0); stage.classList.remove('live', 'night'); st.toBoard(() => undefined); slotFor(); void gauges(L.stores); return; }
      if (!flow) { if (L.date && m.frames[L.date]) date = L.date; else if (!m.frames[date]) date = dates[0]; if (level !== 2) idx = frameAt(date, L.hour ?? frames(date)[idx]?.h ?? 12); preload(frames(date).map((f) => f.file)); }
      enterView();
    },
    destroy(instant) {
      stop(); stopLive(); preloadRun++; gaugeG?.remove(); view = null; clearInterval(talkT); walkers?.destroy(); walkers = null; select?.destroy(); if (instant) camHeld = false; else camBack();
      const finish = () => { if (alive !== finish) return; alive = null; st.kill(); c.host.classList.remove('kb-dio-on', 'kb-dio-fab'); stage.remove(); };
      alive = finish;
      if (instant || st.view === 'none') { finish(); return; }
      stage.classList.remove('live'); crumbs.hidden = true; upBtn.hidden = true; st.toBoard(finish);   /* 사람이 닫으면 천이 다시 덮인 뒤 지운다 */
    },
  };
  return api;
};
