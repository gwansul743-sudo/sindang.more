# sindang.more 지도 — 프로젝트 맥락 (단일 정본)

> 새 세션은 **이 파일 하나만** 읽는다(10-26 정리: 성능 지침도 §8로 합쳤다). 디자인 규칙은 `../초안 기능 정리/DESIGN_BRIEF.md`. 세부 동작의 정본은 각 파일 머리 주석.

## 1. 무엇을 만드나
- 신당동 인스타그램 매거진 **sindang.more**(@morethan.sd)가 인터뷰한 가게들을 보여주는 지도 웹사이트. https://sindang-more.pages.dev
- 인스타 프로필 링크로 들어오는 방문객(대부분 폰) + 전시장 대형 화면(전시 모드).
- 가게를 누르면 **사진(여러 장)·영상 → 인스타 게시물 링크 → 인터뷰 전문** 카드. 관리자는 가게 추가·수정·사진 업로드.
- 주민·이장님을 누르면 인터뷰 대화 상자. 구글폼 응답이 시민 인터뷰 주민으로 지도에 걸어 들어온다.

## 2. 지금 상태
| 일 | 상태 |
|---|---|
| Vite+React 골격, `content/` 추출, 엔진 조각 ①~⑥ | ✅ |
| Cloudflare Pages 배포 · Supabase 저장·로그인 · 카카오 주소→좌표 | ✅ |
| 전시 보드(전시 모드) · 자동 순환 · 주민 대화 · 구글폼 주민 · 카드 사진 여러 장·사진 뷰어·영상 | ✅ |
| 팬·줌 렉 1차 수정(§8) | ✅ |
| **남은 전시 기능**: 이장님 영상·자막, 이스터에그, 고정 행인 대본 채우기 | ⬜ §6 |
| 전시 뒤 정리(⑦ 조립·React 부품화·스타일·렉 근본 해결) | ⬜ §7 |

## 3. 폴더 지도
```
sindang.more/
├─ content/            ★ 그림·좌표·파츠·대본. 코드 아님. 정본(옛 HTML에서 다시 추출하지 않음)
│  ├─ landmarks/       랜드마크 그림(*.pixel.txt) + landmarks.json
│  ├─ characters/      parts/·palette.json·looks.json·chief.json·cat.json · villagers/*.json(주민 대본) · form-samples.json
│  └─ map/             roads.json, land.json, props.json, terrain*, decor/ · kiosk-cut.json(재단선) · kiosk-board.json(보드 장식·하늘·제목 자리)
├─ src/
│  ├─ map/             ★ 지도 엔진. React·Supabase·features 모름(`shared`만 본다)
│  │  ├─ engine.ts     바깥 얼굴(아직 임시 엔진을 켜기만 함 → ⑦에서 진짜 조립)
│  │  ├─ projection · viewport · day · night · svg · layers/ · sprites/ · actors/(roadGraph·scene·walker·chief·cat)
│  │  └─ legacy/engine.legacy.js   임시 엔진(카드·관리 폼·인트로·전시 모드·자동 순환). 부품화 끝나면 삭제
│  ├─ features/        theme-toggle · admin-gate · kiosk-board(★ 전시 보드) · chief-speech · chief-talk(큰 대화 상자) · villagers(주민 대본·구글폼 주민) · photo-viewer · click-burst · intro-foil
│  ├─ entities/        타입 + store/api.ts(Supabase, DB 없으면 seed JSON) · villager/api.ts
│  ├─ app/             App.tsx(조립), content.ts, legacy-markup.html(옛 마크업 — 빌드 때 index.html 에 정적으로 들어간다, §8)
│  └─ shared/          styles/(tokens·낮·밤 CSS), lib/(supabase·auth·geocode·image)
├─ supabase/           schema.sql · storage.sql · seed.sql · seed.stores.json(fallback)
├─ public/             seed-photos/ · board/(보드 천 그림 webp)
├─ tools/              check_screen.mjs · apps-script/(구글폼 → Supabase) · night_palette.reference.json
└─ .github/workflows/supabase-ping.yml   매주 월요일 Supabase 핑(일시정지 방지)
```
옛 한 장짜리 HTML은 `../디자인모음/`(참고용, 고치지 않음).

