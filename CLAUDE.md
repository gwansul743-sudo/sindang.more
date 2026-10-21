# sindang.more 지도 — 프로젝트 맥락 (단일 정본)

> 2026-10-07 작성, 10-14 '배포 먼저'로 순서 변경, 10-16 `다음_작업_지침.md`를 이 파일로 합치고 지웠다. 새 세션은 **이 파일 하나만** 읽는다. 디자인 규칙은 `../초안 기능 정리/DESIGN_BRIEF.md`.

## 1. 무엇을 만드나
- 신당동 인스타그램 매거진 **sindang.more**(@morethan.sd)가 인터뷰한 가게들을 보여주는 지도 웹사이트.
- 인스타 프로필 링크로 들어오는 방문객(대부분 폰) + 전시장 대형 화면용.
- 가게를 누르면 **사진 → 인스타 게시물 링크 → 인터뷰 전문** 카드가 열린다. 관리자는 가게 추가·수정·사진 업로드.
- 옛날에는 지도가 HTML 파일 한 장이었다. 그걸 `content/`·`src/map/`으로 나누는 일은 7조각 중 6조각까지 끝났고, 화면은 옛날과 똑같다. 지금은 **배포된 상태에서 전시 기능을 붙이는 단계**.

## 2. 지금 어디까지 왔나
| 순서 | 하는 일 | 상태 |
|---|---|---|
| 1 | Vite + React 골격, 디자인 토큰 | ✅ |
| 2 | 그림·도로·캐릭터 파츠를 `content/`로 추출 | ✅ |
| 3 | 지도 엔진 조각내기 `src/map/` ①~⑥ | ✅ 10-07. **⑦ 조립은 전시 뒤(§7)** |
| 4 | GitHub 푸시 → Cloudflare Pages | ✅ 10-14. https://sindang-more.pages.dev |
| 5 | Supabase 저장·관리자 로그인 | ✅ 10-14 |
| 6 | 카카오 주소 → 좌표 | ✅ 10-14 |
| 7 | **전시 기능** (주민 클릭·이장님 영상·구글폼·이스터에그) | ⬜ **다음 할 일 (§6)** |
| 8 | 전시 뒤 정리 (⑦ 조립, React 부품화, 스타일, 밤 색) | ⬜ (§7) |

**사용자가 직접 할 일(남음)**: Cloudflare Pages 환경 변수에 `VITE_KAKAO_JS_KEY` 넣기. 배포 주소에서 `?admin=1` 로그인 → 가게 수정·저장 → 새로고침 후 남아 있는지 → 사진 업로드 한 번 확인. -> 완료함

끝난 조각 ①~⑥: 투영 `projection.ts` · 뷰포트 `viewport.ts` · 층 `layers/`(roads·terrain·land·landmarks·dots) · 스프라이트 `sprites/`(compose·frames) · 배우 `actors/`(roadGraph·scene·walker·chief·cat) · 밤 `night.ts` + `features/theme-toggle/`. 옛 스크립트 `src/map/legacy/engine.legacy.js`는 776줄 → 약 290줄(카드·관리 폼·인트로·전시 모드만 남음).

## 3. 폴더 지도
```
sindang.more/
├─ content/            ★ 그림·좌표·파츠. 코드 아님. 정본(옛 HTML에서 다시 추출하지 않음)
│  ├─ landmarks/       랜드마크 그림(*.pixel.txt) + landmarks.json
│  ├─ characters/      parts/*.json, palette.json, looks.json(주민 조합), chief.json, cat.json
│  └─ map/             roads.json, land.json, props.json, terrain*.svg.txt, decor/(나무·집)
├─ src/
│  ├─ map/             ★ 지도 엔진. React·Supabase·features 모름(`shared`만 본다)
│  │  ├─ engine.ts     바깥 얼굴(아직 임시 엔진을 켜기만 함 → ⑦에서 진짜 조립)
│  │  ├─ projection.ts · viewport.ts · day.ts(해·구름·파도) · night.ts · svg.ts · layers/ · sprites/ · actors/
│  │  └─ legacy/engine.legacy.js   남은 옛 코드(부품화 끝나면 삭제)
│  ├─ features/theme-toggle/   낮밤 버튼
│  ├─ features/admin-gate/     관리자 입구(holdGate.ts, gate.css)
│  ├─ features/kiosk-patch/    전시 구역(신당 5길) 바닥 천 조각 + 봉제 연출 → kiosk-stamps/ 와펜 → chief-speech/ 말풍선
│  ├─ entities/        가게·랜드마크·캐릭터 타입. store/api.ts = Supabase 읽기·쓰기, DB 없으면 seed JSON
│  ├─ app/             App.tsx(조립), content.ts(content/ 읽기), legacy-markup.html(옛 마크업)
│  └─ shared/          styles/(tokens·낮·밤 CSS), lib/(supabase.ts·auth.ts·geocode.ts)
├─ supabase/           schema.sql · storage.sql · seed.sql · seed.stores.json
├─ public/seed-photos/ 가게 사진 4장
├─ tools/              check_screen.mjs(화면 자동 확인) · night_palette.reference.json(밤 색 변환표)
└─ .github/workflows/supabase-ping.yml   매주 월요일 Supabase 핑(일시정지 방지)
```
옛 한 장짜리 HTML들은 `../디자인모음/`(기준 `게임_낮밤_초안.html`, REV 28). `../초안 기능 정리/`에 `DESIGN_BRIEF.md`, `check_core.py`, 뼈대 HTML. 옛 HTML은 참고용이며 더 고치지 않는다.

