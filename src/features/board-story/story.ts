import './story.css';
import { mountSpeech } from '../chief-speech/speech';

/* 전시 보드 이야기 상자(10-28) — 전시 모드(rest)에서 하늘·소품 그림(해·구름·별·나무·재봉틀)을 누르면 그 주제의 이야기가 열린다.
   · 그림은 board.ts 가 data-story 를 달아 둔 <image>. 그림엔 투명 여백이 있어 요소를 새로 만들지 않고 JS 로 판정한다: 그림 칸을 15% 줄인 칸(최소 44px).
     가게 단추·이름표·주민·이장님을 누른 것이면 그쪽이 이긴다.
   · hover: 살짝 커지고(1.06) 머리 위에 hook 한 줄(주민 hover 말풍선과 같은 모양). 쉬는 동안 9초마다 그림 하나가 살짝 흔들린다(힌트).
   · 열기: 그림이 한 번 통 튀고 → 보드만 살짝 어두워지고(하늘은 그대로) → 오른쪽에서 천 이야기 상자(제목·장·점·‹ ›·✕). ← → 로 장, Esc 로 닫기.
   · 겹 그림(layer): 주제 JSON 에 layer 가 있으면 열 때 storyLayer 에 그리고 닫을 때 DOM 에서 지운다(요소 수 = 팬·줌 렉, CLAUDE.md §8).
     그리는 쪽은 RENDERERS[type] — 다음 단계에서 'frames'(해 렌더 이미지)·'svg' 를 더한다.
   · 닫기: ✕·Esc·보드 빈 곳. 카메라·단추·필터는 건드리지 않는다. 열린 채 45초 입력이 없으면 스스로 닫혀 자동 순환이 다시 돈다.
   · 주제 JSON(content/board-story/*.json)은 처음 열 때 받는다(첫 화면 무게). 늦게 도착한 것은 seq 로 버린다.
   순수 UI: 엔진 상태는 옵션 함수로만 묻는다. */
export interface StoryPage { h: string; body: string; img: string | null; src: string | null }
export interface StoryLayerSpec { type: string; [k: string]: unknown }
export interface StoryTopic { id: string; title: string; hook: string; pages: StoryPage[]; layer: StoryLayerSpec | null }
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
}
export interface BoardStory { readonly open: boolean; close(instant?: boolean): void }

type Renderer = (layer: SVGGElement, spec: StoryLayerSpec) => void;
const RENDERERS: Record<string, Renderer> = {};            /* 다음 단계: frames(해) · svg(2D 겹) */
const LOAD = import.meta.glob<StoryTopic>('../../../content/board-story/*.json', { import: 'default' });
const cache: Record<string, StoryTopic> = {};
async function loadTopic(id: string): Promise<StoryTopic | null> {
  if (cache[id]) return cache[id];
  const f = LOAD[`../../../content/board-story/${id}.json`]; if (!f) return null;
  return (cache[id] = await f());
}
const IDLE_CLOSE_MS = 45000, HINT_MS = 9000, SHRINK = 0.15, MIN_HIT = 44;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SKIP = '.kb-btn,.kb-lg,.wk';                         /* 이쪽을 누른 것이면 이야기 판정을 안 한다 */

