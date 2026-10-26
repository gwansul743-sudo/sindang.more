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
│  └─ map/             roads.json, land.json, props.json, terrain*.svg.txt, decor/(나무·집), kiosk-cut.json(전시 재단선) · kiosk-board.json(보드 장식·하늘·제목 자리) · kiosk-area.json(5길 다각형, 지금은 안 씀)
├─ src/
│  ├─ map/             ★ 지도 엔진. React·Supabase·features 모름(`shared`만 본다)
│  │  ├─ engine.ts     바깥 얼굴(아직 임시 엔진을 켜기만 함 → ⑦에서 진짜 조립)
│  │  ├─ projection.ts · viewport.ts · day.ts(해·구름·파도) · night.ts · svg.ts · layers/ · sprites/ · actors/
│  │  └─ legacy/engine.legacy.js   남은 옛 코드(부품화 끝나면 삭제)
│  ├─ features/theme-toggle/   낮밤 버튼
│  ├─ features/admin-gate/     관리자 입구(holdGate.ts, gate.css)
│  ├─ features/kiosk-board/    ★ 전시 보드: 전시 모드를 켜면 섬이 통째로 '신당 5길' 천 섬이 된다(board.ts 그리기+연출, geometry.ts, curtain.ts OFF 커튼). 시안 v2 그대로, 길만 실제 길
│  ├─ features/chief-speech/   이장님 말풍선 · chief-talk/ 큰 대화 상자(인터뷰)
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
- **전시 직전 점검(한 번)**: 전체화면 장시간 실행(전시 모드 30초 무입력 → 카메라 복귀), 네트워크 끊김 뒤 복구, 사진 로딩 실패, 핀치 확대, 새로고침, 절전 복귀, 가게 0개, 아주 긴 인터뷰, 인스타 URL 없음, 테마 전환 후 새로고침.
- 개발 서버는 CSS 말고 소스가 바뀌면 화면 전체를 새로 고친다(`vite.config.ts` 의 full-reload 플러그인, 10-23). HMR 로 App 만 갈아 끼우면 임시 엔진이 두 번 켜져 옛 엔진이 html 에 kb-on 을 남겼다(땅 없이 리넨 바다만 보이던 화면).
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
- **주민 클릭 → 인터뷰**(10-23 1명 완료): 대본은 `content/characters/villagers/*.json`(파일 하나 = 주민 하나, 형식은 `sindang-yahak.json`: id·name·store(가게 이름과 똑같이)·hook·pages, 선택 `look`(모습 지정 — `act.json` 참고: style short|bob|hat, bun·bag, col 은 팔레트 키 h머리·t윗옷·p바지·b신발·s피부·a모자·g가방, 색은 `palette.json` 안에서만. 없으면 무작위), 3장 미만은 안 띄우고 8장까지). 앞의 주민부터 하나씩 대본을 받는다(`bindVillager`, 임시 엔진 전시 모드 블록). 마우스를 올리면(터치는 첫 탭) 머리 위에 hook 말풍선(다 찍힌 뒤 3초), 누르면(터치는 두 번째 탭) 이장님과 같은 큰 상자에 장마다 넘김(이름표 '가게 · 이름'). 모바일은 대화 중 카드를 띄우지 않고(대화 상자와 겹침) 이름표 옆 '가게 카드 ›'(`TalkScript.action`)로 대화를 닫고 열거나 대화가 끝나면 연다. 터치 판정은 pointerdown 의 종류(iOS 사파리는 click 에 비어 옴). 대화가 열리면 자동 순환을 멈추고 그 주민을 비춘다(10-23): 대본 `store` 와 이름이 같은 가게 카드를 사이드바(폰 바텀시트)에 펴고(`select(st, false, true)` — 셋째 인자는 주민 대화를 닫지 않음), 사이드바가 다 펴진 뒤 주민 쪽으로 줌인(전시 보드는 자동 순환과 같은 배율, 평소 지도는 4.6 이상). 대화가 끝나면 무입력 30초를 다시 센다. 말을 거는 동안 그 주민은 멈춰 선다(`walker.hold/release`), 누를 수 있는 주민은 스프라이트 칸 전체가 투명 사각형으로 잡힌다(`makeClickable`, `.wk-talk`). 평소 지도·전시 보드 둘 다. **빨간 세모(이장님과 같은 표시)는 `kind: "form"`(시민이 구글폼으로 남긴 인터뷰) 주민에게만** — 가게 인터뷰 주민(`shop`)은 표시 없음(10-23 사용자 결정, `walker.showMark`). 지금 2명(바액트 사장님 — 모습 지정, 신당야학 박소민 강학 — 무작위). 남은 것: 고정 행인 채우기.
- **이장님 영상·자막**: `actors/chief.ts`의 이장님 `g`에 클릭(`pointer-events` 켜기) → `features/chief/`가 `<video>`와 동물의 숲식 자막 상자를 띄운다. 영상 `public/chief/chief.mp4` 20MB 이하, 자막 `content/chief/subtitles.json`.
- **구글폼 → 시민 인터뷰 주민**(10-23 코드 완료, 연결은 사용자 몫 — `tools/apps-script/설치_안내.md`): §9 파이프라인. service role(secret) 키는 Apps Script 스크립트 속성에만.
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
- **사이드바는 인트로에서 막 들어왔을 때와 가게 카드가 있을 때만**(10-23): 처음·인트로 다시 보기 때 인트로 아래서 소개('우리가 만난 신당의 가게들')와 함께 펴 두고(`#side.welcome`), 어떤 이유로든 접히면 소개는 끝(MutationObserver 가 `.welcome` 을 뗀다). 카드를 열면 펴지고 닫으면 접힌다(`closeCard(then)` → `withSide(true)`). 전시 모드·전시 끔 때는 접힘. FIELD NOTES 다시 열기 버튼은 `tokens.css` 에서 숨김(마크업 id 는 그대로). `withSide` 는 이미 그쪽으로 접히는 중이면 그 끝을 같이 기다린다.
- **카드 사진·영상 스켈레톤**(10-23): 카드를 열 때 사진을 미리 받아 보고, 다 받기 전엔 포스터 칸에 `.poster.skel`(밝은 띠가 지나감, `tokens.css`). 이미 받아 둔 사진이면 바로. 사진을 못 받으면 `photo` 를 떼 원래 픽셀 포스터로. 영상(iframe·video)은 load 뒤(최대 12초) 나타남.
- 관리자 입구: 상단바 오른쪽 끝 작은 네모 버튼 `#admin-top`을 **2초 꾹**(자판 치는 픽셀 고양이 + 가로 바, 도안은 `holdGate.ts`의 FRAME_A/B). 로그인된 관리자에겐 `is-admin` 클래스로 '가게 관리' 글자 버튼이 되어 한 번 클릭. `?admin=1`도 된다. 가게 하나를 열면 목록·로그인 상자는 숨고 수정 폼만, 제목 왼쪽 `#aback` ‹ 로 돌아온다. 호수 배지는 픽셀 폰트에 한글이 없어 본문 폰트.
- 캐릭터: 주민 5명(가게 인터뷰 대본이 5개를 넘으면 그 수만큼, 파츠 조합, 격자 17×18칸 = 그리는 폭 15 + 양옆 여백 1, 발끝 16번째 줄), 이장님+고양이(주황 줄무늬, `cat.json`, 처음엔 강아지였다). 파츠는 `.json`, 머리카락은 `head.json`의 머리 모양(short·bob·hat)에 포함.
- 그림 색: 랜드마크는 한 벌. 나무·집·땅은 `fill="밤" data-df="낮"` 두 벌 — 고칠 때 둘 다.
- stores 표에 `slug`(옛 id)·`issue`('6호') 컬럼. `published=false` = '다음 호'(점선 점). `seed.stores.json`은 fallback용으로 남긴다.
- 옛 지침서와 다르게 한 것(파츠 JSON, looks.json, decor/, seed.stores.json, slug·issue, 테마 CSS 2벌 등)은 전부 수용(10-07). 지침서 표현과 다르면 실제 파일 쪽이 맞다.
- **배포 먼저, 쪼개기는 전시 뒤**(10-14). ①~⑥은 되돌리지 않는다.

