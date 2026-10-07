/* 랜드마크 층(그림 + 이름표)과 권역 이름 두 개.
   아이콘은 지도 단위로 커지고 작아지고(lmK), 이름표는 화면 px 크기를 유지한다. */
import { el } from '../svg';
import type { Projection } from '../projection';

export interface LandmarkInput { name: string; lat: number; lng: number; art: string }
export interface LandmarkItem extends LandmarkInput { x: number; y: number; g: SVGGElement; ic: SVGGElement; t: SVGTextElement }
export interface LandmarksLayer {
  g: SVGGElement;
  items: LandmarkItem[];
  k(scale: number): number;            // 아이콘 배율(지도 단위)
  update(scale: number): void;
}

export function mountLandmarks(svg: SVGSVGElement, P: Projection, list: LandmarkInput[], size: { worldScale: number; minPx: number }): LandmarksLayer {
  const g = el('g', { class: 'layer lms' }, svg);
  const items = list.map((l) => {
    const [x, y] = P.proj(l.lat, l.lng);
    const lg = el('g', { class: 'lm', transform: `translate(${x},${y})` }, g);
    const ic = el('g', { class: 'ic' }, lg);
    el('use', { href: '#px-' + l.art, x: -18, y: -22, width: 36, height: 36, 'aria-hidden': 'true' }, ic);
    const t = el('text', { y: 0 }, lg); t.textContent = l.name;
    return { ...l, x, y, g: lg, ic, t };
  });
  const k = (s: number) => Math.max(size.worldScale, size.minPx / s);
  return {
    g, items, k,
    update(s) {
      const K = k(s), fs = Math.min(15, Math.max(10, 9 + s * 1.2)), px = (v: number) => v / s;
      for (const l of items) {
        l.ic.setAttribute('transform', `translate(0,${-12 * K}) scale(${K})`);
        l.t.setAttribute('font-size', String(px(fs))); l.t.setAttribute('y', String(2 * K + px(fs + 3)));
      }
    },
  };
}

export interface DistrictInput { name: string; lat: number; lng: number }
export interface DistrictsLayer { g: SVGGElement; update(scale: number): void }

export function mountDistricts(svg: SVGSVGElement, P: Projection, list: DistrictInput[]): DistrictsLayer {
  const g = el('g', {}, svg);
  const ts = list.map((d) => { const [x, y] = P.proj(d.lat, d.lng); const t = el('text', { class: 'dist', x, y }, g); t.textContent = d.name; return t; });
  return { g, update(s) { for (const t of ts) { t.setAttribute('font-size', String(14 / s)); t.setAttribute('opacity', s < 2.6 ? '1' : '0'); } } };
}
