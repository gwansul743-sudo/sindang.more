/* 화면 커튼 — 전시 모드를 끌 때처럼 바탕·주변·카메라가 한꺼번에 바뀌는 순간을 덮는다.
   낮/밤 전환(features/theme-toggle)과 같은 요령: 지금 테마의 바탕색으로 덮고(.25s) → 전환 중 CSS transition 을 끈 채 fn() → 다시 그리기가 가라앉을 때까지(shared/lib/repaint) → 걷기(.32s).
   스타일은 theme-toggle.css 의 .theme-curtain 을 그대로 쓴다(색은 data-to). 겹쳐 부르면 뒤의 것은 바로 fn 만 실행. */
import { afterRepaint } from '../../shared/lib/repaint';
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settled = (e: HTMLElement, ms: number) => new Promise<void>((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; e.addEventListener('transitionend', fin, { once: true }); setTimeout(fin, ms + 60); });
let curtain: HTMLDivElement | null = null, busy = false;

export async function withCurtain(fn: () => void | Promise<void>): Promise<void> {
  if (busy) { await fn(); return; }
  busy = true;
  try {
    if (!curtain) { curtain = document.createElement('div'); curtain.className = 'theme-curtain'; curtain.setAttribute('aria-hidden', 'true'); document.body.appendChild(curtain); }
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    curtain.dataset.to = document.documentElement.dataset.theme || 'night'; curtain.classList.remove('out');
    await nextFrame();
    curtain.classList.add('on');
    if (!quick) await settled(curtain, 250);
    document.documentElement.classList.add('theme-switching');
    await fn();
    await afterRepaint(quick);
    document.documentElement.classList.remove('theme-switching');
    curtain.classList.add('out'); curtain.classList.remove('on');
    if (!quick) await settled(curtain, 320);
  } finally { busy = false; }
}
