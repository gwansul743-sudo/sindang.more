import meta from '../../../content/landmarks/landmarks.json';
import type { LandmarkSet } from './types';

/* content/landmarks 읽기. 그림 파일 1개 = 랜드마크 그림 1개. 그림을 바꾸려면 .pixel.txt만 바꾸면 된다.
   그림 자체는 빌드 때 index.html 에 들어간다(표지 섬 그림과 같이 쓰려고). 그림 파일이 없으면 그쪽(vite.config.ts staticShell)에서 빌드가 멈춘다 */

export function loadLandmarks(): LandmarkSet {
  return meta;
}
