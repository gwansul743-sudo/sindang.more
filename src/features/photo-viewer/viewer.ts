import './viewer.css';

/* 사진 크게 보기(10-26) — 가게 카드의 사진을 누르면 화면 가득 연다. 순수 UI: 지도 엔진·데이터를 모른다.
   · open(urls, i): i 번째 사진부터. 여러 장이면 ‹ › · 키보드 ←/→ · 옆으로 쓸기로 넘긴다.
   · 확대: 사이트가 폰 확대를 막아 두었으므로(viewport user-scalable=no) 여기서 따로 — 사진을 누르면 2.5배(그 자리를 중심으로)·다시 누르면 원래대로,
     두 손가락 벌리기, 휠. 확대된 동안엔 끌어서 둘러본다(사진 밖으로 너무 나가지 않게).
   · 닫기: ✕ · 사진 밖(어두운 곳) 누르기 · Esc. 닫으면 열기 전 초점으로 돌아간다. */
export interface PhotoViewer { open(urls: string[], index?: number, label?: string): void; close(): void; readonly visible: boolean }

const MAX = 4, TAP_ZOOM = 2.5;

export function mountPhotoViewer(): PhotoViewer {
  const el = document.createElement('div'); el.className = 'pv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1; el.hidden = true;
  el.innerHTML = '<img class="pv-img" alt="" draggable="false"><button type="button" class="pv-btn pv-x" aria-label="닫기">✕</button>'
    + '<button type="button" class="pv-btn pv-nav prev" aria-label="이전 사진">‹</button><button type="button" class="pv-btn pv-nav next" aria-label="다음 사진">›</button><span class="pv-count"></span>';
  document.body.appendChild(el);
  const img = el.querySelector('.pv-img') as HTMLImageElement, count = el.querySelector('.pv-count') as HTMLElement;
  const prev = el.querySelector('.prev') as HTMLButtonElement, next = el.querySelector('.next') as HTMLButtonElement, closeBtn = el.querySelector('.pv-x') as HTMLButtonElement;
  let urls: string[] = [], i = 0, label = '', visible = false, back: Element | null = null;
  let s = 1, tx = 0, ty = 0;   // 확대 배율과 옮김(px, 화면 가운데 기준)

  const paint = (anim = false) => { img.classList.toggle('anim', anim); img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; el.classList.toggle('zoomed', s > 1.01); };
  /* 옮김 한계: 확대된 사진이 화면보다 클 때만 그 넘는 만큼 */
  const clampPan = () => { const mx = Math.max(0, (img.clientWidth * s - el.clientWidth) / 2), my = Math.max(0, (img.clientHeight * s - el.clientHeight) / 2); tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
  /* 화면의 점 (qx, qy) 를 고정한 채 배율 s → s2 */
  const zoomAt = (s2: number, qx: number, qy: number) => {
    s2 = Math.max(1, Math.min(MAX, s2)); const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tx = qx - cx - ((qx - cx - tx) * s2) / s; ty = qy - cy - ((qy - cy - ty) * s2) / s; s = s2;
    if (s <= 1.01) { s = 1; tx = 0; ty = 0; } clampPan();
  };
  const reset = () => { s = 1; tx = 0; ty = 0; paint(); };

  function show(k: number) {
    i = (k + urls.length) % urls.length; reset();
    el.classList.add('loading'); img.onload = () => el.classList.remove('loading'); img.onerror = () => el.classList.remove('loading');
    img.src = urls[i]; img.alt = urls.length > 1 ? `${label} 사진 ${i + 1} / ${urls.length}` : `${label} 사진`;
    const many = urls.length > 1; count.textContent = many ? `${i + 1} / ${urls.length}` : ''; prev.hidden = next.hidden = !many;
    if (many) [i - 1, i + 1].forEach((n) => { const pre = new Image(); pre.src = urls[(n + urls.length) % urls.length]; });   // 옆 사진 미리 받기
  }
  function open(list: string[], index = 0, name = '') {
    if (!list.length) return; urls = list; label = name; back = document.activeElement;
    el.hidden = false; visible = true; el.setAttribute('aria-label', `${name} 사진 크게 보기`); show(index);
    requestAnimationFrame(() => el.classList.add('show')); el.focus({ preventScroll: true });   // 초점은 상자에(닫기 단추에 주면 터치로 열어도 초점 테두리가 보인다)
  }
  function close() {
    if (!visible) return; visible = false; el.classList.remove('show'); el.hidden = true; img.removeAttribute('src');
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
  }

  /* 누르기·끌기·두 손가락 */
  const ptrs = new Map<number, { x: number; y: number }>();
  let down = { x: 0, y: 0, t: 0, onImg: false }, moved = false, pinch = { d: 0, s: 1 }, swipeDx = 0;
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.pv-btn')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ }
    if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now(), onImg: e.target === img }; moved = false; swipeDx = 0; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; moved = true; }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d) zoomAt((pinch.s * d) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); paint(); return; }
    if (s > 1) { tx += dx; ty += dy; clampPan(); paint(); return; }
    if (urls.length > 1) { swipeDx = e.clientX - down.x; tx = swipeDx * 0.6; paint(); }   // 원래 크기에선 옆으로 쓸어 넘기기(손을 따라 조금 밀린다)
  });
  const up = (e: PointerEvent) => {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size === 1) { pinch.d = 0; return; }   // 두 손가락 중 하나만 뗐으면 남은 손가락은 끌기로
    if (ptrs.size) return;
    if (s === 1 && Math.abs(swipeDx) > 60 && urls.length > 1) { show(i + (swipeDx < 0 ? 1 : -1)); return; }
    if (s === 1 && tx) { tx = 0; paint(true); }
    if (moved || e.type === 'pointercancel' || performance.now() - down.t > 400) return;
    if (!down.onImg) { close(); return; }                                       // 사진 밖을 눌렀다
    if (s > 1) { s = 1; tx = 0; ty = 0; } else zoomAt(TAP_ZOOM, e.clientX, e.clientY);   // 사진을 눌렀다: 확대 ⇄ 원래대로
    paint(true);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY); paint(); }, { passive: false });
  closeBtn.addEventListener('click', close);
  prev.addEventListener('click', () => show(i - 1)); next.addEventListener('click', () => show(i + 1));
  document.addEventListener('keydown', (e) => {
    if (!visible) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && urls.length > 1) show(i - 1);
    else if (e.key === 'ArrowRight' && urls.length > 1) show(i + 1);
  });
  window.addEventListener('resize', () => { if (visible) { clampPan(); paint(); } });

  return { open, close, get visible() { return visible; } };
}