## 4. 개발 환경과 확인
- Node는 fnm(v24): `eval "$(fnm env)"` 후 npm. `node_modules`는 macOS용.
- 한 단계 = 커밋 1개 + 아래 확인. **푸시는 사용자가**(Claude는 로컬 커밋만).
```bash
npm run build                 # 타입 검사 + 빌드. 오류 0 ("chunk 600KB" 경고는 무시)
node tools/check_screen.mjs   # 헤드리스 Chrome. 마지막 줄 "통과"
```
- `check_screen`: 데스크톱·모바일 × 낮·밤에서 개수(가게점·주민·장식·가로등·랜드마크·권역·도로)·이장님/고양이 해시·층 순서·viewBox·카드 열기·테마·휠/드래그/확대·걷기·손인사·콘솔 오류를 기준값 `tools/.baseline.json`(git 무시)과 비교. **기준값은 일부러 화면을 바꿨을 때만** `--baseline`. 실DB를 읽으므로 가게 수가 바뀌면 가게점·viewBox·휠/드래그 값이 같이 어긋난다(10-26: 기준 19곳 → 실DB 28곳) — 이유가 그것뿐이면 다시 찍는다.
- 헤드리스 요령: 인트로는 `#openMap` 클릭 → `#intro.done` 대기로 끝낼 것(DOM 에서 지우면 `introOpen` 이 남는다). 카드 열기 = `.dot` click 후 `step(1)`.
- 개발 서버는 CSS 외 소스가 바뀌면 전체 새로고침(`vite.config.ts`). HMR 로 임시 엔진이 두 번 켜지면 화면이 깨진다.
- 모바일 390px 먼저. 인스타 버튼은 항상 눈에 띄게.
- **전시 직전 점검(한 번)**: 전체화면 장시간, 네트워크 끊김·복구, 사진 실패, 핀치, 새로고침, 절전 복귀, 가게 0개, 긴 인터뷰, 인스타 URL 없음, 테마 전환 후 새로고침, 영상 재생 중 자동 순환.

## 5. 연결된 서비스 (키는 전부 `.env`, git 무시)
**Cloudflare Pages** — main 푸시 → 자동 배포. 빌드 `npm run build`, 출력 `dist`. 환경 변수 `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KAKAO_JS_KEY`. 파일당 25MB.

**Supabase** (`sindang.more`, Seoul, Free) — schema·storage(버킷 photos)·seed 실행됨. `admins` 표 이메일만 쓰기(RLS). anon key = Publishable key.
- 로그인: 이메일+비밀번호(`shared/lib/auth.ts`, `is_admin()`), 비밀번호 변경은 관리 패널 안. 메일 링크용 Redirect URLs: `http://localhost:5173/**`, `https://sindang-more.pages.dev/**`.
- fallback: DB 실패·빈 표면 `seed.stores.json` 읽기 전용. DB 없이 `npm run dev` 일 때만 메모리 목업 저장.
- 핑 워크플로: GitHub Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

**카카오** — 앱 ID 1607868, JS 키 "sindang-more", SDK 도메인 localhost:5173·4199·배포 주소. `geocode.ts`: 관리 폼 '좌표 찾기'·주소 칸 Enter/blur. 지도 범위 밖 거절, 못 찾으면 '지도에서 찍기'.

**관련 자료**: `~/Documents/경관데이터/dashboard/`(같은 위경도 체계 건물·상가·인터뷰). 거기 `config.json`엔 과금 API 키가 평문 — **절대 복사 금지**.

## 6. 남은 전시 기능 (기능 하나 → 확인 → 커밋)
- **이장님 영상·자막**: 이장님 클릭 → `features/chief/`가 `<video>` + 동물의 숲식 자막 상자. 영상 `public/chief/chief.mp4` 20MB 이하, 자막 `content/chief/subtitles.json`.
- **이스터에그**: 상단 "MORE" 5회 클릭 → 경관 대시보드(별도 Pages 프로젝트). `features/easter-egg/`.
- **고정 행인 대본**: `content/characters/villagers/*.json` 추가(형식 §9 주민).
- 구글폼 연결은 사용자 몫(`tools/apps-script/설치_안내.md`). service role 키는 Apps Script 스크립트 속성에만.

