/* 구글폼 응답 1건 → 마을 사람 대본(hook + 2~6장). 규칙은 설계 메모 5판 §3 · 상인설문_대본규칙.json. 순수 함수 — DOM·DB 를 모른다.
   · 입력: interviews.answers = { v: 1, pairs: [[열 이름, 값], …] } — 시트의 열 이름 그대로(Apps Script 가 공개해도 되는 열만 골라 보낸다).
     폼을 고쳐 같은 문항의 열이 두 벌 생겨도(옛 문장·새 문장, 단일·복수 선택) 번호('SQ1.' '문8-1.')나 문장 사전으로 찾고, 값이 있는 것 중 뒤쪽(새 열)을 쓴다.
   · 익명: SQ3(상호)는 폼에 '익명 처리'라고 안내돼 있어 쓰지 않는다 — 이름은 업종으로('밥집 사장님').
   · 폼을 낸 사람은 모두 띄운다(10-28). 답이 적으면 맺음말('더 이상 할 말은 없네요.' 등)로 채운다. 최소 2장(소개 + 맺음말).
   · 순서: 소개 → 손님 → 생각(파트 A) → 우리만 하는 것(문8-1) → 골목 이야기(문9-1) → 10년 뒤(문30, 절반만) → 맺음말.
     장마다 말투 틀이 여러 벌이고 응답 id 를 씨앗으로 고른다. '~요?' 되받기 틀('10년 뒤요?')은 한 대본에 한 번까지.
   · 응답자 글: Apps Script 가 AI 로 다듬은 정돈본('AI 정돈|문8-1')이 있으면 그것을, 없으면 원문을 쓴다. 정돈본이 '(빼기)'면 그 장을 뺀다(AI 가 공개하기 어렵다고 본 글).
     65자를 넘으면 첫 문장만, 첫 문장도 넘거나 전화·주소창·메일·욕설이 보이면 그 장을 뺀다(공개 전시). 40자가 넘는 글은 틀 없이 그대로.
   · 6장·240자를 넘으면 맺음말 → 생각 둘째 장 → 손님 → 10년 뒤 순으로 덜어낸다.
   · 같은 응답이면 언제 만들어도 같은 대본. hook 은 따로 씨앗을 써서, hook 목록을 늘려도 본문은 바뀌지 않는다. */

export interface FormAnswers { v?: number; pairs?: [string, string][] }
export interface FormScript { id: string; kind: 'form'; name: string; hook: string; pages: string[] }

