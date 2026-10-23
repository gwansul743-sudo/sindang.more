// @ts-nocheck
/* 임시 엔진 — 한 장짜리 HTML(REV 28)의 스크립트 세 덩어리(CORE · WALKERS · NIGHT)를 거의 그대로 옮긴 것.
   바뀐 점은 두 가지뿐: (1) 그림·도로·좌표·파츠·가게 상수를 DATA(= content/ 와 seed)에서 받음, (2) 전체를 bootLegacy()로 감쌈.
   마크업(src/app/legacy-markup.html)이 문서에 들어간 뒤 한 번만 호출할 것. 화면의 id에 의존하므로 두 번 부르면 안 됨.
   이 파일은 폴더구조_지침 §9의 3·4·7단계에서 map/ 과 features/ 로 쪼개며 줄여 나가다가 마지막에 삭제한다. */
import { createProjection } from '../projection';
import { createViewport } from '../viewport';
import { createLand } from '../layers/land';
import { el } from '../svg';
import { mountRoads } from '../layers/roads';
import { mountTerrain } from '../layers/terrain';
import { mountLandmarks, mountDistricts } from '../layers/landmarks';
import { mountDots } from '../layers/dots';
import { mountBoard } from '../../features/kiosk-board/board';
import { withCurtain } from '../../features/kiosk-board/curtain';
import { mountSpeech } from '../../features/chief-speech/speech';
import { mountTalk } from '../../features/chief-talk/talk';
import { majorRoadPath } from '../layers/roads';
import { buildRoadGraph } from '../actors/roadGraph';
import { createScene } from '../actors/scene';
import { spawnWalkers } from '../actors/walker';
import { Chief } from '../actors/chief';
import { Cat } from '../actors/cat';
import { mountNight } from '../night';
import { mountDay } from '../day';
import { setTheme, bindThemeButton, currentTheme } from '../../features/theme-toggle/mountThemes';
import * as storeApi from '../../entities/store/api';
import { watchAuth, signInWithPassword, setPassword, sendLoginLink, signOut } from '../../shared/lib/auth';
import { geocode as kakaoGeocode } from '../../shared/lib/geocode';
import { mountHoldGate } from '../../features/admin-gate/holdGate';
import { onSwipeRight } from '../../shared/lib/swipe';

