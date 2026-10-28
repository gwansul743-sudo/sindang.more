import { project, type Aff } from './sunStage';

/* 해 디오라마 — 건물 고르기(10-28, TASK_08 → TASK_12). 포인터는 sun.ts 가 받아(끌기와 누르기를 가려) 여기 함수를 부른다.
   · 어느 건물: 해 그림과 같은 카메라의 idmap(그림 px 의 RGB, B == 255 → 번호 = R + 256·G − 1)을 화면 밖 캔버스에 한 번 그려 두고 읽는다.
     plan(위에서 본 신당) = hi/idmap_top(3840×2880 → 기준 1920×1440 으로 이웃값 줄이기), axon = idmap.png(기준 크기). 세계 상자(무대)의 화면 칸으로 되돌려 찾는다.
   · plan: 가리키면 크림색 바닥 윤곽 + 작은 이름표 '용도 · n층 · n년'.
   · axon: 고르면 세 겹 흐림 막(캔버스, 아래) — 고른 건물은 그림 그대로, 이웃(near.ids)과 반경 50 m 안 땅은 흰 막 30 %, 나머지는 65 %(밤엔 밤 파랑).
     막은 고를 때 한 번 idmap 으로 만든다: 픽셀마다 번호 → 겹, 땅은 axon 정사영을 거꾸로 풀어 건물 가운데까지 거리(50 m 넘어 4 m 동안 부드럽게).
     섬 밖(바다)은 지금 그림의 알파로 잘라 낸다(destination-in). 고른 건물엔 얇은 테두리(크림 + 와인)만, 데이터 꼬리표 넷 + 실, 상자에 건물 카드.
     SVG 는 세계 상자 안(viewBox = 기준 그림 크기)이라 카메라와 같이 움직이고, 선 굵기·꼬리표 글씨는 화면 크기를 지킨다(카메라가 바뀌면 redraw).
   · 날짜 탭이 바뀌면 값만 다시(refresh). 요소 약 25개 */
export interface Bld {
  i: number; c: number[]; h: number; xy: number[][][]; tower?: number[][][]; svf: number | null;
  info: { use: string | null; struct: string | null; year: number | null; floors: number; basement: number; height: number; bldg_area: number; gfa: number; site_area: number; bcr: number; far: number; dong: string } | null;
  sun: Record<string, { roof: number; street: number; best_wall: number; of: number }>;
  cast: Record<string, { neighbors: number; hours: number; top: number[] }>;
  near: { r: number; ids: number[]; count: number; median_year: number | null; median_floors: number | null; trees: number; road_shade_aug15: number | null; walk_to_rest_min: number | null };
}
export type Mode = 'plan' | 'axon';
export interface SelectOptions {
  world: HTMLElement; size: number[]; plan: Aff; axon: Aff; idmapPlan: string; idmapAxon: string;
  load(): Promise<{ b: Bld[] }>;
  cover(el: HTMLElement | null): void;          // 상자 본문 자리(카드)
  date(): string;                                // 지금 날짜 탭
  scale(): number;                               // 화면 px / 기준 px(카메라 배율)
  idmapAxon2?: string;                           // 2× axon idmap(흐림 막을 2× 로)
  frameImg?(): HTMLImageElement | null;          // 지금 그림(섬 밖을 잘라 낼 알파 — 섬 알파를 아직 못 받았을 때만)
  islandSrc?: string;                            // 섬 알파를 떠 올 그림(hi 해 그림 하나)
}

const NS = 'http://www.w3.org/2000/svg', TOWER_Z = 7.6, THIS_YEAR = 2026;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const n1 = (v: number | null | undefined, unit = '') => (v == null || !isFinite(v) || v === 0 ? '—' : `${Math.round(v * 10) / 10}${unit}`);
const area = (v: number | null | undefined) => (v ? `${Math.round(v).toLocaleString('ko-KR')}㎡` : '—');
export const shortName = (b: Bld) => [b.info?.use || '건물', b.info?.floors ? `${b.info.floors}층` : null, b.info?.year ? `${b.info.year}년` : null].filter(Boolean).join(' · ');

