import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* 개발 서버: CSS 말고 소스(ts·js·json·html·txt)가 바뀌면 화면 전체를 새로 고친다(10-23).
   임시 엔진(engine.legacy.js)은 문서에 한 번만 켜지는 구조라, App 만 갈아 끼우는 HMR 을 하면 옛 엔진이 떨어진 지도에서 계속 돌며
   html 에 kb-on 같은 상태를 남긴다 → 새 지도의 땅이 가려지고 바다만 리넨으로 보이던 오류. 배포 빌드와는 상관없다. */
const fullReload = (): Plugin => ({
  name: 'full-reload-non-css',
  apply: 'serve',
  handleHotUpdate({ file, server }) {
    if (/\.(css)$/.test(file)) return;
    server.ws.send({ type: 'full-reload' });
    return [];
  },
});

export default defineConfig({
  plugins: [react(), fullReload()],
  build: { chunkSizeWarningLimit: 1200 },
});
