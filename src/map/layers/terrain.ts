/* 땅 그림 층 — 그림 정의(<defs>: 랜드마크·나무·집 심볼, 땅 clipPath)와 땅 무늬, 장식(집·나무)을 꽂는다.
   장식(.pixel-props)은 길 위에 올려야 하므로 땅과 따로 떼어 svg 끝에 둔다(나뭇잎·지붕이 길을 가림). */
import { el } from '../svg';

export interface TerrainData { pixelDefs: string; terrain: string }
export interface TerrainLayer { defs: SVGDefsElement; terrain: SVGGElement; props: SVGGElement }

export function mountTerrain(svg: SVGSVGElement, data: TerrainData, beforeRoads: SVGGElement): TerrainLayer {
  const defs = el('defs', {}, svg); defs.innerHTML = data.pixelDefs;
  const terrain = el('g', { class: 'pixel-terrain', 'aria-hidden': 'true' }); terrain.innerHTML = data.terrain;
  svg.insertBefore(terrain, beforeRoads);
  const props = terrain.querySelector<SVGGElement>('.pixel-props')!;
  svg.appendChild(props);
  return { defs, terrain, props };
}
