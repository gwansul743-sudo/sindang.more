import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 개발 서버: CSS 말고 소스(ts·js·json·html·txt)가 바뀌면 화면 전체를 새로 고친다(10-23).
   임시 엔진(engine.legacy.js)은 문서에 한 번만 켜지는 구조라, App 만 갈아 끼우는 HMR 을 하면 옛 엔진이 떨어진 지도에서 계속 돌며
   html 에 kb-on 같은 상태를 남긴다 → 새 지도의 땅이 가려지고 바다만 리넨으로 보이던 오류. 배포 빌드와는 상관없다. */
const fullReload = (): Plugin => ({
  name: 'full-reload-non-css',
  apply: 'serve',
  handleHotUpdate({ file, server }) {
    if (/\.(css)$/.test(file)) return;
    /* 앱 소스만(TASK_20): 전엔 저장소 안 아무 파일(_bus 의 작업 쪽지·기록, 보고서 .md 등)이 바뀌어도 열려 있던 화면이 새로 고쳐져 인트로로 돌아갔다 */
    if (!/[\\/](src|content)[\\/]|[\\/]index\.html$/.test(file)) return [];
    server.ws.send({ type: 'full-reload' });
    return [];
  },
});

/* 첫 화면(표지)을 JS 없이 바로 그린다(10-26). JS 를 다 받고 실행해야 표지가 보이던 것(느린 폰 4초대)을 줄이려고.
   · <!--legacy-markup--> 자리에 src/app/legacy-markup.html 을 그대로 끼운다(임시 엔진이 보는 id 는 같다. App 은 더 이상 innerHTML 하지 않는다).
   · 낮·밤 테마 시트는 인라인 스크립트(themeHead·themeLinks)가 document.write 로 넣는다 — 파서가 넣은 <link> 와 같이 렌더를 막는다(표지가 스타일 없이 번쩍이지 않게).
     주소는 빌드면 해시 붙은 파일, 개발 서버면 소스 경로. mountThemes 는 이 <link id="css-day|css-night"> 를 그대로 쓴다. 처음 테마 고르는 규칙은 mountThemes.initialTheme 과 같게
   · <!--pixel-defs--> 자리에 랜드마크·장식 그림(content/landmarks·map/decor 의 *.pixel.txt = <symbol id="px-…">) — 표지 섬 그림과 지도가 같이 쓴다(지도 엔진은 더 이상 넣지 않는다).
     파일 이름 순(예전 import.meta.glob 순서와 같게) */
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const MARKUP = here('./src/app/legacy-markup.html');
const pixelDefs = () => {
  const have = new Set(readdirSync(here('./content/landmarks/')));
  for (const l of JSON.parse(readFileSync(here('./content/landmarks/landmarks.json'), 'utf8')).items as { art: string }[])
    if (!have.has(l.art + '.pixel.txt')) throw new Error(`랜드마크 그림이 없습니다: content/landmarks/${l.art}.pixel.txt`);
  return ['./content/landmarks/', './content/map/decor/'].flatMap((d) => readdirSync(here(d)).filter((f) => f.endsWith('.pixel.txt')).sort().map((f) => readFileSync(here(d + f), 'utf8'))).join('');
};
/* 테마 스크립트 두 개: ① head 맨 앞 — 처음 테마를 정해 html[data-theme] 에 적고 그 시트를 preload(글꼴 CSS 를 기다리지 않고 바로 받기 시작)
   ② </head> 앞 — 그 테마로 두 시트를 <link> 로(인라인 스크립트는 앞의 스타일시트가 다 올 때까지 기다리므로 적용 순서는 예전처럼 번들 CSS 뒤) */
const themeHead = (day: string, night: string) => `<script>(function(){var t='night';try{var q=/[?&]theme=(day|night)/.exec(location.search);t=q?q[1]:localStorage.getItem('more-theme')||'night'}catch(e){}if(t!=='day')t='night';document.documentElement.setAttribute('data-theme',t);
document.write('<link rel="preload" as="style" href="'+(t==='day'?'${day}':'${night}')+'">')})()</script>`;
const themeLinks = (day: string, night: string) => `<script>(function(){var d=document.documentElement.getAttribute('data-theme')==='day';
document.write('<link id="css-day" rel="stylesheet" href="${day}" media="'+(d?'all':'not all')+'"><link id="css-night" rel="stylesheet" href="${night}" media="'+(d?'not all':'all')+'">')})()</script>`;
const staticShell = (): Plugin => ({
  name: 'static-shell',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const asset = (re: RegExp) => { const a = Object.values(ctx.bundle ?? {}).find((o) => o.type === 'asset' && re.test(o.fileName)); return a && '/' + a.fileName; };
      const day = ctx.bundle ? asset(/theme\.day-[\w-]+\.css$/) : '/src/shared/styles/theme.day.css';
      const night = ctx.bundle ? asset(/theme\.night-[\w-]+\.css$/) : '/src/shared/styles/theme.night.css';
      if (!day || !night) throw new Error('static-shell: 테마 시트를 번들에서 못 찾음');
      return html.replace('<meta charset="utf-8">', (m) => m + '\n' + themeHead(day, night)).replace('</head>', () => themeLinks(day, night) + '\n</head>').replace('<!--legacy-markup-->', () => readFileSync(MARKUP, 'utf8'))
        .replace('<!--pixel-defs-->', () => `<svg id="px-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${pixelDefs()}</defs></svg>`);
    },
  },
});

export default defineConfig({
  plugins: [react(), fullReload(), staticShell()],
  build: { chunkSizeWarningLimit: 1200 },
});