## 7. 전시 뒤 (화면이 안 바뀌는 정리)
**⑦ `engine.ts` 진짜 조립**: `createEngine(host, data)`가 projection → land → viewport → layers → scene → night 순으로. 바깥 API: `setStores`, `select(id)`, `centerOn`, `homeView`, `zoom(f)`, `toLatLng`, `on('store:select'|'chief:click'|'character:click')`, `destroy()`. `Object.assign(window, …)`·`onclick="…"` 없애기.

**React 부품화** (`legacy-markup.html`을 구역별로 옮기고 옮긴 구역은 마크업·임시 엔진에서 지움): 상단바 → `app/App.tsx` · 인트로 → `features/intro/` · 가게 카드 → `features/store-card/` · 관리 패널 → `features/admin-stores/` · 자동 순환 → `features/kiosk/`. 끝나면 `legacy-markup.html`·`engine.legacy.js` 삭제, 문구는 `content/copy.ko.json`.

**스타일**: 낮·밤 CSS 두 벌은 색만 다르다 → 공통 `base.css` + `tokens.css`의 `[data-theme]` 변수. 옆 패널 섬 그림(data URI 약 100KB×2)은 파일로. (선택) 나무·집·땅의 `fill="밤" data-df="낮"` 두 벌을 `night_palette.reference.json` 계산으로.

**렉 근본 해결**: §8. **JS 나누기**(관리 패널·전시 보드): §8 첫 화면.

## 8. 성능
### 첫 화면 (10-26)
- **표지는 JS 없이 바로 그려진다**: `vite.config.ts` staticShell 이 `legacy-markup.html`(마크업)·`content/` 의 `*.pixel.txt`(집·나무·랜드마크 `<symbol>`, `#px-defs` — 표지와 지도가 같이 씀)를 index.html 에 끼우고, 낮·밤 테마 시트는 인라인 스크립트가 head 맨 앞에서 preload → `</head>` 앞에서 `<link id="css-day|css-night">`(번들 CSS 뒤라 우선순위는 예전과 같다). 낮이면 표지 뒤 인라인 스크립트가 섬 그림을 먼저 낮 색으로. JS 전에 누른 '탐험 시작'은 기억했다가 엔진이 켜지면 연다.
- 글꼴: 표지용(Inter · IBM Plex Sans KR · Pixelify Sans)만 렌더를 막고, 손글씨체(Gaegu · Nanum Pen Script)는 `media=print` → onload. 새 글꼴을 넣을 땐 표지에 쓰는지로 둘 중 하나에.
- Supabase 라이브러리는 첫 JS 에 없다: 공개 읽기는 `restGet`(REST fetch), 로그인·쓰기·사진·실시간만 `getSupabase()` 가 그때 받는다(`shared/lib/supabase.ts`).
- 측정(느린 4G + CPU ×4, 헤드리스): 표지 3.4 → 1.2초, 긴 작업 약 680 → 340ms, 가게 점 7.0 → 6.1초. 메인 JS 897 → 576KB(gzip 277 → 192KB).
- **안 한 것**: 관리 패널·전시 보드를 따로 받기 — 둘 다 임시 엔진 안에 엮여 있어(보드는 부팅 때 mountBoard) ⑦·부품화 때. React(gzip 약 45KB)는 지금 껍데기로만 쓰여 빼면 그만큼 준다 — 스택 결정이라 사용자 판단.