/* 틀 목록. '?'로 시작하는 틀은 되받기('~요?') — 한 대본에 한 번만 쓴다 */
type Kind = { short: string; did: string; doing: string; hooks: string[]; invite: string[] };
const KIND: Record<string, Kind> = {   /* SQ2 → 짧은 이름 · 동사 · hook 여러 벌(랜덤) · 업종별 맺음말 */
  '한식·분식·일반 음식점': { short: '밥집', did: '밥집 한', doing: '밥집 하고', hooks: ['밥은 드셨어요?', '배 안 고프세요?', '오늘 점심은 뭐 드셨어요?'], invite: ['출출하면 들렀다 가세요.', '다음엔 밥 먹으러 오세요.'] },
  '주점·포차': { short: '술집', did: '술집 한', doing: '술집 하고', hooks: ['한 잔 하고 가실래요?', '오늘 같은 날엔 한 잔이죠.', '저녁에 뭐 하세요?'], invite: ['저녁에 한 잔 하러 오세요.', '다음엔 한 잔 하고 가세요.'] },
  '카페·디저트·베이커리': { short: '카페', did: '카페 한', doing: '카페 하고', hooks: ['잠깐 앉았다 가세요.', '커피 한 잔 어때요?', '다리 아프지 않으세요?'], invite: ['커피 한 잔 하러 들르세요.', '쉬어 가고 싶을 때 오세요.'] },
  '판매(의류·잡화·식자재 등)': { short: '가게', did: '가게 한', doing: '가게 하고', hooks: ['구경만 하셔도 돼요.', '뭐 찾으시는 거 있어요?', '그냥 둘러보세요.'], invite: ['지나가다 구경하러 들르세요.'] },
  '생활 서비스(미용·세탁·수리 등)': { short: '가게', did: '가게 한', doing: '가게 하고', hooks: ['이 골목에서 오래 했어요.', '동네 분이세요?', '어서 오세요.'], invite: ['필요한 일 있으면 들르세요.'] },
  '제조·도매·공장': { short: '공장', did: '공장 돌린', doing: '공장 돌리고', hooks: ['여기가 원래 공장 골목이었어요.', '기계 소리 시끄럽죠?', '이 골목 처음 와 보세요?'], invite: ['문 열려 있으면 구경하고 가세요.'] },
};
const OTHER: Kind = { short: '가게', did: '가게 한', doing: '가게 하고', hooks: ['안녕하세요.', '동네 분이세요?', '이 골목 처음 와 보세요?'], invite: ['지나가다 들르세요.'] };
/* 문1 손님 경로 → 말 여러 벌 */
const HOW: Record<string, string[] | null> = {
  'SNS·유튜브': ['요즘은 SNS 보고 찾아오시는 분이 많아요.', '처음 오는 손님은 거의 SNS 보고 와요.', '요즘 손님들은 SNS로 먼저 알고 오시더라고요.'],
  '지도앱·배달앱': ['요즘은 지도앱 보고 찾아오시는 분이 많아요.', '다들 지도앱 켜고 찾아오시더라고요.'],
  '지인 소개': ['처음 오는 분들은 대개 아는 분 소개로 와요.', '입소문이죠. 아는 분 소개로 많이들 오세요.'],
  '지나가다가': ['지나가다 쓱 들어오시는 분이 많아요.', '처음 오는 분들은 대개 지나가다 들어오세요.'],
  'TV·기사': ['기사 보고 찾아오신 분들도 있어요.', '방송이나 기사 보고 오시는 분들이 있어요.'],
  '잘 모르겠다': null,
};
/* 문30 — '아니다'도 '모르겠다'와 같은 말로(떠날 생각을 공개 지도에 드러내지 않는다) */
const UNSURE = ['10년 뒤는 저도 잘 모르겠어요.', '앞일은 모르죠. 10년 뒤엔 어떨지.', '?10년 뒤요? 글쎄요, 그건 모르겠어요.'];
const FUTURE: Record<string, string[]> = {
  '그렇다': ['10년 뒤에도 아마 여기 있을 거예요.', '앞으로 10년은 더 여기 있을 것 같아요.', '?10년 뒤요? 그때도 이 자리에 있을 거예요.'],
  '아니다': UNSURE, '모르겠다': UNSURE,
};
/* 파트 A 문장 앞말 */
const LEAD_STRONG = ['', '솔직히 ', '장사해 보니까 ', '제가 보기엔 '], LEAD_AGREE = ['', '제 생각엔 '], LEAD_MORE = ['그리고 ', '하나 더 말하자면, '];
/* 응답자 글 틀 — {t} 자리에 글. 40자가 넘는 글은 틀 없이 그대로 */
const ONLY = ['이 근방에서 우리 가게만 하는 게 있어요. {t}', '우리 집 자랑을 하자면요, {t}', '{t} 이건 이 근방에서 우리만 해요.', '?이 근방에서 우리만 하는 거요? {t}'];
const STORY = ['이 자리에 얽힌 이야기가 하나 있어요. {t}', '손님들한테 가끔 하는 이야기가 있어요. {t}', '?얘기 하나 해 드릴까요? {t}', '?이 자리에 얽힌 이야기요? {t}'];
/* 맺음말 — 답이 적은 사람(SHY)은 늘, 나머지(BYE)는 절반만 */
const SHY = ['더 이상 할 말은 없네요.', '말주변이 없어서 이 정도네요.', '제 이야기는 이게 다예요.', '특별한 이야기는 없어요. 그냥 하루하루 하는 거죠.'];
const BYE = ['제 이야기는 여기까지예요.', '말이 길었네요. 좋은 하루 보내세요.', '다음에 지나가면 들러 주세요.'];

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

const BAD = [/\[가림\]/, /[ㄱ-ㅎㅏ-ㅣ]/, /\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/, /https?:|www\.|\.com|\.kr|\.net/i, /@[\w-]+\./, /씨발|시발|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|좆|존나|졸라|미친놈|미친년|꺼져|닥쳐/];
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
const ida = (w: string) => (hasBatchim(w) ? '이에요' : '예요');
const iga = (w: string) => (hasBatchim(w) ? '이' : '가');

