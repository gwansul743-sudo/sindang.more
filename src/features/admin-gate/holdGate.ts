import './gate.css';

/* 관리자 입구 — 상단바의 작은 네모 버튼.
   · 로그인돼 있으면: 누르면 바로 가게 관리 패널.
   · 아니면: 꾹 누르고 있으면 버튼 아래에 자판을 두드리는 픽셀 고양이와 '관리자 로그인' 글자, 그 밑의 가로 바가 매끄럽게 차오르고(기본 3초),
     다 차면 로그인 상자가 열린다. 중간에 손을 떼면 취소.
   방문객에게는 그냥 작은 네모 하나로 보인다. */
export interface HoldGateOptions {
  holdMs?: number;
  canOpen: () => boolean;    // 지금 바로 열어도 되는가 (로그인된 관리자)
  onOpen: () => void;
  label?: string;
}

/* 픽셀 고양이 24×15칸, 두 프레임(왼발·오른발 번갈아 자판을 침, 화면 글자도 바뀜). 글자 = 아래 팔레트 키, '.' = 비움 */
const PAL: Record<string, string> = {
  k: '#2b2a2a', w: '#f3ecd8', p: '#c9ad7c', m: '#3b4046', s: '#1c2c2c', g: '#7fdc8a',
  d: '#8a5a2b', b: '#5c6166', B: '#9aa0a6', r: '#d6432b', n: '#e39a9a',
};
const FRAME_A = [
  '........................',
  '..............k....k....',
  '.............kwk..kwk...',
  '.............kwwkkwwk...',
  '..mmmmmmm....kwwwwwwk...',
  '..msssssm....kwkwwkwk...',
  '..msggsgm....kwwwnwwk...',
  '..mssssgm....kkwwwwkk...',
  '..msgsssm.....kwwwwk....',
  '..mmmmmmm....kwwppwwk.k.',
  '.....mm......kwwwwkppkk.',
  '....mmmm.....kwwwwwwkkrr',
  '..bBbBbBbBbBbkppkBbBbBrr',
  'dddddddddddddddddddddddd',
  'dddddddddddddddddddddddd',
];
const FRAME_B = [
  '........................',
  '..............k....k....',
  '.............kwk..kwk...',
  '.............kwwkkwwk...',
  '..mmmmmmm....kwwwwwwk...',
  '..msssssm....kwkwwkwk...',
  '..msgsggm....kwwwnwwk...',
  '..msggssm....kkwwwwkk...',
  '..mssgssm.....kwwwwk....',
  '..mmmmmmm....kwwppwwk.k.',
  '.....mm......kppkwwwwkk.',
  '....mmmm.....kwwwwwwkkrr',
  '..bBbBbBbBbBbBbBbkppkbrr',
  'dddddddddddddddddddddddd',
  'dddddddddddddddddddddddd',
];

function frameSvg(rows: string[], cls: string): string {
  let out = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      if (!PAL[c]) { x++; continue; }
      const x0 = x;
      while (x < row.length && row[x] === c) x++;
      out += `<rect x="${x0}" y="${y}" width="${x - x0}" height="1" fill="${PAL[c]}"/>`;
    }
  });
  return `<g class="${cls}">${out}</g>`;
}

export function mountHoldGate(btn: HTMLElement, o: HoldGateOptions): { refresh(): void } {
  const holdMs = o.holdMs ?? 3000;
  const pop = document.createElement('div');
  pop.className = 'hold-gate';
  pop.setAttribute('aria-hidden', 'true');
  pop.innerHTML =
    `<svg class="hold-gate__cat" viewBox="0 0 24 15" shape-rendering="crispEdges">${frameSvg(FRAME_A, 'a')}${frameSvg(FRAME_B, 'b')}</svg>` +
    `<span class="hold-gate__label">${o.label ?? '관리자 로그인'}</span>` +
    `<span class="hold-gate__bar"><i></i></span>`;
  btn.style.position = 'relative';
  btn.appendChild(pop);
  (pop.querySelector('.hold-gate__bar i') as HTMLElement).style.animationDuration = holdMs + 'ms';

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
