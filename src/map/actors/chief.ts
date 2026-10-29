/* 이장님 — 정해진 자리에 서 있다가, 포인터가 다가오면 폴짝 뛰고 손을 흔든 뒤 꾸벅 인사. 머리 위에 빨간 세모(NPC 표시). 발밑 이름표는 chief.json 에 name 이 있을 때만(10-28 '신당 5길' 이름표를 뺐다).
   자리와 도안·색·표시·이름은 content/characters/chief.json.
   상인회 매니저님(10-29, content/characters/manager.json)도 같은 배우다 — seated(벤치에 앉음)면 손은 흔들어도 폴짝 뛰지 않는다. cls 로 g 에 class 를 더 붙인다(wk-manager). */
import { el } from '../svg';
import { SW, FEET, SHADOW, mountFrames, type FrameSet, type Palette } from '../sprites/compose';
import { chiefFrames, type BodyParts, type ChiefArt } from '../sprites/frames';
import { HIT_TOP, HIT_H, overBody, HoverProbe, type Actor, type Frame } from './scene';

export interface ChiefData {
  name?: string;   // 발밑 이름표 (없으면 안 그림)
  seated?: boolean;   // 앉아 있다(폴짝 안 뜀) — 매니저님
  cls?: string;       // g 에 덧붙일 class
  x: number; y: number; col: Palette; art: ChiefArt;
  mark: { outline: string; fill: string; shine: string; colors: { outline: string; fill: string; shine: string } };
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Chief implements Actor {
  g: SVGGElement; body: SVGGElement; fs: FrameSet; x: number; y: number; ox = 0; oy = 0; front = false; lastT = ''; lastB = '';
  private mark: SVGGElement; private markB = -1;
  private label: SVGTextElement | null = null; private labelQ = 0;
  private mode: 'stand' | 'wave' | 'bow' = 'stand'; private until = 0; private nextPause = rnd(8, 16);
  private armed = true; private waveMin = 0; private waveEnd = 0;
  waveStart = 0;                                   /* 고양이가 꼬리 박자를 맞추는 데 읽는다 */
  private seated: boolean;
  get waving() { return this.mode === 'wave'; }
  onClick?: () => void;
  hitHalf = 6.5;                  /* 몸 판정 칸 가로 반폭(칸). 모자까지 가로 13칸 */
  hover = new HoverProbe();       /* 엔진이 hover.onHover 를 단다 */

  constructor(parent: SVGGElement, body: BodyParts, c: ChiefData) {
    this.x = c.x; this.y = c.y; this.seated = !!c.seated;
    this.g = el('g', { class: 'wk wk-chief' + (c.cls ? ' ' + c.cls : '') }, parent);
    el('path', { d: SHADOW, fill: '#24382d', opacity: '.22', transform: `translate(${-SW / 2},${-FEET})` }, this.g);
    this.fs = mountFrames(this.g, chiefFrames(body, c.art), c.col); this.body = this.fs.body;
    this.mark = el('g', { class: 'wk-mark' }, this.g); const M = c.mark;
    el('path', { d: M.outline, fill: M.colors.outline }, this.mark); el('path', { d: M.fill, fill: M.colors.fill }, this.mark); el('path', { d: M.shine, fill: M.colors.shine }, this.mark);
    if (c.name) { this.label = el('text', { class: 'wk-name', x: 0, 'text-anchor': 'middle' }, this.g); this.label.textContent = c.name; }
  }

  /* 마우스를 올리거나 누를 수 있게 — 스프라이트 칸 전체를 투명 사각형으로 잡는다(주민 makeClickable 과 같은 요령, 10-23) */
  makeHoverable() {
    if (this.g.classList.contains('wk-talk')) return;
    this.g.classList.add('wk-talk');
    const r = el('rect', { class: 'wk-hit', x: -this.hitHalf, y: -HIT_TOP, width: this.hitHalf * 2, height: HIT_H, fill: 'transparent' });   /* 그려진 몸(모자까지 가로 13·세로 16칸)만(10-23) */
    r.style.pointerEvents = 'visible';   /* 'all' 은 숨긴(visibility:hidden) 주민도 마우스를 받아, 이장님 대화 중 안 보이는 주민의 말풍선이 떴다(10-23) */ this.g.style.cursor = 'pointer'; this.g.insertBefore(r, this.g.firstChild);
  }

  tick(f: Frame) {
    const { now, dt, V, s, P, live, still, kiosk } = f;
    const mul = f.mul, q = f.q * mul;   /* 배율은 엔진이 준다(주민과 같이). 이름표는 px/q 환산이라 글자 크기는 그대로 */
    const sx = (this.x - V.x) * s, sy = (this.y - V.y) * s;
    const over = this.lastT !== 'off' && overBody(P, sx, sy, q, this.hitHalf), near = live && over;   /* 손 흔들기와 hover 말풍선이 같은 몸 판정 칸(10-26) */
    if (!near) this.armed = true;
    this.hover.step(over, P, now);
    if (near && this.mode !== 'wave' && (this.armed || (now - P!.t < 140 && now - this.waveEnd > 900))) { this.mode = 'wave'; this.waveStart = now; this.waveMin = now + 1200; this.armed = false; }
    if (this.mode === 'wave' && now > this.waveMin && !(near && now - P!.t < 2400)) { this.mode = 'bow'; this.until = now + 650; this.waveEnd = now; }   /* 손을 내리며 꾸벅 */
    if (this.mode === 'bow' && now > this.until) { this.mode = 'stand'; this.waveEnd = now; }
    if (this.mode === 'stand' && kiosk && !still) { this.nextPause -= dt; if (this.nextPause <= 0) { this.mode = 'wave'; this.waveStart = now; this.waveMin = now + rnd(1500, 2400); this.nextPause = rnd(10, 22); } }   /* 전시 모드: 가끔 먼저 인사 */
    let hop = 0;
    if (this.mode === 'wave') { const wt = now - this.waveStart, fr = Math.floor(wt / 170) % 2; this.fs.show('wave' + fr); if (!this.seated) hop = wt < 110 ? 1 : wt < 230 ? 2 : wt < 330 ? 1 : 1 - fr; }
    else this.fs.show(this.mode === 'bow' ? 'bow' : 'front0');
    const mb = still ? 0 : Math.floor(now / 520) % 2;   /* 세모: 0.52초마다 한 칸 오르내림 */
    if (mb !== this.markB) { this.mark.setAttribute('transform', `translate(${-SW / 2},${-FEET - mb})`); this.markB = mb; }
    /* 이름표: g 안의 1단위 = 화면 q px 이므로 px/q 로 환산. 랜드마크 이름표와 같은 글자 크기 공식 */
    if (this.label && q !== this.labelQ) { const fs = Math.min(15, Math.max(10, 9 + s * 1.2)); this.label.setAttribute('font-size', String(fs / q)); this.label.setAttribute('y', String((fs + 4) / q)); this.labelQ = q; }
    f.place(this, sx, sy, 1, hop, mul);
  }
}
