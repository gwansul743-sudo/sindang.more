import type { StoryPage } from './story';
import { pageHtml } from './pageHtml';

/* 논문 읽기(10-28, 감독 요청 — PDF 보기 대신) — '논문 원문 보기' 를 누르면 화면을 덮는 천 틀.
   왼쪽(약 68%): 논문 모든 쪽의 작은 그림(public/theses/pages/<slug>/t01…, 줄마다 5장, 쪽 번호). 누르면 그 쪽을 크게(p01…, 높이에 맞춤) —
   ‹ › · ← → 로 앞뒤 쪽, '전체 쪽 보기' 로 돌아가기, 휠·끌기로 확대·이동(1×–2.5×), 두 번 누르면 원래대로.
   오른쪽(약 32%): 이야기 상자와 같은 글(제목·글쓴이·질문·본문·출처, pageHtml) + ✕.
   PDF 보기(도구 막대·내려받기·인쇄)는 어디에도 없다. 열 때 그 논문의 작은 그림을 받고, 큰 쪽은 열 때 + 다음 쪽.
   · 닫기: ✕, Esc(큰 쪽 → 쪽 목록 → 닫기), 3분 동안 입력이 없으면 스스로. 이야기 45초 자동 닫기는 열린 동안 멈춘다(story.ts). */
export interface Reader { readonly open: boolean; show(pdf: string, p: StoryPage): void; close(silent?: boolean): void; poke(): void; key(e: KeyboardEvent): void }
interface Manifest { theses: Record<string, { pages: number; w: number; h: number }> }