### 팬·줌 렉 (10-25 측정·수정, 옛 `성능_지침_팬줌렉.md` 요약)
- **원인**: 카메라가 움직일 때 viewBox 가 바뀌면 브라우저가 SVG 전체(요소 약 2,700개)를 CPU로 다시 래스터한다. JS가 아니라 그리기 비용(2초 팬 중 래스터 ≈100%). 가만히 있을 땐 60fps.
- **한 것**: 제스처·비행·휠·핀치 중엔 viewBox 대신 `svg.style.transform`(+ `will-change`)으로 움직이고 끝날 때 한 번 커밋(`viewport.ts` applyLive/commit, `onLive` 로 말풍선·팝업만 따라감). SVG는 칸보다 사방 20%(BLEED) 크게 그려 viewBox 속성값도 그만큼 넓다. `body.far .rd-c` 는 `display:none`, 밤 번짐 선 이음 miter, 전시 모드에서 숨긴 옛 섬 층은 `display:none`·줌아웃 비행은 출발 때 한 번 커밋. 끌기 데스크톱 낮 46→19ms, 밤 73→32ms(헤드리스).
- **해 보고 버린 것(측정 근거)**: roads.json 공선 점 합치기(합칠 점 4% 미만), 그룹 opacity→stroke-opacity(잡음 안), 밤 가로등·불빛 줄이기(각 5~10%뿐).
- **남은 비용**: 낮은 땅 path 약 700 + 장식 `<use>` 220, 밤은 `night-ground`(결 무늬 + 번짐 선)·하늘. 커밋 순간(줌 끝)에 한 번 버벅일 수 있다.
- **근본 해법(⑦ 때)**: 땅·도로·장식·하늘·밤 효과를 줌 단계별 비트맵(canvas 또는 `<image>`)으로 한 번 굽고 SVG에는 움직이는 것(주민·점·이름표·보드)만. 이 상태면 viewBox 를 매 프레임 바꿔도 60fps(측정됨).
- 재측정: 배포 주소 → 인트로 끝내기 → rAF로 viewBox 를 흔들며 프레임 간격 기록, 층을 하나씩 `display:none` 하며 비교. 트레이스는 CDP `devtools.timeline,cc` 의 `DisplayItemList::Raster` 합계.

## 9. 하지 말 것
- 임시 엔진을 한 번에 다시 쓰기. 한 번에 두 기능 작업.
- 전시 전에 ⑦ 조립·React 부품화 시작하기.
- `bootLegacy()` 두 번 부르기(`App.tsx` 의 `booted` 가드·StrictMode 미사용은 그래서). 마크업을 다시 JS(innerHTML)로 넣기 — 표지가 JS 를 기다리게 된다.
- `legacy-markup.html`의 id·class 바꾸기(옮긴 구역만).
- 옛 HTML에서 `content/` 다시 추출하기.
- 화면이 달라진 이유를 모르는데 `--baseline` 덮어쓰기.
- `.env`·service role 키·카카오 REST 키를 저장소에 올리기.
- `src/map/`에서 React·Supabase·features 가져오기.
- 즉흥으로 새 색·간격 넣기 — 토큰만. 상시 글자는 랜드마크 6 + 권역 2가 상한.

## 10. 결정된 것 · 확인된 사실
**스택** (소규모·과금 상한 고정): Vite + React + TS(정적) · FSD(`app/features/entities/shared`) + `map/` 엔진 + `content/` · CSS Modules + 토큰(Tailwind 안 씀) · Pretendard · Cloudflare Pages · Supabase Free · 카카오 JS geocoder · 구글폼 → Apps Script → Supabase REST. AI 챗봇·V-World 는 v1 제외.
- 지도 엔진은 React 밖 독립 모듈. **좌표는 실제 위경도**(가게·랜드마크·OSM 도로), 장식 집·나무·지형만 일러스트.
- 그림 색: 랜드마크 한 벌, 나무·집·땅은 `fill="밤" data-df="낮"` 두 벌 — 고칠 때 둘 다.
- 옛 지침서와 실제 파일이 다르면 실제 파일이 맞다. ①~⑥은 되돌리지 않는다.

**데이터 모델** (정의는 `supabase/schema.sql`, 읽기 누구나·쓰기 admins):
```
stores      id, slug, name, addr, lat, lng, ig_url, photo_path(표지), photo_paths(여러 장), video_url, category, interview_md, issue('6호'), order, published(false = 다음 호, 점선 점)
characters  id, nickname, look(json: 파츠 조합 결과만), interview_id, status(pending|approved|hidden), created_at
interviews  id, source(form|shop), answers(json), summary_md, store_id?, created_at
```

