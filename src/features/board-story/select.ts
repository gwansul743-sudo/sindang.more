/* 해 디오라마 — 건물 하나 골라 보기(10-28, 감독 요청 "건물을 고르면 그 건물과 반경 안 이웃의 환경 분석을 3D 위에").
   · 고르기: idmap.png(해 그림과 같은 카메라·크기 1920×1440)을 화면 밖 캔버스에 한 번 그려 두고, 포인터 자리 → 그림 px → RGB.
     B == 255 이면 건물 번호 = R + 256·G − 1 (sun-buildings.json 의 순서). 주민(dioWalkers)을 누른 것은 건드리지 않는다.
   · 3D 위 표시(그림 칸 위 SVG 한 장, viewBox = 그림 크기 → contain 과 똑같이 겹친다, 요소 약 20개):
     고른 건물 = 바닥(xy, 탑이 있으면 7.6 m 까지 기단) + 탑(tower, 7.6 m → 높이) 윗면을 와인 35% + 테두리, 바깥쪽 모서리 세로선, 바닥 윤곽.
     이웃(near.ids) = 윗면만 한 path 로 옅게. 반경 50 m = 땅 위 원(64점)을 점선 타원으로. 데이터 꼬리표 넷 = 빈 쪽에 세로로 쌓고 실로 잇는다.
     정사영(manifest.axon): 그림 px = origin + x·perX + y·perY + z·perZ (지역 미터).
   · 상자: 고르면 본문 대신 건물 카드(기본 정보 · 햇볕 · 하늘과 열 · 이웃과 함께). '‹ 이야기로' · Esc · ✕ 는 고른 것부터 푼다.
   · 날짜 탭(하지·오늘·동지, 춘분은 자료가 없어 오늘)이 바뀌면 값만 다시. 시각 막대와 상관없이 고른 것은 그대로(모양은 시간과 무관). */
export interface Bld {
  i: number; c: number[]; h: number; xy: number[][][]; tower?: number[][][]; svf: number | null;
  info: { use: string | null; struct: string | null; year: number | null; floors: number; basement: number; height: number; bldg_area: number; gfa: number; site_area: number; bcr: number; far: number; dong: string } | null;
  sun: Record<string, { roof: number; street: number; best_wall: number; of: number }>;
  cast: Record<string, { neighbors: number; hours: number; top: number[] }>;
  near: { r: number; ids: number[]; count: number; median_year: number | null; median_floors: number | null; trees: number; road_shade_aug15: number | null; walk_to_rest_min: number | null };
}
interface Axon { origin: number[]; perX: number[]; perY: number[]; perZ: number[] }
export interface SelectOptions {
  pane: HTMLElement; size: number[]; axon: Axon; idmap: string;
  load(): Promise<{ b: Bld[] }>;
  cover(el: HTMLElement | null): void;          // 상자 본문 자리(카드)
  date(): string;                                // 지금 날짜 탭
  onSelect(): void;                              // 골랐다(재생 멈춤 등)
}

const NS = 'http://www.w3.org/2000/svg', TOWER_Z = 7.6, THIS_YEAR = 2026;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const n1 = (v: number | null | undefined, unit = '') => (v == null || !isFinite(v) || v === 0 ? '—' : `${Math.round(v * 10) / 10}${unit}`);
const area = (v: number | null | undefined) => (v ? `${Math.round(v).toLocaleString('ko-KR')}㎡` : '—');