export function buildFormScript(id: string, answers: FormAnswers | null | undefined): FormScript {
  const pairs = (answers?.pairs || []).filter((p) => Array.isArray(p) && p.length >= 2).map(([k, v]) => [norm(String(k)), String(v ?? '').trim()] as [string, string]);
  const last = (re: RegExp) => { let v = ''; for (const [k, x] of pairs) if (re.test(k) && x) v = x; return v; };   /* 같은 문항이 두 벌이면 뒤쪽(새 열) */
  const rnd = seeded(hash(id));
  let usedQ = false;   /* 되받기 틀은 한 번만 */
  const pick = (list: string[]) => {
    const ok = list.filter((s) => !(usedQ && s.startsWith('?')));
    const s = ok[Math.floor(rnd() * ok.length)] || ok[0] || '';
    if (s.startsWith('?')) { usedQ = true; return s.slice(1); }
    return s;
  };

  const sq2 = last(/^SQ2\./), custom = !KIND[sq2] && /^[가-힣]{1,6}$/.test(sq2);   /* '기타'에 직접 적은 짧은 업종('꽃집')은 그대로 */
  const kind: Kind = KIND[sq2] || (custom ? { ...OTHER, short: sq2, did: `${sq2} 한`, doing: `${sq2} 하고` } : OTHER), k = kind.short;
  const sq1 = last(/^SQ1\./), yrs = /미만|처음|막/.test(sq1) ? 0 : /\d+/.exec(sq1) ? parseInt(/\d+/.exec(sq1)![0], 10) : null;   /* '1년 미만'은 숫자보다 먼저 */

  type Page = { key: string; text: string };
  const pages: Page[] = [];
  /* 1. 소개 */
  const intro = yrs === null ? [`여기서 ${kind.doing} 있어요.`, `이 골목에서 ${kind.doing} 있어요.`]
    : yrs === 0 ? [`이제 막 문을 연 ${k}${ida(k)}.`, `문 연 지 얼마 안 된 ${k}${ida(k)}.`, '여기 온 지 1년도 안 됐어요. 아직 신참이에요.']
    : yrs >= 20 ? [`여기서 ${kind.did} 지 ${yrs}년째예요. 이 골목에선 오래된 편이죠.`, `${yrs}년째 이 자리를 지키고 있어요.`, `이 골목에서 ${kind.doing} ${yrs}년이 지났어요.`]
    : yrs >= 10 ? [`여기서 ${kind.did} 지 벌써 ${yrs}년이에요.`, `이 자리에서 ${yrs}년째 ${kind.doing} 있어요.`, `${kind.did} 지 ${yrs}년 됐어요.`]
    : [`여기서 ${kind.did} 지 ${yrs}년째예요.`, `이 자리에서 ${yrs}년째 ${kind.doing} 있어요.`, `${kind.did} 지 이제 ${yrs}년 됐어요.`];
  pages.push({ key: 'intro', text: pick(intro) });
  /* 2. 손님 — 문1(복수 선택, 쉼표로 이어짐: 처음 고른 것) · 문11-1(주중 연령대) */
  const how = last(/^문1\./).split(/,\s*/).map((o) => HOW[o.trim()]).find((x) => !!x);
  const age = last(/^문11-1\./);
  const c1 = how ? pick(how) : '';
  const c2 = !age ? '' : age === '골고루' ? pick(['손님 나이대는 골고루예요.', '젊은 분부터 어르신까지 골고루 오세요.'])
    : pick([`주중엔 ${age} 손님이 많아요.`, `평일엔 주로 ${age} 분들이 오세요.`, `손님은 ${age}${iga(age)} 제일 많아요.`]);
  if (c1 || c2) pages.push({ key: 'customers', text: [c1, c2].filter(Boolean).join(' ') });
  /* 4·5 를 먼저 읽어 둔다 — 응답자 글이 없으면 파트 A 를 한 장 더 쓴다 */
  const freeText = (n: string) => {   /* AI 정돈본 우선 → 없으면 원문. '(빼기)'면 그 장 없음 */
    const ai = last(new RegExp(`^AI 정돈\\|문${n}$`));
    if (ai === '(빼기)') return null;
    return cleanFree(ai || last(new RegExp(`^문${n}\\.`)), 65);
  };
  const only = last(/^문8\./) === '없다' ? null : freeText('8-1');
  const story = last(/^문9\./) === '없다' ? null : freeText('9-1');
  /* 3. 생각 — 파트 A: '매우 그렇다' 문장(없으면 '그렇다'). 한 장에 둘까지(60자 이하일 때), 응답자 글이 없으면 남은 문장으로 한 장 더 */
  const strong: string[] = [], agree: string[] = [], seen = new Set<number>();
  for (const [key, v] of pairs) {
    const m = /동의하시는지.*\[(.+)\]$/.exec(key); if (!m || !v) continue;
    const s = SAY_BY_TEXT.get(norm(m[1])); if (!s || !s.say || seen.has(s.n)) continue;
    if (v === '매우 그렇다') { strong.push(s.say); seen.add(s.n); } else if (v === '그렇다') { agree.push(s.say); seen.add(s.n); }
  }
  const shuffle = (a: string[]) => a.map((x) => [rnd(), x] as [number, string]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const pool = strong.length ? shuffle(strong) : shuffle(agree);
  if (pool.length) {
    let text = pick(strong.length ? LEAD_STRONG : LEAD_AGREE) + pool.shift();
    const i = pool.findIndex((b) => (text + ' 그리고 ' + b).length <= 60);
    if (i >= 0 && (strong.length || (!only && !story))) text += ' ' + pick(['', '그리고 ']) + pool.splice(i, 1)[0];
    pages.push({ key: 'opinion', text });
    if (pool.length && !only && !story) pages.push({ key: 'opinion2', text: pick(LEAD_MORE) + pool[0] });
  }
  /* 4·5. 응답자 글 */
  const free = (t: string, frames: string[]) => (t.length > 40 ? t : pick(frames).replace('{t}', t));
  if (only) pages.push({ key: 'only', text: free(only, ONLY) });
  if (story) pages.push({ key: 'story', text: free(story, STORY) });
  /* 6. 10년 뒤 — 문30. 절반만 묻는다. 다른 말이 하나도 없으면 늘 넣는다 (문31 이유는 쓰지 않는다) */
  const fut = FUTURE[last(/^문30\./)];
  const said = pages.some((p) => ['opinion', 'only', 'story'].includes(p.key));
  if (fut && (!said || rnd() < 0.5)) pages.push({ key: 'future', text: pick(fut) });
  /* 7. 맺음말 — 응답자 글이 없는 사람은 늘(답이 적은 걸 채운다), 나머지는 절반 */
  const shy = !only && !story;
  if (shy || rnd() < 0.5) pages.push({ key: 'closer', text: shy ? (rnd() < 0.5 ? pick(SHY) : pick(SHY) + ' ' + pick(kind.invite)) : pick([...BYE, ...kind.invite]) });

  /* 길이: 6장·240자를 넘으면 덜어낸다 */
  const total = () => pages.reduce((n, p) => n + p.text.length, 0);
  for (const key of ['closer', 'opinion2', 'customers', 'future']) {
    if (pages.length <= 6 && total() <= 240) break;
    const i = pages.findIndex((p) => p.key === key); if (i > 0) pages.splice(i, 1);
  }
  const hooks = kind.hooks, hr = seeded(hash(id + '#hook'));
  return { id, kind: 'form', name: `${k} 사장님`, hook: hooks[Math.floor(hr() * hooks.length)] || '안녕하세요.', pages: pages.map((p) => p.text) };
}

/* interviews.summary_md 에 관리자가 손본 대본(JSON)이 있으면 그것을 쓴다(나중에 Supabase 표에서 직접 고칠 수 있게) */
export function scriptFromRow(id: string, answers: FormAnswers | null, summary: string | null): FormScript | null {
  if (summary) { try { const s = JSON.parse(summary); if (s && s.hook && Array.isArray(s.pages) && s.pages.length >= 1) return { id, kind: 'form', name: s.name || '가게 사장님', hook: s.hook, pages: s.pages.slice(0, 6) }; } catch { /* 손본 대본이 깨졌으면 규칙으로 */ } }
  return buildFormScript(id, answers);
}
