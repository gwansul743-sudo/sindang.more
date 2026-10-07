import dayUrl from '../../shared/styles/theme.day.css?url';
import nightUrl from '../../shared/styles/theme.night.css?url';

/* 낮/밤 스타일시트 두 벌을 id(css-day / css-night)를 붙여 끼운다.
   처음 테마: 주소의 ?theme=day|night → 브라우저에 기억된 선택 → 밤.
   버튼으로 바꾸는 동작(setTheme)은 아직 임시 엔진 안에 있다. 4단계에서 이 폴더로 옮긴다. */
export type Theme = 'day' | 'night';

export function initialTheme(): Theme {
  try {
    const q = /[?&]theme=(day|night)/.exec(location.search);
    return (q ? q[1] : localStorage.getItem('more-theme') || 'night') as Theme;
  } catch {
    return 'night';
  }
}

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
