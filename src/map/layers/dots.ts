/* 가게 점 층. 점은 화면 px 크기를 유지하고(줌과 무관), showAt() 배율(기본 2.2) 미만에서는 숨고 4.2배부터 이름표가 보인다.
   가게 데이터의 모양은 최소만 요구한다(id·name·lat·lng·status). 클릭하면 onSelect 를 부른다.
   화면에서 clusterPx 보다 가까운 점들은 숫자 말풍선(.cluster) 하나로 묶인다 — 겹쳐서 못 누르는 가게가 없도록. 말풍선을 누르면 onCluster(멤버들) */
import { el } from '../svg';
import type { Projection } from '../projection';

export interface DotInput { id: string; name: string; lat: number; lng: number; status: 'pub' | 'up' }
export interface DotItem<S extends DotInput = DotInput> { store: S; x: number; y: number; g: SVGGElement; t: SVGTextElement }
export interface DotsLayer<S extends DotInput = DotInput> {
  g: SVGGElement;
  items: DotItem<S>[];
  clusters(): Map<string, { members: DotItem<S>[]; x: number; y: number }>;   // 지금 화면에서 묶인 점들 (키 = 멤버 id 를 이어 붙인 것)
  set(stores: S[]): DotItem<S>[];
  select(item: DotItem<S> | null): void;
  selected(): DotItem<S> | null;
  move(item: DotItem<S>, x: number, y: number): void;
  update(scale: number): void;
}

export interface DotsOptions<S extends DotInput> {
  showAt?: () => number;
  clusterPx?: number;                                                   // 이보다 가까우면 묶는다 (화면 px, 기본 22)
  onCluster?: (members: DotItem<S>[], x: number, y: number) => void;    // 말풍선 클릭 (x, y 는 지도 좌표)
}

export function mountDots<S extends DotInput>(svg: SVGSVGElement, P: Projection, onSelect: (item: DotItem<S>) => void, opts?: DotsOptions<S>): DotsLayer<S> {
  const g = el('g', { class: 'layer dots hide' }, svg);
  const showAt = opts?.showAt ?? (() => 2.2), clusterPx = opts?.clusterPx ?? 22;
  let items: DotItem<S>[] = [], sel: DotItem<S> | null = null;
  const clusterEls = new Map<string, SVGGElement>(), clusterNow = new Map<string, { members: DotItem<S>[]; x: number; y: number }>();
  const layer: DotsLayer<S> = {
    g, items,
    set(stores) {
      g.innerHTML = ''; sel = null; clusterEls.clear(); clusterNow.clear();
      items = stores.map((store) => {
        const [x, y] = P.proj(store.lat, store.lng);
        const dg = el('g', { class: 'dot' + (store.status === 'up' ? ' up' : ''), transform: `translate(${x},${y})` }, g);
        el('circle', { class: 'outer', r: 1 }, dg); el('circle', { class: 'core', r: 1 }, dg);
        const t = el('text', {}, dg); t.textContent = store.name;
        const item: DotItem<S> = { store, x, y, g: dg, t };
        dg.addEventListener('click', (e) => { e.stopPropagation(); onSelect(item); });
        return item;
      });
      layer.items = items;
      return items;
    },
    select(item) { if (sel) sel.g.classList.remove('sel'); sel = item; if (sel) sel.g.classList.add('sel'); },
    selected: () => sel,
    move(item, x, y) { item.x = x; item.y = y; item.g.setAttribute('transform', `translate(${x},${y})`); },
    clusters: () => clusterNow,
    update(s) {
      const px = (v: number) => v / s;
      g.classList.toggle('hide', s < showAt()); g.classList.toggle('labels', s >= 4.2);
      /* 묶기: 화면 거리 clusterPx 미만인 점끼리 (가게 수가 적어 n² 로 충분) */
      const lim = px(clusterPx), groupOf = new Map<DotItem<S>, DotItem<S>[]>();
      for (const a of items) {
        if (groupOf.has(a)) continue;
        const grp = [a]; groupOf.set(a, grp);
        for (const b of items) if (!groupOf.has(b) && Math.hypot(a.x - b.x, a.y - b.y) < lim) { grp.push(b); groupOf.set(b, grp); }
      }
      clusterNow.clear();
      for (const grp of new Set(groupOf.values())) {
        if (grp.length < 2) { grp[0].g.classList.remove('clustered'); continue; }
        const key = grp.map((m) => m.store.id).sort().join('|'), x = grp.reduce((t, m) => t + m.x, 0) / grp.length, y = grp.reduce((t, m) => t + m.y, 0) / grp.length;
        for (const m of grp) m.g.classList.add('clustered');
        clusterNow.set(key, { members: grp, x, y });
        let cg = clusterEls.get(key);
        if (!cg) { cg = el('g', { class: 'cluster' }, g); el('circle', { class: 'outer' }, cg); const t = el('text', {}, cg); t.textContent = String(grp.length);
          cg.addEventListener('click', (e) => { e.stopPropagation(); opts?.onCluster?.(grp, x, y); }); clusterEls.set(key, cg); }
        cg.setAttribute('transform', `translate(${x},${y})`); cg.classList.toggle('sel', !!sel && grp.includes(sel));
        cg.querySelector('circle')!.setAttribute('r', String(px(11))); cg.querySelector('circle')!.setAttribute('stroke-width', String(px(2.4)));
        const t = cg.querySelector('text')!; t.setAttribute('font-size', String(px(11))); t.setAttribute('y', String(px(4)));
      }
      for (const [key, cg] of clusterEls) if (!clusterNow.has(key)) { cg.remove(); clusterEls.delete(key); }
      for (const it of items) {
        const on = it === sel, core = it.g.querySelector('.core')!, outer = it.g.querySelector('.outer')!;
        outer.setAttribute('r', String(px(on ? 10 : 8))); outer.setAttribute('stroke-width', String(px(on ? 3.5 : 2.4)));
        if (it.store.status === 'up') { outer.setAttribute('stroke-dasharray', `${px(2)} ${px(2)}`); core.setAttribute('stroke-width', String(px(1.5))); }
        core.setAttribute('r', String(px(on ? 4.2 : 3.4)));
        it.t.setAttribute('font-size', String(px(11))); it.t.setAttribute('y', String(px(24)));
      }
    },
  };
  return layer;
}