**화면 동작**
- 사이드바는 인트로에서 막 들어왔을 때(소개 `#side.welcome`, 한 번 접히면 끝)와 가게 카드가 있을 때만 펴진다. 카드 닫으면 접힘(`closeCard(then)` → `withSide`). 전시 모드에선 접힘.
- 카드 포스터: 사진은 미리 받아 보고 그 전엔 스켈레톤(`.poster.skel`), 실패하면 픽셀 포스터. 여러 장은 옆으로 넘김(scroll-snap), 누르면 사진 뷰어. 사진은 올릴 때 긴 변 1600px WebP로 자동 축소(`shared/lib/image.ts`).
- 카드 영상: `video_url` 이 드라이브·유튜브면 iframe, mp4 등이면 `<video>`, 그 밖엔 '영상 보기' 링크. 칸은 16:9. **드라이브 플레이어는 폭 512px 아래에서 영상을 잘라 보여서** 560×315 로 그리고 `transform: scale` 로 줄인다(`driveFit`). 영상 재생 중엔 자동 순환을 안 한다(`<video>` 는 paused, iframe 은 안을 누른 뒤 포커스가 있는 동안·최대 10분, 전체화면).
- 관리자 입구: 상단바 오른쪽 끝 `#admin-top` **2초 꾹**(픽셀 고양이 게이지), 로그인 뒤엔 '가게 관리' 버튼. `?admin=1` 도 된다.
- 낮/밤 전환은 커튼으로 덮고 바꾼다(`theme-toggle/switchTheme`) — 폰에서 시트 교체 중간 프레임이 지지직거려서.

**캐릭터·주민 대화**
- 걷는 주민은 **모두 7명까지**(10-28, `engine.legacy.js` WALK_MAX·FORM_SLOTS·shopFit): 구글폼 시민 인터뷰 주민이 먼저 최대 5명, 남은 자리를 가게 인터뷰 주민(대본 중 무작위)으로 채운다 — 폼 0명 → 가게 최대 7, 폼 4 → 가게 3, 폼 10 → 폼 5 + 가게 2. 가게 주민은 40초마다 먼저 나온 사람이 퇴장·안 나온 사람이 화면 밖에서 걸어 들어온다(SHOP_SWAP_MS, 말 거는 중엔 안 내보냄). 대본 없는 지나가는 사람은 없다. 파츠 조합, 격자 17×18. 이장님 + 고양이(`cat.json`).
- 주민 대본 `content/characters/villagers/*.json`: id·name·store(가게 이름과 똑같이)·hook·pages(3~8장), 선택 `look`(`act.json` 참고 — style short|bob|hat, bun·bag, col 은 `palette.json` 키). `store` 는 실DB 가게 이름과 똑같이(예: '나은데이 필라테스'). 지금 5명(바액트·신당야학·표주·두런두런·나은데이).
- hover(터치는 첫 탭): 머리 위 hook 말풍선. 판정은 그려진 몸 칸(`scene.ts` overBody)을 매 프레임 `HoverProbe` 가 본다. 새 말풍선이 옛 것을 닫고, 큰 대화 상자·전시 연출 중엔 안 뜬다. 전시 보드에선 보드 전체에서 + 버튼(×1.6)을 데스크톱 1번·좁은 창 2번 누른 배율부터(`hoverZooms`).
- 누르면(터치는 두 번째 탭, 누르는 칸 44px) 큰 대화 상자(이름표 '가게 · 이름', Skip »). 그 가게 카드를 펴고 주민 쪽으로 줌인, 자동 순환 멈춤, 주민은 멈춰 섬(`walker.hold`). 폰은 카드 대신 이름표 옆 '가게 카드 ›'.
- 머리 위 세모 표시는 `kind: "form"`(시민 인터뷰) 주민에게만 — **초록**(10-28, `chief.json` mark.formColors). 이장님 세모는 빨강 그대로.

**구글폼 → 시민 인터뷰 주민** (서버·크론 없음):
```
폼 제출 → 응답 시트 → Apps Script(tools/apps-script/form_to_supabase.gs) → 공개해도 되는 열만 interviews{source:'form'} + characters{approved}
  → 앱(entities/villager/api.ts) 실시간 + 20초 폴링 → features/villagers/formScript.ts 대본 생성 → 주민 스폰(동시 5명, FIFO — 남는 자리는 가게 주민)
```
- 승인 없이 바로 띄움(AUTO_PUBLISH). 내리기 = `characters.status = hidden`. 손본 대본은 `interviews.summary_md` 에 JSON(hook·pages·name).
- 대본 규칙·익명 처리(상호 안 보냄, 이름표는 업종 '밥집 사장님')·폼 열 이름 찾기는 `formScript.ts`·`.gs` 머리 주석. `?formdemo=N` 으로 DB 없이 미리 보기.

