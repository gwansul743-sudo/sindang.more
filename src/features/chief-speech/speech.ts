import './speech.css';

/* 이장님 말풍선 — 전시 모드에서 카메라가 이장님에게 당겨진 뒤, 머리 위에 대사가 한 줄씩 뜬다(동물의 숲식 타자).
   · say(lines): 첫 줄을 타자로 찍고, 다 찍히면 holdMs 뒤 다음 줄. 마지막 줄은 hide() 때까지 남는다.
   · 말풍선을 누르면 바로 다음 줄(찍는 중이면 끝까지 바로 찍음).
   · place(): 매 프레임 anchor()(이장님 머리 위 화면 좌표, #map 기준)에 맞춰 옮긴다. 화면 끝에 가두지 않는다(가로만 조금 안쪽으로).
   · **굵게** 는 <b> 로(강조색). 순수 UI: 지도 엔진·데이터를 모른다. */
export interface SpeechOptions {
  anchor: () => { x: number; y: number } | null;   // 말풍선 꼬리 끝이 닿을 자리 (#map 안 px). null 이면 숨김
  bounds: () => { left: number; top: number; width: number; height: number };   // 지도 칸 (#map 안 px) — 가로로 안쪽에 밀어 넣을 때만 쓴다
  charMs?: number; holdMs?: number;
  onEnd?: () => void;                              // 마지막 줄이 holdMs 동안 보인 뒤(또는 마지막 줄에서 클릭) 한 번. hide() 로 끊기면 안 부름
}
/* say 의 선택(10-26): onTap 이 있으면 말풍선 자체가 버튼 — 누르면 다음 줄 대신 onTap. cta 는 말풍선 아래쪽에 붙는 안내 한 줄('이야기 듣기 ›').
   setCta(10-28): 떠 있는 말풍선에 안내 줄만 붙인다(글자를 다시 찍지 않음) — hover 로 뜬 말풍선을 누르면 '이야기 듣기 ›' 가 붙는다 */
export interface SayOptions { onTap?: () => void; cta?: string; stay?: boolean; ctaButton?: boolean }   // ctaButton(10-29): 안내 줄을 글자 대신 와인색 알약 단추로(▶ 영상 보기 — 대화 상자의 영상 단추와 같은 모양)   // stay(10-29): 마지막 줄 뒤에도 onEnd 로 닫지 않고 hide() 때까지 남는다(연출 뒤 이장님·매니저님의 '이야기 듣기' 말풍선)
export interface Speech { say(lines: string[], opts?: SayOptions): void; setCta(label: string): void; hide(): void; place(): void; readonly visible: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const markup = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function mountSpeech(stage: HTMLElement, o: SpeechOptions): Speech {
  const charMs = o.charMs ?? 34, holdMs = o.holdMs ?? 2800;
  const el = document.createElement('div'); el.className = 'speech'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="sp-box"><span class="sp-text"></span><span class="sp-cta"></span></div><div class="sp-tail"></div>';   /* 모양은 시안 v2 의 .speech 그대로(10-23) */
  stage.appendChild(el);
  const text = el.querySelector('.sp-text') as HTMLElement, cta = el.querySelector('.sp-cta') as HTMLElement;
  let lines: string[] = [], i = 0, run = 0, timer = 0, typing = false, visible = false, onTap: (() => void) | null = null, stay = false;
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
    else if (o.onEnd && !stay) timer = window.setTimeout(() => { if (run === my) end(); }, holdMs);
  }
  function end() { const fn = o.onEnd; hide(); fn?.(); }
  function next() {
    if (!visible) return;
    if (typing) { clear(); const my = ++run; const line = lines[i]; text.innerHTML = markup(line); finishLine(my); return; }
    if (i < lines.length - 1) { clear(); i++; showLine(); } else if (o.onEnd && !stay) { clear(); end(); }
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); if (onTap && visible) { onTap(); return; } next(); });

  return {
    get visible() { return visible; },
    say(ls, opts) { clear(); lines = ls.slice(); i = 0; visible = true; onTap = opts?.onTap ?? null; stay = !!opts?.stay;
      cta.textContent = opts?.cta ?? ''; el.classList.toggle('has-cta', !!opts?.cta); el.classList.toggle('tappable', !!onTap); el.classList.toggle('cta-button', !!opts?.ctaButton);
      el.classList.add('show'); place(); showLine(); },
    setCta(label) { if (!visible) return; cta.textContent = label; el.classList.toggle('has-cta', !!label); place(); },
    hide,
    place,
  };
  function hide() { clear(); run++; visible = false; typing = false; onTap = null; stay = false; el.classList.remove('show', 'done'); }
  function place() {
    if (!visible) return;
    const a = o.anchor(); if (!a) { el.style.visibility = 'hidden'; return; }
    const b = o.bounds(), w = el.getBoundingClientRect().width || 260;   /* 화면 px 기준(zoom 반영) */
    /* 말풍선은 언제나 사람 머리 위(10-28): 화면 끝에 가두지 않는다 — 가두면 지도를 움직일 때 말풍선만 화면 가장자리에 붙어 따라와 오류처럼 보였다.
       가로만 꼬리가 몸 위에 남는 만큼(w/2 - 16)까지 안쪽으로 밀어 준다. 사람이 칸 밖으로 나가면 말풍선도 같이 나가 잘린다(#map overflow) */
    const reach = Math.max(0, w / 2 - 16), xIn = Math.max(b.left + w / 2 + 6, Math.min(b.left + b.width - w / 2 - 6, a.x));
    const x = Math.max(a.x - reach, Math.min(a.x + reach, xIn)), y = a.y - 10;
    const z = parseFloat(getComputedStyle(el).zoom as string) || 1;   /* 큰 화면에서 CSS zoom 이 걸리면 좌표도 그만큼 나눠야 제자리 */
    el.style.visibility = ''; el.style.left = x / z + 'px'; el.style.top = y / z + 'px';
    (el.querySelector('.sp-tail') as HTMLElement).style.left = `calc(50% - 7px + ${((a.x - x) / z).toFixed(1)}px)`;   /* 꼬리는 이장님 쪽으로 */
  }
}
