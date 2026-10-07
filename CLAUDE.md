# sindang.more 지도 — 프로젝트 맥락

> 2026-10-07 작성, 같은 날 폴더 정리 후 갱신. 새 세션은 **이 파일 → `폴더구조_지침.md` → `다음_작업_지침.md`** 순으로 읽는다. 디자인 규칙은 `../초안 기능 정리/DESIGN_BRIEF.md`.

## 무엇을 만드나
- 신당동 인스타그램 매거진 **sindang.more**(@morethan.sd)가 인터뷰한 가게들을 보여주는 지도 웹사이트.
- 인스타 프로필 링크로 들어오는 방문객(대부분 폰) + 전시장 대형 화면용.
- 가게를 누르면 **사진 → 인스타 게시물 링크 → 인터뷰 전문** 카드가 열린다. 관리자는 가게 추가·수정·사진 업로드.
- 지금까지는 claude.ai 아티팩트로 바이브코딩했고, 이제 **실제 배포 환경으로 옮기는 단계**.

## 이 폴더에 있는 것
**이 폴더(`sindang.more/`)가 Vite + React 프로젝트 본체다.** `npm install && npm run dev`로 옛 HTML과 같은 화면이 뜬다(2026-10-07 확인).
- `폴더구조_지침.md` — 목표 폴더 구조, 블록별 이전 위치, 데이터 모델, 구글폼→캐릭터 파이프라인, 이전 순서(§9).
- `다음_작업_지침.md` — **진행 상황의 정본.** 지금 상태(§1), 지침서와 다르게 한 것(§3), 다음 할 일 순서(§4), 확인 방법(§5), 하지 말 것(§6).
- `content/` — 그림·도로·좌표·파츠(코드 아님). `src/` — app / features / entities / shared / map. `supabase/` — schema·seed. `tools/check_screen.mjs` — 화면 자동 확인. `tools/extract_from_html.py` — 옛 HTML을 이 구조로 푸는 스크립트(**재실행하면 content/와 임시 엔진을 덮어쓴다**).
- 옛 한 장짜리 HTML 변주들은 **`../디자인모음/`**으로 옮겼다. 기준 파일은 `게임_낮밤_초안.html`(REV 28). `../초안 기능 정리/`에 `DESIGN_BRIEF.md`, `check_core.py`, 뼈대 `sindang-more-map.html`이 있다. 옛 HTML은 참고용이며 더 고치지 않는다.
- `다음_작업_지침.md` §3의 "지침서와 다르게 한 것"(파츠 JSON, looks.json, decor/, `_legacy/geo.json`, seed.stores.json, slug·issue 컬럼, published=false='다음 호', 테마 CSS 2벌 등)은 **전부 받아들이기로 결정**(2026-10-07). 지침서 표현과 다르면 실제 파일 쪽이 맞다.

## 개발 환경
- Node는 fnm으로 설치돼 있다(v24). 셸에 fnm 환경이 안 잡혀 있으면 `eval "$(fnm env)"` 후 npm을 쓴다.
- `npm run build` = 타입 검사 + 빌드. 오류 0이어야 다음 단계로 간다. 화면 확인은 `node tools/check_screen.mjs`(헤드리스 Chrome, 마지막 줄 "통과"). 기준값 `tools/.baseline.json`은 일부러 화면을 바꿨을 때만 `--baseline`으로 다시 찍는다.
- git 저장소와 GitHub 푸시는 사용자가 직접 관리한다. 커밋은 단계마다.

## 이미 확인된 사실
- **좌표는 실제 위경도.** 가게 11곳·랜드마크·도로(OpenStreetMap)가 모두 실좌표이고, `proj()`가 웹 메르카토르로 투영한다. 지도 클릭 → 위경도 역변환도 있음. 장식용 집·나무·지형만 일러스트(실제 건물과 무관).
- **저장은 아직 안 된다.** 가게 읽기는 `src/entities/store/api.ts`가 `supabase/seed.stores.json`을 돌려주고, 추가·수정은 임시 엔진(`src/map/legacy/engine.legacy.js`) 안의 옛 `connect()`/mockDb라 새로고침하면 사라진다. 옛 `claude.use('db'|'assets'|'user')`는 claude.ai 밖에서 동작하지 않으므로 Supabase로 바꾼다(§4-3).
- 가게 데이터: 11곳이 `supabase/seed.sql`·`seed.stores.json`에, 사진 4장은 `public/seed-photos/`에 풀려 있다. 주소 입력은 아직 `content/_legacy/geo.json`(내장 좌표표) 조회 → `src/shared/lib/geocode.ts`(카카오 geocoder, 준비됨)로 교체 예정.
- 캐릭터: 주민 5명(파츠 조합 스프라이트, 격자는 좌우 여백 포함 17×18칸·그리는 폭 15칸), 이장님+강아지. 파츠·팔레트·이장님·강아지 도안은 전부 `content/characters/`. 움직임은 `src/map/actors/`.
- 그림 색: 랜드마크는 색 한 벌. 나무·집·땅(`content/map/decor/`, `terrain.svg.txt`)은 `fill="밤 색" data-df="낮 색"` 두 벌이라 고칠 때 둘 다 고친다(§4-B에서 한 벌로 줄일 예정).
- 관련 자료: `~/Documents/경관데이터/dashboard/` (경관 대시보드)에 같은 위경도 체계의 건물 1만 동·상가 8,033곳·인터뷰 21건이 있어 그대로 올릴 수 있다. 단 거기의 `config.json`에는 과금 API 키가 평문으로 있으니 **절대 복사하지 말 것**.

