import './focus.css';

/* 전시 모드 집중 — "비우고, 5길만 남기고, 이장님 말이 끝나면 한 톤 낮춰 돌려놓기".
   전시 모드를 켜면 섬 위의 모든 것이 비워지고(blank) → 천 조각(kiosk-patch)이 꿰매진 뒤 5길 안쪽만 돌아오고(five)
   → 와펜·이장님 말이 끝나면 동네 나머지가 한 톤 낮춘 상태로 돌아온다(rest). 끄면 전부 원래대로(off).
   · 요소는 5길 다각형 안/밖으로 분류해 class 를 붙인다: 집·나무(<use>), 가게 점·묶음, 랜드마크(그림·이름표). 권역 글자는 항상 밖.
   · 밤 층(가로등·그림자·집 불빛·길 불빛)처럼 섬 전체가 한 덩어리인 층은 자를 수 없으니, 5길 clip 을 건 **사본**(.kf-clone)을 만들어 안쪽을 그리고
     원본은 '밖'으로 취급해 낮추거나 숨긴다. 사본은 전시 모드가 아닐 때 display:none. 길은 kiosk-patch 가 구역 안 굵은 복사본을 이미 그리므로 사본을 안 만든다.
   · 천 조각 자체(그림·봉제 연출)는 kiosk-patch 가 맡는다. 여기는 '나머지'의 보임/숨김/낮춤만.
   · 상태는 html class: kf(켜짐) · kf-blank · kf-five · kf-rest. 전환은 전부 CSS(focus.css). */

export interface FocusOptions { svg: SVGSVGElement; polygon: [number, number][] }   // polygon: 5길 다각형(지도 좌표)
export type FocusStage = 'off' | 'blank' | 'five' | 'rest';
export interface Focus {
  blank(): void;                   // 전부 숨김(0.6s 페이드). 전시 모드 켠 직후, 카메라가 가는 동안
  five(): void;                    // 5길 안쪽만 돌아옴(가운데서부터 차례로). 천 조각 봉제가 끝난 뒤
  rest(immediate?: boolean): void; // 바깥을 낮춘 상태로 복귀(1.0s 페이드). immediate 면 바로
  off(): void;                     // 전부 원래대로 (호출하는 쪽이 커튼·transition 끄기를 맡는다)
  readonly stage: FocusStage;
}

const NS = 'http://www.w3.org/2000/svg';
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('patch_slow')) || 1);   /* 개발용 슬로모션(kiosk-patch 와 같은 파라미터) */

function inPoly(poly: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
const translateOf = (el: Element): [number, number] | null => { const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(el.getAttribute('transform') || ''); return m ? [+m[1], +m[2]] : null; };

export function mountFocus(o: FocusOptions): Focus {
  const html = document.documentElement, poly = o.polygon;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  if (SLOW > 1) html.style.setProperty('--kf-slow', String(SLOW));

  /* ── 5길 clip ── */
  const defs = o.svg.querySelector('defs') || o.svg.insertBefore(document.createElementNS(NS, 'defs'), o.svg.firstChild);
  const clip = document.createElementNS(NS, 'clipPath'); clip.id = 'kf-clip';
  const cp = document.createElementNS(NS, 'path'); cp.setAttribute('d', poly.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z'); clip.appendChild(cp); defs.appendChild(clip);

  /* ── 섬 전체 층의 5길 사본 ── */
  const cloned = new WeakSet<Element>();
  function cloneLayer(sel: string) {
    o.svg.querySelectorAll(sel).forEach((g) => {
      if (cloned.has(g)) return; cloned.add(g);
      g.classList.add('kf-out', 'kf-layer');
      const c = g.cloneNode(true) as SVGElement; c.classList.remove('kf-out', 'kf-layer'); c.classList.add('kf-clone');
      c.style.clipPath = 'url(#kf-clip)';   /* 속성이 아니라 style — 원본에 CSS clip-path(#px-land)가 있으면 속성은 밀린다 */
      c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      g.parentNode!.insertBefore(c, g.nextSibling);
    });
  }
  const tag = (el: Element, x: number, y: number) => {
    const inside = inPoly(poly, x, y);
    el.classList.toggle('kf-in', inside); el.classList.toggle('kf-out', !inside);
    if (inside) (el as SVGElement).style.setProperty('--kf-i', String(Math.min(14, Math.round(Math.hypot(x - cx, y - cy) / 12))));   /* 가운데서 먼 순서로 늦게 */
  };
  function classify() {
    cloneLayer('.night-ground'); cloneLayer('.night-lamps'); cloneLayer('.night-shadows'); cloneLayer('.night-houselight');
    o.svg.querySelectorAll('.roads').forEach((g) => g.classList.add('kf-out', 'kf-layer'));   /* 길 원본은 밖(구역 안 길은 kiosk-patch 의 굵은 복사본이 그린다) */
    o.svg.querySelectorAll<SVGUseElement>('.pixel-props > use').forEach((u) => tag(u, +u.getAttribute('x')! + +u.getAttribute('width')! / 2, +u.getAttribute('y')! + +u.getAttribute('height')! * 0.9));
    o.svg.querySelectorAll('.dots .dot, .dots .cluster, .lms .lm, .lm-labels .lm').forEach((e) => { const t = translateOf(e); if (t) tag(e, t[0], t[1]); });
    o.svg.querySelectorAll('.dist').forEach((e) => e.classList.add('kf-out'));
    o.svg.querySelectorAll('.walkers').forEach((e) => e.classList.add('kf-live'));
  }
  /* 가게 점 묶음(.cluster)은 줌에 따라 생겼다 없어진다 — 켜져 있는 동안 새로 생기면 분류 */
  const dotsMo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n instanceof Element && (n.classList.contains('cluster') || n.classList.contains('dot'))) { const t = translateOf(n); if (t) tag(n, t[0], t[1]); } })));
  const observe = (on: boolean) => { const dots = o.svg.querySelector('.dots'); dotsMo.disconnect(); if (on && dots) dotsMo.observe(dots, { childList: true }); };

  let stage: FocusStage = 'off';
  const setStage = (s: FocusStage) => {
    if (s !== 'off' && stage === 'off') { classify(); observe(true); }
    if (s === 'off') observe(false);
    stage = s; html.classList.toggle('kf', s !== 'off');
    for (const k of ['blank', 'five', 'rest'] as const) html.classList.toggle('kf-' + k, s === k);
  };

  return {
    get stage() { return stage; },
    blank() { html.classList.remove('kf-now'); setStage('blank'); },
    five() { html.classList.remove('kf-now'); setStage('five'); },
    rest(immediate = false) {
      if (immediate) { html.classList.add('kf-now'); setStage('rest'); void (html as unknown as HTMLElement).offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('kf-now'))); }
      else { html.classList.remove('kf-now'); setStage('rest'); }
    },
    off() { html.classList.remove('kf-now'); setStage('off'); },
  };
}