export function bootLegacy(DATA){
/* ═══════════════ CORE (투영 · 팬줌 · 가게 점 · 카드 · 관리 · 인트로) ═══════════════ */
  const ROADS = DATA.roads;
  const BBOX = DATA.land.bbox;
  const IG = 'https://www.instagram.com/sindang.more/';


  /* 투영 — map/projection.ts (4-1 ①) */
  const W = ROADS.W, H = ROADS.H;
  const P = createProjection(BBOX, W, H), { proj, unproj } = P;

  /* 층 — map/layers/* (4-1 ③). 순서가 곧 그리는 순서: 땅 → 길 → 장식 → 권역 이름 → 랜드마크 → 가게 점 */
  const svg = document.getElementById('svg');
  const gRoads = mountRoads(svg, ROADS);
  const { props: pixelProps } = mountTerrain(svg, { pixelDefs: DATA.pixelDefs, terrain: DATA.terrain }, gRoads);
  const districts = mountDistricts(svg, P, DATA.land.districts), gDist = districts.g;
  const lmLayer = mountLandmarks(svg, P, DATA.landmarks.items, DATA.landmarks), LANDMARKS = lmLayer.items;
  const lmK = s => lmLayer.k(s);
  /* 전시 보드(features/kiosk-board, 10-23): 전시 모드를 켜면 섬이 통째로 '신당 5길' 천 섬이 된다(시안 v2 그대로, 길만 실제 길). 천 조각·집중·와펜(kiosk-patch·focus·stamps)은 이것으로 대체 */
  let board = null;

  /* 가게 · 컬렉션 (데이터는 db에서 옴) */
  let STORES = [];
  /* 가게 점이 나타나는 배율: 데스크톱 2.2, 폰(900px 미만, CSS 분기와 같음)은 처음 화면에서 + 한 번(×1.6 ≈ 1.2)이면 보이게 1.1. 힌트도 같은 배율에서 사라진다 */
  const dotShowAt = () => window.innerWidth < 900 ? 1.1 : 1.9;   /* 데스크톱 1.9: 전시 모드 배율(2.2)보다 넉넉히 낮게 */
  const dots = mountDots(svg, P, it => { if(picking) return; closeCluster(); select(STORES.find(s => s._dot===it), true); },
    { showAt: dotShowAt, onCluster: (members, x, y) => { if(!picking) openCluster(members, x, y); } }), gDots = dots.g;
  /* 겹친 가게 말풍선: 숫자 점을 누르면 지도 위에 사진·이름 목록이 뜨고, 하나를 고르면 카드가 열린다. 점이 떨어지면(확대) 자동으로 닫힌다 */
  const clusterPop = document.createElement('div'); clusterPop.id = 'cluster-pop'; document.getElementById('map').appendChild(clusterPop);   /* map 변수는 뒤에서 선언된다 */
  let clusterAt = null;   /* { key, x, y } 열려 있는 말풍선의 지도 좌표 */
  function openCluster(members, x, y){
    const key = members.map(m => m.store.id).sort().join('|');
    const stores = members.map(m => STORES.find(s => s._dot === m)).filter(Boolean);
    clusterPop.innerHTML = `<div class="cl-title">이 자리의 가게 ${stores.length}곳</div>` + stores.map(st =>
      `<button type="button" class="cl-row${st.status==='up'?' up':''}" data-id="${esc(st.id)}"><span class="cl-thumb"${st.photoUrl?` style="background-image:url('${esc(st.photoUrl)}')"`:''}></span><span class="cl-text"><b>${esc(st.name)}</b><small>${esc(st.issue||'')}${st.status==='up'?' · 다음 호':''}</small></span><span class="cl-go">›</span></button>`).join('');
    clusterPop.querySelectorAll('.cl-row').forEach(b => b.onclick = () => { const st = STORES.find(s => s.id === b.dataset.id); closeCluster(); if(st) select(st, true); });
    clusterAt = { key, x, y }; clusterPop.classList.add('show'); placeCluster();
  }
  function closeCluster(){ clusterAt = null; clusterPop.classList.remove('show'); }
  function placeCluster(){ if(!clusterAt) return;
    if(!dots.clusters().has(clusterAt.key)){ closeCluster(); return; }   /* 확대해서 점이 떨어지면 닫는다 */
    const s = scale(), z = parseFloat(getComputedStyle(clusterPop).zoom) || 1, px = (clusterAt.x - V.x) * s, py = (clusterAt.y - V.y) * s, w = clusterPop.getBoundingClientRect().width || 220 * z;
    const left = Math.max(8, Math.min(V.pw - w - 8, px - w / 2));
    const h = clusterPop.getBoundingClientRect().height || 160 * z, gap = 18 * z;
    const below = py - h - gap < 0;   /* 위에 자리가 없으면 점 아래로(꼬리는 위로). 기본은 점 위(꼬리 아래) */
    clusterPop.classList.toggle('below', below);
    clusterPop.style.left = left / z + 'px'; clusterPop.style.top = (below ? py + gap : py - h - gap) / z + 'px';   /* zoom 만큼 나눈다 */
    clusterPop.style.setProperty('--tail', (px - left) / z + 'px');
  }
  function setStores(list){
    STORES = dots.set(list).map(it => ({...it.store, x:it.x, y:it.y, g:it.g, t:it.t, _dot:it}));   /* 옛 모양 유지 (카드·관리 코드가 쓴다). 4-2에서 정리 */
    if(current){ const again = STORES.find(s=>s.id===current.id); current=null; if(again) select(again,false); else closeCard(); }
    document.getElementById('empty').classList.toggle('show', STORES.length===0 && !introOpen);
    renderAdminList(); apply();
    board?.setStores(STORES);
  }

  /* 뷰포트 — map/viewport.ts (4-1 ②). 그림 갱신은 render(scale)가 맡는다 */
  const map = document.getElementById('map');
  const LAND = createLand(DATA.land.landPath, W, H);
  let sideAnimating = false;   /* 사이드바 접힘/펴짐 전환 중 (withSide) */
  const V = createViewport({ map, svg, W, H, landBounds: LAND.bounds, focus: DATA.land.focus, onApply: render, onActivity: () => wake(), keepViewOnResize: () => !introOpen, holdOnResize: () => sideAnimating });
  const scale = () => V.scale(), apply = () => V.apply(), homeView = () => V.homeView(), resetHome = () => V.resetHome();
  const centerOn = (x,y,s,oy,then) => V.centerOn(x,y,s,oy,then);
  const kioskCutXY = DATA.kioskCut ? DATA.kioskCut.polygon.map(([lat, lng]) => proj(lat, lng)) : null;   /* 전시 보드 재단선(실이 도는 선, 보드에 넣을 실제 길·가게의 범위) */
  if(kioskCutXY && DATA.kioskBoard) board = mountBoard({ svg, before: gDist, host: map, cut: kioskCutXY, roads: ROADS.p, landBounds: LAND.bounds, content: DATA.kioskBoard,
    onStore: id => { const st = STORES.find(s => s.id === id); if(st){ board.select(id); select(st, false); } } });
  function render(s){
    document.body.classList.toggle('far', s < 3.5);
    lmLayer.update(s); districts.update(s); dots.update(s);
    placeCluster(); speech.place();
    const hideHint = s >= dotShowAt() || introOpen || STORES.length===0;
    document.getElementById('hint').classList.toggle('hide', hideHint);
    document.querySelector('.map-title').classList.toggle('hide', hideHint);   /* 제목 블럭도 힌트와 함께 사라진다 (10-21) */
  }
  svg.addEventListener('click', e => {
    if(V.moved) return;
    if(picking){ const [lat,lng] = unproj(...V.toMap(e.clientX, e.clientY));
      form.latlng.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; endPick(); return; }
    if(!e.target.closest('.dot,.col-pill,.cluster')) { closeCluster(); collapseSide(); }   /* 카드가 열려 있으면 카드만, 아니면 빈 사이드바도 접는다 (10-21) */
  });

  /* 카드 */
  const sheet = document.getElementById('sheet'), card = document.getElementById('card');
  const side = document.getElementById('side');   /* 데스크톱 사이드바 X 하나로: 카드가 열려 있으면 카드만 닫고, 아니면 사이드바를 접는다. 가게를 고르면 다시 열린다 */
  document.getElementById('side-close').onclick = () => { if(current) closeCard(); else side.classList.add('closed'); };
  document.getElementById('side-open').onclick = () => side.classList.remove('closed');
  /* 오른쪽으로 슥 넘기면 접기: 데스크톱 사이드바는 X 와 같은 동작, 폰 바텀시트는 카드 닫기 */
  /* 데스크톱 판정은 CSS 미디어 쿼리(min-width:900px)와 같은 '창 폭' 기준. 지도 칸 폭(V.pw)으로 재면 창이 900~1260px일 때 CSS 는 사이드바를 그리는데 엔진은 폰처럼 굴어 어긋난다 */
  const desktop = () => window.innerWidth >= 900;
  const collapseSide = () => { if(current) closeCard(); else if(desktop()) side.classList.add('closed'); };
  const stage = document.getElementById('stage'), sideW = () => side.getBoundingClientRect().width || 320;   /* 사이드바 실제 폭(큰 화면에선 CSS zoom 으로 커진다). 접혀 있어도 요소 폭은 그대로 */
  onSwipeRight(side, collapseSide, {
    onDrag: dx => { if(!desktop()) return; stage.style.transition = 'none'; stage.style.gridTemplateColumns = `minmax(0,1fr) ${Math.max(0, sideW() - dx)}px`; },
    onEnd: () => { stage.style.transition = ''; stage.style.gridTemplateColumns = ''; },   /* 인라인 값을 지우면 CSS 전환이 나머지를 부드럽게 */
  });
  document.getElementById('side-grip').onclick = collapseSide;
  let current = null;
  function select(s, focus){
    speech.hide(); talk.hide();
    current = s; dots.select(s._dot);
    const up = s.status==='up', href = s.ig || IG;
    const list = STORES, idx = list.indexOf(s)+1, vid = renderVideo(s.video);   /* 영상이 있으면 포스터 칸에 사진 대신 플레이어 (10-21) */
    card.innerHTML = `
      <button class="x" aria-label="닫기" onclick="closeCard()">✕</button>
      <div class="ig-meta"><span class="account">@sindang.more</span><span class="num">${idx} / ${list.length}</span></div>
      ${vid.embed ? `<div class="poster video">${vid.embed}</div>` : `<div class="poster ${up?'up':''} ${s.photoUrl?'photo':''}" ${s.photoUrl?`style="background-image:url('${s.photoUrl}')"`:''}><div class="grid"></div><div class="poster-brand">MORE · SINDANG</div><div class="poster-tag">${esc(s.issue||'')}</div><div class="poster-title">${up?'Coming<br>soon':esc(s.name)}</div></div>`}
      <div class="detail">
        <h3>${esc(s.name)}</h3>
        ${up?'<p class="copy">인터뷰가 끝나면 이 자리에 카드뉴스가 올라옵니다.</p>':''}
        ${up?'<div class="tags"><span class="tag">다음 호</span></div>':''}
        <a class="ig-link ${up?'up':''}" href="${esc(href)}" target="_blank" rel="noopener"><span>${up?'매거진 팔로우하기':'Instagram에서 보기'}</span><span>↗</span></a>
        ${vid.link||''}
        <div class="navs"><button class="nav" aria-label="이전" onclick="step(-1)">‹</button><button class="nav" aria-label="다음" onclick="step(1)">›</button></div>
        <div class="small-note">카드뉴스 전체는 인스타그램 게시물에서 볼 수 있습니다.</div>
      </div>
      ${renderInterview(s.interview)}`;
    sheet.classList.add('open'); side.classList.add('has'); side.classList.remove('closed');
    /* 폰 바텀시트는 'INTERVIEW' 제목까지만 보이는 높이로 연다(나머지는 시트 안에서 스크롤). 인터뷰가 없으면 기본 높이 */
    sheet.scrollTop = 0; const ih = card.querySelector('.interview .ih');
    sheet.style.maxHeight = (!desktop() && ih) ? Math.min(ih.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + 16, V.ph * 0.73) + 'px' : '';
    if(focus){ const s0 = Math.max(scale(), 4.6); centerOn(s.x, s.y, s0, desktop()?0:V.ph*0.24); } else apply();
  }
  function step(d){ const i=(STORES.indexOf(current)+d+STORES.length)%STORES.length; select(STORES[i], true); }
  function closeCard(){ closeCluster(); if(current){ dots.select(null); current=null; } sheet.classList.remove('open'); document.getElementById('side').classList.remove('has'); apply(); }
  /* 영상: 포스터 칸에 들어갈 플레이어(embed) 또는, 끼워 넣을 수 없는 주소면 인스타 버튼 아래 링크 버튼(link).
     구글 드라이브(공유 링크) → 미리보기 iframe, 유튜브 → embed, mp4/webm 주소 → <video> (10-21) */
  function renderVideo(url){
    url = (url||'').trim(); if(!url) return {};
    const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
    const frame = (src) => ({ embed: `<iframe src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="영상"></iframe>` });
    if(drive) return frame(`https://drive.google.com/file/d/${drive[1]}/preview`);
    if(yt) return frame(`https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1`);
    if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return { embed: `<video src="${esc(url)}" controls playsinline preload="metadata"></video>` };
    return { link: `<a class="ig-link video-link" href="${esc(url)}" target="_blank" rel="noopener"><span>영상 보기</span><span>↗</span></a>` };
  }
  function renderInterview(text){
    if(!text || !text.trim()) return '';
    const blocks=[]; let cur=null, sec='';
    text.split(/\r?\n/).map(l=>l.trim()).forEach(l => {
      if(!l) return;
      let m;
      if((m=l.match(/슬라이드[^—–-]*[—–-]\s*(.+)$/)) && m[1].trim()){ sec=m[1].trim(); return; }   /* '슬라이드' 와 대시(- – —)가 있는 줄: 대시 뒤가 소제목. 번호는 없어도 된다 */
      if((m=l.match(/^(?:\d+\.\s*)?Q[.．:]\s*(.+)$/))){ cur={sec, q:m[1].trim(), a:[]}; blocks.push(cur); sec=''; return; }
      if(!cur){ cur={sec, q:'', a:[]}; blocks.push(cur); sec=''; }
      cur.a.push(l);
    });
    if(!blocks.length) return '';
    return `<div class="interview"><div class="ih">Interview</div>` + blocks.map(b =>
      `<div class="qa">${b.sec?`<div class="qa-sec">${esc(b.sec)}</div>`:''}${b.q?`<div class="qa-q">${esc(b.q)}</div>`:''}<p class="qa-a">${b.a.map(esc).join('<br>')}</p></div>`).join('') + `</div>`;
  }
  const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* 칩 · 테마 · 메시지 */
  document.getElementById('zin').onclick = () => { V.zoomSmooth(1.6, V.pw/2, V.ph/2); wake(); };
  document.getElementById('zout').onclick = () => { V.zoomSmooth(1/1.6, V.pw/2, V.ph/2); wake(); };
  let msgT; function toast(t){ const m=document.getElementById('msg'); m.textContent=t; m.classList.add('show'); clearTimeout(msgT); msgT=setTimeout(()=>m.classList.remove('show'),2200); }

  /* 전시 모드 (10-23, 시안 v2 그대로): 켜면 사이드바가 접히고 카메라가 보드 전체를 담는 자리로 간 뒤 보드 연출(features/kiosk-board.play)이 돈다 —
     ① 재단선 실 ② 옛 섬이 사라지며 조각이 떠올라 섬만큼 펴짐 ③ 가장자리 꿰매기·하늘·물결 ④ 길 ⑤ 집·나무 ⑥ 단추 ⑦ 제목 → ⑧ 이장님 등장·말풍선·큰 상자(여기) → 마지막 장이 닫히면 ⑨ 범례·주민(kioskRest).
     연출 중 지도를 만지면 바로 다 보이게(kioskSkip, 이장님도 그때). 낮춘 상태에서 30초 무입력이면 카메라만 보드 전체 뷰로. OFF 는 커튼 아래서 되돌린다(kioskOff). */
  let KIOSK = new URLSearchParams(location.search).has('kiosk');
  const BOARD_DEBUG = new URLSearchParams(location.search).has('board');   /* ?board=1: 연출 없이 보드가 다 보이는 상태로 시작(개발·확인용) */
  const kioskBtn = document.getElementById('kiosk');
  function renderKiosk(){ kioskBtn.textContent = '전시 모드 ' + (KIOSK?'ON':'OFF'); kioskBtn.setAttribute('aria-pressed', KIOSK); }
  /* 사이드바 접힘(0.42초)과 카메라 비행을 동시에 돌리면 두 속도 곡선이 겹쳐 화면이 좌우로 흔들린다 → 순서대로: 사이드바가 다 접힌(펴진) 뒤 카메라.
     사이드바 상태가 이미 원하는 쪽이면(손으로 접어 둔 경우) 바로 카메라만 */
  /* 전환 중엔 뷰포트가 재배치하지 않는다(holdOnResize) — 재배치의 미세한 배율 변화가 1~2px 떨림으로 보인다.
     카메라는 전환이 '실제로' 끝난 transitionend 뒤에 출발한다(타이머로 어림하면 마지막 프레임과 겹쳐 반전이 생긴다). 새 전환이 시작되면 이전 마무리는 취소 */
  let sideDone = null;
  function withSide(closed, then){ if(!desktop() || side.classList.contains('closed') === closed){ then(); return; }
    sideDone?.(false); side.classList.toggle('closed', closed); sideAnimating = true;
    const onEnd = e => { if(e.target === stage && e.propertyName === 'grid-template-columns') done(true); };
    const t = setTimeout(() => done(true), 700);   /* transitionend 가 안 오는 경우(감춰진 탭 등) 대비 */
    const done = (run) => { stage.removeEventListener('transitionend', onEnd); clearTimeout(t); sideDone = null; sideAnimating = false; if(run){ V.fit(); then(); } };   /* 접힘이 끝난 뒤의 지도 폭으로 다시 재고 출발 — 안 재면 옛 폭으로 중심을 잡아 치우친다 (10-21) */
    sideDone = done; stage.addEventListener('transitionend', onEnd); }
  let chiefActor = null, catActor = null, chiefHome = null;   /* 이장님 배우 (WALKERS 에서 채움) — 말풍선이 머리 위를 따라간다. chiefHome: 평소 자리 */
  const talk = mountTalk(stage, { onEnd: () => kioskRest() });   /* 큰 말풍선(인터뷰). 작은 말풍선의 인사가 끝나면 시작. 마지막 장이 닫히면 범례·주민 */
  const speech = mountSpeech(stage, {
    anchor: () => { if(!chiefActor || chiefActor.g.getAttribute('display') === 'none') return null; const r = chiefActor.g.getBoundingClientRect(), st = stage.getBoundingClientRect(); return { x: r.left + r.width / 2 - st.left, y: r.top - st.top }; },
    bounds: () => { const m = map.getBoundingClientRect(), st = stage.getBoundingClientRect(); return { left: m.left - st.left, top: m.top - st.top, width: m.width, height: m.height }; },
    onEnd: () => { if(KIOSK && DATA.chiefTalk) talk.start(DATA.chiefTalk); },
  });
  const CHIEF_LINES = ['오호! 처음 보는 얼굴이구먼!\n**신당 5길**에 어서와!!', '잠깐 이야기 좀 듣고 갈 텐가?'];
  /* 보드 전체(시안 캔버스 1774×887)를 담는 카메라 */
  const kioskTarget = () => { const v = board.view(); return { x: v.x, y: v.y, s: desktop() ? Math.min(V.pw / v.w, V.ph / v.h) : V.pw / (v.iw * 1.08) }; };   /* 데스크톱: 캔버스 전체(하늘까지) · 폰: 섬 폭에 맞춤 */
  let walkers = [], walkerGraphs = null;   /* WALKERS 에서 채움 */
  const walkersTo = (which) => { if(walkerGraphs) walkers.forEach(w => w.setGraph(walkerGraphs[which])); };   /* 주민을 보드 위 길 ⇄ 평소 큰 길로 — 보이지 않을 때만 */
  /* 이장님을 보드 자리 ⇄ 평소 자리로 (고양이는 이장님을 따라간다) */
  const chiefTo = (onBoard) => { if(!chiefActor) return; if(!chiefHome) chiefHome = { x: chiefActor.x, y: chiefActor.y }; const p = onBoard ? board.chiefAt() : [chiefHome.x, chiefHome.y]; chiefActor.x = p[0]; chiefActor.y = p[1]; if(catActor){ catActor.x = p[0]; catActor.y = p[1]; } };
  let kioskStage = 'off';   /* off | play | rest */
  function kioskView(){ if(!board) return; kioskStage = 'play'; const t = kioskTarget();
    withSide(true, () => { const t2 = kioskTarget(); centerOn(t2.x, t2.y, t2.s, 0); walkersTo('kiosk'); chiefTo(true);
      board.play({ onChief: () => { if(!KIOSK) return; showChief(true); speech.say(CHIEF_LINES); } }); }); void t; }
  function kioskRest(){ if(!KIOSK || !board || kioskStage === 'rest') return; kioskStage = 'rest'; board.rest(); }
  function kioskSkip(){ if(!KIOSK || !board || kioskStage !== 'play') return; speech.hide(); talk.hide(); board.skip(); showChief(true); kioskRest(); }
  map.addEventListener('pointerdown', kioskSkip); map.addEventListener('wheel', kioskSkip, { passive: true });
  function goHome(){ withSide(false, () => { const hv = homeView(); centerOn(hv.x, hv.y, hv.s, 0); }); }
  /* 이장님·고양이는 평소엔 숨겨 두고(body.chief-hidden), 보드 연출의 제목 뒤에 등장한다. 끄면 다시 숨김 */
  const showChief = (on) => { document.body.classList.toggle('chief-hidden', !on); document.querySelectorAll('.wk-chief,.wk-cat').forEach(g => g.classList.toggle('appear', on)); };
  function kioskOff(){ speech.hide(); talk.hide(); kioskStage = 'off';
    withCurtain(() => { showChief(false); board?.hide(); walkersTo('home'); chiefTo(false); sideDone?.(false); side.classList.remove('closed'); V.fit(); resetHome(); }); }
  kioskBtn.onclick = () => { KIOSK=!KIOSK; renderKiosk(); if(KIOSK){ showChief(false); closeCard(); kioskView(); } else kioskOff(); };
  renderKiosk();
  /* 쉬고 있을 때의 모습: 범례가 뜬 뒤 30초 동안 아무 입력이 없으면 카메라만 보드 전체 뷰로 돌아온다(연출은 다시 틀지 않는다) */
  let idleT = null;
  const idle = () => { clearTimeout(idleT); idleT = setTimeout(() => { if(KIOSK && board && kioskStage === 'rest' && !talk.visible){ const t = kioskTarget(); centerOn(t.x, t.y, t.s, 0); } }, 30000); };
  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, idle, { passive: true })); idle();
  function wake(){}   /* 예전엔 30초 뒤 자동 전환을 다시 걸었다. 호출 자리는 남겨 둔다 */

  /* 인트로 (펼침) */
  let introOpen = true, introT=null;
  const intro = document.getElementById('intro');
  function endIntro(){ if(!introOpen) return; introOpen=false; intro.classList.add('done'); apply();
    document.getElementById('empty').classList.toggle('show', STORES.length===0); wake();
    setTimeout(()=>{ if(KIOSK) kioskView(); else if(BOARD_DEBUG && board){ const t = kioskTarget(); withSide(true, () => { const t2 = kioskTarget(); centerOn(t2.x, t2.y, t2.s, 0); }); void t; } else goHome(); }, 100); }
  function openMap(){ if(intro.classList.contains('open')) return; intro.classList.add('open'); clearTimeout(introT); introT=setTimeout(endIntro, +intro.dataset.ms || 1900); }
  function playIntro(){ introOpen=true; closeCard(); speech.hide(); talk.hide(); clearTimeout(introT); intro.classList.remove('open'); intro.classList.remove('done'); apply();
    document.getElementById('empty').classList.remove('show');
    resetHome(); }
  document.getElementById('openMap').onclick = openMap;
  intro.addEventListener('click', e => { if(intro.classList.contains('open') && !e.target.closest('.folded')) endIntro(); });
  document.getElementById('replay').onclick = playIntro;

  /* ── 데이터 (db) · 관리자 ──────────────────────────────── */
  let gate = null, canWrite = false, authEmail = null, adminOpen = false, picking = false, editing = null, photoPending = null, photoRemove = false;
  const admin = document.getElementById('admin'), form = document.getElementById('form'), listWrap = document.getElementById('alist-wrap'), delConfirm = document.getElementById('del-confirm');
  /* 데이터는 entities/store/api 가 준다 (DB가 있으면 Supabase, 없으면 씨앗). 처음 목록은 App.tsx 가 이미 읽어 DATA.stores 로 넘겼다. */
  async function reload(){ setStores(await storeApi.listStores()); document.documentElement.dataset.store = storeApi.storeSource(); }
  function applyWrite(){
    /* 입구 버튼은 늘 보인다. 로그인 전엔 작은 네모(꾹 눌러야 열림), 관리자로 로그인하면 '가게 관리' 글자 버튼(features/admin-gate 의 is-admin) */
    gate?.refresh();
    if(!canWrite && adminOpen && !wantAdmin) closeAdmin();
    renderLogin();
  }
  /* 관리자 로그인 상자 (#admin 안). 주소에 ?admin=1 을 붙이면 로그인 전에도 패널이 열린다 */
  const wantAdmin = new URLSearchParams(location.search).get('admin') === '1';
  const loginBox = document.createElement('div'); loginBox.id = 'login'; loginBox.style.cssText = 'display:none;flex-direction:column;gap:8px;padding:8px 0 14px;border-bottom:1px solid var(--line);margin-bottom:10px;font-size:12px';
  admin.insertBefore(loginBox, listWrap);
  const IN = 'padding:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;width:100%;box-sizing:border-box';
  let accountOpen = false;   /* 로그인한 뒤엔 계정 상자(비밀번호 변경·로그아웃)를 제목의 '계정' 버튼으로만 연다. 로그인 전·관리자 아님일 땐 늘 보인다 */
  function toggleAccount(){ accountOpen = !accountOpen; renderLogin(); }
  let loginKey = null;   /* 같은 상태면 다시 그리지 않는다 — 탭을 떠났다 돌아오면 Supabase가 SIGNED_IN 을 또 쏘는데, 그때마다 입력 중인 칸이 지워지면 안 된다 */
  function renderLogin(){
    const editingNow = form.classList.contains('open');   /* 가게 하나를 열면 그 수정 폼만 보인다 — 목록·로그인 상자는 숨기고 제목 왼쪽에 ‹ 뒤로 */
    listWrap.style.display = canWrite && !editingNow ? '' : 'none';
    const signedIn = !!authEmail && canWrite;
    loginBox.style.display = storeApi.hasDb() && !editingNow && (!signedIn || accountOpen) ? 'flex' : 'none';
    document.getElementById('aacct').style.display = storeApi.hasDb() && !editingNow && signedIn ? '' : 'none';
    document.getElementById('aback').style.display = editingNow ? '' : 'none';
    if(!storeApi.hasDb()) return;
    const key = `${authEmail}|${canWrite}`; if(key===loginKey) return; loginKey = key; accountOpen = false; if(signedIn) loginBox.style.display = 'none';
    if(authEmail){
      loginBox.innerHTML = `<div>${esc(authEmail)}${canWrite?'':' — <b>관리자 아님</b> (Supabase의 admins 표에 이 이메일이 있어야 합니다)'}</div>
        <div style="display:flex;gap:6px"><input id="pw-new" type="password" placeholder="새 비밀번호 (8자 이상)" autocomplete="new-password" style="${IN}"><button type="button" class="btn" id="pw-set">설정</button></div>
        <button type="button" class="btn" id="logout">로그아웃</button>`;
      document.getElementById('pw-set').onclick = async () => { const pw = document.getElementById('pw-new').value; try{ await setPassword(pw); document.getElementById('pw-new').value=''; toast('비밀번호를 저장했어요'); }catch(e){ toast('실패: '+(e.message||e)); } };
      document.getElementById('logout').onclick = async () => { await signOut(); };
    } else {
      loginBox.innerHTML = `<div>관리자 로그인</div>
        <input id="login-email" type="email" placeholder="이메일" autocomplete="username" style="${IN}">
        <input id="login-pw" type="password" placeholder="비밀번호" autocomplete="current-password" style="${IN}">
        <button type="button" class="btn pri" id="login-go">로그인</button>
        <button type="button" class="btn" id="login-link" style="font-size:11px">비밀번호를 잊었어요 — 메일로 로그인 링크 받기</button>`;
      const go = async () => { const em = document.getElementById('login-email').value.trim(), pw = document.getElementById('login-pw').value; if(!em||!pw) return; try{ await signInWithPassword(em, pw); toast('로그인했어요'); }catch(e){ toast(e.message||String(e)); } };
      document.getElementById('login-go').onclick = go;
      document.getElementById('login-pw').addEventListener('keydown', e => { if(e.key==='Enter') go(); });
      document.getElementById('login-link').onclick = async () => { const em = document.getElementById('login-email').value.trim(); if(!em){ toast('이메일을 먼저 적어 주세요'); return; } try{ await sendLoginLink(em); toast('메일함에서 링크를 눌러 주세요'); }catch(e){ toast('실패: '+(e.message||e)); } };
    }
  }
  window.addEventListener('resize', () => applyWrite());
  function connect(){
    document.documentElement.dataset.store = storeApi.storeSource();   /* seed 일 때만 관리 패널에 안내문 (CSS) */
    let wasAdmin = false;
    watchAuth(st => { authEmail = st.email; canWrite = storeApi.canWrite() && (storeApi.storeSource()==='db' ? st.admin : true); applyWrite();
      if(st.admin && !wasAdmin) reload();   /* 관리자가 된 순간에만 다시 읽는다. 탭 복귀마다 읽으면 편집 중인 가게 객체가 낡은 것이 된다 */
      wasAdmin = st.admin; });
    if(wantAdmin) setTimeout(openAdmin, 0);
  }
  /* 가게 관리 패널은 끌어서 움직이지 않는다 — 상단 '가게 관리' 버튼 한 번에 열리고, 한 번 더 누르면 닫힌다(CSS transform 전환) */
  const adminTop = document.getElementById('admin-top');
  const openAdmin = () => { adminOpen=true; admin.classList.add('open'); adminTop.classList.add('open'); adminTop.setAttribute('aria-expanded','true'); renderLogin(); };
  gate = mountHoldGate(adminTop, { holdMs: 2000, canOpen: () => canWrite, onOpen: () => { if(adminOpen && canWrite) closeAdmin(); else openAdmin(); } });
  function closeAdmin(){ adminOpen=false; accountOpen=false; admin.classList.remove('open'); adminTop.classList.remove('open'); adminTop.setAttribute('aria-expanded','false'); cancelEdit(); wake(); }
  /* 목록 검색: 가게 이름·호수. 공백·대소문자 무시 */
  const search = document.getElementById('asearch');
  const norm = s => String(s||'').toLowerCase().replace(/\s+/g,'');
  search.addEventListener('input', renderAdminList);
  function renderAdminList(){
    const l = document.getElementById('alist'); l.innerHTML='';
    const q = norm(search.value);
    const rows = q ? STORES.filter(s => norm(s.name).includes(q) || norm(s.issue).includes(q)) : STORES;
    rows.forEach(s => { const r=document.createElement('button'); r.type='button'; r.className='row'+(s.status==='up'?' up':''); r.innerHTML=`<b>${esc(s.name)}</b><small>${esc(s.issue||'')}</small>`; r.onclick=()=>editStore(s); l.appendChild(r); });
    if(!STORES.length) l.innerHTML='<div class="row" style="opacity:.6">아직 가게가 없습니다. 위 버튼으로 추가하세요.</div>';
    else if(!rows.length) l.innerHTML=`<div class="row" style="opacity:.6">'${esc(search.value.trim())}'에 맞는 가게가 없어요.</div>`;
  }
  function editStore(s){
    editing = s; form.reset();
    if(s){ form.name.value=s.name; form.issue.value=s.issue||''; form.status.value=s.status; form.ig.value=s.ig||''; form.video.value=s.video||''; form.category.value=s.category||'etc'; form.interview.value=s.interview||''; form.addr.value=s.addr||''; form.latlng.value=`${s.lat}, ${s.lng}`; select(s,true); }
    photoPending=null; photoRemove=false; form.photo.value='';
    setPhotoPrev(s?.photoUrl || null);
    form.photo.disabled = !storeApi.canUpload(); document.getElementById('photo-note').textContent = storeApi.canUpload() ? '없으면 기본 이미지로 표시됩니다.' : '이 화면에서는 사진 업로드가 지원되지 않아요.';
    document.getElementById('delbtn').style.display = s?'':'none';
    cancelDelete();
    form.classList.add('open'); renderLogin(); admin.scrollTop = 0;
  }
  function setPhotoPrev(url){ const p=document.getElementById('photo-prev'); p.classList.toggle('empty',!url); p.style.backgroundImage = url?`url('${url}')`:''; document.getElementById('photo-rm').style.display = url?'':'none'; }
  form.photo.addEventListener('change', () => { const f=form.photo.files[0]; if(!f) return; if(f.size>20*1024*1024){ toast('20MB 이하로 올려주세요'); form.photo.value=''; return; } photoPending=f; photoRemove=false; setPhotoPrev(URL.createObjectURL(f)); });
  function removePhoto(){ photoPending=null; photoRemove=true; form.photo.value=''; setPhotoPrev(null); }
  function cancelEdit(){ endPick(); cancelDelete(); form.classList.remove('open'); editing=null; renderLogin(); }
  /* 주소 → 좌표: 카카오 지도 JS geocoder (shared/lib/geocode.ts). 버튼, 주소 칸의 Enter, 포커스 이탈 때 돈다 */
  let geoSeq = 0;
  async function geocode(){
    const raw = form.addr.value.trim().replace(/\s+/g,' ');
    if(!raw){ toast('주소를 적어주세요'); return; }
    const seq = ++geoSeq; toast('주소 찾는 중…');
    let hit, note='';
    try{
      hit = await kakaoGeocode(raw);
      const m = !hit && raw.match(/^(.*\d+)-\d+$/);          /* "49-1" 같은 부번지가 카카오 자료에 없으면 본번지 "49"로 한 번 더 */
      if(m){ hit = await kakaoGeocode(m[1]); if(hit) note = ' (부번지는 없어서 본번지 자리예요)'; }
    } catch(e){ toast('주소 찾기를 쓸 수 없어요 ('+(e.message||e)+'). 지도에서 찍어주세요.'); return; }
    if(seq!==geoSeq || picking) return;   /* 그 사이 다시 찾기 시작했거나 지도에서 찍는 중이면 버린다 */
    if(!hit){ toast('주소를 못 찾았어요. 도로명·지번으로 다시 적거나 지도에서 찍어주세요.'); return; }
    if(hit.lat<BBOX.lat0||hit.lat>BBOX.lat1||hit.lng<BBOX.lon0||hit.lng>BBOX.lon1){ toast('지도 범위 밖 주소예요 ('+hit.address+'). 지도에서 찍어주세요.'); return; }
    form.latlng.value = `${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`;
    const [x,y] = proj(hit.lat,hit.lng); centerOn(x,y,Math.max(scale(),5), desktop()?0:V.ph*0.24);
    if(editing){ dots.move(editing._dot, x, y); editing.x=x; editing.y=y; }
    toast('좌표를 채웠어요: '+hit.address+note+'. 지도에서 자리를 확인하세요');
  }
  form.addr.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); geocode(); } });
  form.addr.addEventListener('change', () => { if(form.addr.value.trim()) geocode(); });
  function startPick(){ picking=true; document.body.classList.add('picking'); document.getElementById('pickhint').classList.add('show'); if(!desktop()) admin.classList.remove('open'); }
  function endPick(){ picking=false; document.body.classList.remove('picking'); document.getElementById('pickhint').classList.remove('show'); if(adminOpen) admin.classList.add('open'); }
  async function saveStore(e){
    e.preventDefault();
    const m = form.latlng.value.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if(!m){ toast('위치는 "위도, 경도" 형식으로'); return; }
    const lat=+m[1], lng=+m[2];
    if(lat<BBOX.lat0||lat>BBOX.lat1||lng<BBOX.lon0||lng>BBOX.lon1){ toast('지도 범위 밖 좌표예요'); return; }
    const input = {name:form.name.value.trim(), issue:form.issue.value.trim(), status:form.status.value, ig:form.ig.value.trim(), video:form.video.value.trim(), category:form.category.value, interview:form.interview.value.trim(), addr:form.addr.value.trim(), lat, lng};
    try{
      if(photoPending) toast('사진 올리는 중…');
      const r = await storeApi.saveStore(editing, input, photoPending, photoRemove);
      await reload(); toast(r?.warning || '저장했어요'); cancelEdit(); }   /* 저장이 된 뒤엔 반드시 폼을 닫는다 — 열어 두면 다시 눌렀을 때 새 가게로 또 들어간다 */
    catch(err){ toast('저장 실패: '+(err.message||err.code||err)); }
  }
  /* 삭제는 두 단계: '삭제' → 패널 안 확인 상자 → '영구 삭제'를 눌러야만 실제로 지운다. 브라우저 confirm() 은 환경에 따라 안 뜨기도 해서 쓰지 않는다 */
  function deleteStore(){ if(!editing) return; document.getElementById('del-confirm-title').textContent = `정말 '${editing.name}' 가게를 삭제하시겠습니까?`; delConfirm.classList.add('open'); delConfirm.scrollIntoView({ block: 'nearest' }); }
  function cancelDelete(){ delConfirm.classList.remove('open'); }
  async function confirmDelete(){ if(!editing) return; cancelDelete();
    try{ await storeApi.deleteStore(editing); await reload(); toast('지웠어요'); cancelEdit(); } catch(err){ toast('삭제 실패: '+(err.message||err.code||err)); } }

  /* 시작 */
  function init(){
    V.fit(); V.resetHome();
    setStores(DATA.stores);
    connect();
    if(board && BOARD_DEBUG){ board.skip(); walkersTo('kiosk'); chiefTo(true); showChief(true); board.rest(); }   /* 보드만 바로 보기(개발·확인용): 연출 없이 다 보이는 상태. 카메라는 인트로가 끝날 때(endIntro) */
  }
  document.fonts ? document.fonts.ready.then(init) : init();

