import './viewer.css';

/* 사진 크게 보기(10-26) — 가게 카드의 사진을 누르면 화면 가득 연다. 순수 UI: 지도 엔진·데이터를 모른다.
   · open(urls, i): i 번째 사진부터. 여러 장이면 옆으로 쓸기 · 옆 사진 누르기 · 키보드 ←/→ · 양옆 ‹ › 로 넘긴다(✕ 단추는 10-28 에 뺐다. ‹ › 는 10-28 에 바탕 없는 기호로 다시).
   · 넘김은 커버플로(10-28, Originkit 'Coverflow Gallery' 를 React 없이 옮김): 가운데 사진 양옆으로 앞뒤 사진이 기울어 물러나 있고,
     넘기면 3D 로 돌아 들어온다. 원본은 사진 400px 칸 기준 수치라, 사진 칸 크기에 비례(K)해 간격·깊이·원근을 같이 키운다 →
     원본보다 '멀리 있는' 느낌 없이 가운데 사진이 화면을 거의 채운다.
   · 사진 칸 규격은 예전 그대로: 화면 94% × 86% 안에 사진 원래 비율로(받기 전엔 카드뉴스 4:5).
     좁은 화면(폭 600px 미만)은 폭 80% — 뒤에 사진이 더 있다는 게 양옆으로 보이게(10-28, 74 → 80: 가운데 사진을 조금 더 크게).
   · 확대: 사이트가 폰 확대를 막아 두었으므로(viewport user-scalable=no) 여기서 따로 — 가운데 사진을 누르면 2.5배(그 자리를 중심으로)·다시 누르면 원래대로,
     두 손가락 벌리기, 휠. 확대된 동안엔 끌어서 둘러보고(사진 밖으로 너무 나가지 않게) 옆 사진은 숨긴다.
   · 닫기: 사진 밖(어두운 곳) 누르기 · Esc. 닫으면 열기 전 초점으로 돌아간다. */
export interface PhotoViewer { open(urls: string[], index?: number, label?: string): void; close(): void; readonly visible: boolean }

const MAX = 4, TAP_ZOOM = 2.5;
/* 커버플로 수치 — gap·gapNarrow(좁은 화면)·inactiveOpacity·round 는 사용자 지정(10-28). round 0~20 → 모서리 반지름 = 짧은 변 절반 × round/20(원본 계산), 나머지는 원본 기본값 */
const CF = { gap: 6, gapNarrow: 5, inactiveOpacity: 30, round: 3, tilt: 12, sideTilt: 8, scaleStep: 0.16, maxVisible: 2, depth: 240, perspective: 1600, base: 400 };
const DIM = 1 - CF.inactiveOpacity / 100;   // 옆 사진 위에 덮는 바탕색 농도(가운데 0)
const BOX_W = 0.94, BOX_W_NARROW = 0.8, NARROW = 600, BOX_H = 0.86, ASPECT = 0.8;

interface Card { el: HTMLElement; img: HTMLImageElement; dim: HTMLElement; a: number; rel: number }

