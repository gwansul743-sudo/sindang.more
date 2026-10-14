import './gate.css';

/* 관리자 입구 — 상단바의 작은 네모 버튼.
   · 로그인돼 있으면: 누르면 바로 가게 관리 패널.
   · 아니면: 꾹 누르고 있으면 버튼 아래에 작은 톱니바퀴와 링이 돌고, 링이 다 차면(기본 5초) 로그인 상자가 열린다. 중간에 손을 떼면 취소.
   방문객에게는 그냥 작은 네모 하나로 보인다. */
export interface HoldGateOptions {
  holdMs?: number;
  canOpen: () => boolean;    // 지금 바로 열어도 되는가 (로그인된 관리자)
  onOpen: () => void;
  label?: string;
}

const GEAR_A = 'M6 0h4v2h2v2h2v4h-2v2h-2v2h-4v-2h-2v-2h-2v-4h2v-2h2zM6 6h4v4h-4z';     // 이빨이 상하좌우
const GEAR_B = 'M5 1h2v2h2v-2h2v2h2v2h2v2h-2v2h2v2h-2v2h-2v2h-2v-2h-2v2h-2v-2h-2v-2h-2v-2h2v-2h-2v-2h2v-2h2zM6 6h4v4h-4z';   // 이빨이 대각선

export function mountHoldGate(btn: HTMLElement, o: HoldGateOptions): { refresh(): void } {
  const holdMs = o.holdMs ?? 5000;
  const pop = document.createElement('div');
  pop.className = 'hold-gate';
  pop.setAttribute('aria-hidden', 'true');
  pop.innerHTML =
    `<svg class="hold-gate__ring" viewBox="0 0 36 36" shape-rendering="geometricPrecision"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15"/></svg>` +
    `<svg class="hold-gate__gear" viewBox="0 0 16 16" shape-rendering="crispEdges"><path class="a" fill-rule="evenodd" d="${GEAR_A}"/><path class="b" fill-rule="evenodd" d="${GEAR_B}"/></svg>` +
    `<span class="hold-gate__label">${o.label ?? 'LOGIN'}</span>`;
  btn.style.position = 'relative';
  btn.appendChild(pop);
  (pop.querySelector('.fg') as SVGElement).style.animationDuration = holdMs + 'ms';

  let timer: number | null = null;
  const stop = () => { if (timer !== null) { clearTimeout(timer); timer = null; } pop.classList.remove('hold-gate--on'); };
  const start = (e: PointerEvent) => {
    if (o.canOpen() || e.button > 0) return;                       // 관리자는 보통 클릭으로 연다
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* 지원 안 하면 무시 */ }
    stop();
    pop.classList.add('hold-gate--on');
    timer = window.setTimeout(() => { stop(); o.onOpen(); }, holdMs);
  };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('lostpointercapture', stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());    // 폰에서 길게 누를 때 메뉴가 뜨지 않게
  btn.addEventListener('click', () => { if (o.canOpen()) o.onOpen(); });
  return { refresh: () => btn.classList.toggle('is-admin', o.canOpen()) };
}
