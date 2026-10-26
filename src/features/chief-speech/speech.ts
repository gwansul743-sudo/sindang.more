import './speech.css';

/* 이장님 말풍선 — 전시 모드에서 카메라가 이장님에게 당겨진 뒤, 머리 위에 대사가 한 줄씩 뜬다(동물의 숲식 타자).
   · say(lines): 첫 줄을 타자로 찍고, 다 찍히면 holdMs 뒤 다음 줄. 마지막 줄은 hide() 때까지 남는다.
   · 말풍선을 누르면 바로 다음 줄(찍는 중이면 끝까지 바로 찍음).
   · place(): 매 프레임 anchor()(이장님 머리 위 화면 좌표, #stage 기준)에 맞춰 옮긴다. 지도 칸 안으로 가둔다.
   · **굵게** 는 <b> 로(강조색). 순수 UI: 지도 엔진·데이터를 모른다. */
export interface SpeechOptions {
  anchor: () => { x: number; y: number } | null;   // 말풍선 꼬리 끝이 닿을 자리 (#stage 안 px). null 이면 숨김
  bounds: () => { left: number; top: number; width: number; height: number };   // 가둘 영역 (#map, #stage 안 px)
  charMs?: number; holdMs?: number;
  onEnd?: () => void;                              // 마지막 줄이 holdMs 동안 보인 뒤(또는 마지막 줄에서 클릭) 한 번. hide() 로 끊기면 안 부름
}
/* say 의 선택(10-26): onTap 이 있으면 말풍선 자체가 버튼 — 누르면 다음 줄 대신 onTap. cta 는 말풍선 아래쪽에 붙는 안내 한 줄('이야기 듣기 ›') */
export interface SayOptions { onTap?: () => void; cta?: string }
export interface Speech { say(lines: string[], opts?: SayOptions): void; hide(): void; place(): void; readonly visible: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const markup = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function mountSpeech(stage: HTMLElement, o: SpeechOptions): Speech {
  const charMs = o.charMs ?? 34, holdMs = o.holdMs ?? 2800;
  const el = document.createElement('div'); el.className = 'speech'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="sp-box"><span class="sp-text"></span><span class="sp-cta"></span></div><div class="sp-tail"></div>';   /* 모양은 시안 v2 의 .speech 그대로(10-23) */
  stage.appendChild(el);
  const text = el.querySelector('.sp-text') as HTMLElement, cta = el.querySelector('.sp-cta') as HTMLElement;
  let lines: string[] = [], i = 0, run = 0, timer = 0, typing = false, visible = false, onTap: (() => void) | null = null;
  const clear = () => { clearTimeout(timer); timer = 0; };

  function showLine() {
    const my = ++run, line = lines[i], plain = line.replace(/\*\*/g, '');
    el.classList.remove('done'); typing = true;
    let n = 0;
    const tick = () => {
      if (run !== my) return;
      n++; const head = plain.slice(0, n);
      // 강조 구간: 찍힌 데까지만 굵게 — 원문의 ** 위치를 찍힌 길이에 맞춰 다시 적용
      text.innerHTML = markup(reapply(line, head));
      if (n < plain.length) { timer = window.setTimeout(tick, charMs); }
      else finishLine(my);
    };
    tick();
  }
  function reapply(line: string, head: string) {   /* line 의 ** 마크를 head(앞부분 평문)에 다시 입힌다 */
    let out = '', p = 0, open = false;
    for (let k = 0; k < line.length && p < head.length; k++) {
      if (line.startsWith('**', k)) { out += '**'; open = !open; k++; continue; }
      out += line[k]; p++;
    }
    if (open) out += '**';
    return out;
  }
  function finishLine(my: number) {
    typing = false; el.classList.add('done');
    if (i < lines.length - 1) timer = window.setTimeout(() => { if (run === my) { i++; showLine(); } }, holdMs);
    else if (o.onEnd) timer = window.setTimeout(() => { if (run === my) end(); }, holdMs);
  }
  function end() { const fn = o.onEnd; hide(); fn?.(); }
  function next() {
    if (!visible) return;
    if (typing) { clear(); const my = ++run; const line = lines[i]; text.innerHTML = markup(line); finishLine(my); return; }
    if (i < lines.length - 1) { clear(); i++; showLine(); } else if (o.onEnd) { clear(); end(); }
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); if (onTap && visible) { onTap(); return; } next(); });

  return {
    get visible() { return visible; },
    say(ls, opts) { clear(); lines = ls.slice(); i = 0; visible = true; onTap = opts?.onTap ?? null;
      cta.textContent = opts?.cta ?? ''; el.classList.toggle('has-cta', !!opts?.cta); el.classList.toggle('tappable', !!onTap);
      el.classList.add('show'); place(); showLine(); },
    hide,
    place,
  };
  function hide() { clear(); run++; visible = false; typing = false; onTap = null; el.classList.remove('show', 'done'); }
  function place() {
    if (!visible) return;
    const a = o.anchor(); if (!a) { el.style.visibility = 'hidden'; return; }
    const b = o.bounds(), r0 = el.getBoundingClientRect(), w = r0.width || 260, h = r0.height || 80;   /* 화면 px 기준(zoom 반영) */
    const x = Math.max(b.left + w / 2 + 6, Math.min(b.left + b.width - w / 2 - 6, a.x));
    const y = Math.max(b.top + h + 6, a.y - 10);
    const z = parseFloat(getComputedStyle(el).zoom as string) || 1;   /* 큰 화면에서 CSS zoom 이 걸리면 좌표도 그만큼 나눠야 제자리 */
    el.style.visibility = ''; el.style.left = x / z + 'px'; el.style.top = y / z + 'px';
    (el.querySelector('.sp-tail') as HTMLElement).style.left = `calc(50% - 7px + ${((a.x - x) / z).toFixed(1)}px)`;   /* 꼬리는 이장님 쪽으로 */
  }
}