export function mountStory(o: StoryOptions): BoardStory {
  let cur: { topic: string; el: SVGGraphicsElement } | null = null, data: StoryTopic | null = null, page = 0, seq = 0;
  let panel: HTMLElement | null = null, dim: SVGPathElement | null = null, idleT = 0, hot: { topic: string; el: SVGGraphicsElement } | null = null, raf = 0;
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
    const t = hitAt(e.clientX, e.clientY);
    if (t) openTopic(t); else if (cur) close();
  });

  function openTopic(t: { topic: string; el: SVGGraphicsElement }) {
    if (!o.active()) return;
    const my = ++seq; o.onOpen(); hook.hide();
    if (!reduced()) t.el.animate([{ scale: '1' }, { scale: '1.16' }, { scale: '.96' }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
    if (cur?.topic === t.topic && data) { cur = t; return; }
    clearLayer(true); cur = t; data = null;
    loadTopic(t.topic).then((d) => {
      if (my !== seq || !d || !o.active()) { if (my === seq && !d) close(true); return; }
      data = d; page = 0; showDim(true); ensurePanel(); render(); armIdle();
      panel!.classList.add('show'); document.documentElement.classList.add('kb-story-on');
      if (d.layer) RENDERERS[d.layer.type]?.(o.layer, d.layer);
    }).catch(() => { if (my === seq) close(true); });
  }
  function clearLayer(keepDim = false) { [...o.layer.children].forEach((c) => { if (!keepDim || c !== dim) c.remove(); }); if (!keepDim) dim = null; }   /* 주제를 바꿀 땐 어둠은 그대로(깜빡임 없이) */
  function showDim(on: boolean) {
    if (on) {
      if (!dim) { dim = document.createElementNS(NS, 'path'); dim.setAttribute('class', 'kb-story-dim'); dim.setAttribute('d', o.islandPath); o.layer.prepend(dim); }
      void dim.getBoundingClientRect(); dim.classList.add('on');
    } else dim?.classList.remove('on');
  }
  function close(instant = false) {
    ++seq; clearTimeout(idleT); off();
    const was = !!cur; cur = null; data = null; setHot(null);
    document.documentElement.classList.remove('kb-story-on');
    if (panel) { panel.classList.toggle('instant', instant); panel.classList.remove('show'); }
    if (instant || reduced()) clearLayer();
    else { showDim(false); const my = seq; setTimeout(() => { if (my === seq) clearLayer(); }, 260); }   /* 어둠이 걷힌 뒤 비운다 */
    if (was) o.onClose?.();
  }

  /* 상자(HTML, #map 안): 처음 열 때 만든다 */
  function ensurePanel() {
    if (panel) { panel.classList.remove('instant'); return panel; }
    panel = document.createElement('aside'); panel.className = 'kb-story'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<button type="button" class="kb-story-x" aria-label="이야기 닫기">✕</button><h2 class="kb-story-title"></h2><div class="kb-story-page"></div>'
      + '<nav class="kb-story-nav"><button type="button" class="kb-story-prev" aria-label="앞 장">‹</button><span class="kb-story-dots"></span><button type="button" class="kb-story-next" aria-label="다음 장">›</button></nav>';
    ['pointerdown', 'wheel', 'click'].forEach((ev) => panel!.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));   /* 지도 끌기·휠 줌·빈 곳 닫기로 새지 않게(활동 판정은 window capture 라 그대로) */
    panel.querySelector('.kb-story-x')!.addEventListener('click', () => close());
    panel.querySelector('.kb-story-prev')!.addEventListener('click', () => go(-1));
    panel.querySelector('.kb-story-next')!.addEventListener('click', () => go(1));
    o.host.appendChild(panel); void panel.offsetWidth;
    return panel;
  }
  function render() {
    const d = data!, p = d.pages[page] || { h: '', body: '', img: null, src: null };
    panel!.setAttribute('aria-label', d.title);
    panel!.querySelector('.kb-story-title')!.textContent = d.title;
    panel!.querySelector('.kb-story-page')!.innerHTML = (p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : '')
      + `<h3>${esc(p.h)}</h3><p>${esc(p.body)}</p>` + (p.src ? `<small class="kb-story-src">${esc(p.src)}</small>` : '');
    panel!.querySelector('.kb-story-dots')!.innerHTML = d.pages.map((_, i) => `<i${i === page ? ' class="on"' : ''}></i>`).join('');
    (panel!.querySelector('.kb-story-prev') as HTMLButtonElement).disabled = page === 0;
    (panel!.querySelector('.kb-story-next') as HTMLButtonElement).disabled = page >= d.pages.length - 1;
  }
  function go(dp: number) { if (!data) return; const n = Math.max(0, Math.min(data.pages.length - 1, page + dp)); if (n !== page) { page = n; render(); } }

  /* 열린 동안: 입력이 오면 45초를 다시 센다, ← → Esc */
  const armIdle = () => { clearTimeout(idleT); const my = seq; idleT = window.setTimeout(() => { if (my === seq && cur) close(); }, IDLE_CLOSE_MS); on(); };
  const onInput = () => { if (cur && data) armIdle(); };
  const onKey = (e: KeyboardEvent) => {
    if (!cur || !data) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
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
