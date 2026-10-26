import './burst.css';

/* 클릭 지점에서 십자선 4개 + 작은 네모 8개가 바깥으로 튀는 효과(Originkit 'Click Effects' 의 sniper 모드를 gsap·React 없이 옮김).
   · 화면 어디를 누르든(인트로·지도·카드·전시 보드) body 맨 위의 고정 층 .cb-layer 에 그린다. 끝나면 지운다. pointer-events 없음 — 누름은 그대로 아래로 간다.
   · 클릭은 window 캡처 단계에서 받는다(점·주민·이장님·보드 단추가 stopPropagation 하므로 버블 단계로는 못 받는다).
   · 그리지 않는 경우: 지도를 끌었다 놓은 클릭(누른 자리에서 8px 넘게 움직임), 키보드·코드로 누른 클릭(e.detail 0 이고 좌표 0,0), prefers-reduced-motion.
   · 색은 테마마다(html[data-theme]) — 인트로 반짝이(intro-foil)의 가장 밝은 색과 맞춘다.
   · 전시 모드(전시 보드가 켜진 동안 html.kb-on)는 밤이어도 낮 색(10-26 사용자 결정).
   · 움직임은 원본 수치 그대로: 길이 0.3s, 굵기 2px, 크기 90px, 선은 power2.out 으로 날아가며 짧아지고 마지막 40% 동안 가늘어진다. */

const DUR = 300, SW = 2, SIZE = 90;
const LEN = SIZE * 0.2, GAP = 5;
const OUT = 'cubic-bezier(.5,1,.89,1)';      // gsap power2.out
const COLOR = { night: '#f4e3b5', day: '#bf6549' } as const;
const DRAG = 8;                                // 이만큼(px) 넘게 움직였으면 끌기로 본다
const DOTS = [1, 2, 4, 5, 0.5, 2.5, 3.5, 5.5].map((k) => (k * Math.PI) / 3);   // 60°·120°·240°·300°·30°·150°·210°·330°

let mounted = false;
export function mountClickBurst() {
  if (mounted) return;
  mounted = true;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let layer: HTMLDivElement | null = null;
  const down = new Map<number, { x: number; y: number; moved: boolean }>();   // 손가락·마우스마다 누른 자리

  window.addEventListener('pointerdown', (e) => { down.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false }); }, { capture: true, passive: true });
  window.addEventListener('pointermove', (e) => {
    const d = down.get(e.pointerId);
    if (d && !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG) d.moved = true;
  }, { capture: true, passive: true });
  let lastMoved = false;
  const lift = (e: PointerEvent) => { lastMoved = !!down.get(e.pointerId)?.moved || down.size > 1; down.delete(e.pointerId); };   // 두 손가락(핀치)도 끌기로 본다
  window.addEventListener('pointerup', lift, { capture: true, passive: true });
  window.addEventListener('pointercancel', lift, { capture: true, passive: true });

  window.addEventListener('click', (e) => {
    if (still.matches || lastMoved || (e.detail === 0 && e.clientX === 0 && e.clientY === 0)) return;   // 키보드·코드로 누른 클릭은 좌표가 없다
    if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.className = 'cb-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
    const x = e.clientX, y = e.clientY;
    const html = document.documentElement;
    const color = COLOR[html.classList.contains('kb-on') || html.getAttribute('data-theme') === 'day' ? 'day' : 'night'];   // 전시 보드(kb-on)는 낮·밤 상관없이 낮 색

    const fx = document.createElement('div');
    fx.className = 'cb-fx'; fx.style.left = `${x}px`; fx.style.top = `${y}px`; fx.style.color = color;
    const anims: Animation[] = [];
    const thin = (el: HTMLElement) => anims.push(el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: DUR * 0.4, delay: DUR * 0.6, easing: 'linear', fill: 'forwards' }));

    for (const deg of [0, 90, 180, 270]) {                       // 선: 안쪽 끝·바깥 끝이 모두 (GAP+LEN)×2 자리로 모이며 날아간다
      const line = document.createElement('i'); line.className = 'cb-line'; line.style.width = `${LEN}px`;
      const ink = document.createElement('b'); line.appendChild(ink); fx.appendChild(line);
      anims.push(line.animate([
        { transform: `rotate(${-deg}deg) translateX(${GAP}px) scaleX(1)` },
        { transform: `rotate(${-deg}deg) translateX(${(GAP + LEN) * 2}px) scaleX(0)` },
      ], { duration: DUR, easing: OUT, fill: 'forwards' }));
      ink.style.transformOrigin = '50% 50%'; thin(ink);
    }
    for (const a of DOTS) {                                     // 네모: 크기×0.4 만큼 튀어 나가며 마지막 40% 동안 작아진다
      const dot = document.createElement('i'); dot.className = 'cb-dot';
      const ink = document.createElement('b'); dot.appendChild(ink); fx.appendChild(dot);
      anims.push(dot.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${Math.cos(a) * SIZE * 0.4}px,${Math.sin(a) * SIZE * 0.4}px)` },
      ], { duration: DUR, easing: OUT, fill: 'forwards' }));
      thin(ink);
    }
    layer.appendChild(fx);
    Promise.all(anims.map((an) => an.finished)).catch(() => undefined).then(() => fx.remove());
    setTimeout(() => fx.remove(), DUR + 700);                   // 애니메이션이 멈추는 환경 대비(느린 폰도 끝까지 보이게 넉넉히)
  }, { capture: true, passive: true });
}