## 4. 개발 환경과 확인 방법
- Node는 fnm(v24). 셸에 안 잡혀 있으면 `eval "$(fnm env)"` 후 npm. `node_modules`는 macOS용 — 다른 OS에서 빌드하려면 `git archive`로 복사해 그쪽에서 `npm install`.
- 한 단계 = 커밋 1개 + 아래 확인. git·GitHub 푸시는 사용자가 관리한다(Claude는 로컬 커밋만, 푸시 안 함).
```bash
npm run build                 # 타입 검사 + 빌드. 오류 0
node tools/check_screen.mjs   # 헤드리스 Chrome. 마지막 줄 "통과"
```
- `check_screen.mjs`가 보는 것: 데스크톱·모바일 × 낮·밤 4화면에서 숫자(가게점 11 · 주민 7 · 장식 217 · 가로등 53 · 랜드마크 6 · 권역 2 · 도로 4), 이장님·고양이 path 해시, SVG 층 순서, viewBox, 가게 점 클릭 → 카드·사진, 테마 버튼, 휠·드래그·확대, 주민이 걷는지, 이장님 호버 손인사, 콘솔 오류 0.
- 기준값 `tools/.baseline.json`(git 무시)은 **일부러 화면을 바꿨을 때만** `--baseline`으로 다시 찍는다. 빌드 로그의 "chunk 600KB" 경고는 무시.
- **전시 직전 점검(한 번)**: 전체화면 장시간 실행(전시 모드 30초 무입력 → 6초 순환), 네트워크 끊김 뒤 복구, 사진 로딩 실패, 핀치 확대, 새로고침, 절전 복귀, 가게 0개, 아주 긴 인터뷰, 인스타 URL 없음, 테마 전환 후 새로고침.
- 모바일 390px 폭에서 먼저 확인. 인스타 버튼은 항상 눈에 띄게.

## 5. 연결된 서비스 설정 메모 (키는 전부 `.env`, git 무시)
**Cloudflare Pages** — GitHub main 푸시 → 자동 배포. 빌드 `npm run build`, 출력 `dist`. 환경 변수 `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록됨. `VITE_KAKAO_JS_KEY`는 사용자가 넣을 것. 파일당 25MB 제한.

**Supabase** (프로젝트 `sindang.more`, Seoul, Free) — `schema.sql`·`storage.sql`(버킷 photos)·`seed.sql`(가게 11곳, 사진은 `/seed-photos/` 정적 경로) 실행됨. `admins` 표의 이메일만 쓰기 가능(RLS). `.env`의 `VITE_SUPABASE_ANON_KEY` = Publishable key.
- 로그인: 이메일+비밀번호(`shared/lib/auth.ts`, `is_admin()`). 세션은 브라우저에 남는다. 비밀번호 변경·처음 설정은 관리 패널 안에서. 잊었을 때만 메일 링크 — Authentication → URL Configuration: Site URL = 배포 주소, Redirect URLs에 `http://localhost:5173/**`, `https://sindang-more.pages.dev/**`.
- fallback: DB 조회 실패나 표가 비면 `seed.stores.json` 읽기 전용. DB 없이 `npm run dev`일 때만 메모리 목업 저장.
- 핑 워크플로는 GitHub Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` 필요.

**카카오 지도** — 앱 "Gwansul - sindang.more"(ID 1607868), JavaScript 키 "sindang-more", SDK 도메인 `http://localhost:5173`·`http://localhost:4199`·`https://sindang-more.pages.dev`. `shared/lib/geocode.ts`가 가게 주소의 "좌표 찾기" 버튼·주소 칸 Enter치거나 포커스 이탈할 때 돈다. 지도 범위 밖이면 거절, 못 찾으면 "지도에서 찍기" 안내.

