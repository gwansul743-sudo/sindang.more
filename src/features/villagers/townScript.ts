/* '신당동, 어떤 동네인가요? | 관설 설문'(10-30, 방문객·주민·일하는 사람 누구나) 응답 1건 → 마을 사람 대본(hook + 2~6장). 순수 함수 — DOM·DB 를 모른다.
   · 입력: interviews.answers = { v: 1, f: 'town', pairs: [[질문 제목, 값], …] } — Apps Script(tools/apps-script/town_form_to_supabase.gs)가 폼에서 바로 보낸다.
     질문 제목 앞부분으로 찾는다(폼에서 문장을 조금 고쳐도 앞말이 같으면 된다). 연락처·개인정보 동의는 처음부터 오지 않는다.
   · 이름(익명): 연령대 + 관계·답에서 나온 말 — '30대 토박이 주민' · '40대 골목 일꾼' · '20대 맛집 탐방 손님'. hook 은 떠오르는 단어로('신당동 하면 「곱창」이죠!') — 10-30 2판, 5명 동시 겹침을 줄이려고.
   · 순서: 소개(머문 기간 / 오는 빈도 + 목적) → 떠오르는 단어 → 새 가게 변화(머무는 분만) → 거리 분위기 + 불편한 점 → 남았으면 하는 곳 → 바라는 동네 → 맺음말.
   · 응답자 글(단어·장소·바라는 동네): AI 정돈본('AI 정돈|keep' 'AI 정돈|future')이 있으면 그것, '(빼기)'면 그 장을 뺀다. 위험하거나 길면 뺀다(formScript cleanFree).
   · 6장·240자를 넘으면 맺음말 → 새 가게 변화 → 거리 분위기 순으로 덜어낸다. 같은 응답이면 언제 만들어도 같은 대본. */
import { cleanFree, seeded, seedOf, type FormAnswers, type FormScript } from './formScript';

