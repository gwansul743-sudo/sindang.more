import './fabric.css';

/* 전시 모드 천 재질 — 조각보(누더기). 전시 모드를 켜면 섬 바닥만 천 조각을 기운 것처럼 바뀐다. 캐릭터·랜드마크·길·나무·집은 그대로.
   · 조각 = 길(a·b·c 등급)로 나뉜 블록. 길을 그린 1× 캔버스에서 연결 성분을 찾아 블록마다 천(바탕색 + 무늬)을 정하고,
     2× 해상도 캔버스에 픽셀 단위로 그려 그림 하나를 만든다(테마별 1장, 처음 켤 때 만들고 캐시).
   · 그림은 SVG '아래' HTML div 의 배경으로 깔고, 뷰포트에 맞춰 크기·위치와 섬 모양 clip 을 매 프레임 맞춘다(sync).
     SVG 의 땅 채움(바탕·풀·밭)은 CSS 로 투명하게(fabric.css). SVG <pattern><image> 는 Chrome 이 줌아웃에서 띠로 깨져서 쓰지 않는다(10-21 확인).
   · 봉제 연출(play): 신당 5길 자리에서 둥글게 천이 깔리고(마스크), 큰 길을 따라 박음질이 달리고(점선 dashoffset), 가장자리 오버로크가 드러난다. 끝나면 onDone. */

export interface FabricOptions {
  map: HTMLElement; svg: SVGSVGElement; roadsGroup: SVGGElement;
  W: number; H: number; landPath: string;
  roads: { a?: string; b?: string; c?: string };
  origin: { x: number; y: number };          // 연출이 퍼져 나가는 중심(지도 좌표) — 신당 5길
  area?: [number, number][];                 // 특별한 천을 입힐 구역(지도 좌표 다각형) — 신당 5길
  theme?: () => string;                      // 'day' | 'night'
}
export interface Fabric {
  set(on: boolean): void;                    // 켜고 끄기(연출 없이, 0.6s 페이드)
  play(onDone?: () => void): void;           // 켜면서 봉제 연출
  sync(vx: number, vy: number, scale: number): void;
  ready(): Promise<void>;
}

const NS = 'http://www.w3.org/2000/svg';
/* 개발용: ?fabric_slow=8 이면 연출이 8배 느리게 흐른다(스크린샷 검증용). 평소엔 1 */
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('fabric_slow')) || 1);
const REVEAL_MS = 1000 * SLOW, STITCH_MS = 1400 * SLOW, TOTAL_MS = 1700 * SLOW;
if (SLOW > 1) document.documentElement.style.setProperty('--fabric-slow', String(SLOW));

/* 천 팔레트. base 는 바탕, hi/lo 는 무늬·결, seam 은 조각 경계 실 */
interface Cloth { base: [number, number, number]; hi: [number, number, number]; lo: [number, number, number] }
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = {
  day: {
    cloths: ['#b9cf8b', '#a9c27a', '#c9d99a', '#9fb876', '#d3dea4', '#b0c68a', '#c2d2a0'].map((b) => ({ base: hex(b), hi: hex('#e6edc6'), lo: hex('#8aa366') } as Cloth)),
    special: { base: hex('#efe3bf'), hi: hex('#fff8e6'), lo: hex('#d9b98e') } as Cloth,
    seam: hex('#f3efdc'), seamAlpha: .78, motifAlpha: .55,
  },
  night: {
    cloths: ['#3b4f36', '#344a3a', '#42543a', '#2f4433', '#46553a', '#3a4d3e', '#3f5240'].map((b) => ({ base: hex(b), hi: hex('#6c7f5a'), lo: hex('#22301f') } as Cloth)),
    special: { base: hex('#5a5340'), hi: hex('#8c8468'), lo: hex('#3a3528') } as Cloth,
    seam: hex('#d9c99a'), seamAlpha: .45, motifAlpha: .5,
  },
};
type ThemeKey = keyof typeof PAL;

