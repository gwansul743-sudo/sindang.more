/* 구글폼 응답 1건 → 마을 사람 대본(hook + 4~6장). 규칙은 설계 메모 5판 §3 · 상인설문_대본규칙.json. 순수 함수 — DOM·DB 를 모른다.
   · 입력: interviews.answers = { v: 1, pairs: [[열 이름, 값], …] } — 시트의 열 이름 그대로(Apps Script 가 공개해도 되는 열만 골라 보낸다).
     폼을 고쳐 같은 문항의 열이 두 벌 생겨도(옛 문장·새 문장, 단일·복수 선택) 번호('SQ1.' '문8-1.')나 문장 사전으로 찾고, 값이 있는 것 중 뒤쪽(새 열)을 쓴다.
   · 익명: SQ3(상호)는 폼에 '익명 처리'라고 안내돼 있어 쓰지 않는다 — 이름은 업종으로('밥집 사장님'), 1장도 '여기서 밥집 한 지 12년째예요.'
   · 순서 고정 + 되받기 틀: 소개 → 손님 → 생각(파트 A) → 우리만 하는 것(문8-1, 응답자 글) → 골목 이야기(문9-1, 응답자 글) → 10년 뒤(문30, 마지막).
     비어 있는 장은 틀째 빠진다. 3장 미만이면 null(띄우지 않음). 전체 230자를 넘으면 손님 → 이야기 순으로 덜어낸다(마지막 장은 남긴다).
   · 응답자 글: 50자를 넘으면 첫 문장만, 첫 문장도 50자를 넘으면 그 장을 뺀다. 전화번호·주소창·메일·욕설이 보이면 그 장을 뺀다(공개 전시).
   · 같은 응답이면 언제 만들어도 같은 대본(파트 A 고르기는 응답 id 를 씨앗으로). */

export interface FormAnswers { v?: number; pairs?: [string, string][] }
export interface FormScript { id: string; kind: 'form'; name: string; hook: string; pages: string[] }

const KIND: Record<string, { short: string; hook: string }> = {   /* SQ2 → 짧은 이름 · hook(상인설문_대본규칙.json hook_by_SQ2) */
  '한식·분식·일반 음식점': { short: '밥집', hook: '밥은 드셨어요? 잠깐 이야기 좀 들어 보실래요?' },
  '주점·포차': { short: '술집', hook: '한 잔 하고 가실래요? 잠깐 이야기 좀 들어 보실래요?' },
  '카페·디저트·베이커리': { short: '카페', hook: '잠깐 앉았다 가세요. 잠깐 이야기 좀 들어 보실래요?' },
  '판매(의류·잡화·식자재 등)': { short: '가게', hook: '구경만 하셔도 돼요. 잠깐 이야기 좀 들어 보실래요?' },
  '생활 서비스(미용·세탁·수리 등)': { short: '가게', hook: '이 골목에서 오래 했어요. 잠깐 이야기 좀 들어 보실래요?' },
  '제조·도매·공장': { short: '공장', hook: '여기가 원래 공장 골목이었어요. 잠깐 이야기 좀 들어 보실래요?' },
};
const OTHER = { short: '가게', hook: '잠깐 이야기 좀 들어 보실래요?' };
const HOW: Record<string, string | null> = { 'SNS·유튜브': 'SNS 보고', '지도앱·배달앱': '지도앱 보고', '지인 소개': '지인 소개로', '지나가다가': '지나가다가', 'TV·기사': '기사 보고', '잘 모르겠다': null };
const FUTURE: Record<string, string> = { '그렇다': '10년 뒤요? 아마 여기 있을 거예요.', '아니다': '10년 뒤요? 글쎄요, 그건 모르겠어요.', '모르겠다': '10년 뒤요? 글쎄요, 그건 모르겠어요.' };

