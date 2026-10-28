import { project, type Aff } from './sunStage';

/* 해 디오라마 — 건물 고르기(10-28, TASK_08 → TASK_12). 포인터는 sun.ts 가 받아(끌기와 누르기를 가려) 여기 함수를 부른다.
   · 어느 건물: 해 그림과 같은 카메라의 idmap(그림 px 의 RGB, B == 255 → 번호 = R + 256·G − 1)을 화면 밖 캔버스에 한 번 그려 두고 읽는다.
     plan(위에서 본 신당) = hi/idmap_top(3840×2880 → 기준 1920×1440 으로 이웃값 줄이기), axon = idmap.png(기준 크기). 세계 상자(무대)의 화면 칸으로 되돌려 찾는다.
   · plan: 가리키면 크림색 바닥 윤곽 + 작은 이름표 '용도 · n층 · n년'.
   · axon: 고르면 세 겹 흐림 막(캔버스, 아래) — 고른 건물은 그림 그대로, 이웃(near.ids)과 반경 50 m 안 땅은 흰 막 30 %, 나머지는 65 %(밤엔 밤 파랑).
     막은 고를 때 한 번 idmap 으로 만든다: 픽셀마다 번호 → 겹, 땅은 axon 정사영을 거꾸로 풀어 건물 가운데까지 거리(50 m 넘어 4 m 동안 부드럽게).
     섬 밖(바다)은 지금 그림의 알파로 잘라 낸다(destination-in). 고른 건물엔 얇은 테두리(크림 + 와인)만, 상자에 건물 카드.
     정보 카드(TASK_16): 건물 옆 빈 쪽(건물·상자 위를 덮지 않게, 무대 칸 안)에 카드 하나 — '용도 · n층' + 2×2 수치(아이콘 · 큰 숫자 · 짧은 이름),
       옥상 지붕 가운데에서 가는 실선 하나 + 점으로 잇는다. HTML(세계 상자 안, 1/배율로 줄여 화면 크기 일정), 자리는 화면 좌표로 정한다.
     SVG 는 세계 상자 안(viewBox = 기준 그림 크기)이라 카메라와 같이 움직이고, 선 굵기·꼬리표 글씨는 화면 크기를 지킨다(카메라가 바뀌면 redraw).
   · 햇볕 지도(TASK_15): 블렌더로 센 '하루 동안 해가 드는 시간'(10월 30일, 8–17시 한 시간마다 그림자 판정) 그림을 막 위 캔버스에.
     고른 건물·이웃·반경 안 땅만 보이게 — 막을 만드는 같은 줄에서 겹 알파(고른·이웃 = 255, 땅은 반경 넘어 4 m 동안 0 으로)를 같이 쓰고,
     켤 때 그림 위에 destination-in 으로 한 번 잘라 둔다(고를 때마다). 새 단지는 이웃 자료가 없어 가운데 50 m 안 건물을 이웃으로.
     가리키면 값 그림(sunhours_today.png, 시간 × 25)에서 읽는다(heatAt). 카드엔 지도가 켜졌을 때만 한 줄.
   · 날짜 탭이 바뀌면 값만 다시(refresh). 요소 약 25개 */
export interface Bld {
  i: number; c: number[]; h: number; xy: number[][][]; tower?: number[][][]; svf: number | null; removed?: boolean; src?: string;   // removed: 모형에 없는 옛 건물(고를 수 없음) · src: 새 단지 출처
  info: { use: string | null; struct: string | null; year: number | null; floors: number; basement: number; height: number; bldg_area: number; gfa: number; site_area: number; bcr: number; far: number; dong: string } | null;
  sun: Record<string, { roof: number; street: number; best_wall: number; of: number }> | null;      // 새 단지(925–933)는 분석 자료가 없다(null)
  cast: Record<string, { neighbors: number; hours: number; top: number[] }> | null;
  near: { r: number; ids: number[]; count: number; median_year: number | null; median_floors: number | null; trees: number; road_shade_aug15: number | null; walk_to_rest_min: number | null } | null;
}
/* 가운데(c)가 없는 건물(새 단지)은 바닥 꼭짓점 평균으로 */
export const centre = (b: Bld) => (b.c ||= (() => { const p = b.xy.flat(); return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length]; })());
export type Mode = 'plan' | 'axon';
export interface SelectOptions {
  world: HTMLElement; size: number[]; plan: Aff; axon: Aff; idmapPlan: string; idmapAxon: string;
  load(): Promise<{ b: Bld[] }>;
  cover(el: HTMLElement | null): void;          // 상자 본문 자리(카드)
  date(): string;                                // 지금 날짜 탭
  scale(): number;                               // 화면 px / 기준 px(카메라 배율)
  area?: HTMLElement;                            // 무대 칸(정보 카드를 이 안에 — 상자 쪽으로 넘어가지 않게)
  idmapAxon2?: string;                           // 2× axon idmap(흐림 막을 2× 로)
  frameImg?(): HTMLImageElement | null;          // 지금 그림(섬 밖을 잘라 낼 알파 — 섬 알파를 아직 못 받았을 때만)
  islandSrc?: string;                            // 섬 알파를 떠 올 그림(hi 해 그림 하나)
  more?(): void;                                 // 정보 카드 '자세히 ›'(접힌 상자를 편다)
  heatSrc?: string; valuesSrc?: string;          // 햇볕 지도 그림(2×) · 값 그림(기준 크기, 시간 × 25)
}