export function mountSelect(o: SelectOptions) {
  const [IW, IH] = o.size;
  const mask = document.createElement('canvas'); mask.className = 'kb-dio-mask'; o.world.appendChild(mask);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'kb-dio-sel'); svg.setAttribute('viewBox', `0 0 ${IW} ${IH}`); svg.setAttribute('aria-hidden', 'true');
  o.world.appendChild(svg);
  const mk = (tag: string, cls: string, parent: Element = svg) => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); parent.appendChild(e); return e; };
  const ring = mk('path', 'sl-ring'), halo = mk('path', 'sl-halo'), line = mk('path', 'sl-line'), hover = mk('path', 'sl-hover'), leads = mk('path', 'sl-lead');
  const tagG = mk('g', 'sl-tags'), nameG = mk('g', 'sl-name'), nameR = mk('rect', '', nameG), nameT = mk('text', '', nameG);
  let data: Bld[] | null = null, sel: Bld | null = null, mode: Mode = 'axon', dead = false, night = false, maskFor = -1, hiMs = 0, useHi = true;
  const maps: Partial<Record<Mode, Uint8ClampedArray>> = {}, loads: Partial<Record<Mode | 'data' | 'hi', Promise<void>>> = {};
  let hiMap: Uint8ClampedArray | null = null, isl: Uint8Array | null = null, maskImg: ImageData | null = null;
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
    const near = new Uint8Array((data?.length || 0) + 2); b.near.ids.forEach((q) => { near[q] = 1; });
    const A = o.axon, det = A.perX[0] * A.perY[1] - A.perY[0] * A.perX[1], ia = A.perY[1] / det, ib = -A.perY[0] / det, ic = -A.perX[1] / det, id = A.perX[0] / det;   /* 기준 px → 지역 m (z = 0) */
    const r0 = b.near.r, r1 = r0 + 4, cx0 = b.c[0], cy0 = b.c[1], NEAR = 77, FAR = 166;   /* 0.30 · 0.65 × 255 */
    const img = new ImageData(W, H), out = new Uint32Array(img.data.buffer), src = new Uint32Array(ids.buffer, ids.byteOffset, W * H), RGB = night ? DUSK : 0x00ffffff;
    const r0s = r0 * r0, r1s = r1 * r1, A_NEAR = (NEAR << 24) | RGB, A_FAR = (FAR << 24) | RGB, step = 1 / R, sh = R === 2 ? 1 : 0;   /* 섬 알파 한 칸 = 기준 1 px = 막 R px */
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
    if (!isl) { const f = o.frameImg?.(); if (f?.complete && f.naturalWidth) { cx.globalCompositeOperation = 'destination-in'; cx.drawImage(f, 0, 0, W, H); cx.globalCompositeOperation = 'source-over'; maskImg = null; } }   /* 섬 알파가 아직 없으면 그림 알파로(느림) */
    mask.classList.toggle('night', night); maskFor = b.i;
    const ms = performance.now() - t0; if (hi) { hiMs = ms; if (ms > 120) useHi = false; }
    (window as unknown as { __maskMs?: number[] }).__maskMs = [...((window as unknown as { __maskMs?: number[] }).__maskMs || []), Math.round(ms * 10) / 10 * (hi ? 1 : -1)];   /* 확인용: + 는 2×, − 는 1× */
  }
  function tint() {   /* 낮 = 흰 막, 밤 = 밤 파랑 막 — 알파는 그대로 두고 색만 다시 써 넣는다 */
    mask.classList.toggle('night', night);
    if (!mask.width) return;
    if (!maskImg) { const cx = mask.getContext('2d')!; cx.globalCompositeOperation = 'source-in'; cx.fillStyle = night ? '#04202d' : '#ffffff'; cx.fillRect(0, 0, mask.width, mask.height); cx.globalCompositeOperation = 'source-over'; return; }
    const out = new Uint32Array(maskImg.data.buffer), RGB = night ? DUSK : 0x00ffffff; for (let k = 0; k < out.length; k++) if (out[k]) out[k] = (out[k] & 0xff000000) | RGB;
    mask.getContext('2d')!.putImageData(maskImg, 0, 0);
  }
  const ensure = (m: Mode) => Promise.all([loads.data ||= o.load().then((d) => { data = d.b; }), loadMap(m)]).then(() => undefined);
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
    tagG.replaceChildren();
    if (!sel || !data || mode !== 'axon') { [ring, halo, line, leads].forEach((e) => e.setAttribute('d', '')); svg.classList.remove('on'); mask.classList.remove('on'); return; }
    const b = sel, d = day(), k = 1 / Math.max(0.05, o.scale());   /* 화면 1px = 기준 k px */
    if (maskFor !== b.i) buildMask(b); mask.classList.add('on');
    const outline = topOf(b) + (b.tower?.length ? verts(b.xy, 0, TOWER_Z) + verts(b.tower, TOWER_Z, b.h) : verts(b.xy, 0, b.h));   /* 그림은 그대로, 얇은 테두리만 */
    halo.setAttribute('d', outline); line.setAttribute('d', outline);
    ring.setAttribute('d', Array.from({ length: 64 }, (_, j) => { const a = (j / 64) * Math.PI * 2, [u, v] = project(o.axon, b.c[0] + Math.cos(a) * b.near.r, b.c[1] + Math.sin(a) * b.near.r, 0); return `${j ? 'L' : 'M'}${u.toFixed(1)} ${v.toFixed(1)}`; }).join('') + 'Z');
    /* 꼬리표: 건물 윗면 가운데에서 그림 가운데의 반대쪽으로, 화면 13px 글씨 */
    const [ax, ay] = project(o.axon, b.c[0], b.c[1], b.h), s = b.sun[d], cast = b.cast[d];
    const tags = [s ? `옥상 일조 ${s.roof}시간` : null, b.svf != null ? `앞길 하늘 ${Math.round(b.svf * 100)}%` : null, cast ? `이웃 ${cast.neighbors}동에 그림자` : null, `반경 ${b.near.r}m 나무 ${b.near.trees}그루`].filter(Boolean) as string[];
    const FS = 13 * k, TH = 24 * k, GAP = 7 * k, OFF = 34 * k, right = ax < IW / 2;
    /* 건물 + 반경 원이 화면에 차지하는 칸 바깥에 놓는다(건물 위를 덮지 않게) */
    const ext = [...(b.tower?.length ? b.tower : b.xy).flatMap((r) => r.map(([x, y]) => project(o.axon, x, y, b.h))), ...b.xy.flatMap((r) => r.map(([x, y]) => project(o.axon, x, y, 0)))];
    const bx0 = Math.min(...ext.map((p) => p[0])), bx1 = Math.max(...ext.map((p) => p[0]));
    const y0 = ay - (tags.length * (TH + GAP)) / 2; let ld = '';
    tags.forEach((t, j) => {
      const w = t.length * FS * 0.92 + 16 * k, x = right ? bx1 + OFF : bx0 - OFF - w, y = y0 + j * (TH + GAP);
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'sl-tag'); g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`); g.style.setProperty('--i', String(j));
      g.innerHTML = `<rect width="${w.toFixed(1)}" height="${TH.toFixed(1)}" rx="${(3 * k).toFixed(1)}"/><rect class="st" x="${(2.5 * k).toFixed(1)}" y="${(2.5 * k).toFixed(1)}" width="${(w - 5 * k).toFixed(1)}" height="${(TH - 5 * k).toFixed(1)}" rx="${(2 * k).toFixed(1)}"/><text x="${(8 * k).toFixed(1)}" y="${(TH / 2).toFixed(1)}" font-size="${FS.toFixed(1)}">${esc(t)}</text>`;
      tagG.appendChild(g);
      ld += `M${ax.toFixed(1)} ${ay.toFixed(1)}L${(right ? x : x + w).toFixed(1)} ${(y + TH / 2).toFixed(1)}`;
    });
    leads.setAttribute('d', ld);
    svg.classList.add('on');
  }
  /* 상자 카드 */
  function card(b: Bld, d: string) {
    const el = document.createElement('div'); el.className = 'kb-bld';
    const I = b.info, yr = I?.year ? `${I.year}년 (${THIS_YEAR - I.year}년 된 건물)` : '—', cast = b.cast[d];
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    const bars = (['summer', 'today', 'winter'] as const).map((k) => { const s = b.sun[k]; if (!s) return ''; const lab = k === 'summer' ? '하지' : k === 'today' ? '오늘' : '동지';
      return `<li${k === d ? ' class="cur"' : ''}><span>${lab}</span><i><b style="width:${((s.street / (s.of || 1)) * 100).toFixed(0)}%"></b></i><em>길 ${s.street} / ${s.of}시간 · 옥상 ${s.roof}</em></li>`; }).join('');
    const N = b.near;
    const dn = d === 'summer' ? '하지에' : d === 'winter' ? '동지에' : '오늘', st0 = b.sun[d];
    const lead = `이 건물 앞길은 ${dn} 햇볕이 ${st0 ? st0.street : '—'}시간 들고, ` + (cast && cast.neighbors ? `이웃 ${cast.neighbors}동에 그림자를 드리워요.` : '이웃에게 그림자를 거의 드리우지 않아요.');
    el.innerHTML = `<button type="button" class="kb-bld-back">‹ 이야기로</button>
      <p class="kb-bld-lead">${esc(lead)}</p>
      <h3>${esc(I?.use || '건물')}<small>신당동</small></h3>
      <dl>${row('구조', I?.struct || '—')}${row('층수', I?.floors ? `지상 ${I.floors}층` + (I.basement ? ` / 지하 ${I.basement}층` : '') : '—')}${row('높이', n1(I?.height || b.h, 'm'))}${row('사용승인', yr)}
      ${row('건축면적', area(I?.bldg_area))}${row('대지면적', area(I?.site_area))}${row('건폐율', n1(I?.bcr, '%'))}${row('용적률', n1(I?.far, '%'))}</dl>
      <h4>햇볕 <small>(길 높이에서 해가 드는 시간 / 해가 떠 있는 시간)</small></h4><ul class="kb-bld-sun">${bars}</ul>
      <h4>하늘과 열</h4><p>앞길에서 하늘이 <b>${b.svf != null ? Math.round(b.svf * 100) + '%' : '—'}</b> 보여요. 하늘이 많이 보일수록 밤에 열이 잘 빠져요.</p>
      <h4>이웃과 함께 <small>(반경 ${N.r}m)</small></h4>
      <ul class="kb-bld-near"><li>그림자를 드리우는 이웃 <b>${cast ? cast.neighbors + '동 · ' + cast.hours + '시간' : '—'}</b></li><li>이웃 건물 <b>${N.count}동</b> · 가운데 연도 <b>${N.median_year ?? '—'}</b> · 가운데 층수 <b>${N.median_floors ?? '—'}</b></li>
      <li>나무 <b>${N.trees}그루</b> · 8월 오후 길 그늘 <b>${N.road_shade_aug15 != null ? Math.round(N.road_shade_aug15 * 100) + '%' : '—'}</b></li><li>가장 가까운 쉼터까지 걸어서 <b>${N.walk_to_rest_min != null ? N.walk_to_rest_min + '분' : '—'}</b></li></ul>`;
    el.querySelector('.kb-bld-back')!.addEventListener('click', (e) => { e.stopPropagation(); clear(); });
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
  function clear() { if (!sel) return false; sel = null; maskFor = -1; draw(); o.cover(null); return true; }
  return {
    ensure, ensureHi, idAt, hoverAt, select, clear, get maskMs() { return hiMs; },
    setNight(n: boolean) { if (n === night) return; night = n; tint(); },
    setMode(m: Mode) { mode = m; hover.setAttribute('d', ''); nameG.classList.remove('on'); draw(); },
    get mode() { return mode; }, get selected() { return sel; }, building: (i: number) => data?.[i] ?? null,
    refresh() { if (sel) { draw(); o.cover(card(sel, day())); } },   /* 날짜가 바뀌었을 때 */
    redraw() { if (sel) draw(); if (nameG.classList.contains('on')) nameG.classList.remove('on'); },   /* 카메라가 바뀌었을 때(꼬리표 크기) */
    enter() { svg.classList.remove('enter'); void svg.getBoundingClientRect(); svg.classList.add('enter'); },   /* 내려앉은 뒤 차례로 그려지기 */
    destroy() { dead = true; svg.remove(); mask.remove(); delete maps.plan; delete maps.axon; hiMap = null; data = null; },
  };
}
export type Select = ReturnType<typeof mountSelect>;