const IDLE_MS = 3 * 60 * 1000, BASE = '/theses/pages/', ZMAX = 2.5;
let man: Promise<Manifest | null> | null = null;
const manifest = () => (man ||= fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
const two = (n: number) => String(n).padStart(2, '0');

export function mountReader(onClose: () => void): Reader {
  let el: HTMLElement | null = null, idleT = 0, run = 0, slug = '', pages = 0, cur = 0, z = 1, tx = 0, ty = 0;
  const arm = () => { clearTimeout(idleT); if (el) idleT = window.setTimeout(() => close(), IDLE_MS); };
  const $ = <T extends Element>(s: string) => el!.querySelector(s) as T;
  const big = () => $('.kb-rd-big') as HTMLElement, grid = () => $('.kb-rd-grid') as HTMLElement, img = () => $('.kb-rd-img') as HTMLImageElement;
  const apply = () => { img().style.transform = `translate(${tx}px,${ty}px) scale(${z})`; big().classList.toggle('zoomed', z > 1.01); };
  const reset = () => { z = 1; tx = 0; ty = 0; apply(); };
  const clamp = () => { const f = $('.kb-rd-frame') as HTMLElement, w = f.clientWidth, h = f.clientHeight; tx = Math.min(0, Math.max(w - w * z, tx)); ty = Math.min(0, Math.max(h - h * z, ty)); };

  function openPage(i: number) {
    if (!el || i < 1 || i > pages) return;
    cur = i; reset(); grid().hidden = true; big().hidden = false;
    img().src = `${BASE}${slug}/p${two(i)}.webp`; img().alt = `${i}쪽`;
    $('.kb-rd-no').textContent = `${i} / ${pages}`;
    ($('.kb-rd-prev') as HTMLButtonElement).disabled = i <= 1; ($('.kb-rd-next') as HTMLButtonElement).disabled = i >= pages;
    if (i < pages) { const n = new Image(); n.src = `${BASE}${slug}/p${two(i + 1)}.webp`; }   /* 다음 쪽 미리 */
  }
  function toGrid() { if (!el) return; cur = 0; big().hidden = true; grid().hidden = false; img().removeAttribute('src'); }

  function show(pdf: string, p: StoryPage) {
    close(true);
    const my = ++run; slug = (pdf.split('/').pop() || '').replace(/\.pdf$/i, '');
    el = document.createElement('div'); el.className = 'kb-rd'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${p.author ?? ''} 「${p.h}」 원문`);
    el.innerHTML = `<div class="kb-rd-left"><div class="kb-rd-grid" role="list"></div>
      <div class="kb-rd-big" hidden><div class="kb-rd-frame"><img class="kb-rd-img" alt="" draggable="false"></div>
        <button type="button" class="kb-rd-prev" aria-label="앞 쪽">‹</button><button type="button" class="kb-rd-next" aria-label="다음 쪽">›</button>
        <div class="kb-rd-bar"><button type="button" class="kb-rd-all">전체 쪽 보기</button><span class="kb-rd-no"></span><small>휠·끌기로 확대 · 두 번 누르면 원래대로</small></div></div></div>
      <aside class="kb-rd-side"><button type="button" class="kb-rd-x" aria-label="논문 닫기">✕</button><div class="kb-rd-text">${pageHtml(p, { pdfButton: false })}</div></aside>`;
    ['pointerdown', 'wheel', 'click'].forEach((ev) => el!.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'wheel' }));
    $('.kb-rd-x').addEventListener('click', () => close());
    $('.kb-rd-all').addEventListener('click', toGrid);
    $('.kb-rd-prev').addEventListener('click', () => openPage(cur - 1));
    $('.kb-rd-next').addEventListener('click', () => openPage(cur + 1));
    /* 큰 쪽: 휠 확대(포인터 자리 기준) · 끌기 이동 · 두 번 눌러 원래대로 */
    const frame = $('.kb-rd-frame') as HTMLElement;
    frame.addEventListener('wheel', (e) => { e.preventDefault(); const r = frame.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, z2 = Math.min(ZMAX, Math.max(1, z * Math.exp(-e.deltaY * 0.0015)));
      tx = px - ((px - tx) * z2) / z; ty = py - ((py - ty) * z2) / z; z = z2; clamp(); apply(); }, { passive: false });
    let drag: { x: number; y: number; tx: number; ty: number } | null = null;
    frame.addEventListener('pointerdown', (e) => { if (z <= 1.01) return; drag = { x: e.clientX, y: e.clientY, tx, ty }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener('pointermove', (e) => { if (!drag) return; tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; clamp(); apply(); });
    frame.addEventListener('pointerup', () => { drag = null; }); frame.addEventListener('pointercancel', () => { drag = null; });
    frame.addEventListener('dblclick', reset);
    document.body.appendChild(el); void el.offsetWidth; el.classList.add('show');
    window.addEventListener('blur', onBlur); arm();
    void manifest().then((m) => {
      if (my !== run || !el) return;
      const t = m?.theses[slug]; pages = t?.pages || 0;
      grid().innerHTML = Array.from({ length: pages }, (_, k) => `<button type="button" class="kb-rd-th" data-i="${k + 1}" role="listitem" aria-label="${k + 1}쪽 크게 보기"><img src="${BASE}${slug}/t${two(k + 1)}.webp" alt="" loading="lazy" decoding="async"><span>${k + 1}</span></button>`).join('')
        || '<p class="kb-rd-none">이 논문의 쪽 그림을 준비하지 못했어요.</p>';
      grid().querySelectorAll<HTMLButtonElement>('.kb-rd-th').forEach((b) => b.addEventListener('click', () => openPage(+b.dataset.i!)));
    });
    ($('.kb-rd-x') as HTMLElement).focus();
  }
  const onBlur = () => setTimeout(() => { if (el) arm(); });
  function close(silent = false) {
    if (!el) return;
    run++; clearTimeout(idleT); window.removeEventListener('blur', onBlur);
    el.querySelectorAll('img').forEach((i) => i.removeAttribute('src')); el.remove(); el = null; cur = 0;
    if (!silent) onClose();
  }
  return {
    get open() { return !!el; }, show, close, poke: arm,
    key(e) {   /* Esc: 큰 쪽 → 쪽 목록 → 닫기. ← → 는 큰 쪽에서 앞뒤 */
      if (!el) return;
      if (e.key === 'Escape') { e.preventDefault(); if (cur) toGrid(); else close(); }
      else if (cur && e.key === 'ArrowLeft') { e.preventDefault(); openPage(cur - 1); }
      else if (cur && e.key === 'ArrowRight') { e.preventDefault(); openPage(cur + 1); }
    },
  };
}