/* 파트 A: 시트의 [문장](옛 문장·새 문장 두 벌) → 그 사람의 말(어미만 ~어요). null = 대본에서 뺌(상인회·재개발 — 개인 입장이 공개 지도에 드러남) */
const SAY = [
  '1|SNS 하는 가게만 손님이 있다|SNS를 하는 가게에 손님이 몰리는 편이다|SNS를 하는 가게에 손님이 몰리는 편이에요.',
  '2|낮에 오면 할 게 없다|낮 시간대에는 즐길 거리가 부족하다|낮 시간대에는 즐길 거리가 부족해요.',
  '3|명동이 살아나면서 여긴 죽었다|명동 상권이 살아나면서 이곳을 찾는 발길이 줄었다|명동 상권이 살아나면서 이곳을 찾는 발길이 줄었어요.',
  "4|힙당동은 이미 한물갔다|'힙당동' 열풍은 예전만 못하다|'힙당동' 열풍은 예전만 못해요.",
  '5|여기(우리 골목)까지는 사람들이 잘 안 들어온다|우리 골목까지는 방문객의 발길이 잘 닿지 않는다|우리 골목까지는 방문객의 발길이 잘 닿지 않아요.',
  '6|신당의 매력은 옛것과 새것이 섞여 있다는 것이다|신당의 매력은 옛것과 새것이 어우러져 있다는 것이다|신당의 매력은 옛것과 새것이 어우러져 있다는 거예요.',
  '7|상인회에 들어가도 뭐 하나 싶다|상인회 가입의 이점이 잘 와닿지 않는다|',
  '8|재개발 투표가 올라오면 무조건 반대로 찍는다|재개발에 대해서는 반대하는 편이다|',
  '9|한 건물에 주인이 여럿이라 재개발이 안 된다|건물 소유 관계가 복잡해 재개발이 쉽지 않다|',
  '10|젊은 가게 열 곳이 들어오면 한 곳만 살아남는다|새로 생긴 가게가 자리 잡기까지는 쉽지 않다|새로 생긴 가게가 자리 잡기까지는 쉽지 않아요.',
  '11|SNS는 몰라서가 아니라, 알아도 할 여력이 없어서 안 하는 것이다|SNS 홍보는 방법을 몰라서라기보다, 할 여력이 없어 못 하는 것이다|SNS 홍보는 방법을 몰라서라기보다, 할 여력이 없어 못 하는 거예요.',
  '12|신당은 지금 과도기다|신당은 지금 변화의 과도기에 있다|신당은 지금 변화의 과도기에 있어요.',
  '13|이 골목은 신당의 다른 곳(중앙시장·주신당 쪽)과는 다른 동네다|이 골목은 신당의 다른 지역(중앙시장·주신당 쪽)과는 분위기가 다르다|이 골목은 신당의 다른 지역(중앙시장·주신당 쪽)과는 분위기가 달라요.',
  '14|이 골목은 손님들에게 가성비 좋은 동네로 알려져 있다|이 골목은 손님들에게 가성비 좋은 동네로 알려져 있다|이 골목은 손님들에게 가성비 좋은 동네로 알려져 있어요.',
  '15|상인회가 무언가를 정할 때 내 의견이 반영된다|상인회가 무언가를 정할 때 내 의견이 반영된다|',
].map((l) => l.split('|'));
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[‘’`]/g, "'").trim();
const SAY_BY_TEXT = new Map<string, { n: number; say: string }>();
SAY.forEach(([n, oldT, newT, say]) => { SAY_BY_TEXT.set(norm(oldT), { n: +n, say }); SAY_BY_TEXT.set(norm(newT), { n: +n, say }); });

const BAD = [/\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/, /https?:|www\.|\.com|\.kr|\.net/i, /@[\w-]+\./, /씨발|시발|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|좆|존나|졸라|미친놈|미친년|꺼져|닥쳐/];
/* 응답자 글 정리: 50자 넘으면 첫 문장만, 그래도 넘거나 위험하면 null. 끝에 문장부호가 없으면 마침표만 붙인다(뜻은 그대로) */
export function cleanFree(raw: string | undefined, max = 50): string | null {
  if (!raw) return null;
  let t = raw.replace(/\s+/g, ' ').trim().replace(/^["'“”「『]+|["'“”」』]+$/g, '').trim();
  if (t.length < 2 || BAD.some((re) => re.test(t))) return null;
  if (t.length > max) { const m = /^.+?[.!?…~](?=\s|$)/.exec(t); t = m ? m[0].trim() : t; if (t.length > max) return null; }
  if (!/[.!?…~)]$/.test(t)) t += '.';
  return t;
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seeded(seed: number) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const seedOf = hash;
const hasBatchim = (w: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };

export function buildFormScript(id: string, answers: FormAnswers | null | undefined): FormScript | null {
  const pairs = (answers?.pairs || []).filter((p) => Array.isArray(p) && p.length >= 2).map(([k, v]) => [norm(String(k)), String(v ?? '').trim()] as [string, string]);
  const last = (re: RegExp) => { let v = ''; for (const [k, x] of pairs) if (re.test(k) && x) v = x; return v; };   /* 같은 문항이 두 벌이면 뒤쪽(새 열) */
  const rnd = seeded(hash(id));

  const sq2 = last(/^SQ2\./), kind = KIND[sq2] || OTHER, k = KIND[sq2] ? kind.short : /^[가-힣]{1,6}$/.test(sq2) ? sq2 : OTHER.short;   /* '기타'에 직접 적은 짧은 업종('꽃집')은 그대로 */
  const sq1 = last(/^SQ1\./), yrs = /\d+/.exec(sq1) ? parseInt(/\d+/.exec(sq1)![0], 10) : /미만|처음|막/.test(sq1) ? 0 : null;

  type Page = { key: string; text: string };
  const pages: Page[] = [];
  /* 1. 소개 */
  if (yrs === null) pages.push({ key: 'intro', text: `여기서 ${k} 하고 있어요.` });
  else if (yrs === 0) pages.push({ key: 'intro', text: `이제 막 문을 연 ${k}${hasBatchim(k) ? '이에요' : '예요'}.` });
  else if (yrs >= 20) pages.push({ key: 'intro', text: `여기서 ${k} 한 지 ${yrs}년째예요. 이 골목에선 오래된 편이죠.` });
  else pages.push({ key: 'intro', text: `여기서 ${k} 한 지 ${yrs}년째예요.` });
  /* 2. 손님 — 문1(복수 선택, 쉼표로 이어짐: 처음 고른 것) · 문11-1(주중 연령대) */
  const how = last(/^문1\./).split(/,\s*/).map((o) => HOW[o.trim()]).find((x) => !!x) || null;
  const age = last(/^문11-1\./);
  const c1 = how ? `요즘 처음 오시는 분들은 ${how} 알고 오세요.` : '';
  const c2 = !age ? '' : age === '골고루' ? '주중엔 손님 나이대가 골고루예요.' : `주중엔 ${age} 손님이 ${c1 ? '많고요' : '많아요'}.`;
  if (c1 || c2) pages.push({ key: 'customers', text: [c1, c2].filter(Boolean).join(' ') });
  /* 3. 생각 — 파트 A: '매우 그렇다' 문장 중 최대 2개(합쳐 55자 이하일 때만 둘), 없으면 '그렇다' 1개 */
  const strong: string[] = [], agree: string[] = [], seen = new Set<number>();
  for (const [key, v] of pairs) {
    const m = /동의하시는지.*\[(.+)\]$/.exec(key); if (!m || !v) continue;
    const s = SAY_BY_TEXT.get(norm(m[1])); if (!s || !s.say || seen.has(s.n)) continue;
    if (v === '매우 그렇다') { strong.push(s.say); seen.add(s.n); } else if (v === '그렇다') { agree.push(s.say); seen.add(s.n); }
  }
  const shuffle = (a: string[]) => a.map((x) => [rnd(), x] as [number, string]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const pool = strong.length ? shuffle(strong) : shuffle(agree).slice(0, 1);
  if (pool.length) {
    let text = pool[0];
    const two = pool.slice(1).find((b) => (pool[0] + ' ' + b).length <= 55);
    if (two && strong.length) text = pool[0] + ' ' + two;
    pages.push({ key: 'opinion', text });
  }
  /* 4. 우리만 하는 것 — 문8-1(응답자 글) */
  const only = last(/^문8\./) === '없다' ? null : cleanFree(last(/^문8-1\./));
  if (only) pages.push({ key: 'only', text: `이 근방에서 우리만 하는 거요? ${only}` });
  /* 5. 골목 이야기 — 문9-1(응답자 글) */
  const story = last(/^문9\./) === '없다' ? null : cleanFree(last(/^문9-1\./));
  if (story) pages.push({ key: 'story', text: `이 자리에 얽힌 이야기요? ${story}` });
  /* 6. 10년 뒤 — 문30 (문31 이유는 쓰지 않는다) */
  const fut = FUTURE[last(/^문30\./)];
  if (fut) pages.push({ key: 'future', text: fut });

  /* 길이: 6장 넘거나 230자 넘으면 손님 → 이야기 순으로 덜어낸다. 마지막 장은 남긴다 */
  const total = () => pages.reduce((n, p) => n + p.text.length, 0);
  for (const key of ['customers', 'story', 'opinion']) { if (pages.length <= 4 || (pages.length <= 6 && total() <= 230)) break; const i = pages.findIndex((p) => p.key === key); if (i >= 0 && i < pages.length - 1) pages.splice(i, 1); }
  /* 3장 미만이면 띄우지 않는다. 소개 + 손님만 있는 것처럼 그 사람의 말이 하나도 없으면 띄우지 않는다 */
  if (pages.length < 3 || !pages.some((p) => ['opinion', 'only', 'story', 'future'].includes(p.key))) return null;
  return { id, kind: 'form', name: `${k} 사장님`, hook: kind.hook, pages: pages.map((p) => p.text) };
}

/* interviews.summary_md 에 관리자가 손본 대본(JSON)이 있으면 그것을 쓴다(나중에 Supabase 표에서 직접 고칠 수 있게) */
export function scriptFromRow(id: string, answers: FormAnswers | null, summary: string | null): FormScript | null {
  if (summary) { try { const s = JSON.parse(summary); if (s && s.hook && Array.isArray(s.pages) && s.pages.length >= 3) return { id, kind: 'form', name: s.name || '가게 사장님', hook: s.hook, pages: s.pages.slice(0, 6) }; } catch { /* 손본 대본이 깨졌으면 규칙으로 */ } }
  return buildFormScript(id, answers);
}