**전시 모드 = 전시 보드** (정본: `features/kiosk-board/board.ts` 머리 주석 + `engine.legacy.js` 전시 모드 블록):
- 켜면 섬이 시안 `MORE_exhibition_dynamic_v2.html` 그대로의 천 섬이 된다(바다 #7793b1 + 리넨, 낮/밤 없음). **길만 실제 길**(roads.json 을 재단선 → 섬 상자로 변환, `kiosk-board.json` 의 hideRoads·hideMain 으로 정돈), 가게 단추도 실제 자리. 업종(`category`) → 단추 그림(`public/board/btn-*.webp`)·범례 필터. **위계(10-28)**: `kiosk-board.json` `featured`(가게 이름 목록, 전시 1회용 — DB 칸 아님)에 든 가게는 천 이름표, 나머지는 작은 이름 글씨. **단추 크기는 10-29부터 모두 작은 단추(0.5배)로 같다**(`board.ts` FEAT_K — 1로 두면 예전처럼 강조 가게만 큰 단추). 숫자 단추는 없다 — 겹친 큰 단추는 실제 자리 가운데로 모아 맞닿게 붙이고(0.78배) 묶음끼리 닿으면 묶음째 밀어 띄운다, 이름표는 빈 자리로 빼 빨간 홈질 실로 잇는다, 작은 단추는 비켜 선다(`board.ts` layout). 이름표 손 배치는 `labelAt: {"가게 이름": [dx, dy]}`. 목록이 비면 전부 큰 단추. 캔버스 단위 1:1 평행이동.
- 연출: 어두워짐 → 보드가 떠올라 펴짐 → 스티치·하늘·길·집·나무·제목 → 이장님 줌인·대화 → 범례·주민·단추(대화 뒤엔 보드 전체까지 다 물러나지 않고 데스크톱 ×1.25·폰 ×1.6 로 이장님을 고정점 삼아 줌아웃, 10-28 `REST_ZOOM`). 연출 중엔 'Skip ›'로만 건너뜀. 주민은 인터뷰가 있는 사람만(`parkExtras`).
- 무입력 `IDLE_MS`(지금 3초, 사용자 조정)면 자동 순환: 단추를 하나씩 줌인 + 카드 6초씩, 한 바퀴 뒤 보드 전체. 입력이 오면 바로 멈춤(`V.stop`). 대화·사진 뷰어·영상 재생·손가락 닿음 동안엔 시작 안 함.
- **평소 지도(전시 모드 OFF)도 자동 순환**(10-26, '가게를 주인공으로'): 무입력 `HOME_IDLE_MS` 12초면 발행된 가게(다음 호 제외)를 지도 동선 순서(가장 서쪽에서 가까운 가게로)로 카드 열고 줌인(`HOME_FOCUS` 4.6) 6초씩, 한 바퀴 뒤 카드 닫고 처음 화면. 방문객이 직접 연 카드가 떠 있으면(읽는 중) 시작 안 함. 멈춤·재개 규칙은 전시 모드와 같다(`homeStep`)
- 인트로가 떠 있는 동안엔 아무것도 안 돈다(인트로 다시 보기 = 상단바 'MORE' 글자, 10-28 — 'INTRO 다시 보기' 버튼은 뺐다. 연출을 멈추고(`stopKiosk`) 인트로가 끝나면 다시). 늦은 콜백은 `kioskSeq` 로 막는다. OFF 는 커튼(`curtain.ts`)으로 덮고 한 번에 되돌린다.
- **전시장 QR**(10-26): `https://sindang-more.pages.dev/qr` → 전시 모드 ON 으로 열림(`?kiosk` 와 같음). 경로로 한 이유: Cloudflare Web Analytics 는 `?쿼리` 를 기록하지 않아 `/qr` 이어야 QR 방문이 따로 집계된다(Pages 는 404.html 이 없으면 모르는 경로에 첫 화면을 준다 — `public/` 에 404.html 을 만들면 QR 이 깨진다). 인쇄한 주소는 못 바꾸니 QR 방문객 동작은 `engine.legacy.js` 의 `KIOSK` 판정에서만 바꾼다. QR 이미지는 `tools/qr/`(SVG 인쇄용·PNG, 오류 정정 Q).
- `?board=1` 연출 없이 바로, `?patch_slow=N` 연출 N배 느리게. 알려진 흠: 제목이 근처 단추 이름표와 겹칠 수 있다.
