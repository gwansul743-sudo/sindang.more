/* 가게 점 층. 점은 화면 px 크기를 유지하고(줌과 무관), 2.2배 미만에서는 숨고 4.2배부터 이름표가 보인다.
   가게 데이터의 모양은 최소만 요구한다(id·name·lat·lng·status). 클릭하면 onSelect 를 부른다. */
import { el } from '../svg';
import type { Projection } from '../projection';

export interface DotInput { id: string; name: string; lat: number; lng: number; status: 'pub' | 'up' }
export interface DotItem<S extends DotInput = DotInput> { store: S; x: number; y: number; g: SVGGElement; t: SVGTextElement }
export interface DotsLayer<S extends DotInput = DotInput> {
  g: SVGGElement;
  items: DotItem<S>[];
  set(stores: S[]): DotItem<S>[];
  select(item: DotItem<S> | null): void;
  selected(): DotItem<S> | null;
  move(item: DotItem<S>, x: number, y: number): void;
  update(scale: number): void;
}

export function mountDots<S extends DotInput>(svg: SVGSVGElement, P: Projection, onSelect: (item: DotItem<S>) => void): DotsLayer<S> {
  const g = el('g', { class: 'layer dots hide' }, svg);
  let items: DotItem<S>[] = [], sel: DotItem<S> | null = null;
  const layer: DotsLayer<S> = {
    g, items,
    set(stores) {
      g.innerHTML = ''; sel = null;
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
    update(s) {
      const px = (v: number) => v / s;
      g.classList.toggle('hide', s < 2.2); g.classList.toggle('labels', s >= 4.2);
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