export function mountSelect(o: SelectOptions) {
  const [IW, IH] = o.size, A = o.axon;
  const P = (x: number, y: number, z: number) => [A.origin[0] + x * A.perX[0] + y * A.perY[0] + z * A.perZ[0], A.origin[1] + x * A.perX[1] + y * A.perY[1] + z * A.perZ[1]];
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'kb-dio-sel'); svg.setAttribute('viewBox', `0 0 ${IW} ${IH}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.setAttribute('aria-hidden', 'true');
  o.pane.appendChild(svg);
  const mk = (tag: string, cls: string) => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); svg.appendChild(e); return e; };
  const ring = mk('path', 'sl-ring'), near = mk('path', 'sl-near'), base = mk('path', 'sl-base'), edges = mk('path', 'sl-edge'), tops = mk('path', 'sl-top'), hover = mk('path', 'sl-hover'), leads = mk('path', 'sl-lead');
  const tagG = mk('g', 'sl-tags');
  let data: Bld[] | null = null, ids: Uint8ClampedArray | null = null, loading: Promise<void> | null = null, sel: Bld | null = null, hot = -1, raf = 0, dead = false;

  function ensure() {
    if (!loading) loading = Promise.all([o.load().then((d) => { data = d.b; }), new Promise<void>((ok) => {
      const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(im, 0, 0); ids = cx.getImageData(0, 0, IW, IH).data; ok(); }; im.onerror = () => ok(); im.src = o.idmap; })]).then(() => undefined);
    return loading;
  }
  /* 포인터 → 그림 px(contain) → 건물 번호 */
  function idAt(cx: number, cy: number) {
    if (!ids) return -1;
    const r = o.pane.getBoundingClientRect(), k = Math.min(r.width / IW, r.height / IH), ox = (r.width - IW * k) / 2, oy = (r.height - IH * k) / 2;
    const u = Math.floor((cx - r.left - ox) / k), v = Math.floor((cy - r.top - oy) / k); if (u < 0 || v < 0 || u >= IW || v >= IH) return -1;
    const p = (v * IW + u) * 4; return ids[p + 3] && ids[p + 2] === 255 ? ids[p] + 256 * ids[p + 1] - 1 : -1;
  }
  const poly = (rings: number[][][], z: number) => rings.map((r) => r.map(([x, y], j) => { const [u, v] = P(x, y, z); return `${j ? 'L' : 'M'}${u.toFixed(1)} ${v.toFixed(1)}`; }).join('') + 'Z').join('');
  /* 바깥쪽 세로 모서리: 화면에서 가장 왼쪽·오른쪽, 가장 앞(아래) 꼭짓점 */
  function verts(rings: number[][][], z0: number, z1: number) {
    const pts = rings[0] || []; if (!pts.length) return '';
    const g = pts.map(([x, y]) => [P(x, y, z0), P(x, y, z1)]);
    const pick = new Set([g.reduce((a, q, i) => (q[0][0] < g[a][0][0] ? i : a), 0), g.reduce((a, q, i) => (q[0][0] > g[a][0][0] ? i : a), 0), g.reduce((a, q, i) => (q[0][1] > g[a][0][1] ? i : a), 0)]);
    return [...pick].map((i) => `M${g[i][0][0].toFixed(1)} ${g[i][0][1].toFixed(1)}L${g[i][1][0].toFixed(1)} ${g[i][1][1].toFixed(1)}`).join('');
  }
  const topOf = (b: Bld) => (b.tower?.length ? poly(b.xy, TOWER_Z) + poly(b.tower, b.h) : poly(b.xy, b.h));
  function day() { const d = o.date(); return d === 'summer' || d === 'winter' ? d : 'today'; }

  function draw() {
    tagG.replaceChildren();
    if (!sel || !data) { [ring, near, base, edges, tops, leads].forEach((e) => e.setAttribute('d', '')); svg.classList.remove('on'); return; }
    const b = sel, d = day();
    tops.setAttribute('d', topOf(b));
    base.setAttribute('d', poly(b.xy, 0));
    edges.setAttribute('d', b.tower?.length ? verts(b.xy, 0, TOWER_Z) + verts(b.tower, TOWER_Z, b.h) : verts(b.xy, 0, b.h));
    near.setAttribute('d', b.near.ids.map((k) => data![k]).filter(Boolean).map((q) => topOf(q)).join(''));
    ring.setAttribute('d', Array.from({ length: 64 }, (_, j) => { const a = (j / 64) * Math.PI * 2, [u, v] = P(b.c[0] + Math.cos(a) * b.near.r, b.c[1] + Math.sin(a) * b.near.r, 0); return `${j ? 'L' : 'M'}${u.toFixed(1)} ${v.toFixed(1)}`; }).join('') + 'Z');
    /* 꼬리표: 건물 윗면 가운데에서 빈 쪽(그림 가운데에서 먼 쪽)으로 세로로 쌓는다 */
    const [ax, ay] = P(b.c[0], b.c[1], b.h), s = b.sun[d], cast = b.cast[d];
    const tags = [s ? `옥상 일조 ${s.roof}시간` : null, b.svf != null ? `앞길 하늘 ${Math.round(b.svf * 100)}%` : null, cast ? `이웃 ${cast.neighbors}동에 그림자` : null, `반경 ${b.near.r}m 나무 ${b.near.trees}그루`].filter(Boolean) as string[];
    const FS = 26, TH = 46, GAP = 14, right = ax < IW / 2, x0 = right ? Math.min(ax + 120, IW - 380) : Math.max(ax - 120 - 330, 20);
    const y0 = Math.max(20, Math.min(IH - 20 - tags.length * (TH + GAP), ay - (tags.length * (TH + GAP)) / 2));
    let ld = '';
    tags.forEach((t, j) => {
      const w = t.length * FS * 0.92 + 30, x = right ? x0 : x0 + 330 - w, y = y0 + j * (TH + GAP);
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'sl-tag'); g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      g.innerHTML = `<rect width="${w.toFixed(1)}" height="${TH}" rx="6"/><rect class="st" x="4" y="4" width="${(w - 8).toFixed(1)}" height="${TH - 8}" rx="3"/><text x="15" y="${TH / 2}">${esc(t)}</text>`;
      tagG.appendChild(g);
      ld += `M${ax.toFixed(1)} ${ay.toFixed(1)}L${(right ? x : x + w).toFixed(1)} ${(y + TH / 2).toFixed(1)}`;
    });
    leads.setAttribute('d', ld);
    svg.classList.add('on');
    o.cover(card(b, d));
  }
  /* 상자 카드 */
  function card(b: Bld, d: string) {
    const el = document.createElement('div'); el.className = 'kb-bld';
    const I = b.info, yr = I?.year ? `${I.year}년 (${THIS_YEAR - I.year}년 된 건물)` : '—';
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    const bars = (['summer', 'today', 'winter'] as const).map((k) => { const s = b.sun[k]; if (!s) return ''; const lab = k === 'summer' ? '하지' : k === 'today' ? '오늘' : '동지';
      return `<li${k === d ? ' class="cur"' : ''}><span>${lab}</span><i><b style="width:${((s.street / (s.of || 1)) * 100).toFixed(0)}%"></b></i><em>길 ${s.street} / ${s.of}시간 · 옥상 ${s.roof}</em></li>`; }).join('');
    const cast = b.cast[d], N = b.near;
    el.innerHTML = `<button type="button" class="kb-bld-back">‹ 이야기로</button>
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
  function select(i: number) { if (!data || !data[i]) return; sel = data[i]; hover.setAttribute('d', ''); o.onSelect(); draw(); }
  function clear() { if (!sel) return false; sel = null; draw(); o.cover(null); return true; }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || (e.target as Element).closest?.('.kb-dio-hit')) return;
    void ensure(); cancelAnimationFrame(raf); const { clientX: x, clientY: y } = e;
    raf = requestAnimationFrame(() => { if (dead) return; const i = idAt(x, y); if (i === hot) return; hot = i; o.pane.classList.toggle('kb-pick', i >= 0);
      hover.setAttribute('d', i >= 0 && data?.[i] && i !== sel?.i ? topOf(data[i]) : ''); });
  };
  const onClick = (e: MouseEvent) => { if ((e.target as Element).closest?.('.kb-dio-hit')) return; void ensure().then(() => { if (dead) return; const i = idAt(e.clientX, e.clientY); if (i >= 0) select(i); }); };
  const onLeave = () => { hot = -1; hover.setAttribute('d', ''); o.pane.classList.remove('kb-pick'); };
  o.pane.addEventListener('pointermove', onMove, { passive: true }); o.pane.addEventListener('click', onClick); o.pane.addEventListener('pointerleave', onLeave);
  return {
    ensure, clear, refresh: () => { if (sel) draw(); },
    get selected() { return sel?.i ?? -1; },
    destroy() { dead = true; cancelAnimationFrame(raf); o.pane.removeEventListener('pointermove', onMove); o.pane.removeEventListener('click', onClick); o.pane.removeEventListener('pointerleave', onLeave); svg.remove(); ids = null; data = null; },
  };
}
export type Select = ReturnType<typeof mountSelect>;
