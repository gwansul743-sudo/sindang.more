/* 낮 장식 — 해·햇무리·흰 구름·햇빛 길·파도 결·섬 둘레의 얕은 물빛과 물거품. 모두 땅보다 아래 층(바다).
   night.ts 와 짝: 요소는 항상 만들어 두고, 밤 스타일시트가 숨긴다(.day-sky). 색은 고정값(낮 바다 색 #8eafa7 기준). */
import { el } from './svg';
import type { LandGeometry } from './layers/land';

export interface DayOptions { svg: SVGSVGElement; W: number; H: number; land: LandGeometry; landPath: string }

export function mountDay(o: DayOptions): { destroy(): void } {
  const { svg, W, H, land } = o, made: Element[] = [];
  const keep = <T extends Element>(e: T) => { made.push(e); return e; };

  const defs = keep(el('defs', {}, svg));
  const grad = (id: string, stops: [number, string, number][]) => `<radialGradient id="${id}">` + stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]}"/>`).join('') + '</radialGradient>';
  defs.innerHTML =
    grad('d-sun', [[0, '#fff6c4', 0.7], [0.3, '#ffe98f', 0.3], [0.6, '#ffe98f', 0.1], [1, '#ffe98f', 0]]) +
    grad('d-glint', [[0, '#f4f7e6', 0.3], [1, '#f4f7e6', 0]]);
  const inLand = land.contains;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   /* 고정 씨앗: 늘 같은 바다 */

  const sky = keep(el('g', { class: 'day-sky', 'pointer-events': 'none', 'aria-hidden': 'true' })); svg.insertBefore(sky, svg.firstChild);

  /* 1) 섬 둘레의 얕은 물빛(밝은 옥색) → 물가의 흰 거품 띠 */
  ([[60, '#bcdad034'], [34, '#c6e0d634'], [14, '#d2e8df3e'], [5, '#eef6f052']] as [number, string][]).forEach(([w, c]) => el('path', { d: o.landPath, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'miter', transform: 'translate(0,10)' }, sky));

  /* 2) 해 — 섬 북동쪽 하늘(달과 같은 자리). 햇무리 → 픽셀 해 → 하이라이트 → 짧은 햇살 */
  const SX = Math.max.apply(null, land.polygon.map((p) => p[0])) - 84, SY = 20   /* 10-21: 92 → 20, 더 위로 */;
  el('circle', { cx: SX, cy: SY, r: 84, fill: 'url(#d-sun)' }, sky);
  el('path', { d: `M${SX - 6} ${SY - 14}h12v2h4v2h2v2h2v4h2v8h-2v4h-2v2h-2v2h-4v2h-12v-2h-4v-2h-2v-2h-2v-4h-2v-8h2v-4h2v-2h2v-2h4z`, fill: '#f7c64a' }, sky);
  el('path', { d: `M${SX - 4} ${SY - 12}h8v2h4v2h2v2h-12v-2h-4v-2h2zM${SX - 8} ${SY} h3v3h-3z`, fill: '#fff1a4', opacity: '.85' }, sky);
  el('path', { d: `M${SX + 2} ${SY + 6}h5v2h-5zM${SX + 6} ${SY + 2}h2v3h-2z`, fill: '#eba63a', opacity: '.6' }, sky);
  el('path', { d: `M${SX - 1} ${SY - 27}h2v7h-2zM${SX - 1} ${SY + 20}h2v7h-2zM${SX - 27} ${SY - 1}h7v2h-7zM${SX + 20} ${SY - 1}h7v2h-7z` +
    `M${SX - 20} ${SY - 20}h3v3h-3zM${SX + 17} ${SY - 20}h3v3h-3zM${SX - 20} ${SY + 17}h3v3h-3zM${SX + 17} ${SY + 17}h3v3h-3z`, fill: '#f7c64a', opacity: '.7' }, sky);

  /* 3) 흰 구름 (밤 구름과 같은 모양·자리) */
  const cloud = (x: number, y: number, k: number) => {
    const g = el('g', { transform: `translate(${x},${y}) scale(${k})` }, sky);
    el('path', { d: 'M10 0h10v2h6v2h4v2h6v2h4v2h4v4h-52v-4h4v-2h4v-2h4v-2h4v-2h2z', fill: '#f8f6ec' }, g);
    el('path', { d: 'M12 2h8v2h-8zM22 6h6v2h-6zM4 8h6v2h-6z', fill: '#ffffff' }, g);
    el('path', { d: 'M-8 10h52v2h-52z', fill: '#dfe4d8' }, g);
    el('path', { d: 'M-6 12h48v2h-48zM2 14h30v1h-30z', fill: '#c3d4cc', opacity: '.85' }, g);
  };
  cloud(SX - 150, SY - 14, 1.5); cloud(SX - 84, SY + 30, 1.05); cloud(SX + 30, SY + 34, 1.2); cloud(SX - 226, SY + 50, 0.8);

  /* 4) 파도 결: 계단 모양 픽셀 물결(밝은 결·어두운 결) + 햇빛에 반짝이는 자리 + 해 아래 햇빛 길 */
  let light = '', dark = '', foam = '';
  const wave = (x: number, y: number, w: number) => { const a = Math.round(w / 3); return `M${x.toFixed(1)} ${y.toFixed(1)}h${a}v1h-${a}zM${(x + a).toFixed(1)} ${(y - 1).toFixed(1)}h${a}v1h-${a}zM${(x + 2 * a).toFixed(1)} ${y.toFixed(1)}h${a}v1h-${a}z`; };
  const dash = (x: number, y: number, w: number, h: number) => `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h}h-${w.toFixed(1)}z`;
  const free = (x: number, y: number, w: number) => !(inLand(x, y) || inLand(x + w, y) || inLand(x, y - 24) || inLand(x, y + 16) || inLand(x - 16, y) || inLand(x + w + 16, y));
  for (let i = 0; i < 320; i++) {
    const x = -320 + rnd() * (W + 640), y = -260 + rnd() * (H + 520), w = 9 + rnd() * 12;
    if (!free(x, y, w)) continue;
    if (rnd() < 0.6) light += wave(x, y, w); else dark += wave(x, y, w * 0.9);
  }
  for (let i = 0; i < 12; i++) {   /* 햇빛이 모여 반짝이는 곳 */
    let cx = 0, cy = 0, t = 0; do { cx = -240 + rnd() * (W + 480); cy = -160 + rnd() * (H + 320); } while (!free(cx - 40, cy, 80) && ++t < 30);
    if (t >= 30) continue;
    el('ellipse', { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: 30, ry: 13, fill: 'url(#d-glint)' }, sky);
    for (let k = 0; k < 6; k++) { const w = 4 + rnd() * 10; foam += dash(cx - w / 2 + (rnd() - 0.5) * 30, cy + (k - 3) * 3.6 + (rnd() - 0.5) * 1.5, w, 1.4); }
  }
  el('ellipse', { cx: SX, cy: SY + 150, rx: 34, ry: 120, fill: 'url(#d-glint)' }, sky);
  for (let i = 0; i < 30; i++) { const y = SY + 34 + i * 8 + rnd() * 5, w = 6 + rnd() * 18, x = SX - w / 2 + (rnd() - 0.5) * 28; if (!inLand(x, y) && !inLand(x + w, y)) foam += dash(x, y, w, 1.6); }   /* 햇빛 길 */
  el('path', { d: dark, fill: '#6f948c', opacity: '.55' }, sky);
  el('path', { d: light, fill: '#c8e0d7', opacity: '.9' }, sky);
  el('path', { d: foam, fill: '#f6f8e8', opacity: '.75' }, sky);

  return { destroy() { made.forEach((e) => e.remove()); } };
}
