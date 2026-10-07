export interface Landmark { name: string; lat: number; lng: number; art: string }   // art = content/landmarks/<art>.pixel.txt
export interface LandmarkSet { worldScale: number; minPx: number; items: Landmark[]; art: Record<string, string> }
