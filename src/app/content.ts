/* content/ 의 파일들을 읽어 지도 엔진에 넘길 데이터 한 덩어리로 묶는다.
   그림·도로·좌표·파츠는 전부 파일이고, 여기서는 읽어서 이어 붙이기만 한다. */
import roads from '../../content/map/roads.json';
import land from '../../content/map/land.json';
import props from '../../content/map/props.json';
import terrain from '../../content/map/terrain.svg.txt?raw';
import terrainDefs from '../../content/map/terrain.defs.svg.txt?raw';
import head from '../../content/characters/parts/head.json';
import body from '../../content/characters/parts/body.json';
import wave from '../../content/characters/parts/wave.json';
import palette from '../../content/characters/palette.json';
import looks from '../../content/characters/looks.json';
import chief from '../../content/characters/chief.json';
import cat from '../../content/characters/cat.json';
import kioskArea from '../../content/map/kiosk-area.json';
import chiefTalk from '../../content/characters/chief-talk.json';
import { loadLandmarks } from '../entities/landmark/load';
import type { Store } from '../entities/store/types';
import type { EngineData } from '../map/engine';

const decorArt = import.meta.glob('../../content/map/decor/*.pixel.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadContent(stores: Store[]): EngineData {
  const landmarks = loadLandmarks();
  const uses = props.decor.map((p) => `<use href="#px-${p.kind}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`).join('');
  const withLand = (s: string) => s.split('{{LAND}}').join(land.landPath);
  return {
    roads,
    land,
    props,
    landmarks,
    pixelDefs: Object.values(landmarks.art).join('') + Object.values(decorArt).join('') + withLand(terrainDefs),
    terrain: withLand(terrain).replace('<!--PROPS-->', uses),
    characters: { head, body, wave, palette, looks, chief, cat },
    stores,
    kioskArea: { name: kioskArea.name, polygon: kioskArea.polygon.map(([lat, lng]) => [lat, lng] as [number, number]) },
    chiefTalk: { name: chiefTalk.name, portrait: chiefTalk.portrait, pages: chiefTalk.pages },
  };
}
