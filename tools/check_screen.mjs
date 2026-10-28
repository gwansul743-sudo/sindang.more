#!/usr/bin/env node
/* 화면 확인 자동화 — CLAUDE.md §4의 확인 항목을 헤드리스 Chrome으로 돌린다.
   사용: node tools/check_screen.mjs [--baseline]  (먼저 npm run build)
   · vite preview 를 띄우고, 데스크톱(1280×800)·모바일(390×844)에서 인트로를 넘긴 뒤 숫자를 센다.
   · --baseline 이면 tools/.baseline.json 에 저장, 아니면 그 파일과 비교해 다르면 종료 코드 1.
   · 스크린샷은 tools/.shots/ 에 남긴다 (git 무시). 콘솔 오류가 있으면 실패. */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4199, URL_ = `http://localhost:${PORT}/`;
const BASE = join(ROOT, 'tools/.baseline.json'), SHOTS = join(ROOT, 'tools/.shots');
const baseline = process.argv.includes('--baseline');
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((ok, no) => { server.stdout.on('data', d => { if (String(d).includes('localhost')) ok(); }); server.on('exit', no); setTimeout(ok, 4000); });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const results = {};
const SNIPPET = () => ({
  가게점: document.querySelectorAll('.dot').length,
  주민: document.querySelectorAll('.wk').length,
  장식: document.querySelectorAll('.pixel-props use').length,
  가로등: document.querySelectorAll('.night-lamps circle').length,
  테마: document.documentElement.dataset.theme,
  도로: document.querySelectorAll('.roads path').length,
  랜드마크: document.querySelectorAll('.lms .lm').length,
  랜드마크이름표: document.querySelectorAll('.lm-labels text').length,
  권역: document.querySelectorAll('text.dist').length,
  주민프레임: document.querySelectorAll('.wk g[display], .wk g:not([display])').length,
  밤장식층: ['night-sky', 'night-ground', 'night-shadows', 'night-houselight'].filter(c => document.querySelector('.' + c)).length,
  비네트: !!document.querySelector('.night-vignette'),
  svg층순서: [...document.getElementById('svg').children].map(e => (e.getAttribute('class') || e.tagName).split(' ')[0]).join('>'),
  테마버튼: document.getElementById('theme')?.textContent,
  이장님그림: [...document.querySelectorAll('.wk-chief path')].map(p => p.getAttribute('d') + p.getAttribute('fill')).join('|').length + ':' + [...document.querySelectorAll('.wk-chief path')].map(p => p.getAttribute('d') + p.getAttribute('fill')).join('|').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
  고양이그림: [...document.querySelectorAll('.wk-cat path')].map(p => p.getAttribute('d') + p.getAttribute('fill')).join('|').length + ':' + [...document.querySelectorAll('.wk-cat path')].map(p => p.getAttribute('d') + p.getAttribute('fill')).join('|').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
  /* 주민그림칸수는 뺐다(10-28): 가게 주민을 무작위로 두 명씩 내보내서, 누가 뽑히느냐(머리 모양·가방)에 따라 실행마다 달라진다 */
  viewBox: document.getElementById('svg').getAttribute('viewBox').split(' ').map(v => Math.round(+v)).join(' '),
});