const NS = 'http://www.w3.org/2000/svg', TOWER_Z = 7.6, THIS_YEAR = 2026;
/* 정보 카드 아이콘(18 px, 와인 선): 해 · 하늘(지평선 위 둥근 하늘) · 그림자(건물 + 땅에 진 그림자) · 나무 */
const ico = (d: string) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON: Record<string, string> = {
  sun: ico('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  sky: ico('<path d="M2.5 18.5h19M4.5 18.5a7.5 7.5 0 0 1 15 0"/><circle cx="15" cy="12.5" r="1.6"/>'),
  shadow: ico('<path d="M4 20V5h6v15M10 20h10l-6-6h-4"/><path d="M6.5 8.5h1M6.5 12h1"/>'),
  tree: ico('<path d="M12 21v-6M9.5 21h5"/><path d="M12 3.5c3.4 0 6 2.6 6 5.8 0 3.1-2.6 5.7-6 5.7s-6-2.6-6-5.7c0-3.2 2.6-5.8 6-5.8z"/>'),
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const n1 = (v: number | null | undefined, unit = '') => (v == null || !isFinite(v) || v === 0 ? '—' : `${Math.round(v * 10) / 10}${unit}`);
const area = (v: number | null | undefined) => (v ? `${Math.round(v).toLocaleString('ko-KR')}㎡` : '—');
export const shortName = (b: Bld) => [b.info?.use || '건물', b.info?.floors ? `${b.info.floors}층` : null, b.info?.year ? `${b.info.year}년` : null].filter(Boolean).join(' · ');

export function mountSelect(o: SelectOptions) {
  const [IW, IH] = o.size;
  const mask = document.createElement('canvas'); mask.className = 'kb-dio-mask'; o.world.appendChild(mask);
  const heat = document.createElement('canvas'); heat.className = 'kb-dio-heat'; o.world.appendChild(heat);   /* 막 위, 테두리 SVG 아래 */
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'kb-dio-sel'); svg.setAttribute('viewBox', `0 0 ${IW} ${IH}`); svg.setAttribute('aria-hidden', 'true');
  o.world.appendChild(svg);
  const mk = (tag: string, cls: string, parent: Element = svg) => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); parent.appendChild(e); return e; };
  const ring = mk('path', 'sl-ring'), halo = mk('path', 'sl-halo'), line = mk('path', 'sl-line'), hover = mk('path', 'sl-hover'), leads = mk('path', 'sl-lead');
  const dot = mk('circle', 'sl-dot'), nameG = mk('g', 'sl-name'), nameR = mk('rect', '', nameG), nameT = mk('text', '', nameG);
  /* 정보 카드: 바깥 칸은 자리·배율, 안 칸은 나타나기(8 px 올라오며) */
  const info = document.createElement('div'); info.className = 'kb-bld-tag'; info.hidden = true; info.setAttribute('aria-hidden', 'true');
  const infoIn = document.createElement('div'); infoIn.className = 'kb-bld-tag-in'; info.appendChild(infoIn); o.world.appendChild(info);
  let infoKey = '';
  let data: Bld[] | null = null, sel: Bld | null = null, mode: Mode = 'axon', dead = false, night = false, maskFor = -1, hiMs = 0, useHi = true;
  const maps: Partial<Record<Mode, Uint8ClampedArray>> = {}, loads: Partial<Record<Mode | 'data' | 'hi' | 'heat', Promise<void>>> = {};
  let hiMap: Uint8ClampedArray | null = null, isl: Uint8Array | null = null, maskImg: ImageData | null = null;
  let heatBox: { x: number; y: number; w: number; h: number; R: number; a: Uint8Array } | null = null, heatOn = false, heatFor = -1, heatImg: ImageBitmap | null = null, vals: Uint8ClampedArray | null = null, heatMs = 0, cardEl: HTMLElement | null = null;
  const IW2 = IW, IH2 = IH;   /* 섬 알파는 기준 크기, 0–255 그대로 곱해 가장자리를 부드럽게 */

  function loadMap(m: Mode) {
    return (loads[m] ||= new Promise<void>((ok) => {
      const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const cx = cv.getContext('2d', { willReadFrequently: true })!;
        cx.imageSmoothingEnabled = false; cx.drawImage(im, 0, 0, IW, IH); maps[m] = cx.getImageData(0, 0, IW, IH).data; ok(); };   /* 2× 지도는 이웃값으로 줄인다(번호가 섞이지 않게) */
      im.onerror = () => ok(); im.src = m === 'plan' ? o.idmapPlan : o.idmapAxon; }));
  }
  /* 2× axon idmap(흐림 막용) — 고를 때 영상이 도는 동안 받는다 */
  const readImg = (src: string, w: number, h: number) => new Promise<Uint8ClampedArray | null>((ok) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(im, 0, 0, w, h); ok(cx.getImageData(0, 0, w, h).data); }; im.onerror = () => ok(null); im.src = src; });
  const ensureHi = () => (loads.hi ||= Promise.all([
    o.idmapAxon2 ? readImg(o.idmapAxon2, IW * 2, IH * 2).then((d) => { hiMap = d; }) : null,
    o.islandSrc ? readImg(o.islandSrc, IW2, IH2).then((d) => { if (!d) return; isl = new Uint8Array(IW2 * IH2); for (let k = 0; k < isl.length; k++) isl[k] = d[k * 4 + 3]; }) : null,   /* 그림 알파 → 섬(땅·옆벽·건물) / 바다, 가장자리는 중간값 */
  ]).then(() => undefined));
  const DUSK = 0x002d2004;   /* #04202d 를 0xAABBGGRR 순서로 */
  /* 세 겹 흐림 막: 고를 때 한 번. 2× 로 만들어 보고 120 ms 를 넘으면 다음부터 1× */
  function buildMask(b: Bld) {
    const t0 = performance.now(), hi = useHi && !!hiMap, R = hi ? 2 : 1, W = IW * R, H = IH * R, ids = hi ? hiMap! : maps.axon; if (!ids) return;
    const near = new Uint8Array((data?.length || 0) + 2); (b.near?.ids || []).forEach((q) => { near[q] = 1; });
    const A = o.axon, det = A.perX[0] * A.perY[1] - A.perY[0] * A.perX[1], ia = A.perY[1] / det, ib = -A.perY[0] / det, ic = -A.perX[1] / det, id = A.perX[0] / det;   /* 기준 px → 지역 m (z = 0) */
    const r0 = b.near ? b.near.r : -10, r1 = r0 + 4, cx0 = b.c[0], cy0 = b.c[1], NEAR = 77, FAR = 166;   /* 0.30 · 0.65 × 255. 이웃 자료가 없으면(새 단지) 가까운 겹 없이 */
    const img = new ImageData(W, H), out = new Uint32Array(img.data.buffer), src = new Uint32Array(ids.buffer, ids.byteOffset, W * H), RGB = night ? DUSK : 0x00ffffff;
    const r0s = r0 < 0 ? -1 : r0 * r0, r1s = r0 < 0 ? -1 : r1 * r1, A_NEAR = (NEAR << 24) | RGB, A_FAR = (FAR << 24) | RGB, step = 1 / R, sh = R === 2 ? 1 : 0;   /* 섬 알파 한 칸 = 기준 1 px = 막 R px */
    for (let v = 0; v < H; v++) {
      const dv = (v + 0.5) * step - A.origin[1], row = v * W, irow = (v >> sh) * IW2;
      let x = ia * (0.5 * step - A.origin[0]) + ib * dv - cx0, y = ic * (0.5 * step - A.origin[0]) + id * dv - cy0;   /* 한 줄 안에서 u 가 1 늘 때 x·y 는 일정하게 는다 */
      const dx = ia * step, dy = ic * step;
      for (let u = 0; u < W; u++, x += dx, y += dy) {
        const px = src[row + u];   /* 리틀엔디안 RGBA → 0xAABBGGRR */
        if (px >>> 24 && ((px >>> 16) & 255) === 255) { const q = (px & 255) + 256 * ((px >>> 8) & 255) - 1; out[row + u] = q === b.i ? 0 : near[q] ? A_NEAR : A_FAR; continue; }
        const ial = isl ? isl[irow + (u >> sh)] : 255; if (!ial) continue;   /* 바다: 막 없음(0) */
        const d2 = x * x + y * y, a = d2 <= r0s ? NEAR : d2 >= r1s ? FAR : NEAR + ((FAR - NEAR) * (Math.sqrt(d2) - r0)) / 4;
        out[row + u] = ial === 255 ? (d2 <= r0s ? A_NEAR : d2 >= r1s ? A_FAR : ((a & 255) << 24) | RGB) : ((((a * ial) / 255) & 255) << 24) | RGB;   /* 섬 가장자리는 알파를 곱해 부드럽게 */
      }
    }
    mask.width = W; mask.height = H; const cx = mask.getContext('2d')!; cx.putImageData(img, 0, 0); maskImg = img;
    heatFor = -1;
    if (!isl) { const f = o.frameImg?.(); if (f?.complete && f.naturalWidth) { cx.globalCompositeOperation = 'destination-in'; cx.drawImage(f, 0, 0, W, H); cx.globalCompositeOperation = 'source-over'; maskImg = null; } }   /* 섬 알파가 아직 없으면 그림 알파로(느림) */
    mask.classList.toggle('night', night); maskFor = b.i;
    const ms = performance.now() - t0; if (hi) { hiMs = ms; if (ms > 120) useHi = false; }
    (window as unknown as { __maskMs?: number[] }).__maskMs = [...((window as unknown as { __maskMs?: number[] }).__maskMs || []), Math.round(ms * 10) / 10 * (hi ? 1 : -1)];   /* 확인용: + 는 2×, − 는 1× */
  }
  /* 햇볕 지도: 그림 위에 겹 알파를 destination-in 으로(고를 때마다 한 번, 켤 때) */
  const heatLoad = () => (loads.heat ||= new Promise<void>((ok) => {
    if (!o.heatSrc) { ok(); return; }
    /* 미리 비트맵으로 풀어 둔다(영상이 도는 동안) — 켤 때 큰 그림을 처음 올리는 비용을 피한다 */
    fetch(o.heatSrc).then((r) => r.blob()).then((bl) => createImageBitmap(bl)).then((bm) => { if (dead) bm.close(); else heatImg = bm; }, () => undefined).then(ok);
    if (o.valuesSrc) void readImg(o.valuesSrc, IW, IH).then((d) => { vals = d; });
  }));
  /* 겹 알파는 고른 건물·이웃·반경이 차지하는 칸(상자)만 — 막과 같은 판정(번호 → 겹, 땅은 거리), 캔버스도 그 상자 크기로 */
  function composeHeat() {
    const b = sel; if (!heatOn || !b || !data || mode !== 'axon' || !heatImg || heatFor === b.i) return;
    const t0 = performance.now(), hi = useHi && !!hiMap, R = hi ? 2 : 1, W = IW * R, H = IH * R, ids = hi ? hiMap! : maps.axon; if (!ids) return;
    const hn = new Uint8Array(data.length + 2), hR = b.near?.r ?? 50, c0 = centre(b), A = o.axon;
    if (b.near) b.near.ids.forEach((q) => { hn[q] = 1; });
    else data.forEach((q) => { if (!q.removed && q.c && Math.hypot(q.c[0] - c0[0], q.c[1] - c0[1]) <= hR) hn[q.i] = 1; });   /* 새 단지: 가운데가 50 m 안인 건물 */
    hn[b.i] = 1;
    /* 상자: 반경 원(+4 m) 바닥 + 이웃·고른 건물의 바닥·지붕 꼭짓점 */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (u: number, v: number) => { if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; };
    for (let j = 0; j < 48; j++) { const t = (j / 48) * Math.PI * 2, [u, v] = project(A, c0[0] + Math.cos(t) * (hR + 5), c0[1] + Math.sin(t) * (hR + 5), 0); add(u, v); }
    data.forEach((q) => { if (!hn[q.i] || q.removed) return; q.xy.forEach((r) => r.forEach(([x, y]) => { const p0 = project(A, x, y, 0), p1 = project(A, x, y, q.h); add(p0[0], p0[1]); add(p1[0], p1[1]); })); });
    const bx = Math.max(0, Math.floor(x0 * R) - 4), by = Math.max(0, Math.floor(y0 * R) - 4), bw = Math.min(W, Math.ceil(x1 * R) + 4) - bx, bh = Math.min(H, Math.ceil(y1 * R) + 4) - by;
    if (bw <= 0 || bh <= 0) return;
    const det = A.perX[0] * A.perY[1] - A.perY[0] * A.perX[1], ia = A.perY[1] / det, ib = -A.perY[0] / det, ic = -A.perX[1] / det, id = A.perX[0] / det;
    const h0s = hR * hR, h1s = (hR + 4) * (hR + 4), step = 1 / R, sh = R === 2 ? 1 : 0, src = new Uint32Array(ids.buffer, ids.byteOffset, W * H);
    const img = new ImageData(bw, bh), out = new Uint32Array(img.data.buffer), a8 = new Uint8Array(bw * bh);
    for (let v = 0; v < bh; v++) {
      const gv = by + v, dv = (gv + 0.5) * step - A.origin[1], row = gv * W, irow = (gv >> sh) * IW;
      let x = ia * ((bx + 0.5) * step - A.origin[0]) + ib * dv - c0[0], y = ic * ((bx + 0.5) * step - A.origin[0]) + id * dv - c0[1];
      const dx = ia * step, dy = ic * step;
      for (let u = 0; u < bw; u++, x += dx, y += dy) {
        const px = src[row + bx + u]; let al = 0;
        if (px >>> 24 && ((px >>> 16) & 255) === 255) { if (hn[(px & 255) + 256 * ((px >>> 8) & 255) - 1]) al = 255; }
        else { const ial = isl ? isl[irow + ((bx + u) >> sh)] : 255, d2 = x * x + y * y; if (ial && d2 < h1s) al = ((d2 <= h0s ? 255 : 255 - (255 * (Math.sqrt(d2) - hR)) / 4) * ial) / 255; }   /* 반경 안 땅, 4 m 동안 옅어진다 */
        if (al) { out[v * bw + u] = (al << 24) >>> 0; a8[v * bw + u] = al; }
      }
    }
    const t1 = performance.now();
    const tmp = document.createElement('canvas'); tmp.width = bw; tmp.height = bh; tmp.getContext('2d')!.putImageData(img, 0, 0);
    heat.width = bw; heat.height = bh; const k = heatImg.width / W, cx = heat.getContext('2d')!;
    cx.drawImage(heatImg, bx * k, by * k, bw * k, bh * k, 0, 0, bw, bh); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(tmp, 0, 0); cx.globalCompositeOperation = 'source-over';
    tmp.width = tmp.height = 0;
    Object.assign(heat.style, { left: (bx / W) * 100 + '%', top: (by / H) * 100 + '%', width: (bw / W) * 100 + '%', height: (bh / H) * 100 + '%' });
    heatBox = { x: bx, y: by, w: bw, h: bh, R, a: a8 }; heatFor = b.i; heatMs = performance.now() - t0; (window as unknown as { __heatParts?: number[][] }).__heatParts = [...((window as unknown as { __heatParts?: number[][] }).__heatParts || []), [Math.round(t1 - t0), Math.round(performance.now() - t1), bw, bh]];   /* 확인용: 알파 · 합성 ms, 상자 */
  }
  function showHeat() {
    const on = heatOn && !!sel && mode === 'axon';
    if (on) composeHeat();
    heat.classList.toggle('on', on && heatFor === sel?.i);
    cardEl?.querySelectorAll<HTMLElement>('.kb-bld-heat').forEach((e) => { e.hidden = !on; });
  }
  function tint() {   /* 낮 = 흰 막, 밤 = 밤 파랑 막 — 알파는 그대로 두고 색만 다시 써 넣는다 */
    mask.classList.toggle('night', night);
    if (!mask.width) return;
    if (!maskImg) { const cx = mask.getContext('2d')!; cx.globalCompositeOperation = 'source-in'; cx.fillStyle = night ? '#04202d' : '#ffffff'; cx.fillRect(0, 0, mask.width, mask.height); cx.globalCompositeOperation = 'source-over'; return; }
    const out = new Uint32Array(maskImg.data.buffer), RGB = night ? DUSK : 0x00ffffff; for (let k = 0; k < out.length; k++) if (out[k]) out[k] = (out[k] & 0xff000000) | RGB;
    mask.getContext('2d')!.putImageData(maskImg, 0, 0);
  }
  const ensure = (m: Mode) => Promise.all([loads.data ||= o.load().then((d) => { data = d.b; data.forEach((b) => { if (!b.removed) centre(b); }); }), loadMap(m)]).then(() => undefined);
  const aff = () => (mode === 'plan' ? o.plan : o.axon);
  /* 화면 자리 → 기준 px → 건물 번호(세계 상자의 화면 칸으로 되돌린다) */
  function idAt(cx: number, cy: number) {
    const ids = maps[mode]; if (!ids) return -1;
    const r = o.world.getBoundingClientRect(), k = r.width / IW, u = Math.floor((cx - r.left) / k), v = Math.floor((cy - r.top) / k);
    if (u < 0 || v < 0 || u >= IW || v >= IH) return -1;
    const p = (v * IW + u) * 4; return ids[p + 3] && ids[p + 2] === 255 ? ids[p] + 256 * ids[p + 1] - 1 : -1;
  }
  const poly = (rings: number[][][], z: number) => rings.map((r) => r.map(([x, y], j) => { const [u, v] = project(aff(), x, y, z); return `${j ? 'L' : 'M'}${u.toFixed(1)} ${v.toFixed(1)}`; }).join('') + 'Z').join('');
  function verts(rings: number[][][], z0: number, z1: number) {   /* 바깥쪽 세로 모서리: 화면에서 가장 왼쪽·오른쪽·앞 꼭짓점 */
    const pts = rings[0] || []; if (!pts.length) return '';
    const g = pts.map(([x, y]) => [project(o.axon, x, y, z0), project(o.axon, x, y, z1)]);
    const pick = new Set([g.reduce((a, q, i) => (q[0][0] < g[a][0][0] ? i : a), 0), g.reduce((a, q, i) => (q[0][0] > g[a][0][0] ? i : a), 0), g.reduce((a, q, i) => (q[0][1] > g[a][0][1] ? i : a), 0)]);
    return [...pick].map((i) => `M${g[i][0][0].toFixed(1)} ${g[i][0][1].toFixed(1)}L${g[i][1][0].toFixed(1)} ${g[i][1][1].toFixed(1)}`).join('');
  }
  const topOf = (b: Bld) => (mode === 'plan' ? poly(b.xy, 0) : b.tower?.length ? poly(b.xy, TOWER_Z) + poly(b.tower, b.h) : poly(b.xy, b.h));
  const day = () => { const d = o.date(); return d === 'summer' || d === 'winter' ? d : 'today'; };

  function draw() {
    if (!sel || !data || mode !== 'axon') { [ring, halo, line, leads].forEach((e) => e.setAttribute('d', '')); dot.setAttribute('r', '0'); svg.classList.remove('on'); info.hidden = true; mask.classList.remove('on'); showHeat(); return; }
    const b = sel, d = day(), k = 1 / Math.max(0.05, o.scale());   /* 화면 1px = 기준 k px */
    if (maskFor !== b.i) buildMask(b); mask.classList.add('on'); showHeat();
    const outline = topOf(b) + (b.tower?.length ? verts(b.xy, 0, TOWER_Z) + verts(b.tower, TOWER_Z, b.h) : verts(b.xy, 0, b.h));   /* 그림은 그대로, 얇은 테두리만 */
    halo.setAttribute('d', outline); line.setAttribute('d', outline);
    ring.setAttribute('d', b.near ? Array.from({ length: 64 }, (_, j) => { const a = (j / 64) * Math.PI * 2, [u, v] = project(o.axon, b.c[0] + Math.cos(a) * b.near!.r, b.c[1] + Math.sin(a) * b.near!.r, 0); return `${j ? 'L' : 'M'}${u.toFixed(1)} ${v.toFixed(1)}`; }).join('') + 'Z' : '');
    /* 정보 카드 */
    const [ax, ay] = project(o.axon, b.c[0], b.c[1], b.h), st = b.sun?.[d], cast = b.cast?.[d];
    const key = `${b.i}|${d}`;
    if (key !== infoKey) {
      infoKey = key;
      const I = b.info, sky = b.svf == null ? null : Math.round(b.svf * 100);
      const m = (icon: string, v: number | string | null | undefined, unit: string, label: string) =>
        `<div class="m">${ICON[icon]}<p>${v == null ? '<b>—</b>' : `<b>${v}</b>${unit ? `<i>${unit}</i>` : ''}`}</p><span>${label}</span></div>`;
      infoIn.innerHTML = `<h5>${esc(I?.use || '건물')}${I?.floors ? ` · ${I.floors}층` : ''}</h5><div class="gr">`
        + m('sun', st?.roof, '시간', '옥상 햇볕')
        + (sky === 0 ? `<div class="m">${ICON.sky}<p><b class="s">거의 막힘</b></p><span>앞길 하늘</span></div>` : m('sky', sky, '%', '앞길 하늘'))
        + m('shadow', cast?.neighbors, '동', '그림자 드리우는 이웃')
        + m('tree', b.near?.trees, '그루', `반경 ${b.near?.r ?? 50}m 나무`) + '</div>' + (o.more ? '<button type="button" class="kb-bld-more">자세히 ›</button>' : '');
      infoIn.querySelector('.kb-bld-more')?.addEventListener('click', (e) => { e.stopPropagation(); o.more?.(); });
    }
    /* 자리: 화면 좌표로 — 건물(지붕·바닥 꼭짓점)이 차지하는 칸 바깥의 빈 쪽(오른쪽 → 왼쪽 → 위 → 아래), 무대 칸 안.
       어느 쪽에도 안 들어가면 카드를 줄여(큰 화면 배율 → 1배까지) 가장 넓은 쪽에 — 건물 위는 덮지 않는다 */
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;   /* 무대 위 다른 천 조각처럼 큰 화면에선 함께 키운다 */
    info.hidden = false; info.style.transform = 'none';
    const Wr = o.world.getBoundingClientRect(), K = Wr.width / IW, Ar = (o.area || o.world).getBoundingClientRect(), w0 = info.offsetWidth, h0 = info.offsetHeight, G = 32, M = 10;
    const ext = [...(b.tower?.length ? b.tower : b.xy).flatMap((r) => r.map(([x, y]) => project(o.axon, x, y, b.h))), ...b.xy.flatMap((r) => r.map(([x, y]) => project(o.axon, x, y, 0)))];
    const sx0 = Wr.left + Math.min(...ext.map((p) => p[0])) * K, sx1 = Wr.left + Math.max(...ext.map((p) => p[0])) * K, sy0 = Wr.top + Math.min(...ext.map((p) => p[1])) * K, sy1 = Wr.top + Math.max(...ext.map((p) => p[1])) * K;
    const AH = Ar.height - 2 * M, AW = Ar.width - 2 * M;
    const sides = [   /* [쪽, 들어갈 수 있는 배율] */
      ['r', Math.min((Ar.right - M - (sx1 + G)) / w0, AH / h0)], ['l', Math.min((sx0 - G - (Ar.left + M)) / w0, AH / h0)],
      ['t', Math.min((sy0 - G - (Ar.top + M)) / h0, AW / w0)], ['b', Math.min((Ar.bottom - M - (sy1 + G)) / h0, AW / w0)],
    ] as const;
    const fit = sides.find((q) => q[1] >= ui), best = fit || sides.reduce((a, q) => (q[1] > a[1] ? q : a)), f = fit ? ui : Math.max(0.85, Math.min(ui, best[1])), side = best[0];
    info.style.transform = `scale(${k * f})`;
    const cw = w0 * f, ch = h0 * f, rx = Wr.left + ax * K, ry = Wr.top + ay * K;
    const cx = Math.max(Ar.left + M, Math.min(Ar.right - M - cw, side === 'r' ? sx1 + G : side === 'l' ? sx0 - G - cw : rx - cw / 2));
    const cy = Math.max(Ar.top + M, Math.min(Ar.bottom - M - ch, side === 't' ? sy0 - G - ch : side === 'b' ? sy1 + G : ry - ch / 2));
    const u = (cx - Wr.left) / K, v = (cy - Wr.top) / K, w = cw * k, h = ch * k;   /* cw·ch 는 화면 px */
    info.style.left = u.toFixed(1) + 'px'; info.style.top = v.toFixed(1) + 'px';
    /* 실: 지붕 가운데 → 카드 테두리의 가장 가까운 점(카드가 지붕을 덮으면 없음) */
    const px = Math.max(u, Math.min(u + w, ax)), py = Math.max(v, Math.min(v + h, ay));
    leads.setAttribute('d', px === ax && py === ay ? '' : `M${ax.toFixed(1)} ${ay.toFixed(1)}L${px.toFixed(1)} ${py.toFixed(1)}`); leads.setAttribute('stroke-width', (1.5 * k).toFixed(2));
    dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1)); dot.setAttribute('r', (3.5 * k).toFixed(2)); dot.setAttribute('stroke-width', (1.5 * k).toFixed(2));
    svg.classList.add('on');
  }
  /* 상자 카드 */
  function card(b: Bld, d: string) {
    const el = document.createElement('div'); el.className = 'kb-bld';
    const I = b.info, yr = I?.year ? `${I.year}년 (${THIS_YEAR - I.year}년 된 건물)` : '—', cast = b.cast?.[d];
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    const bars = (['summer', 'today', 'winter'] as const).map((k) => { const s = b.sun?.[k]; if (!s) return ''; const lab = k === 'summer' ? '하지' : k === 'today' ? '오늘' : '동지';
      return `<li${k === d ? ' class="cur"' : ''}><span>${lab}</span><i><b style="width:${((s.street / (s.of || 1)) * 100).toFixed(0)}%"></b></i><em>길 ${s.street} / ${s.of}시간 · 옥상 ${s.roof}</em></li>`; }).join('');
    const N = b.near ?? { r: 50, ids: [], count: 0, median_year: null, median_floors: null, trees: 0, road_shade_aug15: null, walk_to_rest_min: null };   /* 자료가 있는 건물만 이 줄에 온다(새 단지는 위에서 따로) */
    const dn = d === 'summer' ? '하지에' : d === 'winter' ? '동지에' : '오늘', st0 = b.sun?.[d];
    const lead = `이 건물 앞길은 ${dn} 햇볕이 ${st0 ? st0.street : '—'}시간 들고, ` + (cast && cast.neighbors ? `이웃 ${cast.neighbors}동에 그림자를 드리워요.` : '이웃에게 그림자를 거의 드리우지 않아요.');
    const basic = `<h3>${esc(I?.use || '건물')}<small>신당동</small></h3>
      <dl>${row('구조', I?.struct || '—')}${row('층수', I?.floors ? `지상 ${I.floors}층` + (I.basement ? ` / 지하 ${I.basement}층` : '') : '—')}${row('높이', n1(I?.height || b.h, 'm'))}${row('사용승인', yr)}
      ${row('건축면적', area(I?.bldg_area))}${row('대지면적', area(I?.site_area))}${row('건폐율', n1(I?.bcr, '%'))}${row('용적률', n1(I?.far, '%'))}</dl>`;
    if (!b.sun) {   /* 새 단지(925–933): 기본 정보 + 한 줄 + 출처 */
      el.innerHTML = `<button type="button" class="kb-bld-back">‹ 이야기로</button>${basic}<p class="kb-bld-none">새로 지어진 단지라 햇볕 분석 자료가 아직 없어요.</p><p class="kb-bld-heat" hidden>햇볕 지도는 3D 모형으로 계산해서 이 단지도 보여요. 색이 진할수록 해가 덜 들어요.</p>` + (b.src ? `<small class="kb-story-src">${esc(b.src)}</small>` : '');
    } else {
      el.innerHTML = `<button type="button" class="kb-bld-back">‹ 이야기로</button>
        <p class="kb-bld-lead">${esc(lead)}</p>
        ${basic}
        <h4>햇볕 <small>(길 높이에서 해가 드는 시간 / 해가 떠 있는 시간)</small></h4><ul class="kb-bld-sun">${bars}</ul>${b.sun.today ? `<p class="kb-bld-heat" hidden>색이 진할수록 해가 덜 들어요. 이 건물 앞길: <b>${b.sun.today.street}시간</b></p>` : ''}
        <h4>하늘과 열</h4><p>앞길에서 하늘이 <b>${b.svf != null ? Math.round(b.svf * 100) + '%' : '—'}</b> 보여요. 하늘이 많이 보일수록 밤에 열이 잘 빠져요.</p>
        <h4>이웃과 함께 <small>(반경 ${N.r}m)</small></h4>
        <ul class="kb-bld-near"><li>그림자를 드리우는 이웃 <b>${cast ? cast.neighbors + '동 · ' + cast.hours + '시간' : '—'}</b></li><li>이웃 건물 <b>${N.count}동</b> · 가운데 연도 <b>${N.median_year ?? '—'}</b> · 가운데 층수 <b>${N.median_floors ?? '—'}</b></li>
        <li>나무 <b>${N.trees}그루</b> · 8월 오후 길 그늘 <b>${N.road_shade_aug15 != null ? Math.round(N.road_shade_aug15 * 100) + '%' : '—'}</b></li><li>가장 가까운 쉼터까지 걸어서 <b>${N.walk_to_rest_min != null ? N.walk_to_rest_min + '분' : '—'}</b></li></ul>`;
    }
    el.querySelector('.kb-bld-back')!.addEventListener('click', (e) => { e.stopPropagation(); clear(); });
    cardEl = el; el.querySelectorAll<HTMLElement>('.kb-bld-heat').forEach((e) => { e.hidden = !(heatOn && mode === 'axon'); });
    return el;
  }
  /* 가리키기: plan 은 바닥 윤곽 + 이름표, axon 은 윗면만 옅게 */
  function hoverAt(cx: number, cy: number) {
    if (dead) return -1;
    const i = idAt(cx, cy), b = i >= 0 ? data?.[i] : null;
    hover.setAttribute('d', b && b !== sel ? (mode === 'axon' ? topOf(b) + (b.tower?.length ? verts(b.xy, 0, TOWER_Z) + verts(b.tower, TOWER_Z, b.h) : verts(b.xy, 0, b.h)) : topOf(b)) : '');   /* axon 은 테두리만(막을 하나 더 만들지 않는다) */
    if (mode === 'plan' && b) {
      const k = 1 / Math.max(0.05, o.scale()), [u, v] = project(o.plan, b.c[0], b.c[1], 0), t = shortName(b), FS = 12 * k, w = t.length * FS * 0.9 + 14 * k, h = 22 * k;
      nameR.setAttribute('x', (u - w / 2).toFixed(1)); nameR.setAttribute('y', (v - h - 14 * k).toFixed(1)); nameR.setAttribute('width', w.toFixed(1)); nameR.setAttribute('height', h.toFixed(1)); nameR.setAttribute('rx', (3 * k).toFixed(1));
      nameT.setAttribute('x', u.toFixed(1)); nameT.setAttribute('y', (v - h / 2 - 14 * k).toFixed(1)); nameT.setAttribute('font-size', FS.toFixed(1)); nameT.textContent = t; nameG.classList.add('on');
    } else nameG.classList.remove('on');
    return i;
  }
  function select(i: number) { if (!data?.[i]) return false; sel = data[i]; hover.setAttribute('d', ''); nameG.classList.remove('on'); draw(); o.cover(card(sel, day())); return true; }
  function clear() { if (!sel) return false; sel = null; maskFor = -1; draw(); o.cover(null); cardEl = null; return true; }
  /* 햇볕 지도 값: 화면 자리 → 기준 px → 시간(보이는 겹 안에서만, 아니면 null) */
  function heatAt(cx: number, cy: number) {
    const B = heatBox; if (!heat.classList.contains('on') || !vals || !B) return null;
    const r = o.world.getBoundingClientRect(), k = r.width / IW, fu = (cx - r.left) / k, fv = (cy - r.top) / k, u = Math.floor(fu), v = Math.floor(fv);
    const hu = Math.floor(fu * B.R) - B.x, hv = Math.floor(fv * B.R) - B.y;
    if (u < 0 || v < 0 || u >= IW || v >= IH || hu < 0 || hv < 0 || hu >= B.w || hv >= B.h || B.a[hv * B.w + hu] < 128) return null;
    return vals[(v * IW + u) * 4] / 25;
  }
  return {
    ensure, ensureHi, idAt, hoverAt, select, clear, heatAt, get maskMs() { return hiMs; }, get heatMs() { return heatMs; }, get heatShown() { return heat.classList.contains('on'); },
    heatLoad, setHeat(on: boolean) { heatOn = on; if (on) void heatLoad().then(() => { if (!dead) showHeat(); }); else showHeat(); },
    setNight(n: boolean) { if (n === night) return; night = n; tint(); },
    setMode(m: Mode) { mode = m; hover.setAttribute('d', ''); nameG.classList.remove('on'); draw(); },
    get mode() { return mode; }, get selected() { return sel; }, building: (i: number) => data?.[i] ?? null,
    refresh() { if (sel) { draw(); o.cover(card(sel, day())); } },   /* 날짜가 바뀌었을 때 */
    redraw() { if (sel) draw(); if (nameG.classList.contains('on')) nameG.classList.remove('on'); },   /* 카메라가 바뀌었을 때(꼬리표 크기) */
    enter() { svg.classList.remove('enter'); info.classList.remove('enter'); void svg.getBoundingClientRect(); svg.classList.add('enter'); info.classList.add('enter'); },   /* 내려앉은 뒤 차례로 그려지기 */
    destroy() { dead = true; svg.remove(); info.remove(); mask.remove(); heat.width = heat.height = 0; heat.remove(); heatBox = null; vals = null; heatImg?.close(); heatImg = null; cardEl = null; delete maps.plan; delete maps.axon; hiMap = null; data = null; },
  };
}
export type Select = ReturnType<typeof mountSelect>;