/* ═══════════════ WALKERS — map/actors/* (4-1 ⑤) ═══════════════ */
  const graph = buildRoadGraph(majorRoadPath(ROADS), LAND);
  if(graph.edges.length){
    const scene = createScene({ svg, map, V, landmarks: lmLayer, before: gDist, frontBefore: gDots, isKiosk: () => KIOSK, actorMul: () => (board?.on ? 1.3 : 1) });   /* 보드 위에서는 조금 크게(10-23: 2.6 → 1.3, 사용자 '많이 줄여') */
    walkers = spawnWalkers(scene, { graph, parts: DATA.characters, palette: DATA.characters.palette, looks: DATA.characters.looks, count: 5, speed: 6.5, home: LANDMARKS[0] || {x:W/2, y:H/2} });
    walkerGraphs = { home: graph, kiosk: board ? buildRoadGraph(board.roadPath(), board.land, { minLen: 40 }) : graph };   /* 전시 모드: 보드 위의 실제 길(골목까지) */
    const chief = new Chief(scene.layer, DATA.characters.body, DATA.characters.chief); scene.add(chief); chiefActor = chief;
    catActor = new Cat(scene.layer, DATA.characters.cat, chief); scene.add(catActor);
    document.body.classList.add('chief-hidden');   /* 전시 모드 연출 뒤에만 보인다 (showChief) */
    scene.start();
  }

/* ═══════════════ DAY / NIGHT — map/day.ts · map/night.ts · 낮/밤 전환은 features/theme-toggle (4-1 ⑥) ═══════════════ */
  mountDay({ svg, W, H, land: LAND, landPath: DATA.land.landPath });
  mountNight({ svg, map, W, H, land: LAND, landPath: DATA.land.landPath, majorRoads: majorRoadPath(ROADS), lamps: DATA.props.lamps, roads: gRoads, props: pixelProps, landmarks: LANDMARKS });
  bindThemeButton(document.getElementById('theme'));
  setTheme(currentTheme(), false);

  /* 마크업·카드 템플릿의 on* 속성이 부르는 함수들 (컴포넌트로 옮기면 필요 없어짐) */
  Object.assign(window, {cancelDelete, cancelEdit, closeAdmin, closeCard, confirmDelete, deleteStore, editStore, geocode, removePhoto, saveStore, startPick, step, toggleAccount});
  return { centerOn, select, setTheme, getStores: () => STORES, proj, unproj };
}
