import dayUrl from '../../shared/styles/theme.day.css?url';
import nightUrl from '../../shared/styles/theme.night.css?url';

/* 낮/밤 테마.
   · mountThemes: 스타일시트 두 벌(css-day / css-night)을 id를 붙여 끼운다. 처음 테마는 주소의 ?theme= → 브라우저에 기억된 선택 → 밤.
   · setTheme: 스타일시트를 바꿔 끼우고, 그림의 색은 요소마다 남겨 둔 낮 색(data-df·data-ds)과 맞바꾼다. 밤 장식은 낮 스타일시트가 숨긴다.
   · bindThemeButton: 버튼 글씨·aria 갱신과 클릭 토글. */
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
  const active = theme === 'day' ? day : night;
  return new Promise((resolve) => {            // 스타일이 들어온 뒤에 화면을 그린다 (맨화면 깜빡임 방지)
    active.addEventListener('load', () => resolve(), { once: true });
    active.addEventListener('error', () => resolve(), { once: true });
  });
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

export function bindThemeButton(btn: HTMLElement) {
  const label = (t: Theme) => { btn.textContent = t === 'day' ? '☾ 밤' : '☀ 낮'; btn.setAttribute('aria-label', t === 'day' ? '밤 테마로 바꾸기' : '낮 테마로 바꾸기'); };
  btn.addEventListener('click', () => setTheme(currentTheme() === 'day' ? 'night' : 'day', true));
  onThemeChange(label); label(currentTheme());
}
