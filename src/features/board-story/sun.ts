import type { LayerCtl, LayerCtx, Renderer, StoreSpot } from './layers';
import { mountLift, type LocalFrame, type TransVideo } from './lift';
import { mountDioWalkers, type DioWalkers } from './dioWalkers';
import { mountSelect } from './select';

/* 해 이야기(10-28) — layer.type "diorama". 장의 layer 칸: view "diorama" | "board", date, hour, autoplay, stores, diagram.
   · diorama: 천을 들추면 — 그 위 HTML 무대(#map 안, 상자 왼쪽)에 Blender 렌더(public/board/sun/, manifest.json, 1920×1440)가
     상자 왼쪽 칸 가득(contain, 여백 12px) 떠오른다. 그림 두 장(<img>)을 opacity 로 바꿔 끼운다(0.35s).
     상자 아래 칸: 날짜 탭(하지·춘분·오늘·동지) · ▶/❚❚ · 시각 막대(낮 + 해 진 뒤 저녁·밤 프레임까지) · '해 높이 38°'(밤이면 '밤').
     재생은 0.9초마다 한 시간씩 저녁까지 돌고, 마지막 장면에서 1.5초 쉰 뒤 처음부터. 사람이 무엇이든 만지면 멈춘다. 재생 중엔 이야기 45초 자동 닫기를 멈춘다(hold).
     밤 프레임이면 무대 바탕(바다색 막)이 해 질 녘·밤 파랑으로 물들고 작은 별(60개 이하)이 반짝인다.
   · 그림은 지금 날짜만 열 때부터 하나씩 차례로 받는다 — 전부 기다리지 않는다. 실패한 그림은 건너뛰고 앞 그림을 둔다.
   · board + stores: 보드로 돌아와 가게 단추 옆에 해 눈금(10분 칸, 해 = 노랑, 그늘 = 회갈색) + 'n시간'. 가게마다 <g> 하나(19개 이하), 장이 바뀌면 지운다.
   · 닫히면(destroy) 무대를 DOM 에서 지우고, 타이머를 멈추고, img.src 를 놓는다. 그림 내용(픽셀)에 기대지 않는다 — GEN 이 같은 이름으로 다시 렌더한다.
   · 보드 ⇄ 디오라마 전환은 lift.ts(천을 들추면: 보드 길에 맞춘 위에서 본 그림 → 기울며 솟는 프레임). 사람이 닫으면 거꾸로 돌아간 뒤 지우고,
     전시 끄기·인트로·다른 이야기로 바뀔 땐 바로 지운다(destroy(instant)). */
interface Frame { h: number; elev: number; az: number; file: string; night?: boolean }
interface Manifest { dates: Record<string, string>; frames: Record<string, Frame[]>; size?: number[]; local?: LocalFrame; transition?: Partial<TransVideo>; idmap?: { file: string }; axon?: { origin: number[]; perX: number[]; perY: number[]; perZ: number[] } }
interface DaySun { hours: number; of: number; slots: string; start: string }
interface StoreSun { id: string; name: string; [day: string]: DaySun | string | unknown }
interface PageL { view?: 'diorama' | 'board'; date?: string; hour?: number; autoplay?: boolean; stores?: string; diagram?: string; mode?: string }