**관련 자료**: `~/Documents/경관데이터/dashboard/`(경관 대시보드)에 같은 위경도 체계의 건물 1만 동·상가 8,033곳·인터뷰 21건. 단 거기의 `config.json`에는 과금 API 키가 평문으로 있으니 **절대 복사하지 말 것**.

## 6. 다음 할 일: 전시 기능 (서로 독립, 기능 하나 → 확인 → 커밋)
우선순위는 전시 기획에 따른다.
- **주민 클릭 → 인터뷰 카드**: 주민은 `src/map/actors/walker.ts`. 클릭을 `engine.ts`의 `on('character:click')`으로 올리고, 카드는 `features/walkers/`(가게 카드와 같은 틀). 손인사는 그대로.
- **이장님 영상·자막**: `actors/chief.ts`의 이장님 `g`에 클릭(`pointer-events` 켜기) → `features/chief/`가 `<video>`와 동물의 숲식 자막 상자를 띄운다. 영상 `public/chief/chief.mp4` 20MB 이하, 자막 `content/chief/subtitles.json`.
- **구글폼 → 캐릭터**: §9. service role 키는 Apps Script 속성에만.
- **이스터에그**: 상단 "MORE" 5회 클릭 → 경관 대시보드(별도 Pages 프로젝트). `features/easter-egg/`.

## 7. 전시 뒤 (화면이 안 바뀌는 정리)
**⑦ `engine.ts` 진짜 조립**: `createEngine(host, data)`가 projection → land → viewport → layers → scene → night 순으로 만든다(임시 엔진 앞부분의 투영·층·뷰포트·render가 옮겨갈 내용). 바깥 API: `setStores`, `select(id)`, `centerOn`, `homeView`, `zoom(f)`, `toLatLng(clientX, clientY)`, `on('store:select'|'chief:click'|'character:click')`, `destroy()`. 이때 `Object.assign(window, …)`를 없애고 `onclick="…"`을 `addEventListener`로.

**화면을 React 부품으로** (`legacy-markup.html`을 구역별로 잘라 옮기고, 옮긴 구역은 마크업·임시 엔진에서 지운다):
| 구역 | 갈 곳 | 임시 엔진에서 같이 빠지는 것 |
|---|---|---|
| 상단바 (MORE · 버튼 4개) | `app/App.tsx` | 전시 모드 토글, 인트로 다시 보기 |
| 인트로 | `features/intro/` | openMap · endIntro · playIntro |
| 가게 카드 (사이드/바텀시트) | `features/store-card/` | select · step · closeCard · renderInterview |
| 관리 패널 + 폼 | `features/admin-stores/` | editStore · saveStore · geocode · startPick · 사진 미리보기 |
| 전시 모드 자동 순환 | `features/kiosk/` | wake · startCycle |
끝나면 `legacy-markup.html`·`engine.legacy.js` 삭제, 문구는 `content/copy.ko.json`으로.

**스타일 정리**: 낮·밤 CSS 두 벌은 색만 다르다. 공통은 `shared/styles/base.css`, 색은 `tokens.css`의 `[data-theme]` 변수로. 옆 패널 섬 그림(CSS 안 data URI 약 100KB×2)은 파일로.
**밤 색을 계산으로(선택)**: 나무·집·땅의 `fill="밤" data-df="낮"` 두 벌을 낮 한 벌로 줄이고 밤은 `tools/night_palette.reference.json` 규칙으로.

## 8. 하지 말 것
- 임시 엔진을 한 번에 다시 쓰기. 조각 하나 → 확인 → 커밋. 한 번에 두 기능 작업 금지.
- 전시 전에 ⑦ 조립·React 부품화 시작하기.
- `bootLegacy()` 두 번 부르기(문서 id 의존). `App.tsx`의 `booted` 가드와 StrictMode 미사용은 그래서다.
- `legacy-markup.html`의 id·class 바꾸기(임시 엔진이 참조). 컴포넌트로 옮긴 구역만.
- 옛 HTML에서 `content/` 다시 추출하기(추출 스크립트는 git 역사의 `tools/extract_from_html.py`).
- 화면이 달라진 이유를 모르는데 `--baseline` 덮어쓰기.
- `.env`, service role 키, 카카오 REST 키를 저장소에 올리기.
- `src/map/`에서 React·Supabase·features 가져오기.
- AI가 즉흥으로 새 색·간격 넣기 — 토큰만 쓴다. 상시 글자는 랜드마크 6 + 권역 2가 상한.

