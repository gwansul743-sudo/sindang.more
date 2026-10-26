export interface Landmark { name: string; lat: number; lng: number; art: string }   // art = content/landmarks/<art>.pixel.txt
export interface LandmarkSet { worldScale: number; minPx: number; items: Landmark[] }   // 그림(<symbol id="px-<art>">)은 index.html 에 정적으로 들어간다(vite.config.ts staticShell)
