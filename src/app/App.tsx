import { useEffect } from 'react';
import { loadContent } from './content';
import { createEngine } from '../map/engine';
import { listStores } from '../entities/store/api';
import { mountIntroFoil } from '../features/intro-foil/foil';
import { mountClickBurst } from '../features/click-burst/burst';

/* 조립만 한다.
   지금은 임시 엔진을 한 번 켜는 것이 전부다. 옛 마크업(legacy-markup.html)은 빌드 때 index.html 에 그대로 들어가 있다(vite.config.ts staticShell — 표지를 JS 없이 바로 그리려고).
   4단계에서 상단바·사이드패널·바텀시트·관리 패널을 features/ 컴포넌트로 바꿔 끼우며 legacy-markup.html을 줄여 나간다. */
let booted = false;   // 임시 엔진은 문서의 id에 의존하므로 한 번만 켠다

export function App() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    mountIntroFoil(document.getElementById('intro'));
    mountClickBurst();
    listStores().then((stores) => {
      createEngine(loadContent(stores));
      if ((window as { __openEarly?: number }).__openEarly) document.getElementById('openMap')?.click();   // JS 가 오기 전에 누른 '탐험 시작'(legacy-markup.html 인라인 스크립트)
    });
  }, []);
  return null;
}