## 9. 이미 결정된 것 · 확인된 사실
**스택** (소규모·과금 상한 고정): Vite + React + TS(정적 빌드) · FSD 4층(`app/features/entities/shared`) + `map/` 엔진 + `content/` · CSS Modules + 토큰(Tailwind 안 씀) · Radix Primitives · motion(UI만) · Pretendard + 세리프 서브셋 · Cloudflare Pages · Supabase Free · 카카오 JS geocoder(서버 없음) · 구글폼 → Apps Script → Supabase REST · GitHub. AI 챗봇·V-World 키는 v1 제외(필요하면 Cloudflare Functions 뒤). 공유용 가게별 OG 페이지가 필요해지면 Astro 검토.
- 지도 엔진은 React 밖 독립 모듈. React는 ref로 마운트해 이벤트만 주고받는다.
- **좌표는 실제 위경도**. 가게 11곳·랜드마크·도로(OSM) 모두 실좌표, `proj()`가 웹 메르카토르로. 장식용 집·나무·지형만 일러스트.
- 관리자 입구: 상단바 오른쪽 끝 작은 네모 버튼 `#admin-top`을 **2초 꾹**(자판 치는 픽셀 고양이 + 가로 바, 도안은 `holdGate.ts`의 FRAME_A/B). 로그인된 관리자에겐 `is-admin` 클래스로 '가게 관리' 글자 버튼이 되어 한 번 클릭. `?admin=1`도 된다. 가게 하나를 열면 목록·로그인 상자는 숨고 수정 폼만, 제목 왼쪽 `#aback` ‹ 로 돌아온다. 호수 배지는 픽셀 폰트에 한글이 없어 본문 폰트.
- 캐릭터: 주민 5명(파츠 조합, 격자 17×18칸 = 그리는 폭 15 + 양옆 여백 1, 발끝 16번째 줄), 이장님+고양이(주황 줄무늬, `cat.json`, 처음엔 강아지였다). 파츠는 `.json`, 머리카락은 `head.json`의 머리 모양(short·bob·hat)에 포함.
- 그림 색: 랜드마크는 한 벌. 나무·집·땅은 `fill="밤" data-df="낮"` 두 벌 — 고칠 때 둘 다.
- stores 표에 `slug`(옛 id)·`issue`('6호') 컬럼. `published=false` = '다음 호'(점선 점). `seed.stores.json`은 fallback용으로 남긴다.
- 옛 지침서와 다르게 한 것(파츠 JSON, looks.json, decor/, seed.stores.json, slug·issue, 테마 CSS 2벌 등)은 전부 수용(10-07). 지침서 표현과 다르면 실제 파일 쪽이 맞다.
- **배포 먼저, 쪼개기는 전시 뒤**(10-14). ①~⑥은 되돌리지 않는다.

**데이터 모델** (실제 정의는 `supabase/schema.sql`):
```
stores       가게      id, slug, name, addr, lat, lng, ig_url, photo_path, interview_md, issue, order, published
characters   인터뷰이  id, nickname, look(json: 파츠·색 seed), interview_id, status(pending|approved|hidden), created_at
interviews   인터뷰    id, source(form|shop), answers(json), summary_md, store_id?, created_at
```
- 읽기 누구나, 쓰기는 `admins` 이메일만(RLS). `characters.look`은 **파츠 조합 결과만** 저장(그림은 `content/characters/`). 랜드마크·도로·장식은 DB에 넣지 않는다(git 이력이 더 유용).

**구글폼 → 캐릭터 파이프라인** (서버·크론 없음):
```
구글폼 제출 → 연결된 구글시트 행 추가 → Apps Script onFormSubmit
  → Supabase REST로 interviews + characters(status=pending) INSERT  (service role 키는 Apps Script 속성에만)
  → 관리자가 승인 → 앱이 approved 캐릭터를 불러와 walkers로 스폰 → 클릭 시 인터뷰 카드
```
- 외형은 look을 비워 두고 앱이 처음 볼 때 seed로 랜덤 생성(더 단순). 쿠폰 코드 검증이 필요하면 폼 항목 + Apps Script 대조.
- 이장님: 클릭 시 영상 재생 + 동물의 숲식 자막 상자. 이스터에그: MORE 5회 클릭 → 경관 대시보드.
- **낮/밤 전환은 커튼으로 덮고 바꾼다**(10-16, `features/theme-toggle/switchTheme`): 목표 테마 바탕색 커튼 .25s → 시트 둘 다 로드 확인 → `html.theme-switching`으로 transition 끄고 `setTheme` → 2프레임+120ms → .32s 걷기. 폰에서 스타일시트 교체·SVG 재래스터화 중간 프레임이 지지직거려 보이던 것을 숨긴다. 근본 수정(시트 한 벌 + 변수)은 §7 스타일 정리 때.
