import './story.css';
import { mountSpeech } from '../chief-speech/speech';
import { RENDERERS, type LayerCtl, type StoreSpot } from './layers';
import type { DioVillagers } from './dioWalkers';
import { mountReader } from './reader';
import { pageHtml, imgSrc, type Credit } from './pageHtml';

/* 전시 보드 이야기 상자(10-28) — 전시 모드(rest)에서 하늘·소품 그림(해·구름·별·나무·재봉틀)을 누르면 그 주제의 이야기가 열린다.
   · 그림은 board.ts 가 data-story 를 달아 둔 <image>. 그림엔 투명 여백이 있어 요소를 새로 만들지 않고 JS 로 판정한다: 그림 칸을 15% 줄인 칸(최소 44px).
     가게 단추·이름표·주민·이장님을 누른 것이면 그쪽이 이긴다.
   · hover: 살짝 커지고(1.06) 머리 위에 hook 한 줄(주민 hover 말풍선과 같은 모양). 쉬는 동안 9초마다 그림 하나가 살짝 흔들린다(힌트).
   · 열기: 그림이 한 번 통 튀고 → 보드만 살짝 어두워지고(하늘은 그대로) → 오른쪽에서 천 이야기 상자(제목·장·점·‹ ›·✕). ← → 로 장, Esc 로 닫기.
   · 겹 그림(layer): 주제 JSON 에 layer 가 있으면 열 때 storyLayer 에 그리고 닫을 때 DOM 에서 지운다(요소 수 = 팬·줌 렉, CLAUDE.md §8).
     그리는 쪽은 layers.ts 의 RENDERERS[type](별자리 constellation …). 장마다 page() 로 상태를 바꾼다(장의 layer 칸은 렌더러가 읽는다).
   · 장: h 제목 → author(작은 줄) → q(손글씨 한 줄 질문) → body → src(작게) → pdf 가 있으면 '논문 원문 보기'(reader.ts — 새 탭·PDF 보기 없이 쪽 그림을 펼쳐 읽는 틀).
   · 닫기: ✕·Esc·보드 빈 곳. 카메라·단추·필터는 건드리지 않는다. 열린 채 45초 입력이 없으면 스스로 닫혀 자동 순환이 다시 돈다.
   · 주제 JSON(content/board-story/*.json)은 처음 열 때 받는다(첫 화면 무게). 늦게 도착한 것은 seq 로 버린다.
   순수 UI: 엔진 상태는 옵션 함수로만 묻는다. */
export interface StoryPage { h: string; body: string; img?: string | { file: string; cap?: string } | null; src?: string | null; author?: string | null; q?: string; pdf?: string | null; layer?: Record<string, unknown> | null }
export interface StoryLayerSpec { type: string; [k: string]: unknown }
export interface StoryTopic { id: string; title: string; hook: string; pages: StoryPage[]; layer: StoryLayerSpec | null; focus?: boolean }   // focus: 열린 동안 단추·이름표·범례·주민·동선을 걷는다
export interface StoryOptions {
  host: HTMLElement;                                        // #map — 상자·말풍선을 붙일 칸
  svg: SVGSVGElement;
  targets: () => { topic: string; el: SVGGraphicsElement }[];
  layer: SVGGElement; islandPath: string;
  active: () => boolean;                                    // 전시 모드 rest 이고 인트로가 닫혀 있을 때만 true
  busy: () => boolean;                                      // 카드·대화·말풍선·사진·자동 순환 중이면 true(힌트 흔들기 안 함)
  quiet: () => boolean;                                     // 큰 대화 상자가 떠 있으면 true(hook 말풍선 안 띄움)
  moved: () => boolean;                                     // 방금 끌기였나(viewport) — 끈 뒤의 click 은 무시
  onOpen: () => void;                                       // 엔진: 활동으로 치고, 카드·주민 대화·이장님 말풍선 닫기
  onClose?: () => void;
  toBoard?: (lat: number, lng: number) => [number, number];   // 실제 위경도 → 보드 캔버스(건물 겹 그림)
  spots?: () => StoreSpot[];                                 // 보드 가게 단추 자리(해 눈금)
  villagers?: DioVillagers;                                  // 보드 주민 명단·말 걸기(해 디오라마)
  openPhoto?: (urls: string[], i: number, label: string) => void;   // 사진 크게 보기(엔진의 photo-viewer)
  top?: SVGGElement;                                         // 단추·이름표 위 층(해 눈금)
  obstacles?: () => { x0: number; y0: number; x1: number; y1: number }[];   // 장식 칸(캔버스)
  camera?: { focus(x: number, y: number, mul: number, dx?: number): void; restore(): void };   // 카메라 잠깐 당기기·되돌리기(보드 캔버스 좌표)
}
export interface BoardStory { readonly open: boolean; close(instant?: boolean): void }

