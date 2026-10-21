/* 이장님의 고양이 — 이장님 오른쪽 cells 칸에 가만히 앉아 있다가, 이장님이 손을 흔드는 동안만 같은 박자로 꼬리를 흔든다.
   도안·색·자리는 content/characters/cat.json. */
import { el } from '../svg';
import { SW, FEET, mountFrames, type FrameSet, type Palette } from '../sprites/compose';
import { catFrames, type CatArt } from '../sprites/frames';
import type { Actor, Frame } from './scene';
import type { Chief } from './chief';

export interface CatData { cells: number; col: Palette; shadow: string; art: CatArt }

export class Cat implements Actor {
  g: SVGGElement; body: SVGGElement; fs: FrameSet; x: number; y: number; ox = 0; oy = 0; front = false; lastT = ''; lastB = '';
  private cells: number; private chief: Chief;

  constructor(parent: SVGGElement, d: CatData, chief: Chief) {
    this.chief = chief; this.x = chief.x; this.y = chief.y; this.cells = d.cells;
    this.g = el('g', { class: 'wk wk-cat' }, parent);
    el('path', { d: d.shadow, fill: '#24382d', opacity: '.22', transform: `translate(${-SW / 2},${-FEET})` }, this.g);
    this.fs = mountFrames(this.g, catFrames(d.art), d.col); this.body = this.fs.body;
  }

  tick(f: Frame) {
    const { now, V, s, still, kiosk } = f;
    const mul = kiosk ? 0.5 : 1, q = f.q * mul;   /* 전시 모드: 이장님과 같이 절반 */
    const sx = (this.x - V.x) * s + this.cells * q, sy = (this.y - V.y) * s;   /* 어느 줌에서나 같은 간격 */
    const fr = this.chief.waving && !still ? Math.floor((now - this.chief.waveStart) / 170) % 2 : 0;   /* 이장님 팔과 같은 박자 */
    this.fs.show('sit' + fr);
    f.place(this, sx, sy, 1, 0, mul);
  }
}
