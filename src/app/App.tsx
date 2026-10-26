import { useEffect, useRef } from 'react';
import markup from './legacy-markup.html?raw';
import { loadContent } from './content';
import { createEngine } from '../map/engine';
import { listStores } from '../entities/store/api';
import { mountIntroFoil } from '../features/intro-foil/foil';

/* 조립만 한다.
   지금은 옛 마크업을 통째로 꽂고 임시 엔진을 한 번 켜는 것이 전부다.
   4단계에서 상단바·사이드패널·바텀시트·관리 패널을 features/ 컴포넌트로 바꿔 끼우며 legacy-markup.html을 줄여 나간다. */
let booted = false;   // 임시 엔진은 문서의 id에 의존하므로 한 번만 켠다

export function App() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (booted || !host.current) return;
    booted = true;
    host.current.innerHTML = markup;
    mountIntroFoil(document.getElementById('intro'));
    listStores().then((stores) => createEngine(loadContent(stores)));
  }, []);
  return <div ref={host} style={{ display: 'contents' }} />;
}
