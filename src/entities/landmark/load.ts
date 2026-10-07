import meta from '../../../content/landmarks/landmarks.json';
import type { LandmarkSet } from './types';

/* content/landmarks 읽기. 그림 파일 1개 = 랜드마크 그림 1개. 그림을 바꾸려면 .pixel.txt만 바꾸면 된다. */
const art = import.meta.glob('../../../content/landmarks/*.pixel.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadLandmarks(): LandmarkSet {
  const byName: Record<string, string> = {};
  for (const path in art) byName[path.split('/').pop()!.replace('.pixel.txt', '')] = art[path];
  for (const l of meta.items) if (!byName[l.art]) throw new Error(`랜드마크 그림이 없습니다: content/landmarks/${l.art}.pixel.txt`);
  return { ...meta, art: byName };
}