const DATES = ['summer', 'equinox', 'today', 'winter'];
const STEP_MS = 900, LOOP_REST_MS = 1500, OUT_MS = 400;
const SUN = '#f0a850', SHADE = '#9a7a60';                 /* 해 눈금: 해 = 밤 하늘 노을 노랑(night.ts), 그늘 = 범례 안내 글자 회갈색(board.css .kb-note) */
const NS = 'http://www.w3.org/2000/svg';
/* 일조 사선 단면(10-28, 「건축법 시행령」 제86조): 높이 10 m 까지는 북쪽 땅 경계에서 1.5 m, 그 위는 높이의 1/2 이상 떨어진다.
   1 m = 6 px. 경계선(점선) 오른쪽이 북쪽 이웃 땅, 1:2 사선은 점선 안내선, 건물은 층(3 m)마다 계단처럼 물러난다. 왼쪽 위 해에서 이웃 땅까지 빛줄기.
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

/* 그림 칸: 두 장을 번갈아 쓰며 opacity 로 바꿔 끼운다 */
function mountPane(parent: HTMLElement) {
  const el = document.createElement('figure'); el.className = 'kb-dio-pane';
  const imgs = [0, 1].map(() => { const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.draggable = false; el.appendChild(im); return im; });
  parent.appendChild(el);
  let front = 0, want = '', shown = '';
  return {
    el,
    async show(src: string, alive: () => boolean) {
      if (src === shown || src === want) return; want = src;
      const ok = await fetchImg(src);
      if (!alive() || want !== src || !ok) { if (want === src) want = ''; return; }   /* 실패: 앞 그림을 그대로 둔다 */
      const back = imgs[1 - front]; back.src = src;
      try { await back.decode(); } catch { /* 디코드 실패해도 이미 받은 그림 */ }
      if (!alive() || want !== src) return;
      back.classList.add('on'); imgs[front].classList.remove('on'); front = 1 - front; shown = src; want = '';
    },
    release() { imgs.forEach((im) => { im.removeAttribute('src'); }); el.remove(); },
  };
}

let alive: (() => void) | null = null;   /* 앞 이야기의 무대가 아직 거꾸로 돌아가는 중이면 새로 열 때 바로 치운다 */