for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
  for (const theme of ['night', 'day']) {
    const page = await browser.newPage(); await page.setViewport(vp);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(URL_ + '?theme=' + theme, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.dot', { timeout: 10000 });
    await page.click('#openMap'); await page.waitForFunction(() => document.getElementById('intro').classList.contains('done'), { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1200));   // centerOn 애니메이션 끝
    const r = await page.evaluate(SNIPPET);
    await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`) });
    // 동작 단언 (기준값과 비교하지 않음): 주민이 걷는지, 이장님이 손을 흔드는지
    if (name === 'desktop') {
      const before = await page.evaluate(() => [...document.querySelectorAll('.wk:not(.wk-chief):not(.wk-cat)')].find(w => !w.hasAttribute('display'))?.getAttribute('transform'));
      await new Promise(r => setTimeout(r, 700));
      const after = await page.evaluate(() => [...document.querySelectorAll('.wk:not(.wk-chief):not(.wk-cat)')].find(w => !w.hasAttribute('display'))?.getAttribute('transform'));
      r.동작_주민걷기 = before !== after;
      await page.evaluate(() => document.body.classList.remove('chief-hidden'));   // 이장님은 평소 숨김(전시 모드 연출 뒤 등장) — 호버 검사 동안만 보이게
      const box = await page.evaluate(() => { const b = document.querySelector('.wk-chief').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
      if (box[0] > 0 && box[0] < vp.width) {
        await page.mouse.move(box[0] - 5, box[1] - 5); await page.mouse.move(box[0], box[1], { steps: 3 }); await new Promise(r => setTimeout(r, 350));
        r.동작_이장님손인사 = await page.evaluate(() => [...document.querySelector('.wk-chief > g').children].findIndex(g => !g.hasAttribute('display')));   // 0 front0 · 1,2 wave · 3 bow
      } else r.동작_이장님손인사 = '화면 밖';
      await page.evaluate(() => document.body.classList.add('chief-hidden'));
    }
    // 가게 점 클릭 → 카드 열림·사진
    await page.evaluate(() => { const d = document.querySelector('.dot'); d.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await new Promise(r => setTimeout(r, 900));
    r.카드열림 = await page.evaluate(() => document.getElementById('sheet').classList.contains('open'));
    r.카드사진 = await page.evaluate(() => !!document.querySelector('#card .poster.photo'));
    r.카드제목 = await page.evaluate(() => document.querySelector('#card h3')?.textContent);
    await page.screenshot({ path: join(SHOTS, `${name}-${theme}-card.png`) });
    // 테마 버튼 → 바뀌는지
    await page.click('#theme'); await new Promise(r => setTimeout(r, 900));   /* 커튼 전환(.25s 덮기 → 교체 → .32s 걷기) */
    r.버튼후테마 = await page.evaluate(() => document.documentElement.dataset.theme);
    // 팬·줌: 휠 → 드래그 → 확대 버튼 뒤의 viewBox (휠·드래그는 즉시, 버튼은 애니메이션 뒤)
    const vb = () => page.evaluate(() => document.getElementById('svg').getAttribute('viewBox').split(' ').map(v => Math.round(+v)).join(' '));
    await page.mouse.move(200, 300); await page.mouse.wheel({ deltaY: -300 }); await new Promise(res => setTimeout(res, 300)); r.휠후 = await vb();   // 휠은 transform 으로 줌하고 0.15초 뒤 viewBox 커밋(viewport.ts, 10-25)
    await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(340, 280, { steps: 4 }); await page.mouse.move(380, 260, { steps: 4 }); await page.mouse.up(); r.드래그후 = await vb();
    await page.click('#zin'); await new Promise(res => setTimeout(res, 700)); r.확대버튼후 = await vb();   // +버튼은 0.42초 애니메이션이라 끝난 뒤 읽는다
    r.오류 = errors;
    results[`${name}/${theme}`] = r;
    await page.close();
  }
}
await browser.close(); server.kill();

const text = JSON.stringify(results, null, 1);
let failed = false;
if (baseline) { writeFileSync(BASE, text); console.log('기준값 저장:', BASE); }
else if (existsSync(BASE)) {
  const prev = JSON.parse(readFileSync(BASE, 'utf8'));
  for (const k in results) for (const f in results[k]) {
    if (f.startsWith('동작_')) continue;
    const a = JSON.stringify(prev[k]?.[f]), b = JSON.stringify(results[k][f]);
    if (a !== b) { failed = true; console.log(`✗ ${k} ${f}: 기준 ${a} → 지금 ${b}`); }
  }
}
for (const k in results) for (const f in results[k]) if (f.startsWith('동작_')) {
  const v = results[k][f], ok = f === '동작_주민걷기' ? v === true : (v === '화면 밖' || v === 1 || v === 2);
  if (!ok) { failed = true; console.log(`✗ ${k} ${f}: ${JSON.stringify(v)}`); }
}
for (const k in results) if (results[k].오류.length) { failed = true; console.log(`✗ ${k} 콘솔 오류:`, results[k].오류); }
console.log(text);
console.log(failed ? '실패' : '통과');
process.exit(failed ? 1 : 0);