type Rel = 'live' | 'work' | 'visit';
/* 이름(10-30 2판: 5명 중 같은 이름 73% → 줄이려고) — 관계별 기본 + 답에 따라 붙는 말. 답에서 나온 이름(SPECIFIC)을 60% 확률로 먼저 */
const NAME_BASE: Record<Rel, string[]> = { live: ['주민', '동네 주민', '이웃 주민'], work: ['동네 일꾼', '골목 일꾼', '이웃 일꾼'], visit: ['나들이 손님', '구경 온 손님', '놀러 온 손님'] };
const NAME_STAY: Record<string, [string, string]> = { '3년 미만': ['새내기 주민', '새내기 일꾼'], '20년 이상': ['토박이 주민', '오랜 일꾼'] };
const NAME_OFTEN: Record<string, string> = { '오늘이 처음': '첫 나들이 손님', '한 달에 1–2번': '자주 오는 손님', '매주 이상': '단골 손님' };
const NAME_WHY: Record<string, string> = { '중앙시장': '시장 나들이 손님', '맛집·술집': '맛집 탐방 손님', '카페·소품샵': '카페 나들이 손님', '황학동 주방·가구거리': '가구거리 손님', '전시·공연': '전시 보러 온 손님' };
/* hook(2판: 5명 중 같은 hook 95% → 줄이려고) — 떠오르는 단어가 있으면 75% 확률로 그 단어로(사람마다 다르다). 없거나 걸러지면 관계별 일반 hook */
const WORD_HOOKS = ['신당동 하면 「{w}」{i}죠!', '「{w}」, 그게 신당동이에요.', '역시 신당동은 「{w}」{ida}.', '신당동 하면 「{w}」 아니에요?', '「{w}」 하면 신당동이죠.', '저는 신당동 하면 「{w}」{ga} 생각나요.'];
const HOOKS: Record<Rel, string[]> = {
  live: ['이 동네 어떠세요?', '동네 구경 오셨어요?', '신당동 하면 뭐가 떠올라요?', '이 동네 살기 좋아요.', '산책 나왔어요.', '이 골목 자주 다니세요?', '여기 처음 와 보세요?', '안녕하세요, 동네 사람이에요.'],
  work: ['이 근처에서 일해요.', '점심은 드셨어요?', '신당동 하면 뭐가 떠올라요?', '잠깐 쉬는 중이에요.', '오늘도 바쁘네요.', '이 골목 매일 다녀요.', '어디 찾으세요?', '이 동네 길은 제가 잘 알아요.'],
  visit: ['여기 처음 와 보세요?', '어디 가는 길이세요?', '신당동 하면 뭐가 떠올라요?', '구경할 게 많네요.', '다리 좀 쉬어 가요.', '어디부터 가 볼까요?', '맛집 아는 데 있어요?', '신당동 재밌네요.'],
};
/* 머문 기간 — 주민 / 일하는 사람 */
const STAY: Record<string, [string[], string[]]> = {
  '3년 미만': [['신당동에 산 지 아직 3년이 안 됐어요.', '이 동네 온 지 얼마 안 됐어요. 3년도 안 됐죠.', '이사 온 지 얼마 안 됐어요.', '아직 이 동네 새내기예요.'],
              ['신당동에서 일한 지 아직 3년이 안 됐어요.', '여기서 일한 지 얼마 안 됐어요.', '이 동네에서 일한 지 아직 몇 년 안 됐어요.', '여기 일터로 온 지 얼마 안 됐어요.']],
  '3–10년': [['신당동에 산 지 몇 년 됐어요.', '이 동네에서 지낸 지 꽤 됐어요.', '여기 산 지 어느덧 몇 년째예요.', '이 동네 산 지 이제 좀 됐죠.'],
             ['신당동에서 일한 지 몇 년 됐어요.', '여기서 일한 지 꽤 됐어요.', '이 골목에서 일한 지 몇 년째예요.', '여기로 출근한 지 꽤 됐어요.']],
  '10–20년': [['신당동에서 산 지 10년이 넘었어요.', '이 동네에서 10년 넘게 살았어요.', '여기 산 지 벌써 10년이 넘었네요.', '10년 넘게 이 동네에 살고 있어요.'],
              ['신당동에서 일한 지 10년이 넘었어요.', '여기서 10년 넘게 일했어요.', '이 골목에서 일한 지 벌써 10년이 넘었네요.', '10년 넘게 이 동네로 출근하고 있어요.']],
  '20년 이상': [['신당동에서 산 지 20년이 넘었어요.', '이 동네 토박이나 다름없어요. 20년 넘게 살았거든요.', '여기서만 20년 넘게 살았어요.', '20년 넘게 이 동네를 지켜봤어요.'],
               ['신당동에서 일한 지 20년이 넘었어요.', '여기서 20년 넘게 일했어요.', '이 골목에서만 20년 넘게 일했어요.', '20년 넘게 이 동네에서 일하고 있어요.']],
};
/* 오는 빈도 — 방문객 */
const OFTEN: Record<string, string[]> = {
  '오늘이 처음': ['신당동은 오늘 처음 와 봤어요.', '여기 오늘 처음 와 봐요.', '신당동은 처음이에요.', '오늘 처음 와 봤는데 신기하네요.'],
  '1년에 몇 번': ['신당동엔 1년에 몇 번씩 와요.', '가끔, 1년에 몇 번 와요.', '신당동엔 가끔 들러요.', '1년에 몇 번은 꼭 와요.'],
  '한 달에 1–2번': ['신당동엔 한 달에 한두 번은 와요.', '한 달에 한두 번은 꼭 와요.', '한 달에 한두 번씩 들러요.', '신당동엔 달마다 와요.'],
  '매주 이상': ['신당동엔 거의 매주 와요.', '여기 매주 와요. 단골이죠.', '일주일에 한 번은 꼭 와요.', '거의 매주 신당동에 와요.'],
};
const WHY: Record<string, string> = { '중앙시장': '중앙시장', '맛집·술집': '맛집이랑 술집', '카페·소품샵': '카페랑 소품샵', '황학동 주방·가구거리': '황학동 주방·가구거리', '전시·공연': '전시랑 공연' };
const WHY_SAY = ['주로 {w} 때문에 와요.', '오면 주로 {w} 찾아다녀요.', '{w}, 그거 보러 와요.'];
const WHY_FIRST = ['{w} 때문에 왔어요.', '{w} 찾아왔어요.', '{w}, 그거 보러 왔어요.'];
/* 새 가게 변화(1 아쉽다 ~ 5 반갑다) */
const CHANGE: Record<string, string[]> = {
  low: ['새 가게가 자꾸 느는 게 저는 좀 아쉬워요.', '솔직히 새 가게가 늘어나는 건 좀 아쉬워요.', '새 가게가 생길 때마다 조금 아쉬워요.', '요즘 동네가 바뀌는 게 좀 아쉬워요.'],
  mid: ['새 가게가 느는 건 반반이에요. 반갑기도 하고 아쉽기도 하고요.', '새 가게가 늘어나는 건, 글쎄요. 좋기도 하고 아쉽기도 해요.', '새 가게가 느는 건 좋은 점도 있고 아쉬운 점도 있어요.', '동네가 바뀌는 건 반반이에요.'],
  high: ['새 가게가 늘어나는 게 저는 반가워요.', '요즘 새 가게가 많이 생기는 게 반가워요.', '새 가게가 생길 때마다 반가워요.', '동네에 새 가게가 느는 거, 저는 좋아요.'],
};
/* 거리 분위기 만족(1 불만족 ~ 5 만족) */
const MOOD: Record<string, string[]> = {
  low: ['요즘 신당동 거리 분위기는 좀 아쉬워요.', '거리 분위기는 솔직히 마음에 덜 차요.', '거리 분위기는 아직 아쉬운 데가 있어요.', '솔직히 거리는 좀 더 나아졌으면 해요.'],
  mid: ['요즘 거리 분위기는 그럭저럭이에요.', '거리 분위기는 보통이에요.', '거리 분위기는 나쁘지 않아요.', '거리는 뭐, 괜찮은 편이에요.'],
  high: ['지금 신당동 거리 분위기, 저는 마음에 들어요.', '요즘 거리 분위기 좋아요.', '거리 분위기가 참 좋아요.', '이 동네 거리 분위기, 저는 좋아요.', '골목 분위기가 마음에 들어요.'],
};
const BAD_PT: Record<string, string> = { '주차': '주차', '좁은 길·오토바이': '좁은 길이랑 오토바이', '갈 곳이 이어지지 않음': '갈 곳이 띄엄띄엄 끊기는 점', '낡은 건물·시설': '낡은 건물과 시설' };
const KEEP = ['{t}만큼은 오래 남았으면 좋겠어요.', '{t}, 거기는 사라지지 않았으면 해요.', '{t}, 거기는 꼭 그대로 있었으면 해요.'];
const FUTURE = ['앞으로 신당동은요, {t}', '바라는 게 있다면요. {t}', '?앞으로 신당동이요? {t}'];
const SHY = ['제 얘기는 이 정도예요.', '말주변이 없어서 이 정도네요.', '할 말은 여기까지예요.', '더 할 얘기는 없네요.'];
const BYE: Record<Rel, string[]> = {
  live: ['동네 자주 놀러 오세요.', '좋은 하루 보내세요.', '천천히 구경하고 가세요.', '또 놀러 오세요.'],
  work: ['지나가다 또 봬요.', '좋은 하루 보내세요.', '저는 다시 일하러 가 볼게요.', '구경 잘 하고 가세요.'],
  visit: ['다음에 또 올게요.', '좋은 구경 하세요.', '저는 더 둘러보러 갈게요.', '즐거운 시간 보내세요.'],
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const lv = (v: string) => { const n = parseInt(v, 10); return !n ? '' : n <= 2 ? 'low' : n === 3 ? 'mid' : 'high'; };
const hasBatchim = (w: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const unNeun = (w: string) => (/[가-힣]$/.test(w) ? (hasBatchim(w) ? '은' : '는') : '은(는)');
const iGa = (w: string) => (/[가-힣]$/.test(w) ? (hasBatchim(w) ? '이' : '가') : '이(가)');
/* 짧은 말(단어·장소·기타): 끝 문장부호를 떼고 max 자 안, 위험하면 null */
const short = (raw: string, max: number) => { const t = cleanFree(raw, max); return t ? t.replace(/[.!?…~]+$/, '').trim() || null : null; };

export function buildTownScript(id: string, answers: FormAnswers | null | undefined): FormScript {
  const pairs = (answers?.pairs || []).filter((p) => Array.isArray(p) && p.length >= 2).map(([k, v]) => [norm(String(k)), String(v ?? '').trim()] as [string, string]);
  const last = (re: RegExp) => { let v = ''; for (const [k, x] of pairs) if (re.test(k) && x) v = x; return v; };
  const rnd = seeded(seedOf(id));
  let usedQ = false;
  const pick = (list: string[]) => {
    const ok = list.filter((s) => !(usedQ && s.startsWith('?')));
    const s = ok[Math.floor(rnd() * ok.length)] || ok[0] || '';
    if (s.startsWith('?')) { usedQ = true; return s.slice(1); }
    return s;
  };
  const relRaw = last(/^신당동과 어떤 관계/), rel: Rel = /살아/.test(relRaw) ? 'live' : /장사|일해/.test(relRaw) ? 'work' : 'visit';
  const age = last(/^연령대/).replace(/\s*이상$/, '');   /* '60대 이상' → '60대' */
  const nr = seeded(seedOf(id + '#name')), stayV = last(/^신당동에서 지낸 기간/), oftenV = last(/^신당동에 얼마나 자주/);
  const spec = rel === 'visit' ? [NAME_OFTEN[oftenV], ...last(/^주로 무엇을 하러/).split(/,\s*/).map((w) => NAME_WHY[w.trim()])] : [NAME_STAY[stayV]?.[rel === 'live' ? 0 : 1]];
  const specs = spec.filter(Boolean) as string[], pool = specs.length && nr() < 0.6 ? specs : NAME_BASE[rel];
  const name = (/^\d0대$/.test(age) ? age + ' ' : '') + pool[Math.floor(nr() * pool.length)];
  const ai = (k: string) => last(new RegExp(`^AI 정돈\\|${k}$`));

  type Page = { key: string; text: string };
  const pages: Page[] = [];
  /* 1. 소개 */
  if (rel === 'visit') {
    const often = OFTEN[last(/^신당동에 얼마나 자주/)];
    const whys = last(/^주로 무엇을 하러/).split(/,\s*/).map((w) => WHY[w.trim()]).filter(Boolean).slice(0, 2) as string[];   /* 기타 직접 입력은 문장을 깨뜨려서 쓰지 않는다('친구 만나러 때문에') */
    const first = /처음/.test(last(/^신당동에 얼마나 자주/));
    const why = whys.length ? pick(first ? WHY_FIRST : WHY_SAY).replace('{w}', whys.join(', ')) : '';
    const text = [often ? pick(often) : '', why].filter(Boolean).join(' ');
    pages.push({ key: 'intro', text: text || pick(['신당동 구경 왔어요.', '놀러 왔어요.']) });
  } else {
    const st = STAY[last(/^신당동에서 지낸 기간/)];
    pages.push({ key: 'intro', text: st ? pick(st[rel === 'live' ? 0 : 1]) : rel === 'live' ? '이 동네 살아요.' : '이 근처에서 일해요.' });
  }
  /* 2. 떠오르는 단어 */
  const word = short(last(/^'?신당동'? 하면/), 15);
  /* hook — 단어를 hook 에서 이미 말했으면 본문의 단어 장은 뺀다(겹말) */
  const hr = seeded(seedOf(id + '#hook')), hooks = HOOKS[rel];
  const hb = !!word && /[가-힣]$/.test(word) && hasBatchim(word);
  const hook = word && hr() < 0.75
    ? WORD_HOOKS[Math.floor(hr() * WORD_HOOKS.length)].replace('{w}', word).replace('{i}', hb ? '이' : '').replace('{ida}', hb ? '이에요' : '예요').replace('{ga}', iGa(word))
    : hooks[Math.floor(hr() * hooks.length)];
  const wordHook = !!word && hook.includes(`「${word}」`);
  if (word && !wordHook) pages.push({ key: 'word', text: pick([`신당동 하면 저는 「${word}」${iGa(word)} 먼저 떠올라요.`, `저한테 신당동은 「${word}」${/[가-힣]$/.test(word) && hasBatchim(word) ? '이에요' : '예요'}.`]) });
  /* 3. 새 가게 변화 — 머무는 분만 */
  const ch = CHANGE[lv(last(/^새 가게가 늘어나는/))];
  if (rel !== 'visit' && ch) pages.push({ key: 'change', text: pick(ch) });
  /* 4. 거리 분위기 + 불편한 점(최대 2) */
  const mood = MOOD[lv(last(/^지금 신당동의 거리/))];
  const pts = last(/^신당동에서 불편하거나/).split(/,\s*/).map((w) => BAD_PT[w.trim()] || (/^[가-힣]{1,8}$/.test(w.trim()) ? w.trim() : null))   /* 기타는 짧은 낱말('쓰레기')만 */.filter(Boolean).slice(0, 2) as string[];
  const ptText = pts.join(', ');
  const ptSay = ptText ? (lv(last(/^지금 신당동의 거리/)) === 'high' ? `다만 ${ptText}${unNeun(ptText)} 좀 불편해요.` : `${ptText}${iGa(ptText)} 불편해요.`) : '';
  if (mood || ptSay) pages.push({ key: 'mood', text: [mood ? pick(mood) : '', ptSay].filter(Boolean).join(' ') });
  /* 5. 남았으면 하는 곳 */
  const keepAi = ai('keep');
  const keep = keepAi === '(빼기)' ? null : keepAi ? cleanFree(keepAi, 50) : short(last(/^신당동에서 사라지지 않았으면/), 25);
  if (keep) pages.push({ key: 'keep', text: keepAi ? keep : pick(KEEP).replace('{t}', keep) });
  /* 6. 바라는 동네 */
  const futAi = ai('future');
  const fut = futAi === '(빼기)' ? null : cleanFree(futAi || last(/^앞으로 신당동이/), 65);
  /* 명사로 끝나는 답('옛날 느낌 남아 있는 동네')은 '앞으로 신당동이 ~가 됐으면 좋겠어요.'로 맺는다 */
  const futN = fut && !futAi ? fut.replace(/[.!?…~]+$/, '') : '', nounEnd = futN && (/동네$/.test(futN) || !/(요|다|죠|네|까|음|함|면|게|고|지|어|아|해|래|자)$/.test(futN));
  if (fut) pages.push({ key: 'future', text: nounEnd && futN.length <= 40 ? `앞으로 신당동이 ${futN}${iGa(futN)} 됐으면 좋겠어요.` : fut.length > 40 ? fut : pick(FUTURE).replace('{t}', fut) });
  /* 7. 맺음말 — 글이 없는 사람은 늘, 나머지는 절반 */
  const shy = !keep && !fut;
  if (shy || rnd() < 0.5) pages.push({ key: 'closer', text: shy ? pick(SHY) + ' ' + pick(BYE[rel]) : pick(BYE[rel]) });
  if (pages.length < 2) pages.push({ key: 'closer2', text: pick(BYE[rel]) });

  const total = () => pages.reduce((n, p) => n + p.text.length, 0);
  for (const key of ['closer', 'change', 'mood']) {
    if (pages.length <= 6 && total() <= 240) break;
    const i = pages.findIndex((p) => p.key === key); if (i > 0) pages.splice(i, 1);
  }
  return { id, kind: 'form', name, hook, pages: pages.map((p) => p.text) };
}
