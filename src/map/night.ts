/* 밤 장식 — 달·구름·물비늘·얕은 물빛(바다), 땅의 픽셀 결, 큰 길 가로등과 불빛 번짐, 집의 작은 불빛,
   나무·집·랜드마크 그림자, 랜드마크 뒤 불빛, 화면 가장자리 어둠.
   요소는 항상 만들어 두고, 낮 스타일시트가 숨긴다(.night-* / .night-only). 색은 고정값(밤 색). */
import { el } from './svg';
import type { LandGeometry } from './layers/land';
import type { LandmarkItem } from './layers/landmarks';

export interface NightOptions {
  svg: SVGSVGElement; map: HTMLElement; W: number; H: number;
  land: LandGeometry; landPath: string;
  majorRoads: string;                   // 큰 길 path (불빛 번짐)
  lamps: number[][];                    // 가로등 좌표 (content/map/props.json)
  roads: SVGGElement;                   // 도로 층 (땅 결은 그 아래, 가로등은 그 위)
  props: SVGGElement;                   // 장식 층 (그림자는 그 아래, 집 불빛은 그 위)
  landmarks: LandmarkItem[];
}

export function mountNight(o: NightOptions): { destroy(): void } {
  const { svg, map, W, H, land } = o, made: Element[] = [];
  const keep = <T extends Element>(e: T) => { made.push(e); return e; };

  const defs = keep(el('defs', {}, svg));
  const grad = (id: string, stops: [number, string, number][]) => `<radialGradient id="${id}">` + stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]}"/>`).join('') + '</radialGradient>';
  defs.innerHTML =
    grad('n-lamp', [[0, '#ffeab4', 1], [0.12, '#ffd27e', 0.68], [0.26, '#ffc466', 0.44], [0.41, '#ffb955', 0.27], [0.62, '#ffb04a', 0.15], [0.82, '#ffac45', 0.07], [1, '#ffac45', 0]]) +
    grad('n-lm', [[0, '#ffd98a', 0.85], [0.4, '#ffb650', 0.4], [1, '#ff9c35', 0]]) +
    grad('n-pool', [[0, '#ffcf7a', 0.36], [0.6, '#ffb040', 0.12], [1, '#ffb040', 0]]) +
    grad('n-house', [[0, '#fff3b0', 0.85], [0.28, '#ffd568', 0.52], [0.58, '#ffa33c', 0.2], [1, '#ff9030', 0]]) +
    grad('n-moon', [[0, '#ffb47a', 0.55], [0.45, '#f09a62', 0.18], [1, '#f09a62', 0]]) +
    grad('n-glint', [[0, '#ffb655', 0.34], [1, '#ffb655', 0]]) +
    /* 땅의 픽셀 결: 밝고 어두운 낱알 */
    '<pattern id="n-grain" width="53" height="47" patternUnits="userSpaceOnUse">' +
      '<path d="M3 5h2v1h-2zM19 2h1v1h-1zM41 9h2v1h-2zM11 14h1v1h-1zM31 17h1v1h-1zM6 25h1v1h-1zM47 23h1v1h-1zM22 30h2v1h-2zM15 38h1v1h-1zM36 41h2v1h-2zM50 36h1v1h-1zM28 44h1v1h-1z" fill="#6b8250" opacity=".5"/>' +
      '<path d="M9 3h1v1h-1zM34 4h1v1h-1zM2 13h2v1h-2zM24 11h1v1h-1zM45 15h1v1h-1zM17 21h1v1h-1zM38 27h2v1h-2zM12 31h2v1h-2zM4 40h1v1h-1zM27 36h1v1h-1zM44 44h1v1h-1zM20 45h1v1h-1z" fill="#16261a" opacity=".42"/>' +
    '</pattern>';
  const inLand = land.contains;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   /* 고정 씨앗: 늘 같은 바다 */

  /* 1) 바다 — 땅보다 아래 층: 섬 둘레의 얕은 물빛, 달, 구름, 물비늘 */
  const sky = keep(el('g', { class: 'night-sky', 'pointer-events': 'none', 'aria-hidden': 'true' })); svg.insertBefore(sky, svg.firstChild);
  ([[60, '#0b3d4c3d'], [34, '#0f4c5a33'], [14, '#155f6e29']] as [number, string][]).forEach(([w, c]) => el('path', { d: o.landPath, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'miter', transform: 'translate(0,10)' }, sky));
  const MX = Math.max.apply(null, land.polygon.map((p) => p[0])) - 84, MY = 20   /* 10-21: 92 → 20, 더 위로 */;   /* 섬 북동쪽 바다 위 */
  el('circle', { cx: MX, cy: MY, r: 66, fill: 'url(#n-moon)' }, sky);
  el('path', { d: `M${MX - 6} ${MY - 14}h12v2h4v2h2v2h2v4h2v8h-2v4h-2v2h-2v2h-4v2h-12v-2h-4v-2h-2v-2h-2v-4h-2v-8h2v-4h2v-2h2v-2h4z`, fill: '#e89866' }, sky);
  el('path', { d: `M${MX - 4} ${MY - 12}h8v2h4v2h2v2h-12v-2h-4v-2h2zM${MX + 4} ${MY + 2}h4v4h-4zM${MX - 8} ${MY + 4}h3v3h-3z`, fill: '#f7b98a', opacity: '.8' }, sky);
  el('path', { d: `M${MX - 9} ${MY - 3}h4v3h-4zM${MX + 2} ${MY - 5}h3v2h-3zM${MX - 2} ${MY + 8}h5v2h-5z`, fill: '#c97a55', opacity: '.7' }, sky);
  const cloud = (x: number, y: number, k: number) => {
    const g = el('g', { transform: `translate(${x},${y}) scale(${k})` }, sky);
    el('path', { d: 'M10 0h10v2h6v2h4v2h6v2h4v2h4v4h-52v-4h4v-2h4v-2h4v-2h4v-2h2z', fill: '#3d4a58' }, g);
    el('path', { d: 'M12 2h8v2h-8zM22 6h6v2h-6zM4 8h6v2h-6z', fill: '#55606c' }, g);
    el('path', { d: 'M-8 10h52v2h-52z', fill: '#6a5a5c' }, g);
    el('path', { d: 'M-6 12h48v2h-48zM2 14h30v1h-30z', fill: '#d0835a', opacity: '.85' }, g);
  };
  cloud(MX - 150, MY - 14, 1.5); cloud(MX - 84, MY + 30, 1.05); cloud(MX + 30, MY + 34, 1.2); cloud(MX - 226, MY + 50, 0.8);
  let d1 = '', d2 = '';
  const dash = (x: number, y: number, w: number, h: number) => `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h}h-${w.toFixed(1)}z`;
  for (let i = 0; i < 170; i++) {
    const x = -320 + rnd() * (W + 640), y = -260 + rnd() * (H + 520), w = 5 + rnd() * 10;
    if (inLand(x, y) || inLand(x + w, y) || inLand(x, y - 22) || inLand(x, y + 14)) continue;
    if (rnd() < 0.45) d1 += dash(x, y, w, 1.4); else d2 += dash(x, y, w * 0.7, 1.2);
  }
  for (let i = 0; i < 14; i++) {   /* 물비늘이 모여 반짝이는 곳 */
    let cx = 0, cy = 0, t = 0; do { cx = -240 + rnd() * (W + 480); cy = -160 + rnd() * (H + 320); } while ((inLand(cx, cy) || inLand(cx - 40, cy) || inLand(cx + 40, cy) || inLand(cx, cy - 30) || inLand(cx, cy + 30)) && ++t < 30);
    if (t >= 30) continue;
    el('ellipse', { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: 30, ry: 13, fill: 'url(#n-glint)' }, sky);
    for (let k = 0; k < 7; k++) { const w = 4 + rnd() * 11; d1 += dash(cx - w / 2 + (rnd() - 0.5) * 30, cy + (k - 3) * 3.4 + (rnd() - 0.5) * 1.5, w, 1.6); }
  }
  el('ellipse', { cx: MX, cy: MY + 150, rx: 34, ry: 120, fill: 'url(#n-glint)' }, sky);
  for (let i = 0; i < 30; i++) { const y = MY + 34 + i * 8 + rnd() * 5, w = 6 + rnd() * 18, x = MX - w / 2 + (rnd() - 0.5) * 28; if (!inLand(x, y) && !inLand(x + w, y)) d1 += dash(x, y, w, 1.6); }   /* 달빛 길 */
  el('path', { d: d1, fill: '#f0a850', opacity: '.8' }, sky); el('path', { d: d2, fill: '#f2c070', opacity: '.3' }, sky);

  /* 2) 땅 위: 픽셀 결 → 큰 길 불빛 번짐 (모두 길보다 아래 층) */
  const under = keep(el('g', { class: 'night-ground', 'clip-path': 'url(#px-land)', 'pointer-events': 'none', 'aria-hidden': 'true' })); svg.insertBefore(under, o.roads);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#n-grain)' }, under);
  ([[30, 0.03], [16, 0.055]] as [number, number][]).forEach(([w, op]) => el('path', { d: o.majorRoads, fill: 'none', stroke: '#ffb648', 'stroke-opacity': op, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, under));

  /* 3) 가로등 — 길 위 층. 작은 불빛 점 + 은은한 번짐 */
  const lamps = keep(el('g', { class: 'night-lamps', 'pointer-events': 'none', 'aria-hidden': 'true' })); svg.insertBefore(lamps, o.roads.nextSibling);
  let core = '';
  o.lamps.forEach(([x, y]) => { el('circle', { cx: x, cy: y, r: 18, fill: 'url(#n-lamp)' }, lamps); core += `M${(x - 1).toFixed(1)} ${(y - 1).toFixed(1)}h2v2h-2z`; });
  el('path', { d: core, fill: '#fff3cf' }, lamps);

  /* 4) 집·나무: 그림자와 집의 작은 불빛 — 장식(집·나무)보다 아래 층 */
  const props = o.props;
  if (props.parentNode) {
    const sh = keep(el('g', { class: 'night-shadows', 'clip-path': 'url(#px-land)', 'pointer-events': 'none', 'aria-hidden': 'true' })); props.parentNode.insertBefore(sh, props);
    const halo = keep(el('g', { class: 'night-houselight', 'pointer-events': 'none', 'aria-hidden': 'true' })); props.parentNode.insertBefore(halo, props.nextSibling);   /* 집 그림 '위'에 얹어 빛이 벽과 주변으로 번지게 */
    let shd = '';
    props.querySelectorAll('use').forEach((u) => {
      const x = +u.getAttribute('x')!, y = +u.getAttribute('y')!, w = +u.getAttribute('width')!, h = +u.getAttribute('height')!, href = u.getAttribute('href') || '';
      const chief = href.includes('chiefhome'), house = href.includes('house') || chief;
      const bx = x + w * (house ? 0.5 : 0.52), by = y + h * (house ? 0.905 : 0.955), rw = w * (house ? 0.46 : 0.34);
      /* 오른쪽 아래로 드리운 픽셀 계단 그림자 */
      for (let k = 0; k < 4; k++) { const ww = rw * 2 * (1 - k * 0.2), xx = bx - rw + k * w * 0.09; shd += `M${xx.toFixed(1)} ${(by + k * w * 0.045).toFixed(1)}h${ww.toFixed(1)}v${(w * 0.05).toFixed(2)}h-${ww.toFixed(1)}z`; }
      if (chief) { el('ellipse', { cx: (x + w * 0.5).toFixed(1), cy: (y + h * 0.9).toFixed(1), rx: (w * 0.62).toFixed(1), ry: (w * 0.2).toFixed(1), fill: 'url(#n-pool)' }, sh);
                   el('ellipse', { cx: (x + w * 0.5).toFixed(1), cy: (y + h * 0.6).toFixed(1), rx: (w * 0.78).toFixed(1), ry: (w * 0.62).toFixed(1), fill: 'url(#n-lm)' }, sh); }
      else if (house) el('circle', { cx: (x + w * 0.5).toFixed(1), cy: (y + h * 0.68).toFixed(1), r: (w * 0.6).toFixed(1), fill: 'url(#n-house)' }, halo);
    });
    el('path', { d: shd, fill: '#04110d', opacity: '.5' }, sh);
  }

  /* 5) 랜드마크: 바닥 그림자 → 바닥에 번진 불빛 → 뒤쪽 불빛 */
  o.landmarks.forEach((l) => {
    const f = l.g.firstChild;
    l.g.insertBefore(keep(el('path', { class: 'night-only', d: 'M-17 -1h36v1.6h-36zM-13 .6h34v1.6h-34zM-8 2.2h30v1.4h-30z', fill: '#04110d', opacity: '.45' })), f);
    l.g.insertBefore(keep(el('ellipse', { class: 'night-only', cx: 0, cy: 1, rx: 30, ry: 8, fill: 'url(#n-pool)' })), f);
    l.g.insertBefore(keep(el('ellipse', { class: 'night-only', cx: 0, cy: -15, rx: 42, ry: 36, fill: 'url(#n-lm)' })), f);
  });

  /* 6) 화면 가장자리를 어둡게 */
  const vig = document.createElement('div'); vig.className = 'night-vignette'; vig.setAttribute('aria-hidden', 'true'); map.appendChild(vig); made.push(vig);

  return { destroy() { made.forEach((e) => e.remove()); } };
}
