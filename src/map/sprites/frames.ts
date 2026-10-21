/* 파츠 → 프레임 묶음. 주민(걷기 4방향×4 + 손인사 2), 이장님(서기·손인사 2·꾸벅), 고양이(앉기 2·기쁨 2).
   파츠 파일의 모양: content/characters/parts/{head,body,wave}.json, chief.json, cat.json */
import { compose, composeRaw, outline, type Grid, type Rows, type Extra } from './compose';

export type HairStyle = 'short' | 'bob' | 'hat';
export type View = 'front' | 'side' | 'back';
export interface HeadParts { front: Record<HairStyle, Rows>; side: Record<HairStyle, Rows>; back: Record<HairStyle, Rows>; wave: Record<HairStyle, Rows> }
export interface BodyView { torso: Rows; pants: string; stand: Rows; pass: Rows; s1: Rows; s2: Rows }
export interface BodySide extends BodyView { torsoF: Rows; torsoB: Rows }
export interface BodyParts { front: BodyView; back: BodyView; side: BodySide }
export interface WaveParts { torso: Rows; arm: Extra[][] }
export interface CharacterParts { head: HeadParts; body: BodyParts; wave: WaveParts }

export function walkerFrames(parts: CharacterParts, style: HairStyle, bun?: boolean | number, bag?: boolean | number): Record<string, Grid> {
  const { head: HEAD, body: BODY, wave } = parts, F: Record<string, Grid> = {};
  const add = (name: string, view: View, torso: Rows, legs: Rows, extra?: Extra[], headSet?: Record<HairStyle, Rows>) => {
    const ex = (extra || []).slice();
    if (bun && style !== 'hat') ex.push([-1, 7, 'h'], [-1, 8, 'h'], [-1, 9, 'h']);
    if (bag && view !== 'side') ex.push([11, 4, 'g'], [11, 5, 'g'], [12, 4, 'g'], [12, 5, 'g']);
    if (bag && view === 'side') ex.push([11, 8, 'g'], [11, 9, 'g'], [12, 8, 'g'], [12, 9, 'g']);
    F[name] = outline(compose((headSet || HEAD[view])[style], torso, BODY[view].pants, legs, ex));
  };
  (['front', 'back'] as const).forEach((v) => { const b = BODY[v]; add(v + '0', v, b.torso, b.stand); add(v + '1', v, b.torso, b.s1); add(v + '2', v, b.torso, b.pass); add(v + '3', v, b.torso, b.s2); });
  const s = BODY.side; add('side0', 'side', s.torso, s.stand); add('side1', 'side', bag ? s.torso : s.torsoF, s.s1); add('side2', 'side', s.torso, s.pass); add('side3', 'side', bag ? s.torso : s.torsoB, s.s2);
  add('wave0', 'front', wave.torso, BODY.front.stand, wave.arm[0], HEAD.wave); add('wave1', 'front', wave.torso, BODY.front.stand, wave.arm[1], HEAD.wave);
  return F;
}

export interface ChiefArt { head: Rows; headWave: Rows; torso: Rows; torsoWave: Rows; torsoBow: Rows; arm: Extra[][] }
export function chiefFrames(body: BodyParts, A: ChiefArt): Record<string, Grid> {
  const b = body.front;
  return {
    front0: outline(compose(A.head, A.torso, b.pants, b.stand)),
    wave0: outline(compose(A.headWave, A.torsoWave, b.pants, b.stand, A.arm[0])),
    wave1: outline(compose(A.headWave, A.torsoWave, b.pants, b.stand, A.arm[1])),
    bow: outline(compose(['...............'].concat(A.head), A.torsoBow, b.pants, b.stand)),   /* 머리가 한 칸 내려온 모습 */
  };
}

export interface CatArt { head: Rows; low: Rows; tailA: Rows; tailB: Rows; chestSit: string; chestHappy: string }
export function catFrames(A: CatArt): Record<string, Grid> {
  const mk = (tail: Rows, chest: string) => outline(composeRaw(A.head.concat(tail, [chest], A.low)));
  return { sit0: mk(A.tailA, A.chestSit), sit1: mk(A.tailB, A.chestSit), happy0: mk(A.tailA, A.chestHappy), happy1: mk(A.tailB, A.chestHappy) };
}