export function mountPhotoViewer(): PhotoViewer {
  const el = document.createElement('div'); el.className = 'pv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1; el.hidden = true;
  el.innerHTML = '<div class="pv-stage"><div class="pv-ring"></div></div><span class="pv-count"></span>'
    + '<button type="button" class="pv-nav prev" aria-label="이전 사진">‹</button><button type="button" class="pv-nav next" aria-label="다음 사진">›</button>';
  document.body.appendChild(el);
  const navs = [...el.querySelectorAll<HTMLButtonElement>('.pv-nav')];
  const stage = el.querySelector('.pv-stage') as HTMLElement, ring = el.querySelector('.pv-ring') as HTMLElement, count = el.querySelector('.pv-count') as HTMLElement;
  let urls: string[] = [], cards: Card[] = [], i = 0, label = '', visible = false, back: Element | null = null;
  let s = 1, tx = 0, ty = 0;   // 가운데 사진의 확대 배율과 옮김(px, 화면 가운데 기준)
  let K = 1, stepPx = 180, gap = CF.gap;   // K: 원본 400px 칸 대비 배율, stepPx: 한 장 넘어가는 끌기 거리, gap: 지금 화면의 사진 간격

  /* ── 사진 칸 크기·커버플로 배치 ── */
  const box = () => ({ w: el.clientWidth * (el.clientWidth < NARROW ? BOX_W_NARROW : BOX_W), h: el.clientHeight * BOX_H });
  function size(c: Card) { const b = box(), w = Math.min(b.w, b.h * c.a); c.el.style.width = `${w}px`; c.el.style.height = `${w / c.a}px`; c.el.style.setProperty('--pv-r', `${(CF.round / 20) * Math.min(w, w / c.a) / 2}px`); }
  function layout() {
    const b = box(); K = Math.min(b.w, b.h * ASPECT) / CF.base; gap = el.clientWidth < NARROW ? CF.gapNarrow : CF.gap;
    stage.style.perspective = `${CF.perspective * K}px`; stepPx = Math.max(80, gap * 30 * K); cards.forEach(size);
  }
  /* drag: 끄는 중 밀린 장 수(손가락을 따라 움직임). jump: 애니메이션 없이 바로 그 자리로 */
  function render(drag = 0, jump = false) {
    const n = cards.length;
    cards.forEach((c, j) => {
      let rel = j - i; if (rel > n / 2) rel -= n; if (rel < -n / 2) rel += n;
      const wrap = Math.abs(rel - c.rel) > 1.5; c.rel = rel;   // 맨 끝 ↔ 맨 앞으로 건너가는 사진은 가로질러 날아가지 않게
      const r = rel + drag, ax = Math.abs(r), sc = Math.max(0.4, 1 - ax * CF.scaleStep), vis = Math.max(0, Math.min(1, CF.maxVisible + 1 - ax));
      if (jump || wrap) c.el.classList.add('jump');
      c.el.style.transform = `translate(-50%, -50%) translateX(${r * gap * 30 * K}px) translateZ(${-ax * CF.depth * K}px) rotateY(${-r * CF.tilt}deg) rotateZ(${r * CF.sideTilt}deg) scale(${sc})`;
      c.el.style.opacity = String(vis); c.el.style.pointerEvents = vis > 0.5 ? 'auto' : 'none';
      c.dim.style.opacity = String(Math.min(1, ax) * DIM);
      c.el.classList.toggle('cur', rel === 0); c.el.setAttribute('aria-hidden', String(rel !== 0));
      if (Math.abs(rel) <= CF.maxVisible + 1 && !c.img.getAttribute('src')) load(c, j);   // 보이는 사진 + 한 장 더만 받는다
      if (jump || wrap) { void c.el.offsetWidth; c.el.classList.remove('jump'); }
    });
  }
  function load(c: Card, j: number) {
    c.el.classList.add('loading');
    c.img.onload = () => { c.a = c.img.naturalWidth / c.img.naturalHeight || ASPECT; size(c); c.el.classList.remove('loading'); if (cards[i] === c) { clampPan(); paint(); } };
    c.img.onerror = () => c.el.classList.remove('loading');
    c.img.src = urls[j];
  }

  /* ── 확대(가운데 사진만) ── */
  const curImg = () => cards[i]?.img;
  const paint = (anim = false) => { const img = curImg(); if (!img) return; img.classList.toggle('anim', anim); img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; el.classList.toggle('zoomed', s > 1.01); };
  /* 옮김 한계: 확대된 사진이 화면보다 클 때만 그 넘는 만큼 */
  const clampPan = () => { const img = curImg(); if (!img) return; const mx = Math.max(0, (img.clientWidth * s - el.clientWidth) / 2), my = Math.max(0, (img.clientHeight * s - el.clientHeight) / 2); tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
  /* 화면의 점 (qx, qy) 를 고정한 채 배율 s → s2 */
  const zoomAt = (s2: number, qx: number, qy: number) => {
    s2 = Math.max(1, Math.min(MAX, s2)); const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tx = qx - cx - ((qx - cx - tx) * s2) / s; ty = qy - cy - ((qy - cy - ty) * s2) / s; s = s2;
    if (s <= 1.01) { s = 1; tx = 0; ty = 0; } clampPan();
  };
  const reset = () => { s = 1; tx = 0; ty = 0; paint(); };

  function show(k: number, jump = false) {
    if (!cards.length) return;
    reset(); i = (k + cards.length) % cards.length; reset();   // 떠나는 사진·오는 사진 둘 다 원래 크기로
    const many = cards.length > 1; navs.forEach(b => { b.hidden = !many; }); count.textContent = many ? `${i + 1} / ${cards.length}` : '';
    cards.forEach((c, j) => { c.img.alt = many ? `${label} 사진 ${j + 1} / ${cards.length}` : `${label} 사진`; });
    render(0, jump);
  }
  function open(list: string[], index = 0, name = '') {
    if (!list.length) return; urls = list; label = name; back = document.activeElement;
    ring.textContent = ''; i = 0;
    cards = list.map((_, j) => {
      const c = document.createElement('div'); c.className = 'pv-card'; c.dataset.k = String(j);
      c.innerHTML = '<img class="pv-img" alt="" draggable="false"><i class="pv-dim"></i>'; ring.appendChild(c);
      return { el: c, img: c.querySelector('img') as HTMLImageElement, dim: c.querySelector('.pv-dim') as HTMLElement, a: ASPECT, rel: NaN };
    });
    el.hidden = false; visible = true; el.setAttribute('aria-label', `${name} 사진 크게 보기`); layout(); show(index, true);
    requestAnimationFrame(() => el.classList.add('show')); el.focus({ preventScroll: true });   // 초점은 상자에(키보드 ←/→·Esc 를 받게)
  }
  function close() {
    if (!visible) return; visible = false; el.classList.remove('show', 'zoomed', 'drag'); el.hidden = true; ring.textContent = ''; cards = [];
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
  }

  /* ── 누르기·끌기·두 손가락 ── */
  const ptrs = new Map<number, { x: number; y: number }>();
  let down = { x: 0, y: 0, t: 0, k: -1 }, moved = false, pinch = { d: 0, s: 1 }, swipeDx = 0;
  const endSwipe = () => { swipeDx = 0; el.classList.remove('drag'); render(0); };
  el.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ }
    if (ptrs.size === 1) { const c = (e.target as Element).closest('.pv-card') as HTMLElement | null; down = { x: e.clientX, y: e.clientY, t: performance.now(), k: c ? Number(c.dataset.k) : -1 }; moved = false; swipeDx = 0; }
    if (ptrs.size === 2) { if (swipeDx) endSwipe(); const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; moved = true; }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d) zoomAt((pinch.s * d) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); paint(); return; }
    if (s > 1) { tx += dx; ty += dy; clampPan(); paint(); return; }
    if (cards.length > 1 && moved) { swipeDx = e.clientX - down.x; el.classList.add('drag'); render(swipeDx / stepPx); }   // 원래 크기에선 커버플로 전체가 손가락을 따라 돈다
  });
  const up = (e: PointerEvent) => {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size === 1) { pinch.d = 0; return; }   // 두 손가락 중 하나만 뗐으면 남은 손가락은 끌기로
    if (ptrs.size) return;
    if (swipeDx) {
      const dx = swipeDx; el.classList.remove('drag'); swipeDx = 0;
      if (Math.abs(dx) > 60 && e.type !== 'pointercancel') { const st = Math.max(1, Math.round(Math.abs(dx) / stepPx)); show(i + (dx < 0 ? st : -st)); }
      else render(0);
      return;
    }
    if (moved || e.type === 'pointercancel' || performance.now() - down.t > 400) return;
    if (down.k < 0) { close(); return; }                                       // 사진 밖을 눌렀다
    if (down.k !== i) { show(down.k); return; }                                // 옆 사진을 눌렀다: 그 사진으로
    if (s > 1) { s = 1; tx = 0; ty = 0; } else zoomAt(TAP_ZOOM, e.clientX, e.clientY);   // 가운데 사진을 눌렀다: 확대 ⇄ 원래대로
    paint(true);
  };
  /* ‹ ›: 누르기가 상자의 끌기·'사진 밖 누르면 닫기'로 가지 않게 pointerdown 을 여기서 막는다 */
  navs.forEach((b, k) => {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); if (cards.length > 1) show(i + (k ? 1 : -1)); });
  });
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY); paint(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (!visible) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && cards.length > 1) show(i - 1);
    else if (e.key === 'ArrowRight' && cards.length > 1) show(i + 1);
  });
  window.addEventListener('resize', () => { if (visible) { layout(); render(0, true); clampPan(); paint(); } });

  return { open, close, get visible() { return visible; } };
}
