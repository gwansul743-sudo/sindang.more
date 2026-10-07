/* 이장님의 강아지 — 이장님 오른쪽 cells 칸에 앉아 꼬리를 흔들다가, 포인터가 다가오면 혀를 내밀고 깡충깡충.
   도안·색·자리는 content/characters/dog.json. */
import { el } from '../svg';
import { SW, FEET, mountFrames, type FrameSet, type Palette } from '../sprites/compose';
import { dogFrames, type DogArt } from '../sprites/frames';
import type { Actor, Frame } from './scene';

export interface DogData { cells: number; col: Palette; shadow: string; art: DogArt }

export class Dog implements Actor {
  g: SVGGElement; body: SVGGElement; fs: FrameSet; x: number; y: number; ox = 0; oy = 0; front = false; lastT = ''; lastB = '';
  private cells: number; private happyUntil = 0;

  constructor(parent: SVGGElement, d: DogData, at: { x: number; y: number }) {
    this.x = at.x; this.y = at.y; this.cells = d.cells;
    this.g = el('g', { class: 'wk wk-dog' }, parent);
    el('path', { d: d.shadow, fill: '#24382d', opacity: '.22', transform: `translate(${-SW / 2},${-FEET})` }, this.g);
    this.fs = mountFrames(this.g, dogFrames(d.art), d.col); this.body = this.fs.body;
  }

  tick(f: Frame) {
    const { now, V, s, q, R, P, live, still } = f;
    const sx = (this.x - V.x) * s + this.cells * q, sy = (this.y - V.y) * s;   /* 어느 줌에서나 같은 간격 */
    const pd = live && P ? Math.hypot(P.x - sx, P.y - (sy - 4 * q)) : Infinity, near = pd < R;
    if (near && now - P!.t < 2400) this.happyUntil = now + 900;
    const happy = now < this.happyUntil && !still, fr = Math.floor(now / (happy ? 140 : 450)) % 2;
    this.fs.show((happy ? 'happy' : 'sit') + (still ? 0 : fr));
    f.place(this, sx, sy, 1, happy ? fr : 0);
  }
}
