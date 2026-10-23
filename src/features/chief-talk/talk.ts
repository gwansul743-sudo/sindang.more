import './talk.css';

/* 이장님 대화 패널 — 작은 말풍선의 인사가 끝나면, 지도 아래쪽 큰 말풍선에 인터뷰가 한 줄씩 쌓인다(타자). 모양은 시안 MORE_exhibition_dynamic_v2 의 .talk 그대로(10-23).
   · start(script): 첫 장부터. 한 장(pages[i])의 줄들을 차례로 찍고, 다 찍히면 holdMs 뒤 다음 장. 마지막 장은 lastHoldMs 뒤 닫힌다(onEnd).
   · 패널을 누르면: 찍는 중이면 그 장을 바로 다 보여주고, 다 보였으면 다음 장(마지막이면 닫기).
   · **굵게** 는 <b> 로(강조색). 순수 UI: 지도 엔진·데이터를 모른다. 대본은 content/characters/chief-talk.json. */
export interface TalkScript { name: string; pages: string[][]; action?: { label: string; onClick: () => void } }   // action: 이름표 오른쪽 작은 버튼(모바일 주민 대화의 '가게 카드 ›', 10-23)
export interface TalkOptions { charMs?: number; lineGapMs?: number; holdMs?: number; lastHoldMs?: number; onEnd?: () => void }
export interface Talk { start(script: TalkScript): void; hide(): void; readonly visible: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const markup = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const plainOf = (s: string) => s.replace(/\*\*/g, '');
function partial(line: string, n: number) {   /* 앞 n글자(평문 기준)까지만, ** 마크는 유지 */
  let out = '', p = 0, open = false;
  for (let k = 0; k < line.length && p < n; k++) {
    if (line.startsWith('**', k)) { out += '**'; open = !open; k++; continue; }
    out += line[k]; p++;
  }
  return open ? out + '**' : out;
}

export function mountTalk(stage: HTMLElement, o: TalkOptions = {}): Talk {
  const charMs = o.charMs ?? 38, lineGapMs = o.lineGapMs ?? 260, holdMs = o.holdMs ?? 3200, lastHoldMs = o.lastHoldMs ?? 5000;
  const el = document.createElement('div'); el.className = 'talk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite');
  /* 시안 v2 의 대화 상자(10-23): 리넨 천 + 홈질 테두리, 왼쪽 위 이름 꼬리표, 글, 오른쪽 아래 쪽수. 얼굴 그림은 없다(10-23 사용자 결정) */
  el.innerHTML = '<span class="tk-name"></span><button type="button" class="tk-act"></button><div class="tk-lines"></div><span class="tk-page"></span>';
  stage.appendChild(el);
  const actEl = el.querySelector('.tk-act') as HTMLButtonElement;
  actEl.addEventListener('click', (e) => { e.stopPropagation(); script?.action?.onClick(); });
  const nameEl = el.querySelector('.tk-name') as HTMLElement, linesEl = el.querySelector('.tk-lines') as HTMLElement, pageEl = el.querySelector('.tk-page') as HTMLElement;
  let script: TalkScript | null = null, page = 0, run = 0, timer = 0, typing = false, visible = false;
  const clear = () => { clearTimeout(timer); timer = 0; };

  function showPage() {
    const my = ++run, lines = script!.pages[page];
    el.classList.remove('done'); typing = true; linesEl.innerHTML = '';
    pageEl.textContent = `${page + 1} / ${script!.pages.length}`;
    const spans = lines.map(() => { const sp = document.createElement('span'); sp.className = 'tk-line'; linesEl.appendChild(sp); return sp; });
    let li = 0, n = 0;
    const tick = () => {
      if (run !== my) return;
      const line = lines[li], plain = plainOf(line);
      n++; spans[li].innerHTML = markup(partial(line, n));
      if (n < plain.length) timer = window.setTimeout(tick, charMs);
      else if (li < lines.length - 1) { li++; n = 0; timer = window.setTimeout(tick, lineGapMs); }
      else finishPage(my);
    };
    tick();
  }
  function finishPage(my: number) {
    typing = false; el.classList.add('done');
    const last = page >= script!.pages.length - 1;
    timer = window.setTimeout(() => { if (run === my) (last ? end() : next()); }, last ? lastHoldMs : holdMs);
  }
  function next() { if (!script) return; clear(); if (page < script.pages.length - 1) { page++; showPage(); } else end(); }
  function end() { hide(); o.onEnd?.(); }
  function hide() { clear(); run++; visible = false; typing = false; el.classList.remove('show', 'done'); }
  el.addEventListener('click', (e) => {
    e.stopPropagation(); if (!visible || !script) return;
    if (typing) { clear(); const my = ++run; const lines = script.pages[page]; linesEl.innerHTML = lines.map((l) => `<span class="tk-line">${markup(l)}</span>`).join(''); finishPage(my); }
    else next();
  });
  return {
    get visible() { return visible; },
    start(s) { clear(); script = s; page = 0; visible = true; nameEl.textContent = s.name; actEl.textContent = s.action?.label || ''; actEl.hidden = !s.action; el.classList.add('show'); showPage(); },
    hide,
  };
}
