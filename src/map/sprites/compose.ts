/* 픽셀 스프라이트 격자 — 문자 한 칸 = 색 한 칸. '.' 은 빈칸, 'o' 는 외곽선.
   격자는 17×18칸(그림 폭 15 + 양옆 여백 1씩, 흔드는 손 자리), 발끝이 16번째 줄. 파츠 격자는 content/characters/parts/*.json. */
import { el } from '../svg';

export type Grid = string[][];
export type Rows = string[];                       // 파츠 한 장: 문자열 줄 배열 (폭 15)
export type Extra = [row: number, col: number, ch: string];   // 격자 위에 덧찍는 칸 (팔·가방·쪽머리)
export type Palette = Record<string, string>;      // 문자 → 색

export const SW = 17, SH = 18, FEET = 16, PAD = 1;
export const SHADOW = 'M4 15h9v1h-9zM5 16h7v1h-7z';   // 발밑 그림자 (주민·이장님)

/* 머리·몸통·바지·다리를 위에서 아래로 쌓아 발끝에 맞춘다. 다리가 길면(pass) 몸이 한 칸 올라간다 */
export function compose(head: Rows, torso: Rows, pants: string, legs: Rows, extra?: Extra[]): Grid {
  const rows = head.concat(torso, [pants], legs);
  const top = FEET - rows.length;
  const g: Grid = Array.from({ length: SH }, () => Array(SW).fill('.'));
  rows.forEach((r, i) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') g[top + i][x + PAD] = r[x]; });
  (extra || []).forEach(([r, c, ch]) => { if (g[top + r]) g[top + r][c] = ch; });
  return g;
}

/* 폭 17 줄들을 그대로 발끝에 맞춰 놓는다 (여백 없는 도안: 고양이) */
export function composeRaw(rows: Rows): Grid {
  const g: Grid = Array.from({ length: SH }, () => Array(SW).fill('.'));
  rows.forEach((r, i) => { for (let x = 0; x < SW; x++) if (r[x] !== '.') g[FEET - rows.length + i][x] = r[x]; });
  return g;
}

/* 그림 둘레 한 칸을 'o'(외곽선)로 */
export function outline(g: Grid): Grid {
  const o = g.map((r) => r.slice());
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (g[y][x] === '.') {
    if ((g[y - 1] && g[y - 1][x] !== '.') || (g[y + 1] && g[y + 1][x] !== '.') || (g[y][x - 1] && g[y][x - 1] !== '.') || (g[y][x + 1] && g[y][x + 1] !== '.')) o[y][x] = 'o';
  }
  return o;
}

/* 격자 → 색별 path (가로로 이어진 칸을 한 사각형으로) */
export function renderGrid(g: Grid, col: Palette, parent: SVGElement): void {
  const by: Record<string, string[]> = {};
  for (let y = 0; y < SH; y++) { let x = 0; while (x < SW) { const ch = g[y][x]; if (ch === '.') { x++; continue; }
    let x2 = x; while (x2 < SW && g[y][x2] === ch) x2++; (by[ch] = by[ch] || []).push(`M${x} ${y}h${x2 - x}v1h${x - x2}z`); x = x2; } }
  for (const ch in by) el('path', { d: by[ch].join(''), fill: col[ch] || '#2b3f33' }, parent);
}

/* 프레임 여러 장을 한 <g> 안에 숨겨 두고 이름으로 바꿔 보인다 */
export interface FrameSet { body: SVGGElement; show(name: string): void }
export function mountFrames(parent: SVGGElement, frames: Record<string, Grid>, col: Palette): FrameSet {
  const body = el('g', {}, parent), els: Record<string, SVGGElement> = {};
  for (const name in frames) { const fg = el('g', { display: 'none' }, body); renderGrid(frames[name], col, fg); els[name] = fg; }
  let shown: string | null = null;
  return { body, show(name) { if (shown === name) return; if (shown) els[shown].setAttribute('display', 'none'); els[name].removeAttribute('display'); shown = name; } };
}
