import dayUrl from '../../shared/styles/theme.day.css?url';
import nightUrl from '../../shared/styles/theme.night.css?url';
import './theme-toggle.css';

/* 낮/밤 테마.
   · mountThemes: 스타일시트 두 벌(css-day / css-night)을 id를 붙여 끼운다. 처음 테마는 주소의 ?theme= → 브라우저에 기억된 선택 → 밤.
   · setTheme: 스타일시트를 바꿔 끼우고, 그림의 색은 요소마다 남겨 둔 낮 색(data-df·data-ds)과 맞바꾼다. 밤 장식은 낮 스타일시트가 숨긴다.
   · switchTheme: 커튼으로 화면을 덮은 뒤 setTheme → 두 프레임 뒤 커튼을 걷는다(폰에서 전환 중간 프레임이 지지직거려 보이는 것을 숨김).
   · bindThemeButton: 버튼 글씨·aria 갱신과 클릭 토글(switchTheme). */
export type Theme = 'day' | 'night';
const KEY = 'more-theme';

export function initialTheme(): Theme {
  try {
    const q = /[?&]theme=(day|night)/.exec(location.search);
    return (q ? q[1] : localStorage.getItem(KEY) || 'night') as Theme;
  } catch {
    return 'night';
  }
}
export const currentTheme = (): Theme => (document.documentElement.getAttribute('data-theme') === 'day' ? 'day' : 'night');

let sheetsReady: Promise<void> = Promise.resolve();   // 낮·밤 시트가 둘 다 들어왔는지
export function mountThemes(): Promise<void> {
  const theme = initialTheme();
  document.documentElement.setAttribute('data-theme', theme);
  const add = (id: string, href: string, on: boolean) => {
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet'; link.href = href; link.media = on ? 'all' : 'not all';
    document.head.appendChild(link);
    return link;
  };
  const day = add('css-day', dayUrl, theme === 'day');
  const night = add('css-night', nightUrl, theme === 'night');
  const loaded = (l: HTMLLinkElement) => new Promise<void>((resolve) => {
    l.addEventListener('load', () => resolve(), { once: true });
    l.addEventListener('error', () => resolve(), { once: true });
  });
  sheetsReady = Promise.all([loaded(day), loaded(night)]).then(() => undefined);   // 꺼 둔 시트도 받아 둬야 바꿔 끼울 때 스타일 공백 프레임이 없다
  return loaded(theme === 'day' ? day : night);   // 처음 테마 시트가 들어온 뒤에 화면을 그린다 (맨화면 깜빡임 방지)
}

/* 그림 색 맞바꾸기: fill="밤 색" data-df="낮 색" (stroke 는 data-ds). 처음 바꿀 때 밤 색을 data-nf/ns 에 보관 */
export function paintTheme(t: Theme, root: ParentNode = document) {
  root.querySelectorAll<SVGElement>('[data-df],[data-ds]').forEach((e) => {
    if (e.dataset.df) { if (!e.dataset.nf) e.dataset.nf = e.getAttribute('fill') || ''; e.setAttribute('fill', t === 'day' ? e.dataset.df : e.dataset.nf); }
    if (e.dataset.ds) { if (!e.dataset.ns) e.dataset.ns = e.getAttribute('stroke') || ''; e.setAttribute('stroke', t === 'day' ? e.dataset.ds : e.dataset.ns); }
  });
}

const listeners = new Set<(t: Theme) => void>();
export const onThemeChange = (fn: (t: Theme) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setTheme(t: Theme, remember = false) {
  const cssDay = document.getElementById('css-day') as HTMLLinkElement | null, cssNight = document.getElementById('css-night') as HTMLLinkElement | null;
  if (cssDay && cssNight) { cssDay.media = t === 'day' ? 'all' : 'not all'; cssNight.media = t === 'day' ? 'not all' : 'all'; }
  document.documentElement.setAttribute('data-theme', t);
  paintTheme(t);
  if (remember) { try { localStorage.setItem(KEY, t); } catch { /* 저장 못 해도 동작 */ } }
  listeners.forEach((fn) => fn(t));
}

/* 커튼 전환: 덮기(.25s) → 시트 둘 다 준비될 때까지 대기 → 전환 중 CSS transition 끄고 setTheme → 두 프레임(재래스터화) → 걷기(.32s).
   전환 중에 다시 누르면 무시. prefers-reduced-motion 이면 덮고 걷기를 즉시 한다. */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settled = (e: HTMLElement, ms: number) => new Promise<void>((r) => {
  let done = false; const fin = () => { if (!done) { done = true; r(); } };
  e.addEventListener('transitionend', fin, { once: true }); setTimeout(fin, ms + 60);
});
let curtain: HTMLDivElement | null = null, switching = false;
export async function switchTheme(t: Theme, remember = false): Promise<void> {
  if (switching || t === currentTheme()) return;
  switching = true;
  try {
    if (!curtain) { curtain = document.createElement('div'); curtain.className = 'theme-curtain'; curtain.setAttribute('aria-hidden', 'true'); document.body.appendChild(curtain); }
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    curtain.dataset.to = t; curtain.classList.remove('out');
    await nextFrame();                                  // 색·transition 이 먼저 적용되게 한 프레임 띄운다
    curtain.classList.add('on');
    if (!quick) await settled(curtain, 250);
    await sheetsReady;
    document.documentElement.classList.add('theme-switching');
    setTheme(t, remember);
    await nextFrame(); await nextFrame();               // 스타일 재계산·큰 SVG 다시 그리기가 끝날 시간
    if (!quick) await new Promise<void>((r) => setTimeout(r, 120));   // 느린 폰은 타일 래스터가 늦게 끝난다 — 덮은 채 조금 더 기다린다
    document.documentElement.classList.remove('theme-switching');
    curtain.classList.add('out'); curtain.classList.remove('on');
    if (!quick) await settled(curtain, 320);
  } finally { switching = false; }
}

export function bindThemeButton(btn: HTMLElement) {
  const label = (t: Theme) => { btn.textContent = t === 'day' ? '☾ 밤' : '☀ 낮'; btn.setAttribute('aria-label', t === 'day' ? '밤 테마로 바꾸기' : '낮 테마로 바꾸기'); };
  btn.addEventListener('click', () => { void switchTheme(currentTheme() === 'day' ? 'night' : 'day', true); });
  onThemeChange(label); label(currentTheme());
}
