import type { LayerCtl, LayerCtx, Renderer, StoreSpot } from './layers';
import { mountLift, type LocalFrame, type TransFrame } from './lift';
import { mountDioWalkers, type DioWalkers } from './dioWalkers';

/* 해 이야기(10-28) — layer.type "diorama". 장의 layer 칸: view "diorama" | "board", date, hour, autoplay, compare, night, stores.
   · diorama: 천을 들추면 — 보드는 살짝 작아지며 흐려지고(#map.kb-dio-on, scale·opacity) 그 위 HTML 무대(#map 안, 상자 왼쪽)에
     Blender 렌더(public/board/sun/, manifest.json)가 떠오른다. 그림 두 장(<img>)을 opacity 로 바꿔 끼운다(0.35s). compare 는 두 날짜를 나란히.
     상자 아래 칸: 날짜 탭(하지·춘분·오늘·동지) · ▶/❚❚ · 시각 막대 · '해 높이 38°'. 재생은 0.9초마다 한 시간씩 돌고, 사람이 무엇이든 만지면 멈춘다.
     재생 중엔 이야기 45초 자동 닫기를 멈춘다(hold).
   · 그림은 지금 날짜(compare 면 두 날짜)만 열 때부터 하나씩 차례로 받는다 — 47장을 한꺼번에 기다리지 않는다. 실패한 그림은 건너뛰고 앞 그림을 둔다.
   · board + stores: 보드로 돌아와 가게 단추 옆에 해 눈금(10분 칸, 해 = 노랑, 그늘 = 회갈색) + 'n시간'. 가게마다 <g> 하나(19개 이하), 장이 바뀌면 지운다.
   · 닫히면(destroy) 무대를 DOM 에서 지우고, 타이머를 멈추고, img.src 를 놓는다. 그림 내용(픽셀)에 기대지 않는다 — GEN 이 같은 이름으로 다시 렌더한다.
   · 보드 ⇄ 디오라마 전환은 lift.ts(천을 들추면: 보드 길에 맞춘 위에서 본 그림 → 기울며 솟는 프레임). 사람이 닫으면 거꾸로 돌아간 뒤 지우고,
     전시 끄기·인트로·다른 이야기로 바뀔 땐 바로 지운다(destroy(instant)). */
interface Frame { h: number; elev: number; az: number; file: string }
interface Manifest { dates: Record<string, string>; frames: Record<string, Frame[]>; night?: string; local?: LocalFrame; transition?: { frames: TransFrame[] }; axon?: { origin: number[]; perX: number[]; perY: number[]; perZ: number[] } }
interface DaySun { hours: number; of: number; slots: string; start: string }
interface StoreSun { id: string; name: string; [day: string]: DaySun | string | unknown }
interface PageL { view?: 'diorama' | 'board'; date?: string; hour?: number; autoplay?: boolean; compare?: string; night?: boolean; stores?: string }