## 결정된 스택 (소규모·과금 상한 고정·빌드 단순)
| 역할 | 도구 | 비고 |
|---|---|---|
| 프론트 | **Vite + React + TypeScript** | 정적 빌드. Next.js는 과함 |
| 구조 | FSD 4층 (`app / features / entities / shared`) + `map/` 엔진 + `content/` | 상세는 `폴더구조_지침.md` |
| 스타일 | CSS Modules + 디자인 토큰(CSS 변수) | 기존 스킨 CSS 이식. Tailwind 안 씀 |
| UI 동작 | Radix Primitives | 모양 없이 접근성만 |
| 모션 | motion (구 Framer Motion) | UI 레이어만. 지도 애니메이션은 엔진 안에서 |
| 폰트 | Pretendard(본문) + 세리프 서브셋, self-host | |
| 호스팅 | **Cloudflare Pages** | GitHub 푸시 → 자동 배포. 대역폭 무제한 무료 |
| DB·로그인·사진 | **Supabase Free** | DB 500MB·스토리지 1GB. 자동 과금 없음. 1주 무요청 시 일시정지 → 주간 핑 |
| 주소→좌표 | 카카오 지도 JS SDK geocoder (브라우저, 도메인 제한) | 서버 없음 |
| 인터뷰 접수 | 구글폼 → Apps Script → Supabase REST | 서버 없음 |
| 코드 저장 | GitHub | |

- 지도 엔진(팬·줌·주민 걷기·호버)은 **React 밖 독립 모듈**(`src/map/`)로 두고, React는 ref로 마운트해 이벤트만 주고받는다.
- AI 챗봇·V-World 키는 v1에서 제외. 나중에 필요하면 Cloudflare Functions 프록시 뒤에.
- 공유용 가게별 페이지(OG 미리보기)가 필요해지면 그때 Astro 검토. 지도 모듈과 컴포넌트는 재사용 가능.

## 예정 기능
- 가게 관리: 관리자가 `/admin`에서 채우면 바로 반영. 주소만 넣으면 좌표 자동.
- 인터뷰이 캐릭터: 전시 쿠폰 → 구글폼 인터뷰 → 승인 → 랜덤 외형 주민으로 걸어다님. hover 손인사 유지, 클릭 시 인터뷰 표시.
- 이장님: 클릭 시 영상 재생 + 동물의 숲식 자막 상자.
- 이스터에그: 상단 "MORE" 5회 클릭 → 경관 대시보드(별도 Cloudflare Pages 프로젝트)로 이동.

## 작업 순서와 현재 위치 (상세는 `다음_작업_지침.md` §4)
1. ~~Vite 골격 + tokens~~ — 됨 (tokens.css에는 서체·모서리만. 색 토큰은 §4-A에서)
2. ~~`content/` 추출~~ — 됨
3. `map/` 엔진 이식 — **7조각 중 ①~⑥ 끝(2026-10-07 커밋). ⑦ `engine.ts` 조립만 남음. 여기서부터 시작.** 임시 엔진 `engine.legacy.js`는 263줄(카드·관리·인트로·전시 모드)만 남았다.
4. 화면을 컴포넌트로(§4-2) + 스타일 정리(§4-A) + 밤 색 계산(§4-B)
5. Supabase 연결(§4-3) → 관리 화면·카카오 주소(§4-4) → 주민 클릭·이장님 영상·구글폼·이스터에그·배포(§4-5)

하지 말 것: 임시 엔진을 한 번에 다시 쓰기, `bootLegacy()` 두 번 부르기, `legacy-markup.html`의 id·class 바꾸기, `extract_from_html.py` 재실행, 키를 저장소에 올리기(`다음_작업_지침.md` §6).

## 디자인 원칙 (요약)
- 친숙하고 감각적. 복잡해 보이면 실패. 상시 글자는 랜드마크 6 + 권역 2가 상한.
- 모바일 390px 폭에서 먼저 확인. 인스타 버튼은 항상 눈에 띄게.
- AI가 즉흥으로 새 색·간격을 넣지 않도록 토큰만 쓴다.
