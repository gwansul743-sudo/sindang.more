/* 도로 층 — content/map/roads.json 의 네 등급(d·c·b·a)을 path 로. a·b 가 큰 길(주민이 걷는 길). */
import { el } from '../svg';

export interface RoadsData { W: number; H: number; p: Record<string, string> }

export function mountRoads(svg: SVGSVGElement, roads: RoadsData): SVGGElement {
  const g = el('g', { class: 'roads' }, svg);
  for (const k of ['d', 'c', 'b', 'a']) el('path', { class: 'rd rd-' + k, d: roads.p[k] }, g);
  return g;
}

/* 큰 길만 (밤 불빛 번짐, 주민 길 그래프가 쓴다) */
export const majorRoadPath = (roads: RoadsData) => String(roads.p.a || '') + String(roads.p.b || '');