const DATES = ['summer', 'equinox', 'today', 'winter'];
const STEP_MS = 900, FADE_MS = 350, OUT_MS = 400;
const SUN = '#f0a850', SHADE = '#9a7a60';                 /* 해 눈금: 해 = 밤 하늘 노을 노랑(night.ts), 그늘 = 범례 안내 글자 회갈색(board.css .kb-note) */
const NS = 'http://www.w3.org/2000/svg';
const hourLabel = (h: number) => (h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`);
const short = (label: string) => label.split(' · ').pop() || label;

/* 그림 받기: 같은 주소는 한 번만. 성공·실패를 기억한다 */
const loaded = new Map<string, Promise<boolean>>();
function fetchImg(src: string): Promise<boolean> {
  let p = loaded.get(src);
  if (!p) { p = new Promise<boolean>((ok) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(true); im.onerror = () => { loaded.delete(src); ok(false); }; im.src = src; }); loaded.set(src, p); }
  return p;
}

/* 그림 칸 하나: 두 장을 번갈아 쓰며 opacity 로 바꿔 끼운다 */
function mountPane(parent: HTMLElement) {
  const el = document.createElement('figure'); el.className = 'kb-dio-pane';
  const imgs = [0, 1].map(() => { const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.draggable = false; el.appendChild(im); return im; });
  const cap = document.createElement('figcaption'); el.appendChild(cap); parent.appendChild(el);
  let front = 0, want = '', shown = '';
  return {
    el, set caption(t: string) { cap.textContent = t; cap.hidden = !t; },
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
  const panes = document.createElement('div'); panes.className = 'kb-dio-panes';
  ['pointerdown', 'wheel', 'click'].forEach((ev) => stage.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'pointerdown') stop(); }, { passive: true }));   /* 지도 끌기·줌으로 새지 않게. 무대를 누르면 재생 멈춤 */
  c.host.appendChild(stage);
  const lift = m.transition?.frames?.length && m.local ? mountLift({ stage, host: c.host, base, frames: m.transition.frames, local: m.local, fetchImg,
    boardAt: (lat, lng) => { const ctm = c.root.getScreenCTM(); if (!ctm) return null; const [x, y] = c.toBoard(lat, lng), q = new DOMPoint(x, y).matrixTransform(ctm), r = c.host.getBoundingClientRect(); return [q.x - r.left, q.y - r.top]; },
    containBox: () => ({ x: panes.offsetLeft, y: panes.offsetTop, w: panes.offsetWidth, h: panes.offsetHeight }) }) : null;
  stage.appendChild(panes);   /* 들추는 그림(lift) 위에 해 그림 — 다 오면 덮는다 */
  if (lift && new URLSearchParams(location.search).has('lift_check')) Object.assign(window, { __liftCheck: (lat: number, lng: number) => lift.check(lat, lng), __liftLocal: m.local });   /* 확인용: 보드 길 ↔ t00 맞춤 오차 */
  lift?.preload();
  const P = [mountPane(panes), mountPane(panes)];

  /* 조작 막대(상자 아래 칸) */
  const ctl = document.createElement('div'); ctl.className = 'kb-dio-ctl';
  const tabs = document.createElement('div'); tabs.className = 'kb-dio-tabs'; tabs.setAttribute('role', 'tablist');
  const tabEls = dates.map((d) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = short(m.dates[d] || d); b.setAttribute('role', 'tab'); b.onclick = () => { stop(); night = false; setDate(d); };   /* 밤 장에서 날짜를 누르면 그 날의 낮으로 */ tabs.appendChild(b); return b; });
  const nightTab = document.createElement('button'); nightTab.type = 'button'; nightTab.textContent = '밤'; nightTab.setAttribute('role', 'tab'); nightTab.className = 'night'; nightTab.tabIndex = -1; nightTab.setAttribute('aria-disabled', 'true'); tabs.appendChild(nightTab);
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

  let date = dates.includes('today') ? 'today' : dates[0], cmp: string | null = null, idx = 0, night = false, view: 'diorama' | 'board' | null = null;
  let timer = 0, gaugeG: SVGGElement | null = null, preloadRun = 0, shown = false, landed = false, onLand: (() => void) | null = null;
  /* 디오라마 속 주민(dioWalkers.ts): 다 들춘 뒤 한 장짜리 장에서만. 길 데이터는 처음 걸을 때 받는다 */
  let walkers: DioWalkers | null = null, talkT = 0;
  const walkersOk = () => !!(c.villagers && m.axon && m.local);
  async function people(on: boolean) {
    if (!on || !walkersOk()) { walkers?.stop(); return; }
    if (!walkers) {
      const data = (await c.load('sun-roads.json')) as Parameters<typeof mountDioWalkers>[0]['data'];
      if (!c.alive() || walkers) return;
      walkers = mountDioWalkers({ pane: P[0].el, axon: m.axon!, local: m.local!, data, who: c.villagers!, onTalk: () => {   /* 큰 대화 상자: 재생 멈춤 · 이야기 45초 자동 닫기도 멈춤 */
        stop(); c.hold(true); clearInterval(talkT); talkT = window.setInterval(() => { if (!c.alive() || !c.villagers!.talking()) { clearInterval(talkT); if (c.alive()) c.hold(false); } }, 400); } });
    }
    if (shown && landed && view === 'diorama' && !cmp) { walkers.start(); walkers.page({ h: '', body: '' }, night); }
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
    if (night) { P[0].caption = ''; void P[0].show(base + (m.night || 'night.webp'), c.alive); read.textContent = '밤 · 가로등과 가게 불빛'; }
    else if (f) {
      P[0].caption = cmp ? m.dates[date] || date : ''; void P[0].show(base + f.file, c.alive);
      if (cmp) { const g = frameAt(cmp, f.h); P[1].caption = m.dates[cmp] || cmp; void P[1].show(base + g.file, c.alive); }
      read.innerHTML = `<b>${hourLabel(f.h)}</b> · 해 높이 ${Math.round(f.elev)}°` + (cmp ? ` <small>(${short(m.dates[cmp] || cmp)} ${Math.round(frameAt(cmp, f.h).elev)}°)</small>` : '');
    }
    stage.classList.toggle('compare', !!cmp && !night);
    tabEls.forEach((b, i) => { const on = !night && dates[i] === date; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    nightTab.classList.toggle('on', night); nightTab.hidden = !night;
    row.hidden = night; range.max = String(Math.max(0, frames(date).length - 1)); range.value = String(idx);
    play.textContent = timer ? '❚❚' : '▶'; play.setAttribute('aria-label', timer ? '멈춤' : '재생');
  }
  function setDate(d: string) { const h = frames(date)[idx]?.h ?? 12; date = d; idx = frames(d).indexOf(frameAt(d, h)); preload([...frames(d), ...(cmp ? frames(cmp) : [])].map((f) => f.file)); paint(); }
  function setIdx(i: number) { idx = Math.max(0, Math.min(frames(date).length - 1, i)); paint(); }
  function start() { if (timer || night || !c.alive()) return; c.hold(true); timer = window.setInterval(() => { if (!c.alive()) { stop(); return; } setIdx((idx + 1) % frames(date).length); }, STEP_MS); paint(); }
  function stop() { if (!timer) return; clearInterval(timer); timer = 0; c.hold(false); if (c.alive()) paint(); }

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

  /* 해 눈금(보드 장): 단추 자리 옆, 이름표·단추·다른 눈금과 덜 겹치는 쪽에 */
  async function gauges(day: string | undefined) {
    gaugeG?.remove(); gaugeG = null;
    if (!day) return;
    const data = (await c.load('sun-stores.json')) as { stores: StoreSun[] };
    if (!c.alive() || view !== 'board') return;
    const spots = c.spots(), byId = new Map(spots.map((s) => [s.id, s])), byName = new Map(spots.map((s) => [s.name, s]));
    const BW = 34, BH = 6, FS = 10, TW = 31, W = BW + 3 + TW, H = 11;
    const boxes = spots.flatMap((s) => [{ x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r }, ...(s.lab ? [s.lab] : [])]);
    const over = (a: typeof boxes[0], b: typeof boxes[0]) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    gaugeG = document.createElementNS(NS, 'g'); gaugeG.setAttribute('class', 'kb-sun-gauges'); c.root.appendChild(gaugeG);
    for (const st of data.stores) {
      const d = st[day] as DaySun | undefined, s: StoreSpot | undefined = byId.get(st.id) || byName.get(st.name);
      if (!d || !s) continue;
      const cands: [number, number][] = [[s.x - W / 2, s.y + s.r + 2], [s.x + s.r + 2, s.y - H / 2], [s.x - s.r - 2 - W, s.y - H / 2], [s.x - W / 2, s.y - s.r - 2 - H]];
      let best = cands[0], bc = Infinity;
      cands.forEach(([x, y], k) => { const b = { x0: x, y0: y, x1: x + W, y1: y + H }; const cost = boxes.reduce((a, o) => a + over(b, o), 0) + k * 4; if (cost < bc) { bc = cost; best = [x, y]; } });
      boxes.push({ x0: best[0], y0: best[1], x1: best[0] + W, y1: best[1] + H });
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'kb-sun-g' + (d.hours ? '' : ' zero')); g.setAttribute('transform', `translate(${best[0].toFixed(1)},${best[1].toFixed(1)})`);
      const n = d.slots.length || 1, cw = BW / n; let sun = '';
      for (let i = 0; i < n; ) { if (d.slots[i] !== '1') { i++; continue; } let j = i; while (j < n && d.slots[j] === '1') j++; sun += `M${(i * cw).toFixed(2)} ${(H - BH) / 2}h${((j - i) * cw).toFixed(2)}v${BH}h${(-(j - i) * cw).toFixed(2)}Z`; i = j; }   /* 해 드는 칸을 이어 한 path 로 */
      g.innerHTML = `<rect class="kb-sun-bar" x="0" y="${(H - BH) / 2}" width="${BW}" height="${BH}" rx="1" fill="${SHADE}"/>` + (sun ? `<path d="${sun}" fill="${SUN}"/>` : '')
        + `<text x="${BW + 3}" y="${H / 2}" font-size="${FS}">${d.hours}시간</text>`;
      gaugeG.appendChild(g);
    }
    keyDate.textContent = short(m.dates[day] || day) + ' ';
  }

  const api: LayerCtl = {
    page(_i, p) {
      const L = (p.layer || {}) as PageL;
      stop(); gaugeG?.remove(); gaugeG = null;
      view = L.view === 'board' ? 'board' : 'diorama';
      if (view === 'board') { showStage(false); c.slot(L.stores ? keyRow : null); void gauges(L.stores); return; }
      night = !!L.night; cmp = !night && L.compare && m.frames[L.compare] ? L.compare : null;
      if (L.date && m.frames[L.date]) date = L.date;
      idx = frames(date).indexOf(frameAt(date, L.hour ?? frames(date)[idx]?.h ?? 12));
      if (!night) preload([...frames(date), ...(cmp ? frames(cmp) : [])].map((f) => f.file));
      c.slot(ctl); paint(); showStage(true, () => { if (L.autoplay) start(); });   /* 재생은 전환이 끝난 뒤(들추는 동안 그림이 넘어가지 않게) */
      if (landed) void people(!cmp);   /* 장이 바뀌어도 무대가 떠 있으면: 비교 장에선 숨기고 한 장짜리면 다시 */
    },
    destroy(instant) {
      stop(); preloadRun++; gaugeG?.remove(); view = null; clearInterval(talkT); walkers?.destroy(); walkers = null;
      const finish = () => { if (alive !== finish) return; alive = null; lift?.kill(); c.host.classList.remove('kb-dio-on', 'kb-dio-fab'); P.forEach((p) => p.release()); stage.remove(); };
      alive = finish;
      if (instant || !shown || !lift) { finish(); return; }
      shown = false; lift.leave(finish);   /* 사람이 닫으면 거꾸로 돌아가 천이 다시 덮인 뒤 지운다 */
    },
  };
  return api;
};
