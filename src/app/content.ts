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
import kioskBoard from '../../content/map/kiosk-board.json';
import kioskCut from '../../content/map/kiosk-cut.json';
import chiefTalk from '../../content/characters/chief-talk.json';
import { loadLandmarks } from '../entities/landmark/load';
import type { Store } from '../entities/store/types';
import type { EngineData } from '../map/engine';

/* 마을 사람 인터뷰 대본(content/characters/villagers/*.json) — 파일 하나 = 주민 하나. 형식은 그 폴더의 파일 참고 */
const villagerFiles = import.meta.glob('../../content/characters/villagers/*.json', { import: 'default', eager: true }) as Record<string, { id: string; kind?: string; name: string; store?: string; hook: string; pages: string[]; fixed?: boolean; look?: { style: 'short' | 'bob' | 'hat'; bun?: number; bag?: number; col?: Record<string, string> } }>;

export function loadContent(stores: Store[]): EngineData {
  const landmarks = loadLandmarks();
  const uses = props.decor.map((p) => `<use href="#px-${p.kind}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`).join('');
  const withLand = (s: string) => s.split('{{LAND}}').join(land.landPath);
  return {
    roads,
    land,
    props,
    landmarks,
    pixelDefs: withLand(terrainDefs),   // 랜드마크·장식 그림(content/landmarks·map/decor 의 *.pixel.txt)은 index.html 의 #px-defs 에 정적으로(표지와 같이 쓴다, vite.config.ts staticShell)
    terrain: withLand(terrain).replace('<!--PROPS-->', uses),
    characters: { head, body, wave, palette, looks, chief, cat },
    stores,
    kioskArea: { name: kioskArea.name, polygon: kioskArea.polygon.map(([lat, lng]) => [lat, lng] as [number, number]) },
    villagers: Object.values(villagerFiles).filter((v) => v.pages && v.pages.length >= 3).map((v) => ({ id: v.id, kind: v.kind, name: v.name, store: v.store, look: v.look, hook: v.hook, pages: v.pages.slice(0, 8) })),   /* 3장 미만은 띄우지 않고, 8장 넘으면 자른다(설계 메모) */
    chiefTalk: { name: chiefTalk.name, pages: chiefTalk.pages },
    kioskCut: { name: kioskCut.name, polygon: kioskCut.polygon.map(([lat, lng]) => [lat, lng] as [number, number]) },
    kioskBoard: { hideRoads: (kioskBoard as { hideRoads?: (number[] | number[][])[] }).hideRoads, hideMain: (kioskBoard as { hideMain?: (number[] | number[][])[] }).hideMain, title: kioskBoard.title, sub: (kioskBoard as { sub?: string }).sub, titleAt: kioskBoard.titleAt, titleImg: (kioskBoard as { titleImg?: (string | number)[] }).titleImg, chiefAt: kioskBoard.chiefAt, props: kioskBoard.props, sky: kioskBoard.sky, waves: kioskBoard.waves },
  };
}