const LOAD = import.meta.glob<StoryTopic>('../../../content/board-story/*.json', { import: 'default' });   /* 주제 JSON 과 겹 그림 데이터(…-buildings.json 등) — 모두 처음 쓸 때 받는다 */
const cache: Record<string, StoryTopic> = {};
/* 장 그림의 저작자(public/board/story/<주제>/credits.json) — 그림이 있는 주제를 처음 열 때 받는다 */
const credits: Record<string, Promise<Record<string, Credit>>> = {};
const creditsOf = (id: string) => (credits[id] ||= fetch(`/board/story/${id}/credits.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
const imgBase = (id: string) => `/board/story/${id}/`;
async function loadTopic(id: string): Promise<StoryTopic | null> {
  if (cache[id]) return cache[id];
  const f = LOAD[`../../../content/board-story/${id}.json`]; if (!f) return null;
  return (cache[id] = await f());
}
const IDLE_CLOSE_MS = Number(new URLSearchParams(location.search).get('story_idle')) || 45000,   /* ?story_idle=ms: 확인용으로 줄이기 */
  HINT_MS = 9000, SHRINK = 0.15, MIN_HIT = 44;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const SKIP = '.kb-btn,.kb-lg,.wk';                         /* 이쪽을 누른 것이면 이야기 판정을 안 한다 */

export function mountStory(o: StoryOptions): BoardStory {
  let cur: { topic: string; el: SVGGraphicsElement } | null = null, data: StoryTopic | null = null, page = 0, seq = 0;
  let panel: HTMLElement | null = null, dim: SVGPathElement | null = null, idleT = 0, hot: { topic: string; el: SVGGraphicsElement } | null = null, raf = 0, ctl: LayerCtl | null = null, held = false;
  const islandPts = (o.islandPath.match(/-?\d+\.?\d*/g) || []).map(Number).reduce<number[][]>((a, v, i, arr) => { if (i % 2 === 0) a.push([v, arr[i + 1]]); return a; }, []);   /* 섬 덩어리 꼭짓점(캔버스) */
  const pdf = mountReader(() => { if (cur) armIdle(); });   /* 논문 읽기 틀이 닫히면 45초를 다시 센다(열린 동안은 멈춤) */
  const hook = mountSpeech(o.host, {
    anchor: () => { if (!hot) return null; const r = hot.el.getBoundingClientRect(), m = o.host.getBoundingClientRect(); return { x: r.left + r.width / 2 - m.left, y: r.top + r.height * 0.1 - m.top }; },
    bounds: () => { const m = o.host.getBoundingClientRect(); return { left: 0, top: 0, width: m.width, height: m.height }; },
  });

  /* 판정: 그림 칸을 15% 줄인 칸(가로·세로 각각 최소 44px). 겹치면 작은 칸이 이긴다(나무 앞 재봉틀 등) */
  function hitAt(x: number, y: number) {
    let best: { topic: string; el: SVGGraphicsElement } | null = null, area = Infinity;
    for (const t of o.targets()) {
      const r = t.el.getBoundingClientRect(); if (!r.width) continue;
      const w = Math.max(MIN_HIT, r.width * (1 - SHRINK)), h = Math.max(MIN_HIT, r.height * (1 - SHRINK)), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2 && w * h < area) { best = t; area = w * h; }
    }
    return best;
  }
  const onMap = (t: EventTarget | null) => t instanceof Element && (t === o.svg || o.svg.contains(t)) && !t.closest(SKIP);
  function setHot(t: typeof hot) {
    if (t?.el === hot?.el) return;
    hot?.el.classList.remove('kb-story-hot'); hot = t; o.host.classList.toggle('kb-story-ptr', !!t);
    if (!t) { hook.hide(); return; }
    t.el.classList.add('kb-story-hot');
    if (cur?.el !== t.el) loadTopic(t.topic).then((d) => { if (hot === t && d?.hook && !o.quiet()) hook.say([d.hook], { onTap: () => openTopic(t) }); });
  }
  o.host.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (hot && e.target instanceof Element && e.target.closest('.speech')) return;   /* hook 말풍선 위로 옮겨 가도 유지 — 말풍선을 눌러도 열린다 */
    if (e.target instanceof Element && e.target.closest('.kb-story-layer [data-page],.kb-story-layer [data-hit]')) { cancelAnimationFrame(raf); setHot(null); return; }   /* 겹 그림의 누르는 것(별자리 별) 위 */
    cancelAnimationFrame(raf); const { clientX: x, clientY: y, target } = e;
    raf = requestAnimationFrame(() => setHot(o.active() && onMap(target) ? hitAt(x, y) : null));
  }, { passive: true });
  o.host.addEventListener('pointerleave', () => setHot(null));
  o.host.addEventListener('wheel', () => setHot(null), { passive: true });
  o.host.addEventListener('pointerdown', (e) => { if (!(e.target instanceof Element && e.target.closest('.speech'))) { cancelAnimationFrame(raf); setHot(null); } }, { passive: true });   /* 끌기 시작하면 말풍선이 제자리에 남지 않게 */

  /* 누르기: 단추·이름표·주민을 누르면(capture 로 먼저) 열린 이야기를 닫는다 — 그쪽 카드·대화가 오른쪽을 쓴다 */
  o.host.addEventListener('click', (e) => { if (cur && e.target instanceof Element && e.target.closest(SKIP)) close(true); }, true);
  o.host.addEventListener('click', (e) => {
    if (!o.active() || o.moved() || !onMap(e.target)) return;
    if ((e.target as Element).closest('.kb-story-layer [data-hit]')) return;   /* 겹 그림이 스스로 받는 것(쉼터 제안 자리) */
    const pg = cur && data ? (e.target as Element).closest('.kb-story-layer [data-page]') : null;
    if (pg) { goTo(Number(pg.getAttribute('data-page'))); return; }   /* 별자리 별 → 그 장 */
    const t = hitAt(e.clientX, e.clientY);
    if (t) openTopic(t); else if (cur) close();
  });

  function openTopic(t: { topic: string; el: SVGGraphicsElement }) {
    if (!o.active()) return;
    const my = ++seq; o.onOpen(); hook.hide();
    if (!reduced()) t.el.animate([{ scale: '1' }, { scale: '1.16' }, { scale: '.96' }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
    if (cur?.topic === t.topic && data) { cur = t; return; }
    clearLayer(true); cur = t; data = null; topicCredits = {}; document.documentElement.classList.remove('kb-story-focus');
    loadTopic(t.topic).then((d) => {
      if (my !== seq || !d || !o.active()) { if (my === seq && !d) close(true); return; }
      data = d; page = 0; showDim(true); ensurePanel(); render(); armIdle();
      document.documentElement.classList.toggle('kb-story-focus', !!d.focus);   /* 이 이야기에 집중: 단추·이름표·범례·주민·동선이 물러난다(story.css) */
      if (d.pages.some((q) => q.img && typeof q.img === 'object')) void creditsOf(d.id).then((cr) => { if (my === seq && data === d) { topicCredits = cr; render(); } });
      panel!.classList.add('show'); document.documentElement.classList.add('kb-story-on');
      if (d.layer) startLayer(d, my);
    }).catch(() => { if (my === seq) close(true); });
  }
  /* 겹 그림: 렌더러가 늦게(데이터를 받아) 돌아와도 그새 닫혔거나 주제가 바뀌었으면 버린다 */
  function startLayer(d: StoryTopic, my: number) {
    const fn = RENDERERS[d.layer!.type]; if (!fn) return;
    const root = document.createElementNS(NS, 'g'); root.setAttribute('class', 'kb-story-l kb-l-' + d.layer!.type); o.layer.appendChild(root);
    const alive = () => my === seq && root.isConnected;
    Promise.resolve(fn({ root, spec: d.layer!, topic: d, alive, go: goTo,
      later: (f, ms) => { setTimeout(() => { if (alive()) f(); }, ms); },
      slot: (h) => { if (alive()) panel?.querySelector('.kb-story-slot')!.replaceChildren(...(h ? [h] : [])); },
      cover: (h) => { if (alive()) setCover(h); },
      close: () => { if (alive()) close(); },
      hold: (on) => { if (!alive() || held === on) return; held = on; if (on) clearTimeout(idleT); else armIdle(); },
      host: o.host, spots: () => (o.spots ? o.spots() : []), villagers: o.villagers ?? null, island: islandPts,
      openPhoto: (urls, i, label) => o.openPhoto?.(urls, i, label),
      top: o.top ?? null, obstacles: () => (o.obstacles ? o.obstacles() : []), camera: o.camera ?? null,
      load: async (name) => { const f = LOAD[`../../../content/board-story/${name}`]; if (!f) throw new Error('없는 데이터 ' + name); return f(); },
      toBoard: (lat, lng) => o.toBoard ? o.toBoard(lat, lng) : [0, 0] }))
      .then((c) => { if (!c) return; if (!alive()) { c.destroy?.(); return; } ctl = c; c.page(page, d.pages[page]); })
      .catch(() => { if (alive()) root.remove(); });   /* 겹 그림이 실패해도 이야기는 그대로 */
  }
  let topicCredits: Record<string, Credit> = {};
  function clearLayer(keepDim = false) { dropCtl(); [...o.layer.children].forEach((c) => { if (!keepDim || c !== dim) c.remove(); }); if (!keepDim) dim = null; o.top?.replaceChildren(); panel?.querySelector('.kb-story-slot')!.replaceChildren(); setCover(null); }
  function setCover(h: HTMLElement | null) {   /* 본문 대신 잠시(건물 카드) */
    if (!panel) return; const cov = panel.querySelector('.kb-story-cover') as HTMLElement, pg = panel.querySelector('.kb-story-page') as HTMLElement;
    cov.replaceChildren(...(h ? [h] : [])); cov.hidden = !h; pg.hidden = !!h;
  }
  function dropCtl(instant = true) { const c = ctl; ctl = null; held = false; c?.destroy?.(instant); }   /* 주제를 바꿀 땐 어둠은 그대로(깜빡임 없이) */
  function showDim(on: boolean) {
    if (on) {
      if (!dim) { dim = document.createElementNS(NS, 'path'); dim.setAttribute('class', 'kb-story-dim'); dim.setAttribute('d', o.islandPath); o.layer.prepend(dim); }
      void dim.getBoundingClientRect(); dim.classList.add('on');
    } else dim?.classList.remove('on');
  }
  function close(instant = false) {
    ++seq; clearTimeout(idleT); off(); pdf.close(true); dropCtl(instant || reduced());
    const was = !!cur; cur = null; data = null; setHot(null);
    document.documentElement.classList.remove('kb-story-on', 'kb-story-focus'); topicCredits = {};
    if (panel) { panel.classList.toggle('instant', instant); panel.classList.remove('show'); }
    if (instant || reduced()) clearLayer();
    else { showDim(false); const my = seq; setTimeout(() => { if (my === seq) clearLayer(); }, 260); }   /* 어둠이 걷힌 뒤 비운다 */
    if (was) o.onClose?.();
  }

  /* 상자(HTML, #map 안): 처음 열 때 만든다 */
  function ensurePanel() {
    if (panel) { panel.classList.remove('instant'); return panel; }
    panel = document.createElement('aside'); panel.className = 'kb-story'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<button type="button" class="kb-story-x" aria-label="이야기 닫기">✕</button><h2 class="kb-story-title"></h2><div class="kb-story-page"></div><div class="kb-story-cover" hidden></div><div class="kb-story-slot"></div>'
      + '<nav class="kb-story-nav"><button type="button" class="kb-story-prev" aria-label="앞 장">‹</button><span class="kb-story-dots"></span><button type="button" class="kb-story-next" aria-label="다음 장">›</button></nav>';
    ['pointerdown', 'wheel', 'click'].forEach((ev) => panel!.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));   /* 지도 끌기·휠 줌·빈 곳 닫기로 새지 않게(활동 판정은 window capture 라 그대로) */
    panel.querySelector('.kb-story-x')!.addEventListener('click', () => { if (!ctl?.back?.()) close(); });   /* 고른 건물이 있으면 그것부터 푼다 */
    panel.querySelector('.kb-story-prev')!.addEventListener('click', () => go(-1));
    panel.querySelector('.kb-story-next')!.addEventListener('click', () => go(1));
    o.host.appendChild(panel); void panel.offsetWidth;
    return panel;
  }
  function render() {
    const d = data!, p: StoryPage = d.pages[page] || { h: '', body: '' };
    panel!.setAttribute('aria-label', d.title);
    panel!.querySelector('.kb-story-title')!.textContent = d.title;
    panel!.querySelector('.kb-story-page')!.innerHTML = pageHtml(p, { pdfButton: true, imgBase: imgBase(d.id), credits: topicCredits });
    (panel!.querySelector('.kb-story-page') as HTMLElement).scrollTop = 0;
    const src = imgSrc(p, imgBase(d.id)), cap = p.img && typeof p.img === 'object' ? p.img.cap || '' : '';
    panel!.querySelector('.kb-story-figbtn')?.addEventListener('click', () => o.openPhoto?.([src], 0, cap));
    const nx = d.pages[page + 1]; if (nx?.img) { const im = new Image(); im.src = imgSrc(nx, imgBase(d.id)); }   /* 다음 장 그림 미리 */
    panel!.querySelector('.kb-story-pdf')?.addEventListener('click', () => { if (p.pdf) { clearTimeout(idleT); pdf.show(p.pdf, p); } });   /* 틀이 열린 동안 45초 자동 닫기는 멈춘다 */
    panel!.querySelector('.kb-story-dots')!.innerHTML = d.pages.map((_, i) => `<i${i === page ? ' class="on"' : ''}></i>`).join('');
    (panel!.querySelector('.kb-story-prev') as HTMLButtonElement).disabled = page === 0;
    (panel!.querySelector('.kb-story-next') as HTMLButtonElement).disabled = page >= d.pages.length - 1;
    ctl?.page(page, p);
  }
  function goTo(i: number) { if (!data) return; const n = Math.max(0, Math.min(data.pages.length - 1, i)); if (n !== page) { page = n; render(); } }
  const go = (dp: number) => goTo(page + dp);

  /* 열린 동안: 입력이 오면 45초를 다시 센다, ← → Esc */
  const armIdle = () => { clearTimeout(idleT); on(); if (held) return; const my = seq; idleT = window.setTimeout(() => { if (my !== seq || !cur) return; if (ctl?.back?.()) armIdle(); else close(); }, IDLE_CLOSE_MS); };   /* 45초: 한 단계씩 물러난다(해 이야기 건물 → 위에서 본 신당 → 보드) */
  const onInput = () => { if (pdf.open) pdf.poke(); else if (cur && data && !held) armIdle(); };   /* 논문 틀이 열린 동안엔 그 3분만 센다 */
  const onKey = (e: KeyboardEvent) => {
    if (!cur || !data) return;
    if (pdf.open) { pdf.key(e); return; }   /* 논문 읽기 틀이 열려 있으면 그쪽 키(Esc: 큰 쪽 → 쪽 목록 → 틀 닫기, ← →) */
    if (e.key !== 'Escape' && e.target instanceof HTMLInputElement) return;   /* 막대(range)에 포커스가 있으면 ← → 는 막대 것 */
    if (e.key === 'Escape') { e.preventDefault(); if (!ctl?.back?.()) close(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };
  let listening = false;
  const IN = ['pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
  function on() { if (listening) return; listening = true; IN.forEach((ev) => window.addEventListener(ev, onInput, { passive: true, capture: true })); window.addEventListener('keydown', onKey); window.addEventListener('keydown', onInput, true); }
  function off() { if (!listening) return; listening = false; IN.forEach((ev) => window.removeEventListener(ev, onInput, { capture: true })); window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onInput, true); }

  /* 힌트: 쉬는 동안 9초마다 그림 하나가 살짝 흔들린다 */
  window.setInterval(() => {
    if (cur || hot || reduced() || document.hidden || !o.active() || o.busy()) return;
    const ts = o.targets(); if (!ts.length) return;
    ts[Math.floor(Math.random() * ts.length)].el.animate([{ rotate: '0deg' }, { rotate: '-5deg' }, { rotate: '4deg' }, { rotate: '-2deg' }, { rotate: '0deg' }], { duration: 560, easing: 'ease-in-out' });
  }, HINT_MS);

  return { get open() { return !!cur; }, close };
}