**데이터 모델** (실제 정의는 `supabase/schema.sql`):
```
stores       가게      id, slug, name, addr, lat, lng, ig_url, photo_path(표지), photo_paths(여러 장, 10-26), video_url, category, interview_md, issue, order, published
characters   인터뷰이  id, nickname, look(json: 파츠·색 seed), interview_id, status(pending|approved|hidden), created_at
interviews   인터뷰    id, source(form|shop), answers(json), summary_md, store_id?, created_at
```
- 읽기 누구나, 쓰기는 `admins` 이메일만(RLS). `characters.look`은 **파츠 조합 결과만** 저장(그림은 `content/characters/`). 랜드마크·도로·장식은 DB에 넣지 않는다(git 이력이 더 유용).

**구글폼 → 시민 인터뷰 주민 파이프라인** (서버·크론 없음, 10-23 구현):
```
구글폼 제출 → 응답 시트 '다산로44길(신당오길) 상인 설문(응답)' 행 추가 → Apps Script onFormSubmit (tools/apps-script/form_to_supabase.gs)
  → 공개해도 되는 열만 골라 interviews{source:'form', answers:{v,row,pairs:[[열 이름, 값]…]}} + characters{status: AUTO_PUBLISH ? approved : pending}
  → 앱(entities/villager/api.ts)이 approved 를 실시간(characters 표 publication) + 20초 폴링으로 읽고
  → features/villagers/formScript.ts 가 답으로 대본 생성 → 빨간 세모 주민으로 스폰, 동시 6명(FORM_SLOTS), 넘으면 먼저 온 사람부터 퇴장(FIFO)
```
- 사용자 결정(10-23): 승인 없이 **바로** 띄운다(AUTO_PUBLISH=true). 내리기는 Supabase characters.status = hidden(몇 초 안에 사라짐). 손본 대본은 interviews.summary_md 에 JSON(hook·pages·name)으로 넣으면 규칙 대신 그것을 쓴다.
- 대본 규칙(설계 메모 5판 §3): 소개(SQ1·SQ2) → 손님(문1·문11-1) → 생각(파트 A '매우 그렇다' 최대 2문장, 상인회·재개발 문장 제외) → 우리만 하는 것(문8-1) → 골목 이야기(문9-1) → 10년 뒤(문30). 응답자 글은 50자 넘으면 첫 문장, 그래도 넘거나 전화·주소·메일·욕설이면 그 장을 뺀다. 3장 미만이거나 그 사람의 말(생각·글·10년 뒤)이 하나도 없으면 띄우지 않는다. 230자 넘으면 손님 → 이야기 순으로 덜어낸다.
- **익명**: 폼 SQ3 에 '익명 처리'라고 안내돼 있어 상호는 Apps Script 가 아예 보내지 않는다. 이름표는 업종('밥집 사장님'), 기타에 직접 적은 짧은 업종은 그대로('꽃집 사장님').
- 폼을 고쳐 같은 문항 열이 두 벌(옛 문장·새 문장, 단일·복수 선택)이어도 번호('SQ1.' '문8-1.')나 파트 A 문장 사전(옛·새 둘 다)으로 찾고 값이 있는 뒤쪽 열을 쓴다.
- 외형은 캐릭터 id 를 seed 로(같은 사람은 늘 같은 모습). 새 주민은 화면 밖 길에서 걸어 들어온다. 견본 응답 `content/characters/form-samples.json`, `?formdemo=N` 으로 DB 없이 미리 보기.
- 이장님: 클릭 시 영상 재생 + 동물의 숲식 자막 상자. 이스터에그: MORE 5회 클릭 → 경관 대시보드.
- **전시 모드 = 전시 보드**(10-23, 정본은 `features/kiosk-board/board.ts` 머리 주석과 `engine.legacy.js` 전시 모드 블록): 켜면 사이드바가 접히고 카메라가 보드 전체(시안 캔버스 1774×887, 폰은 섬 폭)를 담는 자리로 간 뒤 `board.play` — ⓪ 화면이 밤색(.kb-shade, 낮→밤 커튼 색)으로 어두워지고(0.35s, 그 아래서 옛 섬·바다가 바뀐다 `html.kb-dark`) ① 0.3s 쉬고(빨간 재단선 그리기는 10-23에 뺐다) ② 어둠이 걷히는(1.4s) 동안 보드가 윤곽 자리에서 떠올라 섬만큼 펴진다(1.5s) ③ 블랭킷 스티치·하늘(해·구름·별)·물결 ④ 길 홈질 ⑤ 집·나무 ⑦ 제목 → ⑧ 이장님 쪽으로 두 단계(×1.6²) 줌인한 뒤 등장·말풍선·큰 상자(엔진, 대화가 끝나면 보드 전체로 물러남. 그 뒤 이장님에게 마우스를 올리거나 탭하면 머리 위 말풍선 '허허, 또 왔구먼! 아직 못 가 본 가게가 있나?' — `CHIEF_AGAIN`, `chief.makeHoverable`) → 마지막 장이 닫히면 ⑨ 범례(제목을 누르면 접기·펴기, 처음엔 데스크톱 펼침·폰 접힘, 클래스는 인트로 `.folded` 와 겹치지 않게 `kb-folded`)·주민·단추(`kioskRest` → `board.rest`, `html.kb-rest`. 단추는 10-23부터 여기서 차례로). 연출 중엔 지도를 만져도 끊기지 않고, 연출 동안만 보이는 '건너뛰기' 버튼(`.kb-skip`, 지도 오른쪽 위)으로만 바로 다 보이게(`kioskSkip`, 10-23). 30초 무입력이면 자동 순환(10-23): 가게 단추를 왼쪽부터 하나씩 줌인(보드 배율 ×2.6, 폰 ×2.2)하며 단추를 콩콩 강조(`board.focus`)하고 단추를 눌렀을 때와 같은 카드를 연다(사이드바가 다 펴진 뒤 카메라), 6초씩. 한 바퀴 뒤엔 카드를 닫고 보드 전체 6초. 범례 필터가 있으면 그 업종만. 입력이 오면 바로 멈추고 이미 출발한 카메라도 그 자리에서 선다(`V.stop`, 열린 카드는 둠). 활동 = 누름·휠·키 + 움직임·스크롤(capture, 0.5초에 한 번), 손가락이 닿아 있는 동안엔 시간이 지나도 시작 안 함. 기다리는 시간 `IDLE_MS` 는 사용자가 조정(10-23 현재 3초). 30초는 쉬는 상태(rest)가 되는 순간부터 새로 센다(건너뛰기 버튼은 지도 끌기를 막으려 pointerdown 을 멈추므로). **OFF 는 커튼**(`kiosk-board/curtain.ts`)으로 덮고 보드·이장님·주민·사이드바·카메라를 한 번에 되돌린다.
  - 인트로와의 순서(10-23): 인트로가 떠 있는 동안엔 뒤에서 아무것도 돌지 않는다. '인트로 다시 보기'는 전시 연출을 그 자리에서 멈추고(`stopKiosk`) 평소 지도로 되돌린다(ON/OFF 상태는 유지). 인트로가 끝나면 평소 지도 → 카메라 0.7s + 1s 뒤 전시 연출(`endIntro`). 늦게 도착하는 콜백(사이드바 접힘·커튼·지연 시작)은 차례 번호 `kioskSeq` 로 막는다.
  - 모양·톤·연출·png 자리는 시안 `MORE_exhibition_dynamic_v2.html` 그대로(사용자 결정, 낮/밤 구분 없음 — 바다 #7793b1 + 리넨, 섬 덩어리는 시안의 sine 블롭). **길만 실제 길**: 재단선 안의 `roads.json`(a·b 큰 길 = 굵은 띠 + 양 가장자리 홈질, c 골목 = 흰 띠만(10-23 점선 뺌), d 생략)을 재단선 상자 → 섬 덩어리 상자(0.92)로 균일 변환해 넣는다. 그린 뒤 정돈(10-23): `kiosk-board.json` 의 `hideRoads`(캔버스 단위 타원·다각형) 안 골목과 `hideMain` 안 큰 길은 빼고(잘린 큰 길 끝은 늘리지 않고, 그 자리에 붙은 60 미만 조각은 버린다), 맞닿은 토막은 한 줄로 이어 점선 박자를 맞추고, 막다른 큰 길은 섬 가장자리까지 늘려 실에 물려 끝나게, 길 홈질은 연하게(opacity .42/.38). 길 폭 큰 길 24·골목 11. 가게 단추도 실제 자리(재단선 밖 12단위까지 포함, 섬 밖이면 안쪽으로 밀어 넣음). 업종은 `stores.category`(없으면 기타) → 단추 무늬·범례 필터.
  - 좌표: 시안 캔버스 단위를 지도 좌표에 1:1 평행이동(캔버스 가운데 = 섬 가운데)으로 놓는다. `kiosk-board.json` 의 props·sky·waves·titleAt·chiefAt 는 전부 캔버스 단위.
  - 켜진 동안 `html.kb-on`: 섬 위 원래 층(땅·길·장식·점·랜드마크·밤 층·하늘)은 opacity 0, `#map` 바탕은 바다색. 주민은 `kb-rest` 뒤에만 보이고(`visibility`), **인터뷰가 있는 사람만**(10-26: 이장님·가게 인터뷰 주민·시민 인터뷰 주민 — 대본 없는 지나가는 주민은 `parkExtras` 로 장면에서 잠시 빠졌다가 OFF 때 돌아온다, 고양이는 이장님 곁이라 남음), 보드 위의 실제 길 그래프(`buildRoadGraph(board.roadPath(), board.land, { minLen: 40 })`)로 갈아탄다. 스프라이트 배율은 `scene.actorMul`(보드 위 1.3). 단추는 시안의 0.7배(`BTN_K`), 커피·음식점·주점·기타는 사용자 제공 천 단추 그림(`public/board/btn-*.webp`, `BTN_IMG` — 갈색 별 원·분홍 하트·노란 펠트 원·하늘색 깅엄 원), 봉제·슈퍼는 예전 무늬 단추, 단추 밑 번호는 없다, 가게 이름은 이장님 이름표와 같은 글꼴(`--font-ui` 700, 각진 외곽선), 집·나무 높이는 시안의 0.75배(kiosk-board.json). 이장님·고양이는 `chiefTo(true)` 로 시안 자리(`chiefAt`)에.
  - 리넨은 `public/board/linen.webp` 를 캔버스에 타일링해 큰 `<image>` 하나로(SVG `<pattern>` 타일은 줌아웃에서 줄무늬). 아플리케·하늘 그림은 `public/board/*.webp`(사용자 제공 png).
  - `?board=1` 로 연출 없이 다 보이는 상태로 시작(개발·확인용). `?patch_slow=N` 은 연출 N배 느리게.
  - 알려진 흠: 가게 이름표가 5길 안에서 겹친다(실제 자리가 촘촘함). 제목이 그 근처 단추 이름표와 겹칠 수 있다.
  - 헤드리스 캡처 요령: 인트로를 DOM 에서 지우면 `introOpen` 이 true 로 남아 칸 크기가 바뀔 때마다 `resetHome` — `#openMap` 클릭 → `#intro` 클릭으로 끝낼 것.
- **낮/밤 전환은 커튼으로 덮고 바꾼다**(10-16, `features/theme-toggle/switchTheme`): 목표 테마 바탕색 커튼 .25s → 시트 둘 다 로드 확인 → `html.theme-switching`으로 transition 끄고 `setTheme` → 2프레임+120ms → .32s 걷기. 폰에서 스타일시트 교체·SVG 재래스터화 중간 프레임이 지지직거려 보이던 것을 숨긴다. 근본 수정(시트 한 벌 + 변수)은 §7 스타일 정리 때.
