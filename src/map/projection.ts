/* 위경도 ↔ 지도 좌표 (웹 메르카토르). 순수 함수. DOM·React를 모른다.
   bbox = content/map/land.json 의 bbox, W·H = content/map/roads.json 의 캔버스 크기. */
export interface BBox { lon0: number; lon1: number; lat0: number; lat1: number }
export type XY = [number, number];
export type LatLng = [number, number];

export interface Projection {
  W: number;
  H: number;
  bbox: BBox;
  proj(lat: number, lng: number): XY;
  unproj(x: number, y: number): LatLng;
  inBBox(lat: number, lng: number): boolean;
}

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export function createProjection(bbox: BBox, W: number, H: number): Projection {
  const my0 = merc(bbox.lat0), my1 = merc(bbox.lat1);
  return {
    W, H, bbox,
    proj: (lat, lng) => [((lng - bbox.lon0) / (bbox.lon1 - bbox.lon0)) * W, ((my1 - merc(lat)) / (my1 - my0)) * H],
    unproj: (x, y) => {
      const lng = bbox.lon0 + (x / W) * (bbox.lon1 - bbox.lon0);
      const my = my1 - (y / H) * (my1 - my0);
      const lat = ((2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180) / Math.PI;
      return [lat, lng];
    },
    inBBox: (lat, lng) => lat >= bbox.lat0 && lat <= bbox.lat1 && lng >= bbox.lon0 && lng <= bbox.lon1,
  };
}
