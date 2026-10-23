/* 지도 엔진의 바깥 얼굴. React·Supabase를 모른다. 데이터를 받아 그리고, 조작 함수 몇 개를 돌려준다.
   지금은 legacy/engine.legacy.js(옛 스크립트를 그대로 옮긴 임시 엔진)를 켜는 얇은 껍데기다.
   3단계에서 projection.ts → viewport.ts → layers/ → actors/ → night.ts 순으로 옮겨 오면 이 파일이 그것들을 조립하게 된다.
   그때 on(event) (store:select, character:click 등)을 여기에 추가한다. */
// @ts-ignore — 임시 엔진은 타입 검사 대상이 아니다
import { bootLegacy } from './legacy/engine.legacy.js';

export interface EngineData {
  roads: { W: number; H: number; p: Record<string, string> };
  land: { bbox: { lon0: number; lon1: number; lat0: number; lat1: number }; focus: { x: number; y: number }; districts: { name: string; lat: number; lng: number }[]; landPath: string };
  props: { decor: { kind: string; x: number; y: number; w: number; h: number }[]; lamps: number[][] };
  landmarks: { worldScale: number; minPx: number; items: { name: string; lat: number; lng: number; art: string }[] };
  pixelDefs: string;
  terrain: string;
  characters: Record<string, unknown>;
  stores: unknown[];
  kioskArea?: { name: string; polygon: [number, number][] };   // 전시 모드에서 강조할 구역 (content/map/kiosk-area.json)
  chiefTalk?: { name: string; portrait: string; pages: string[][] };   // 이장님 인터뷰 대본 (content/characters/chief-talk.json)
  kioskCut?: { name: string; polygon: [number, number][] };   // 전시 보드 재단선 (content/map/kiosk-cut.json)
  kioskBoard?: { title?: string; sub?: string; props?: { kind: string; lat: number; lng: number; h?: number }[] };   // 전시 보드 추가 장식·제목 (content/map/kiosk-board.json)
}

export interface Engine {
  centerOn(x: number, y: number, scale?: number): void;
  select(store: unknown, pan?: boolean): void;
  setTheme(theme: 'day' | 'night', remember?: boolean): void;
  getStores(): unknown[];
  proj(lat: number, lng: number): [number, number];
  unproj(x: number, y: number): [number, number];
}

export function createEngine(data: EngineData): Engine {
  return bootLegacy(data) as Engine;
}
