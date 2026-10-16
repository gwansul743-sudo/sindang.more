/* 구역 강조 층 — 전시 모드에서 '신당 5길' 같은 구역의 외곽선을 띄운다. (이름표는 10-16에 뺐다: 이장님 캐릭터를 가렸다)
   좌표는 위경도(content/map/kiosk-area.json). 선 굵기는 줌과 무관하게 화면 px 를 유지한다. show() 로 켜고 끈다(CSS 전환). */
import { el } from '../svg';
import type { Projection } from '../projection';

export interface AreaInput { name: string; polygon: [number, number][] }
export interface AreaLayer {
  g: SVGGElement; show(on: boolean): void; update(scale: number): void;
  labelCenter(): { x: number; y: number };   // 구역 가운데의 화면 좌표(clientX/Y) — 전시 스탬프가 빨려 들어갈 자리 (이름표가 없어도 자리는 유지)
  pulse(): void;                              // 외곽선이 한 번 또렷해졌다 돌아옴
}

export function mountArea(svg: SVGSVGElement, P: Projection, a: AreaInput, before?: Element | null): AreaLayer {
  const g = el('g', { class: 'layer area' });
  if (before) svg.insertBefore(g, before); else svg.appendChild(g);
  const pts = a.polygon.map(([lat, lng]) => P.proj(lat, lng));
  const path = el('path', { class: 'area-shape', d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z' }, g);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return {
    g,
    show(on) { g.classList.toggle('on', on); },
    labelCenter() { const m = svg.getScreenCTM(); return m ? { x: m.a * cx + m.c * cy + m.e, y: m.b * cx + m.d * cy + m.f } : { x: 0, y: 0 }; },
    pulse() { g.classList.remove('pulse'); void (g as unknown as HTMLElement).offsetWidth; g.classList.add('pulse'); },
    update(s) {
      const px = (v: number) => v / s;
      path.setAttribute('stroke-width', String(px(1.6))); path.setAttribute('stroke-dasharray', `${px(6)} ${px(4)}`);
    },
  };
}