export const diorama: Renderer = async (c: LayerCtx) => {
  const base = String(c.spec.base || '/board/sun/');
  const m = (await (await fetch(String(c.spec.manifest || base + 'manifest.json'))).json()) as Manifest;
  if (!c.alive()) return null;
  const dates = DATES.filter((d) => m.frames[d]?.length);

  /* 무대(HTML, #map 안). 상자 왼쪽을 덮고, 바다색 막 위에 그림 */
  alive?.();
  const stage = document.createElement('div'); stage.className = 'kb-dio'; stage.hidden = true; stage.setAttribute('aria-hidden', 'true');
  const veil = document.createElement('div'); veil.className = 'kb-dio-veil'; stage.appendChild(veil);
  /* 밤 바탕: 해 질 녘 파랑 막 + 별 두 겹(번갈아 반짝임) — 별은 box-shadow 점이라 요소는 둘뿐 */
  const dusk = document.createElement('div'); dusk.className = 'kb-dio-dusk'; stage.appendChild(dusk);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [0, 1].forEach((k) => { const s = document.createElement('div'); s.className = 'kb-dio-stars s' + k;
    s.style.boxShadow = Array.from({ length: 28 }, () => `${(rnd() * 100).toFixed(1)}vw ${(rnd() * 55).toFixed(1)}vh 0 ${rnd() < 0.2 ? 1 : 0}px #fbf3e2`).join(','); stage.appendChild(s); });
  const panes = document.createElement('div'); panes.className = 'kb-dio-panes';
  ['pointerdown', 'wheel', 'click'].forEach((ev) => stage.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'pointerdown') stop(); }, { passive: true }));   /* 지도 끌기·줌으로 새지 않게. 무대를 누르면 재생 멈춤 */
  c.host.appendChild(stage);
  const SW = m.size?.[0] || 1920, SH = m.size?.[1] || 1080;   /* 그림 크기(1920×1440) */
  const tr = m.transition, lift = tr?.video && tr.video_rev && tr.first && tr.aff_t00 && m.local ? mountLift({ stage, host: c.host, base, trans: tr as TransVideo, size: [SW, SH], local: m.local, fetchImg,
    boardAt: (lat, lng) => { const ctm = c.root.getScreenCTM(); if (!ctm) return null; const [x, y] = c.toBoard(lat, lng), q = new DOMPoint(x, y).matrixTransform(ctm), r = c.host.getBoundingClientRect(); return [q.x - r.left, q.y - r.top]; },
    containBox: () => ({ x: panes.offsetLeft, y: panes.offsetTop, w: panes.offsetWidth, h: panes.offsetHeight }) }) : null;
  stage.appendChild(panes);   /* 들추는 그림(lift) 위에 해 그림 — 다 오면 덮는다 */
  if (lift && new URLSearchParams(location.search).has('lift_check')) Object.assign(window, { __liftCheck: (lat: number, lng: number) => lift.check(lat, lng), __liftLocal: m.local });   /* 확인용: 보드 길 ↔ t00 맞춤 오차 */
  lift?.preload();
  const P = [mountPane(panes)];
  /* 건물 고르기(select.ts): 디오라마 장이면 어디서나. 자료(sun-buildings.json)와 idmap 은 처음 가리키거나 '고르기' 장에서 받는다 */
  const select = m.idmap && m.axon ? mountSelect({ pane: P[0].el, size: [SW, SH], axon: m.axon, idmap: base + m.idmap.file, load: () => c.load('sun-buildings.json') as Promise<{ b: import('./select').Bld[] }>,
    cover: (el) => c.cover(el), date: () => date, onSelect: () => stop() }) : null;

  /* 조작 막대(상자 아래 칸) */
  const ctl = document.createElement('div'); ctl.className = 'kb-dio-ctl';
  const tabs = document.createElement('div'); tabs.className = 'kb-dio-tabs'; tabs.setAttribute('role', 'tablist');
  const tabEls = dates.map((d) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = short(m.dates[d] || d); b.setAttribute('role', 'tab'); b.onclick = () => { stop(); setDate(d); }; tabs.appendChild(b); return b; });
  const row = document.createElement('div'); row.className = 'kb-dio-row';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'kb-dio-play'; play.onclick = () => (timer ? stop() : start());
  const range = document.createElement('input'); range.type = 'range'; range.className = 'kb-dio-hour'; range.min = '0'; range.step = '1'; range.setAttribute('aria-label', '시각');
  range.addEventListener('input', () => { const v = +range.value; stop(); setIdx(v); });   /* 값을 먼저 읽는다 — stop() 이 다시 그리며 막대를 옛 값으로 되돌린다 */
  row.append(play, range);
  const read = document.createElement('div'); read.className = 'kb-dio-read';
  ctl.append(tabs, row, read);
  const keyRow = document.createElement('div'); keyRow.className = 'kb-sun-key';   /* 보드 장(해 눈금)의 범례 한 줄 */
  keyRow.innerHTML = `<i style="background:${SUN}"></i>해가 드는 10분 <i style="background:${SHADE}"></i>그늘`;
  const keyDate = document.createElement('b'); keyRow.prepend(keyDate);

  let date = dates.includes('today') ? 'today' : dates[0], idx = 0, view: 'diorama' | 'board' | null = null;
  const isNight = () => !!frames(date)[idx]?.night;
  let timer = 0, gaugeG: SVGGElement | null = null, preloadRun = 0, shown = false, landed = false, onLand: (() => void) | null = null;
  /* 디오라마 속 주민(dioWalkers.ts): 다 들춘 뒤 한 장짜리 장에서만. 길 데이터는 처음 걸을 때 받는다 */
  let walkers: DioWalkers | null = null, talkT = 0, camHeld = false;
  const camBack = () => { if (camHeld) { camHeld = false; c.camera?.restore(); } };   /* 해 눈금 장에서 당긴 카메라 되돌리기 */
  const walkersOk = () => !!(c.villagers && m.axon && m.local);
  async function people(on: boolean) {
    if (!on || !walkersOk()) { walkers?.stop(); return; }
    if (!walkers) {
      const data = (await c.load('sun-roads.json')) as Parameters<typeof mountDioWalkers>[0]['data'];
      if (!c.alive() || walkers) return;
      walkers = mountDioWalkers({ pane: P[0].el, axon: m.axon!, local: m.local!, size: [SW, SH], data, who: c.villagers!, onTalk: () => {   /* 큰 대화 상자: 재생 멈춤 · 이야기 45초 자동 닫기도 멈춤 */
        stop(); c.hold(true); clearInterval(talkT); talkT = window.setInterval(() => { if (!c.alive() || !c.villagers!.talking()) { clearInterval(talkT); if (c.alive()) c.hold(false); } }, 400); } });
    }
    if (shown && landed && view === 'diorama') { walkers.start(); walkers.page({ h: '', body: '' }, isNight()); }
  }
  const frames = (d: string) => m.frames[d] || [];
  const frameAt = (d: string, h: number) => { const fs = frames(d); let best = 0; fs.forEach((f, i) => { if (Math.abs(f.h - h) < Math.abs(fs[best].h - h)) best = i; }); return fs[best]; };

  function preload(list: string[]) {   /* 하나씩 차례로(지금 보이는 것은 show 가 먼저 받는다) */
    const my = ++preloadRun;
    (async () => { for (const f of list) { if (!c.alive() || my !== preloadRun) return; await fetchImg(base + f); } })();
  }
  function paint() {
    if (!c.alive()) return;
    const f = frames(date)[idx];
    if (f) {
      void P[0].show(base + f.file, c.alive);
      read.innerHTML = f.night ? `<b>${hourLabel(f.h)} · 해 진 뒤</b> · 밤` : `<b>${hourLabel(f.h)}</b> · 해 높이 ${Math.round(f.elev)}°`;
    }
    stage.classList.toggle('night', !!f?.night); walkers?.page({ h: '', body: '' }, !!f?.night);
    tabEls.forEach((b, i) => { const on = dates[i] === date; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    range.max = String(Math.max(0, frames(date).length - 1)); range.value = String(idx);
    play.textContent = timer ? '❚❚' : '▶'; play.setAttribute('aria-label', timer ? '멈춤' : '재생');
  }
  function setDate(d: string) { const h = frames(date)[idx]?.h ?? 12; date = d; idx = frames(d).indexOf(frameAt(d, h)); preload(frames(d).map((f) => f.file)); paint(); select?.refresh(); }   /* 고른 건물은 그대로, 날짜 값만 다시 */
  function setIdx(i: number) { idx = Math.max(0, Math.min(frames(date).length - 1, i)); paint(); }
  /* 재생: 한 시간씩 저녁까지, 마지막 장면에서 1.5초 쉬었다가 처음부터 */
  const tick = () => { if (!c.alive() || !timer) { stop(); return; } const last = idx >= frames(date).length - 1; setIdx(last ? 0 : idx + 1); timer = window.setTimeout(tick, idx >= frames(date).length - 1 ? STEP_MS + LOOP_REST_MS : STEP_MS); };
  function start() { if (timer || !c.alive()) return; c.hold(true); timer = window.setTimeout(tick, STEP_MS); paint(); }
  function stop() { if (!timer) return; clearTimeout(timer); timer = 0; c.hold(false); if (c.alive()) paint(); }

  /* 무대 보이기·숨기기: 들추는 전환(lift)이 있으면 그것으로, 없으면 예전처럼 흐려지며 떠오르기 */
  function showStage(on: boolean, then?: () => void) {
    if (on) {
      if (shown) { if (landed) then?.(); else onLand = then || null; return; }
      shown = true; landed = false; onLand = then || null; stage.hidden = false; void stage.offsetWidth;
      const land = () => { if (!c.alive()) return; landed = true; const f = onLand; onLand = null; f?.(); void people(true); };
      if (lift) lift.enter(land); else { c.host.classList.add('kb-dio-on'); stage.classList.add('show'); window.setTimeout(land, 700); }
    } else {
      if (!shown) return; shown = false; landed = false; onLand = null; walkers?.stop();   /* 나가기 시작하면 주민부터 */
      const done = () => { if (c.alive() && view !== 'diorama') stage.hidden = true; };
      if (lift) lift.leave(done); else { c.host.classList.remove('kb-dio-on'); stage.classList.remove('show'); window.setTimeout(done, OUT_MS); }
    }
  }

  /* 해 눈금(보드 장, 10-28 정리): 단추·이름표 위 층(top)에. 자리는 이름표처럼 욕심쟁이 배치 — 아래·오른쪽·왼쪽·위 × 거리 네 단계 중
     이름표·단추·장식·다른 눈금과 가장 덜 겹치는 곳. 단추에서 떨어져 놓이면 가는 홈질 실로 잇는다.
     글씨가 화면에서 12px 보다 작으면(보드 전체로 물러나 있으면) 카메라를 가게들 쪽으로 한 단계(×1.6) 당겼다가 이 장을 떠나면 되돌린다 */
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
    const mine = data.stores.map((st) => ({ st, d: st[day] as DaySun | undefined, s: byId.get(st.id) || byName.get(st.name) })).filter((q): q is { st: StoreSun; d: DaySun; s: StoreSpot } => !!q.d && !!q.s);
    mine.sort((a, b) => a.s.x - b.s.x);
    for (const { d, s } of mine) {
      let best: [number, number] = [s.x - W / 2, s.y + s.r + 2], bc = Infinity, bd = 0;
      [2, 9, 18, 30].forEach((gap, gi) => [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([ux, uy], k) => {
        const x = ux > 0 ? s.x + s.r + gap : ux < 0 ? s.x - s.r - gap - W : s.x - W / 2, y = uy > 0 ? s.y + s.r + gap : uy < 0 ? s.y - s.r - gap - H : s.y - H / 2, b = { x0: x, y0: y, x1: x + W, y1: y + H };
        const cost = fixed.reduce((a, o) => a + over(b, o), 0) + placed.reduce((a, o) => a + over(b, o) * 8, 0) + gi * 60 + k * 6;
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
    back: () => !!select?.clear(),
    page(_i, p) {
      const L = (p.layer || {}) as PageL;
      stop(); gaugeG?.remove(); gaugeG = null; camBack(); select?.clear();
      view = L.view === 'board' ? 'board' : 'diorama';
      if (view === 'diorama' && L.mode === 'select') void select?.ensure();
      if (view === 'board') { showStage(false); c.slot(L.stores ? keyRow : null); void gauges(L.stores); return; }
      if (L.date && m.frames[L.date]) date = L.date;
      idx = frames(date).indexOf(frameAt(date, L.hour ?? frames(date)[idx]?.h ?? 12));
      preload(frames(date).map((f) => f.file));
      if (L.diagram === 'setback') { const fig = document.createElement('figure'); fig.className = 'kb-setback-fig'; fig.appendChild(setbackSVG()); const box = document.createElement('div'); box.append(fig, ctl); c.slot(box); }   /* 일조 사선 그림은 본문 아래, 조작 막대 위 */
      else c.slot(ctl);
      paint(); showStage(true, () => { if (L.autoplay) start(); });   /* 재생은 전환이 끝난 뒤(들추는 동안 그림이 넘어가지 않게) */
      if (landed) void people(true);
    },
    destroy(instant) {
      stop(); preloadRun++; gaugeG?.remove(); view = null; clearInterval(talkT); walkers?.destroy(); walkers = null; select?.destroy(); if (instant) camHeld = false; else camBack();
      const finish = () => { if (alive !== finish) return; alive = null; lift?.kill(); c.host.classList.remove('kb-dio-on', 'kb-dio-fab'); P.forEach((p) => p.release()); stage.remove(); };
      alive = finish;
      if (instant || !shown || !lift) { finish(); return; }
      shown = false; lift.leave(finish);   /* 사람이 닫으면 거꾸로 돌아가 천이 다시 덮인 뒤 지운다 */
    },
  };
  return api;
};