/* 무늬: 2× 텍셀 좌표(x,y)에서 hi(+1)·lo(-1)·없음(0) */
const MOTIFS: ((x: number, y: number) => number)[] = [
  () => 0,                                                                  // 민무늬
  (x, y) => (((x >> 3) + (y >> 3)) & 1 ? 1 : 0),                            // 깅엄 체크
  (x, y) => (((x + y) % 12) < 2 ? 1 : 0),                                   // 사선 줄
  (x, y) => ((y % 10) < 2 ? -1 : 0),                                        // 가로 줄
  (x, y) => ((x % 12 === 5 && y % 12 === 5) ? 1 : 0),                       // 점
  (x, y) => { const u = x % 16, v = y % 16; return ((u === 7 && v >= 5 && v <= 9) || (v === 7 && u >= 5 && u <= 9)) ? 1 : ((u === 7 && v === 7) ? -1 : 0); },   // 작은 꽃(십자)
  (x, y) => ((((x >> 2) ^ (y >> 2)) & 3) === 0 ? -1 : 0),                   // 헤링본 비슷한 격자
];

function hash(n: number) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }
function inPoly(poly: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

export function mountFabric(o: FabricOptions): Fabric {
  const W = Math.round(o.W), H = Math.round(o.H), K = 2;   // 텍스처 배율
  const themeOf = () => ((o.theme?.() === 'day' ? 'day' : 'night') as ThemeKey);

  /* ── DOM: 천 div(SVG 아래) + 섬 모양 clipPath(숨긴 svg) + 길 박음질 path(길 층 위) + 가장자리 박음질(땅 층 안) ── */
  const div = document.createElement('div'); div.className = 'fabric'; div.setAttribute('aria-hidden', 'true');
  o.map.insertBefore(div, o.svg);
  const holder = document.createElementNS(NS, 'svg'); holder.setAttribute('width', '0'); holder.setAttribute('height', '0'); holder.setAttribute('aria-hidden', 'true'); holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  const clip = document.createElementNS(NS, 'clipPath'); clip.id = 'fabric-clip'; clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const clipPath = document.createElementNS(NS, 'path'); clipPath.setAttribute('d', o.landPath); clip.appendChild(clipPath); holder.appendChild(clip);
  o.map.insertBefore(holder, div);
  div.style.clipPath = 'url(#fabric-clip)';

  const terrain = o.svg.querySelector<SVGGElement>('.pixel-terrain');
  /* 절벽 3겹은 '섬 전체를 아래로 밀어 놓은 복사본'이라 섬 안쪽까지 꽉 채운다(평소엔 바탕이 덮어서 안 보일 뿐).
     천을 켜면 바탕이 투명해지므로 절벽 안쪽이 그대로 드러나 천(SVG 아래 div)을 가린다 → 켜는 동안만 섬 안쪽을 도려낸 mask 를 건다.
     mask 좌표계는 그 path 자신의 transform 을 포함하므로, 구멍(땅 모양)은 반대로 옮겨 그린다. (10-21: 이걸 몰라서 '민무늬 섬'이 나왔다) */
  const cliffs = terrain ? Array.from(terrain.querySelectorAll<SVGPathElement>('.land-cliff')) : [];
  const defs = o.svg.querySelector('defs') || o.svg.insertBefore(document.createElementNS(NS, 'defs'), o.svg.firstChild);
  cliffs.forEach((p, i) => {
    const m = document.createElementNS(NS, 'mask'); m.id = `fabric-cliff-${i}`; m.setAttribute('maskUnits', 'userSpaceOnUse');
    m.setAttribute('x', String(-W)); m.setAttribute('y', String(-H)); m.setAttribute('width', String(3 * W)); m.setAttribute('height', String(3 * H));
    const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', String(-W)); r.setAttribute('y', String(-H)); r.setAttribute('width', String(3 * W)); r.setAttribute('height', String(3 * H)); r.setAttribute('fill', '#fff');
    const hole = document.createElementNS(NS, 'path'); hole.setAttribute('d', o.landPath); hole.setAttribute('fill', '#000');
    const mt = p.transform.baseVal.consolidate(); if (mt) hole.setAttribute('transform', `translate(${-mt.matrix.e} ${-mt.matrix.f})`);
    m.append(r, hole); defs.appendChild(m);
  });
  const cliffHole = (v: boolean) => cliffs.forEach((p, i) => { if (v) p.setAttribute('mask', `url(#fabric-cliff-${i})`); else p.removeAttribute('mask'); });
  if (terrain) {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'fabric-stitch'); g.setAttribute('clip-path', 'url(#px-land)');
    for (const cls of ['fray', 'stitch']) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', o.landPath); p.setAttribute('class', cls); g.appendChild(p); }
    const grass = terrain.querySelector('.land-grass');
    if (grass && grass.nextSibling) terrain.insertBefore(g, grass.nextSibling); else terrain.appendChild(g);
  }
  const seam = document.createElementNS(NS, 'path'); seam.setAttribute('class', 'fabric-seam'); seam.setAttribute('d', String(o.roads.a || '') + String(o.roads.b || ''));
  o.roadsGroup.parentNode!.insertBefore(seam, o.roadsGroup.nextSibling);

  /* ── 블록(조각) 나누기: 1× 캔버스에 땅 흰색, 길 검정 → 연결 성분 ── */
  let labels: Int32Array | null = null, nLabels = 0, blockStyle: Uint8Array | null = null, blockCloth: Uint8Array | null = null, blockShade: Float32Array | null = null;
  function segment() {
    if (labels) return;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fill(new Path2D(o.landPath));
    ctx.strokeStyle = '#000'; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    ([['a', 7], ['b', 5], ['c', 3]] as [keyof typeof o.roads, number][]).forEach(([k, w]) => { if (o.roads[k]) { ctx.lineWidth = w; ctx.stroke(new Path2D(o.roads[k]!)); } });
    const d = ctx.getImageData(0, 0, W, H).data;
    const land = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) land[i] = d[i * 4] > 128 ? 1 : 0;
    const lab = new Int32Array(W * H); let n = 0; const stack = new Int32Array(W * H); const areas: number[] = [0]; const sx: number[] = [0], sy: number[] = [0];
    for (let i = 0; i < W * H; i++) {
      if (!land[i] || lab[i]) continue;
      n++; let top = 0; stack[top++] = i; lab[i] = n; let a = 0, ax = 0, ay = 0;
      while (top) { const p = stack[--top]; a++; const px = p % W, py = (p - px) / W; ax += px; ay += py;
        if (px > 0 && land[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack[top++] = p - 1; }
        if (px < W - 1 && land[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack[top++] = p + 1; }
        if (py > 0 && land[p - W] && !lab[p - W]) { lab[p - W] = n; stack[top++] = p - W; }
        if (py < H - 1 && land[p + W] && !lab[p + W]) { lab[p + W] = n; stack[top++] = p + W; } }
      areas.push(a); sx.push(ax / a); sy.push(ay / a);
    }
    /* 길(검정) 픽셀을 이웃 블록으로 메운다(길 아래가 비지 않게). 작은 조각은 그대로 둔다(누더기답게) */
    const landMask = new Uint8Array(W * H); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(o.landPath));
    const d2 = ctx.getImageData(0, 0, W, H).data; for (let i = 0; i < W * H; i++) landMask[i] = d2[i * 4] > 128 ? 1 : 0;
    for (let pass = 0; pass < 6; pass++) {
      const next = lab.slice();
      for (let i = 0; i < W * H; i++) {
        if (lab[i] || !landMask[i]) continue;
        const px = i % W;
        const cand = (px > 0 && lab[i - 1]) || (px < W - 1 && lab[i + 1]) || (i >= W && lab[i - W]) || (i < W * H - W && lab[i + W]);
        if (cand) next[i] = cand;
      }
      lab.set(next);
    }
    labels = lab; nLabels = n;
    blockStyle = new Uint8Array(n + 1); blockCloth = new Uint8Array(n + 1); blockShade = new Float32Array(n + 1);
    for (let b = 1; b <= n; b++) {
      const h = hash(b * 7919);
      blockStyle[b] = areas[b] < 220 ? 0 : h % MOTIFS.length;       /* 아주 작은 조각은 민무늬 */
      blockCloth[b] = (h >>> 8) % PAL.day.cloths.length;
      blockShade[b] = 1 + (((h >>> 16) % 100) / 100 - 0.5) * 0.08;    /* 조각마다 ±4% 밝기 */
      if (o.area && inPoly(o.area, sx[b], sy[b])) blockCloth[b] = 255;   /* 신당 5길: 특별한 천 */
    }
  }

  /* ── 텍스처 그리기(2×): 바탕 + 무늬 + 결 + 조각 경계 실 ── */
  /* 한 장에 1~2초 걸리는 픽셀 루프라 줄 묶음(ROWS)마다 한 번 쉬어 간다 — 안 그러면 사이드바·카메라 애니메이션이 그 동안 멈춘다.
     그래서 켤 때가 아니라 마운트 직후 한가할 때 미리 만들어 둔다(아래 prewarm). 테마별 1장, Promise 로 캐시(중복 생성 방지) */
  const cache: Partial<Record<ThemeKey, Promise<string>>> = {};
  const ROWS = 96;
  function texture(t: ThemeKey): Promise<string> { return cache[t] || (cache[t] = build(t)); }
  async function build(t: ThemeKey): Promise<string> {
    segment();
    const P = PAL[t], w = W * K, h = H * K;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!; const img = ctx.createImageData(w, h); const px = img.data;
    const lab = labels!;
    for (let y = 0; y < h; y++) {
      if (y && y % ROWS === 0) await new Promise((r) => setTimeout(r, 0));
      const ly = (y >> 1) * W;
      for (let x = 0; x < w; x++) {
        const b = lab[ly + (x >> 1)]; const i = (y * w + x) * 4;
        if (!b) { px[i + 3] = 0; continue; }
        const cloth = blockCloth![b] === 255 ? P.special : P.cloths[blockCloth![b]];
        const m = MOTIFS[blockStyle![b]](x, y);
        let r = cloth.base[0], g = cloth.base[1], bl = cloth.base[2];
        if (m) { const to = m > 0 ? cloth.hi : cloth.lo, a = P.motifAlpha; r += (to[0] - r) * a; g += (to[1] - g) * a; bl += (to[2] - bl) * a; }
        /* 결: 가로 실 한 줄 걸러 살짝 어둡게 + 픽셀 노이즈 */
        const grain = (y & 1 ? 0.965 : 1) * (1 + ((hash(x * 131 + y * 71) % 11) - 5) * 0.006) * blockShade![b];
        r *= grain; g *= grain; bl *= grain;
        /* 조각 경계(오른쪽·아래 이웃이 다른 블록이면) → 실 색 */
        const nb = (x + 1 < w ? lab[ly + ((x + 1) >> 1)] : b), nd = (y + 1 < h ? lab[((y + 1) >> 1) * W + (x >> 1)] : b);
        if ((nb && nb !== b) || (nd && nd !== b)) { const a = P.seamAlpha; r += (P.seam[0] - r) * a; g += (P.seam[1] - g) * a; bl += (P.seam[2] - bl) * a; }
        px[i] = r; px[i + 1] = g; px[i + 2] = bl; px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((res) => c.toBlob((blob) => res(blob ? URL.createObjectURL(blob) : c.toDataURL()), 'image/png'));
  }
  /* 미리 굽기: 인트로가 떠 있는 동안(마운트 1.5s 뒤, 한가할 때) 현재 테마 한 장 */
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 0));
  setTimeout(() => idle(() => { void texture(themeOf()); }), 1500);

  const landEls = terrain ? Array.from(terrain.querySelectorAll<SVGGraphicsElement>('.land-base, .land-grass, .land-fields')) : [];
  const setMaskEl = (el: Element | null, m: string) => { if (!el) return; const st = (el as HTMLElement).style as unknown as Record<string, string>; st.maskImage = m; st.webkitMaskImage = m; };
  const landBoxes = landEls.map((el) => el.getBBox());   /* CSS mask 그라디언트 좌표는 그 요소의 바운딩 박스 기준(fill-box) — 요소마다 다르다 */

  /* ── 뷰포트 동기화 ── */
  let on = false, last = '', cur: [number, number, number] | null = null, shownTheme: ThemeKey | null = null, revealR: number | null = null;
  function place(vx: number, vy: number, s: number) {
    const k = `${vx.toFixed(2)}|${vy.toFixed(2)}|${s.toFixed(4)}|${revealR === null ? '' : revealR.toFixed(1)}`; if (k === last) return; last = k;
    div.style.backgroundSize = `${W * s}px ${H * s}px`;
    div.style.backgroundPosition = `${-vx * s}px ${-vy * s}px`;
    div.classList.toggle('fabric--crisp', s >= 2);
    clipPath.setAttribute('transform', `matrix(${s} 0 0 ${s} ${-vx * s} ${-vy * s})`);
    const setMask = setMaskEl;
    if (revealR !== null) {
      const cx = (o.origin.x - vx) * s, cy = (o.origin.y - vy) * s, r = revealR * s;
      setMask(div, `radial-gradient(circle at ${cx}px ${cy}px, #000 ${r}px, transparent ${r + 1}px)`);
      /* 땅 바탕·풀은 반대로: 원 안쪽만 투명(천이 비친다). 좌표는 땅 path 의 바운딩 박스 기준(지도 단위) */
      const rr = revealR; landEls.forEach((el, i) => setMask(el, `radial-gradient(circle at ${o.origin.x - landBoxes[i].x}px ${o.origin.y - landBoxes[i].y}px, transparent ${rr}px, #000 ${rr + 1}px)`));
    } else { setMask(div, ''); landEls.forEach((el) => setMask(el, '')); }
  }
  async function show(t: ThemeKey) { const url = await texture(t); shownTheme = t; div.style.backgroundImage = `url(${url})`; }

  let run = 0, timers: number[] = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  /* immediate: 절벽 안쪽을 바로 도려낸다(연출용). 아니면 바탕이 0.6s 걸려 투명해진 뒤에 — 그 전에 도려내면 페이드 중간에 바다가 비친다 */
  function start(v: boolean, immediate: boolean) {
    on = v; document.documentElement.classList.toggle('fabric-on', v);
    if (v) { show(themeOf()); if (cur) { last = ''; place(...cur); } if (immediate) cliffHole(true); else timers.push(window.setTimeout(() => cliffHole(true), 600)); }
    else cliffHole(false);
  }

  return {
    set(v) { run++; clearTimers(); revealR = null; document.documentElement.classList.remove('fabric-sewing'); landEls.forEach((el) => setMaskEl(el, '')); start(v, false); },
    play(onDone) {
      const my = ++run; clearTimers();
      start(true, true);
      /* 그림이 준비되기 전에도 '연출 중' 상태로: 바탕·풀은 그대로 보이고 천은 반지름 0 원 안(=안 보임)에서 시작 */
      document.documentElement.classList.add('fabric-sewing'); revealR = 0; if (cur) { last = ''; place(...cur); }
      texture(themeOf()).then(() => {
        if (run !== my) return;
        /* 원이 '화면'을 다 덮을 때까지만 키운다(지도 전체 크기 기준이면 줌인 상태에선 0.2초 만에 끝나 버린다 — 10-21).
           반지름은 지도 단위: 5길 중심에서 화면 네 귀퉁이까지 가장 먼 거리 ÷ 배율. 속도는 smoothstep(천이 밀려 나가듯 일정하게) */
        const t0 = performance.now();
        const rMax = () => { if (!cur) return Math.hypot(W, H); const [vx, vy, s] = cur, r = o.map.getBoundingClientRect(), cx = (o.origin.x - vx) * s, cy = (o.origin.y - vy) * s;
          return Math.hypot(Math.max(cx, r.width - cx), Math.max(cy, r.height - cy)) / s + 8; };
        const step = () => {
          if (run !== my) return;
          const t = Math.min(1, (performance.now() - t0) / REVEAL_MS), e = t * t * (3 - 2 * t);
          revealR = 12 + rMax() * e; if (cur) { last = ''; place(...cur); }
          if (t < 1) requestAnimationFrame(step);
          else { revealR = null; if (cur) { last = ''; place(...cur); } landEls.forEach((el) => setMaskEl(el, 'linear-gradient(#0000,#0000)')); }   /* 다 드러났다: 바탕·풀은 계속 숨김 */
        };
        requestAnimationFrame(step);
        timers.push(window.setTimeout(() => { if (run === my) document.documentElement.classList.remove('fabric-sewing'); }, STITCH_MS + 300));
        timers.push(window.setTimeout(() => { if (run === my) landEls.forEach((el) => setMaskEl(el, '')); }, STITCH_MS + 300 + 700));   /* opacity 전환이 끝난 뒤 마스크 해제 */
        timers.push(window.setTimeout(() => { if (run === my) onDone?.(); }, TOTAL_MS));
      });
    },
    sync(vx, vy, s) {
      cur = [vx, vy, s];
      if (!on) return;
      const t = themeOf(); if (shownTheme && shownTheme !== t) show(t);   /* 전시 중 낮밤 전환 */
      place(vx, vy, s);
    },
    ready: () => texture(themeOf()).then(() => undefined),
  };
}
