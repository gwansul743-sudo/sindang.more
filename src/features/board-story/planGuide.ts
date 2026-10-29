/* 위에서 본 신당 길잡이(10-29, TASK_21) — 고르기 장(level 1)은 상자가 접혀 있어 방문객이 할 일을 모른다. 무대 위 아래 가운데에 천 카드 한 장
   '건물 하나를 눌러 보세요'와, 무대 가운데 가까운 건물 하나(정해진 것)를 3초마다 톡 누르는 손 그림 + 그 건물 윤곽(가리키기 강조)·퍼지는 고리.
   · 숨김: 건물 위에 0.5초 넘게 머물거나 끌면 바로. 고르기 장에 있는 채 20초 동안 아무 입력이 없으면 다시.
   · 자리: 카드 = 무대 빈 칸(areaBox) 아래 가운데, 손 = 그 건물 가운데의 화면 자리(누를 때마다·카메라가 움직이면 다시 잼).
   · 전시 모드(html.kb-on)에선 동작 줄이기를 따르지 않는다(안내가 내용). 그 밖에서 동작 줄이기면 손은 가만히. */
export interface PlanGuideOpts {
  stage: HTMLElement;
  area(): { x: number; y: number; w: number; h: number };   // 무대 안 빈 칸(px)
  spot(): [number, number] | null;                          // 시범 건물 가운데의 무대 안 px
  mark(on: boolean): void;                                  // 시범 건물 윤곽 강조 켜기·끄기
  ready(): boolean;                                         // 지금 고르기 장에 가만히 내려앉아 있나
}
const TAP_MS = 3000, PRESS_MS = 900, MARK_MS = 1500, BACK_MS = 20000, HOVER_MS = 500;
const HAND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10h.5V8.5a1.5 1.5 0 0 1 3 0V10h.5V9.5a1.5 1.5 0 0 1 3 0V15c0 3.3-2.2 6-5.5 6H12c-2 0-3.3-.8-4.4-2.3L4.8 14.8a1.5 1.5 0 0 1 2.2-2L9 14.5z"/></svg>`;

export function mountPlanGuide(o: PlanGuideOpts) {
  const card = document.createElement('div'); card.className = 'kb-dio-guide'; card.setAttribute('role', 'note'); card.hidden = true;
  card.innerHTML = `<div class="kb-dio-guide-in"><b>건물 하나를 눌러 보세요</b><span>그 건물이 받는 햇볕과 이웃에게 드리우는 그림자를 보여 드려요</span></div>`;
  const hand = document.createElement('div'); hand.className = 'kb-dio-hand'; hand.innerHTML = `<i class="kb-dio-tapring"></i>${HAND}`; hand.hidden = true;
  o.stage.append(card, hand);
  let shown = false, armed = false, tapT = 0, pressT = 0, markT = 0, backT = 0, hoverT = 0;
  function place() {
    const a = o.area(); card.style.left = (a.x + a.w / 2).toFixed(0) + 'px'; card.style.bottom = (o.stage.clientHeight - (a.y + a.h) + 28).toFixed(0) + 'px';
    const p = o.spot(); hand.hidden = !p || !shown; if (p) { hand.style.left = p[0].toFixed(1) + 'px'; hand.style.top = p[1].toFixed(1) + 'px'; }
  }
  /* 한 번 톡: 손이 다가와 누르고(0.9초) 그때 윤곽을 1.5초 켠다 — CSS 애니메이션(3초)과 같은 박자 */
  function tap() {
    if (!shown) return; place();
    hand.classList.remove('tap'); void hand.offsetWidth; hand.classList.add('tap');
    clearTimeout(pressT); clearTimeout(markT);
    pressT = window.setTimeout(() => { if (!shown) return; o.mark(true); markT = window.setTimeout(() => { if (shown) o.mark(false); }, MARK_MS); }, PRESS_MS);
  }
  function show() {
    if (shown || !armed || !o.ready()) return;
    shown = true; card.hidden = false; place(); requestAnimationFrame(() => { card.classList.add('on'); hand.classList.add('on'); });
    tap(); clearInterval(tapT); tapT = window.setInterval(tap, TAP_MS);
  }
  function hide() {
    clearInterval(tapT); clearTimeout(pressT); clearTimeout(markT); clearTimeout(hoverT); hoverT = 0;
    if (!shown) return; shown = false; o.mark(false);
    card.classList.remove('on'); hand.classList.remove('on', 'tap'); card.hidden = true; hand.hidden = true;
  }
  const rearm = () => { clearTimeout(backT); if (armed) backT = window.setTimeout(show, BACK_MS); };   /* 20초 입력 없음 → 다시 */
  const input = () => { if (armed) rearm(); };
  const IN = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
  IN.forEach((t) => window.addEventListener(t, input, { capture: true, passive: true }));
  return {
    /* 고르기 장에 내려앉았다 */
    arm() { armed = true; show(); rearm(); },
    /* 고르기 장을 떠난다 */
    disarm() { armed = false; clearTimeout(backT); hide(); },
    /* 무대 위 가리키기: 건물 위(i ≥ 0)에 0.5초 머물면 숨김 */
    hover(i: number) { if (!shown) return; if (i < 0) { clearTimeout(hoverT); hoverT = 0; return; } if (!hoverT) hoverT = window.setTimeout(() => { hoverT = 0; hide(); }, HOVER_MS); },
    drag() { hide(); },
    place() { if (shown) place(); },
    get shown() { return shown; },
    destroy() { armed = false; clearTimeout(backT); hide(); IN.forEach((t) => window.removeEventListener(t, input, { capture: true })); card.remove(); hand.remove(); },
  };
}
export type PlanGuide = ReturnType<typeof mountPlanGuide>;
