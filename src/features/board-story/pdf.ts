/* 논문 원문 보기(10-28) — 이야기 상자 안의 '논문 원문 보기' 를 누르면 화면 전체를 덮는 천 틀 + <iframe>(브라우저 PDF 보기).
   전시장 TV 라 새 탭·새 창은 절대 열지 않는다. 열 때 만들고 닫을 때 DOM 에서 지운다(PDF 메모리).
   · 닫기: 큰 ✕, Esc(story.ts 가 먼저 이것을 닫는다), 3분 동안 입력이 없으면 스스로.
   · iframe 안(PDF 보기) 의 입력은 바깥에서 보이지 않는다 — 창이 blur 되는 순간(iframe 을 누름)과 틀 위 입력만 센다. */
export interface PdfOverlay { readonly open: boolean; show(src: string, title: string): void; close(silent?: boolean): void; poke(): void }   // silent: onClose 를 부르지 않음(이야기째 닫을 때)

const IDLE_MS = 3 * 60 * 1000;

export function mountPdf(onClose: () => void): PdfOverlay {
  let el: HTMLElement | null = null, idleT = 0;
  const arm = () => { clearTimeout(idleT); if (el) idleT = window.setTimeout(close, IDLE_MS); };
  const onBlur = () => setTimeout(() => { if (el && document.activeElement?.tagName === 'IFRAME') arm(); });
  function show(src: string, title: string) {
    if (el) close(true);
    el = document.createElement('div'); el.className = 'kb-pdf'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'kb-pdf-x'; x.setAttribute('aria-label', '논문 닫기'); x.textContent = '✕';
    const f = document.createElement('iframe'); f.className = 'kb-pdf-frame'; f.title = title; f.src = src + '#view=FitH';
    const bar = document.createElement('div'); bar.className = 'kb-pdf-bar';   /* 위 띠: 제목 + ✕ (PDF 보기의 도구 막대를 가리지 않게 틀 밖에) */
    const h = document.createElement('b'); h.textContent = title; bar.append(h, x);
    el.append(bar, f);
    x.addEventListener('click', (e) => { e.stopPropagation(); close(); });   /* 틀 위 입력은 3분을 다시 센다(story.ts 의 window 입력 감시가 poke) */
    ['pointerdown', 'wheel', 'click'].forEach((ev) => el!.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
    document.body.appendChild(el); void el.offsetWidth; el.classList.add('show');
    window.addEventListener('blur', onBlur);
    arm(); x.focus();
  }
  function close(silent = false) {
    if (!el) return;
    clearTimeout(idleT); window.removeEventListener('blur', onBlur);
    el.remove(); el = null;
    if (!silent) onClose();
  }
  return { get open() { return !!el; }, show, close, poke: arm };
}
