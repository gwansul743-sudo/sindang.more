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
import { afterRepaint } from '../../shared/lib/repaint';
import { mountSpeech } from '../../features/chief-speech/speech';
import { mountTalk } from '../../features/chief-talk/talk';
import { majorRoadPath } from '../layers/roads';
import { buildRoadGraph } from '../actors/roadGraph';
import { createScene } from '../actors/scene';
import { spawnWalker } from '../actors/walker';
import { listFormVillagers, watchFormVillagers } from '../../entities/villager/api';
import { scriptFromRow, seedOf } from '../../features/villagers/formScript';
import formSamples from '../../../content/characters/form-samples.json';
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
import { onPullDown } from '../../shared/lib/sheetDrag';
import { mountPhotoViewer } from '../../features/photo-viewer/viewer';
import { mountStory } from '../../features/board-story/story';

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
  const viewer = mountPhotoViewer();   /* 카드 사진 크게 보기(10-26) */
  const clusterPop = document.createElement('div'); clusterPop.id = 'cluster-pop'; document.getElementById('map').appendChild(clusterPop);   /* map 변수는 뒤에서 선언된다 */
  /* 묶음 말풍선 목록에서만: 영상이 있는 가게 썸네일 가운데에 픽셀 재생 표시(10-28) — 유튜브 로고를 지도 분위기로(모서리 깎은 빨간 판 + 계단 세모). 색은 tokens.css .cl-vid */
  const VID_BADGE = '<svg class="cl-vid" viewBox="0 0 14 10" aria-label="영상" role="img"><path class="b" d="M1 0h12v1h1v8h-1v1H1V9H0V1h1z"/><path class="t" d="M5 2h1v6H5zM6 3h1v4H6zM7 4h1v2H7z"/></svg>';
  let clusterAt = null;   /* { key, x, y } 열려 있는 말풍선의 지도 좌표 */
  function openCluster(members, x, y){ openClusterOf(members.map(m => STORES.find(s => s._dot === m)).filter(Boolean), x, y, false); }
  /* 전시 보드의 숫자 단추(10-26): 같은 말풍선, 고르면 단추를 눌렀을 때와 같은 카드(board.select + select). 보드 묶음은 가게·필터가 바뀔 때까지 그대로라 확대로 닫히지 않는다 */
  function openBoardCluster(ids, x, y){ openClusterOf(ids.map(id => STORES.find(s => s.id === id)).filter(Boolean), x, y, true); }
  function openClusterOf(stores, x, y, onBoard){
    const key = stores.map(s => s.id).sort().join('|');
    clusterPop.innerHTML = `<div class="cl-title">이 자리의 가게 ${stores.length}곳</div>` + stores.map(st =>
      `<button type="button" class="cl-row${st.status==='up'?' up':''}" data-id="${esc(st.id)}"><span class="cl-thumb"${st.photoUrl?` style="background-image:url('${esc(st.photoUrl)}')"`:''}>${(st.video||'').trim()?VID_BADGE:''}</span><span class="cl-text"><b>${esc(st.name)}</b><small>${esc(st.issue||'')}${st.status==='up'?' · 다음 호':''}</small></span><span class="cl-go">›</span></button>`).join('');
    clusterPop.querySelectorAll('.cl-row').forEach(b => b.onclick = e => { e.stopPropagation(); const st = STORES.find(s => s.id === b.dataset.id); closeCluster(); if(!st) return;
      if(onBoard && board){ board.select(st.id); select(st, false); } else select(st, true); });
    clusterAt = { key, x, y, onBoard }; clusterPop.classList.add('show'); placeCluster();
  }
  function closeCluster(){ clusterAt = null; clusterPop.classList.remove('show'); }
  function placeCluster(){ if(!clusterAt) return;
    if(!clusterAt.onBoard && !dots.clusters().has(clusterAt.key)){ closeCluster(); return; }   /* 확대해서 점이 떨어지면 닫는다 */
    const s = scale(), z = parseFloat(getComputedStyle(clusterPop).zoom) || 1, px = (clusterAt.x - V.x) * s, py = (clusterAt.y - V.y) * s, w = clusterPop.getBoundingClientRect().width || 220 * z;
    const left = Math.max(8, Math.min(V.pw - w - 8, px - w / 2));
    const h = clusterPop.getBoundingClientRect().height || 160 * z, gap = clusterAt.onBoard ? Math.max(18 * z, 20 * s + 8) : 18 * z;   /* 보드 단추는 지도와 같이 커진다(반지름 약 17 캔버스 단위) */
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
  const V = createViewport({ map, svg, W, H, landBounds: LAND.bounds, focus: DATA.land.focus, onApply: render, onLive: () => { placeCluster(); speech.place(); vSpeech.place(); }, onActivity: () => wake(), keepViewOnResize: () => !introOpen, holdOnResize: () => sideAnimating });
  const scale = () => V.scale(), apply = () => V.apply(), homeView = () => V.homeView(), resetHome = () => V.resetHome();
  const centerOn = (x,y,s,oy,then) => V.centerOn(x,y,s,oy,then);
  const kioskCutXY = DATA.kioskCut ? DATA.kioskCut.polygon.map(([lat, lng]) => proj(lat, lng)) : null;   /* 전시 보드 재단선(실이 도는 선, 보드에 넣을 실제 길·가게의 범위) */
  if(kioskCutXY && DATA.kioskBoard) board = mountBoard({ svg, before: gDist, host: map, cut: kioskCutXY, roads: ROADS.p, landBounds: LAND.bounds, content: DATA.kioskBoard,
    onStore: id => { closeCluster(); const st = STORES.find(s => s.id === id); if(st){ board.select(id); select(st, false); } },
    onCluster: (ids, x, y) => { if(clusterAt?.onBoard && clusterAt.key === [...ids].sort().join('|')) closeCluster(); else openBoardCluster(ids, x, y); } });   /* 같은 숫자 단추를 다시 누르면 닫기 */
  function render(s){
    document.body.classList.toggle('far', s < 3.5);
    lmLayer.update(s); districts.update(s); dots.update(s);
    placeCluster(); speech.place(); vSpeech.place();
    const hideHint = s >= dotShowAt() || introOpen || STORES.length===0;
    document.getElementById('hint').classList.toggle('hide', hideHint);
    document.querySelector('.map-title').classList.toggle('hide', hideHint);   /* 제목 블럭도 힌트와 함께 사라진다 (10-21) */
  }
  svg.addEventListener('click', e => {
    if(V.moved) return;
    if(picking){ const [lat,lng] = unproj(...V.toMap(e.clientX, e.clientY));
      form.latlng.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; endPick(); return; }
    if(!e.target.closest('.dot,.col-pill,.cluster,.wk-talk')) { closeCluster(); collapseSide(); if(villager && !vTalk.visible) villagerDone(); else endPeek(true); }   /* 카드가 열려 있으면 카드만, 아니면 빈 사이드바도 접는다 (10-21) */
  });

  /* 카드 */
  const sheet = document.getElementById('sheet'), card = document.getElementById('card');
  const side = document.getElementById('side');
  /* 10-23: 사이드바는 인트로에서 막 들어왔을 때(소개 '우리가 만난 신당의 가게들', .welcome)와 가게 카드가 있을 때만.
     처음·인트로 다시 보기 때 인트로 아래서 미리 펴 두고(.welcome), 어떤 이유로든 접히면 소개는 끝(.welcome 제거) — 카드를 닫으면 접힌 채로. FIELD NOTES 버튼은 없앴다(CSS) */
  side.classList.add('welcome');
  new MutationObserver(() => { if(side.classList.contains('closed') && side.classList.contains('welcome')) side.classList.remove('welcome'); }).observe(side, { attributes: true, attributeFilter: ['class'] });   /* 데스크톱 사이드바 X 하나로: 카드가 열려 있으면 카드만 닫고, 아니면 사이드바를 접는다. 가게를 고르면 다시 열린다 */
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
  /* 폰 바텀시트 손잡이: 한 번 누르거나 아래로 끌어내리면 카드를 닫는다(10-26). 데스크톱 사이드바에선 손잡이가 숨겨져 있다 */
  onPullDown(document.getElementById('sheet-grip'), sheet, collapseSide, { enabled: () => !desktop() });
  let current = null;
  function select(s, focus, keepVillager){   /* keepVillager: 주민과 대화하며 그 주민의 가게 카드를 여는 경우 — 대화를 닫지 않는다(10-23) */
    speech.hide(); talk.hide(); if(!cycling && !keepVillager) villagerDone();
    current = s; dots.select(s._dot);
    const up = s.status==='up', href = s.ig || IG;
    const list = STORES, idx = list.indexOf(s)+1, vid = renderVideo(s.video), photos = s.photos || (s.photoUrl ? [s.photoUrl] : []);   /* 영상이 있으면 포스터 칸에 사진 대신 플레이어 (10-21) */
    card.classList.toggle('has-video', !!vid.embed);   /* 영상 카드(10-28): 인스타 버튼·안내 문구 없이 영상이 카드 폭을 다 쓴다(theme CSS 대신 tokens.css) */
    card.innerHTML = `
      <button class="x" aria-label="닫기" onclick="closeCard()">✕</button>
      <div class="ig-meta"><span class="account">@sindang.more</span><span class="num">${idx} / ${list.length}</span></div>
      ${vid.embed ? `<div class="poster video">${vid.embed}</div>` : photos.length > 1 ? renderGallery(photos) : `<div class="poster ${up?'up':''} ${s.photoUrl?'photo':''}" ${s.photoUrl?`style="background-image:url('${esc(s.photoUrl)}')"`:''}><div class="grid"></div><div class="poster-brand">MORE · SINDANG</div><div class="poster-tag">${esc(s.issue||'')}</div><div class="poster-title">${up?'Coming<br>soon':esc(s.name)}</div></div>`}
      <div class="detail">
        <h3>${esc(s.name)}</h3>
        ${up?'<p class="copy">인터뷰가 끝나면 이 자리에 카드뉴스가 올라옵니다.</p>':''}
        ${up?'<div class="tags"><span class="tag">다음 호</span></div>':''}
        ${vid.embed ? '' : `<a class="ig-link ${up?'up':''}" href="${esc(href)}" target="_blank" rel="noopener"><span>${up?'매거진 팔로우하기':'Instagram에서 보기'}</span><span>↗</span></a>`}
        ${vid.link||''}
        <div class="navs"><button class="nav" aria-label="이전" onclick="step(-1)">‹</button><button class="nav" aria-label="다음" onclick="step(1)">›</button></div>
        ${vid.embed ? '' : '<div class="small-note">카드뉴스 전체는 인스타그램 게시물에서 볼 수 있습니다.</div>'}
      </div>
      ${renderInterview(s.interview)}`;
    /* 스켈레톤(10-23): 사진·영상을 다 받기 전엔 포스터 칸에 반짝이는 자리표시. 이미 받아 둔 사진이면 바로. 사진을 못 받으면 원래 픽셀 포스터로 */
    const ph = card.querySelector('.poster.photo');
    if(ph && s.photoUrl){ const img = new Image(); img.src = s.photoUrl;
      if(!img.complete){ ph.classList.add('skel'); img.onload = () => ph.classList.remove('skel');
        img.onerror = () => { ph.classList.remove('skel', 'photo'); ph.style.backgroundImage = ''; }; } }
    const gal = card.querySelector('.poster.gallery'); if(gal) bindGallery(gal);
    /* 사진 크게 보기(10-26): 포스터 사진을 누르면 화면 가득(features/photo-viewer). 여러 장이면 지금 보던 장부터 */
    const pst = card.querySelector('.poster.photo');
    if(pst) pst.addEventListener('click', e => { if(!pst.classList.contains('photo') || e.target.closest('.pg-nav')) return;
      const tr = pst.querySelector('.pg-track'), k = tr ? Math.round(tr.scrollLeft / (tr.clientWidth || 1)) : 0; viewer.open(photos, k, s.name); });
    const vf = card.querySelector('.poster.video iframe, .poster.video video');
    driveFit.disconnect(); if(vf && vf.classList.contains('drive')) driveFit.observe(vf.parentElement);
    if(vf){ vf.parentElement.classList.add('skel'); const done = () => vf.parentElement.classList.remove('skel'); vf.addEventListener(vf.tagName === 'VIDEO' ? 'loadeddata' : 'load', done, { once: true }); vf.addEventListener('error', done, { once: true }); setTimeout(done, 12000); }
    sheet.classList.add('open'); side.classList.add('has'); side.classList.remove('closed');
    /* 폰 바텀시트는 'INTERVIEW' 제목까지만 보이는 높이로 연다(나머지는 시트 안에서 스크롤). 인터뷰가 없으면 기본 높이 */
    sheet.scrollTop = 0; const ih = card.querySelector('.interview .ih');
    sheet.style.maxHeight = (!desktop() && ih) ? Math.min(ih.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + 16, V.ph * 0.73) + 'px' : '';
    if(focus){ const s0 = Math.max(scale(), 4.6); centerOn(s.x, s.y, s0, desktop()?0:V.ph*0.24); } else apply();
  }
  /* 사진 여러 장(10-26): 포스터 칸 안에서 옆으로 넘긴다(scroll-snap — 손가락·트랙패드는 그대로, 마우스는 ‹ › 단추). 아래 점이 몇 번째인지.
     첫 장을 받기 전엔 스켈레톤, 못 받은 장은 포스터 바탕색으로 둔다. 사이드바 '오른쪽으로 넘겨 닫기'는 data-no-swipe 로 이 칸에서 시작한 끌기를 무시한다 */
  function renderGallery(photos){
    return `<div class="poster photo gallery"><div class="pg-track" data-no-swipe>${photos.map((u, i) => `<div class="pg-slide" role="img" aria-label="사진 ${i+1} / ${photos.length}" style="background-image:url('${esc(u)}')"></div>`).join('')}</div>`
      + `<button type="button" class="pg-nav prev" aria-label="이전 사진">‹</button><button type="button" class="pg-nav next" aria-label="다음 사진">›</button>`
      + `<div class="pg-dots" aria-hidden="true">${photos.map(() => '<i></i>').join('')}</div></div>`;
  }
  function bindGallery(gal){
    const track = gal.querySelector('.pg-track'), slides = [...track.children], dots = [...gal.querySelectorAll('.pg-dots i')], prev = gal.querySelector('.prev'), next = gal.querySelector('.next');
    let raf = 0;
    const sync = () => { raf = 0; const i = Math.round(track.scrollLeft / (track.clientWidth || 1)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); prev.hidden = i <= 0; next.hidden = i >= slides.length - 1; };
    track.addEventListener('scroll', () => { if(!raf) raf = requestAnimationFrame(sync); }, { passive: true });
    const go = d => track.scrollBy({ left: d * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    prev.addEventListener('click', e => { e.stopPropagation(); go(-1); }); next.addEventListener('click', e => { e.stopPropagation(); go(1); });
    sync();
    slides.forEach((sl, k) => { const url = sl.style.backgroundImage.slice(5, -2), img = new Image(); img.src = url;
      if(k === 0 && !img.complete){ gal.classList.add('skel'); img.onload = () => gal.classList.remove('skel'); }
      img.onerror = () => { sl.style.backgroundImage = ''; if(k === 0) gal.classList.remove('skel'); }; });
  }
  function step(d){ const i=(STORES.indexOf(current)+d+STORES.length)%STORES.length; select(STORES[i], true); }
  function closeCard(then){ closeCluster(); if(current){ dots.select(null); current=null; } sheet.classList.remove('open'); document.getElementById('side').classList.remove('has'); apply();
    withSide(true, () => { if(typeof then === 'function') then(); }); }   /* 카드가 없으면 사이드바도 접는다(다 접힌 뒤 지도 폭을 다시 재고 then) */
  /* 영상: 포스터 칸에 들어갈 플레이어(embed) 또는, 끼워 넣을 수 없는 주소면 인스타 버튼 아래 링크 버튼(link).
     구글 드라이브(공유 링크) → 미리보기 iframe, 유튜브 → embed, mp4/webm 주소 → <video> (10-21) */
  /* 드라이브 플레이어는 폭 512px 아래에선 영상을 최소 크기로 그리고 가운데만 잘라 보인다(재생 중에도). 그래서 560×315 로 그려 칸 폭에 맞게 줄인다(10-26, tokens.css) */
  const DRIVE_W = 560, driveFit = new ResizeObserver(es => es.forEach(e => e.target.style.setProperty('--vk', e.contentRect.width / DRIVE_W)));
  function renderVideo(url){
    url = (url||'').trim(); if(!url) return {};
    const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
    const frame = (src, cls = '') => ({ embed: `<iframe class="${cls}" src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="영상"></iframe>` });
    if(drive) return frame(`https://drive.google.com/file/d/${drive[1]}/preview`, 'drive');
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
     연출 중엔 지도를 만져도 끊기지 않는다 — '건너뛰기' 버튼(.kb-skip)으로만 바로 다 보이게(kioskSkip, 10-23). 낮춘 상태에서 30초 무입력이면 카메라만 보드 전체 뷰로. OFF 는 커튼 아래서 되돌린다(kioskOff). */
  /* 전시 모드로 열기: ?kiosk 또는 /qr 경로(10-26, 전시장 QR). QR 은 경로로 — Cloudflare Web Analytics 가 ?쿼리 는 기록하지 않아 /qr 이어야 QR 방문이 따로 집계된다.
     Pages 는 404.html 이 없으면 모르는 경로에 첫 화면(index)을 준다(SPA). 인쇄한 QR 주소는 못 바꾸니 /qr 의 동작은 여기서만 바꾼다 */
  let KIOSK = new URLSearchParams(location.search).has('kiosk') || /^\/qr\/?$/i.test(location.pathname);
  const BOARD_DEBUG = new URLSearchParams(location.search).has('board');   /* ?board=1: 연출 없이 보드가 다 보이는 상태로 시작(개발·확인용) */
  const kioskBtn = document.getElementById('kiosk');
  function renderKiosk(){ kioskBtn.textContent = '전시 모드 ' + (KIOSK?'ON':'OFF'); kioskBtn.setAttribute('aria-pressed', KIOSK); }
  /* 사이드바 접힘(0.42초)과 카메라 비행을 동시에 돌리면 두 속도 곡선이 겹쳐 화면이 좌우로 흔들린다 → 순서대로: 사이드바가 다 접힌(펴진) 뒤 카메라.
     사이드바 상태가 이미 원하는 쪽이면(손으로 접어 둔 경우) 바로 카메라만 */
  /* 전환 중엔 뷰포트가 재배치하지 않는다(holdOnResize) — 재배치의 미세한 배율 변화가 1~2px 떨림으로 보인다.
     카메라는 전환이 '실제로' 끝난 transitionend 뒤에 출발한다(타이머로 어림하면 마지막 프레임과 겹쳐 반전이 생긴다). 새 전환이 시작되면 이전 마무리는 취소 */
  let sideDone = null, sideThens = [];
  function withSide(closed, then){ if(!desktop()){ then(); return; }
    if(side.classList.contains('closed') === closed){ if(sideDone) sideThens.push(then); else then(); return; }   /* 이미 그쪽으로 접히는(펴지는) 중이면 그 끝을 같이 기다린다(10-23) */
    sideDone?.(false); sideThens = [then]; side.classList.toggle('closed', closed); sideAnimating = true;
    const onEnd = e => { if(e.target === stage && e.propertyName === 'grid-template-columns') done(true); };
    const t = setTimeout(() => done(true), 700);   /* transitionend 가 안 오는 경우(감춰진 탭 등) 대비 */
    const done = (run) => { stage.removeEventListener('transitionend', onEnd); clearTimeout(t); sideDone = null; sideAnimating = false; const fns = sideThens; sideThens = []; if(run){ V.fit(); fns.forEach(f => f()); } };   /* 접힘이 끝난 뒤의 지도 폭으로 다시 재고 출발 — 안 재면 옛 폭으로 중심을 잡아 치우친다 (10-21) */
    sideDone = done; stage.addEventListener('transitionend', onEnd); }
  let chiefActor = null, catActor = null, chiefHome = null;   /* 이장님 배우 (WALKERS 에서 채움) — 말풍선이 머리 위를 따라간다. chiefHome: 평소 자리 */
  const talk = mountTalk(stage, { onEnd: () => kioskRest() });   /* 큰 말풍선(인터뷰). 작은 말풍선의 인사가 끝나면 시작. 마지막 장이 닫히면 범례·주민 */
  /* 말풍선은 #map 안(10-28): 범례·확대 버튼·카드·관리 창 같은 UI 를 덮지 않고 그 아래로 지나간다(speech.css z-index) */
  const speech = mountSpeech(map, {
    anchor: () => { if(!chiefActor || chiefActor.g.getAttribute('display') === 'none') return null; const r = chiefActor.g.getBoundingClientRect(), st = map.getBoundingClientRect(); return { x: r.left + r.width / 2 - st.left, y: r.top - st.top }; },
    bounds: () => { const m = map.getBoundingClientRect(); return { left: 0, top: 0, width: m.width, height: m.height }; },
    onEnd: () => { if(KIOSK && !introOpen && kioskStage === 'play' && DATA.chiefTalk) talk.start(DATA.chiefTalk); },
  });
  const CHIEF_LINES = ['오호! 처음 보는 얼굴이구먼!\n**신당 5길**에 어서와!!', '잠깐 이야기 좀 듣고 갈 텐가?'];
  /* 대화가 끝난 뒤(rest) 이장님에게 마우스를 올리면(터치는 탭) 머리 위 말풍선으로 한 줄(10-23). 다 찍히고 2.8초 뒤 스스로 닫힌다 — rest 라 큰 상자로 넘어가지 않는다 */
  const CHIEF_AGAIN = ['허허, 또 왔구먼!\n아직 못 가 본 가게가 있나?'];
  /* 말풍선 규칙(10-26, 이장님·주민 똑같이): 작은 말풍선끼리는 새로 나온 쪽이 이긴다(떠 있던 다른 말풍선은 닫힌다). 큰 대화 상자가 열려 있으면 hover 말풍선은 안 뜬다.
     hook 함수는 말풍선이 떴거나 이미 떠 있으면 true — false 면 HoverProbe 가 0.2초 뒤 다시 묻는다(다시 판정하기) */
  function chiefHook(){ if(!KIOSK || introOpen || kioskStage !== 'rest' || talk.visible || vTalk.visible) return false; if(speech.visible) return true; villagerDone(); speech.say(CHIEF_AGAIN); return true; }
  /* hover 판정 보조: 그 자리 맨 위에 실제로 이 캐릭터가 있나(가게 점·말풍선·패널 등에 가려져 있으면 아니다). 커서 밑으로 걸어 들어온 경우도 이것으로 본다 */
  const topAt = (g, P) => { const t = document.elementFromPoint(P.cx, P.cy); return !!t && g.contains(t); };
  /* 전시 보드에선 충분히 다가갔을 때만 hover 말풍선(10-26 사용자 요청): 보드 전체 화면(kioskTarget)에서 + 버튼(×1.6) hoverZooms() 번만큼 확대한 배율부터.
     멀리서는 사람이 작아 안 보이는데 말풍선만 떠서 오류처럼 보였다. 휠·핀치도 배율로 본다. 누르기(클릭·탭)는 배율과 상관없다 */
  /* 10-26 완화: 3번 → 데스크톱 1번(사람 키 약 21 → 42px), 폰 폭 2번. 폰은 픽셀을 정수로 맞추느라 2번까지 사람 크기가 보드 전체와 같다(21px).
     폰 터치는 이 문턱과 상관없이 탭하면 뜬다 — 이 값은 마우스(좁은 창 포함)용 */
  /* 10-28: 조금 더 다가가야 뜨게 — 위 문턱에 HOVER_EXTRA(×1.25)를 더 곱한다(데스크톱 + 1번 → 약 1.5번, 폰 2번 → 약 2.5번).
     평소 지도(전시 모드 OFF)도 같은 규칙으로, 기준만 처음 화면(homeView) 배율 */
  const hoverZooms = () => desktop() ? 1 : 2, HOVER_EXTRA = 1.25;
  const hoverNear = () => V.scale() >= (KIOSK && board?.on ? kioskTarget().s : homeView().s) * 1.6 ** hoverZooms() * HOVER_EXTRA * 0.98;
  /* 마을 사람 인터뷰(10-23, 설계 메모 '마을 사람 캐릭터 인터뷰' §4): 대본이 있는 주민(content/characters/villagers/*.json)은 이장님과 같은 2단 —
     마우스를 올리면(터치는 첫 탭) 머리 위 작은 말풍선에 hook 한 줄이 HOOK_MS 동안 뜨고, 누르면(터치는 두 번째 탭) 지도 아래 큰 상자에 인터뷰가 장마다 넘어간다.
     말을 거는 동안 그 주민은 그 자리에 서 있다(walker.hold). 말풍선·상자 모양은 이장님 것과 같다(chief-speech · chief-talk). 큰 상자가 닫히면 다시 걷는다 */
  const HOOK_MS = 3000;
  /* 터치(10-26): 첫 탭에 말풍선과 함께 카메라가 그 주민을 비추고(focusVillager) 발밑 표시가 뜬다. 말풍선 자체가 버튼('이야기 듣기 ›') —
     누르거나 주민을 한 번 더 누르면 큰 상자. 말풍선은 다 찍힌 뒤 TOUCH_HOOK_MS 동안 남고, 지도 빈 곳을 누르면 닫힌다 */
  const TOUCH_HOOK_MS = 8000;
  let villager = null, vHookT = null;   /* { w, script } 지금 말을 거는 주민 */
  const vTalk = mountTalk(stage, { onEnd: () => { const st = vEndCard; vEndCard = null; villagerDone(); if(st) openStoreCard(st); if(KIOSK) idle(); } });   /* 모바일: 대화가 끝나면 그 가게 카드 */   /* 대화가 끝나면 무입력 30초를 다시 센다 → 자동 순환 이어짐 */
  const vSpeech = mountSpeech(map, {
    anchor: () => { const g = (vPeek || villager)?.w.g; if(!g || g.getAttribute('display') === 'none') return null; const r = g.getBoundingClientRect(), st = map.getBoundingClientRect(); return { x: r.left + r.width / 2 - st.left, y: r.top - st.top }; },
    bounds: () => { const m = map.getBoundingClientRect(); return { left: 0, top: 0, width: m.width, height: m.height }; },
  });
  const takeVillager = (w, script) => { clearTimeout(vHookT); if(villager && villager.w !== w){ villager.w.release(); vTalk.hide(); } villager = { w, script }; w.hold(); };
  /* 이장님이 말하는 동안(전시 연출·말풍선·큰 상자)엔 주민에게 말을 걸 수 없다(10-23) */
  /* 이장님이 전시 연출 중이거나 큰 상자로 말하는 동안엔 주민에게 말을 걸 수 없다. 이장님 작은 말풍선은 막지 않는다 — 새로 뜬 주민 말풍선이 그것을 닫는다(10-26) */
  const chiefBusy = () => (KIOSK && kioskStage === 'play') || talk.visible;
  /* how: 'hover'(마우스 올림 — 안내 줄 없는 말풍선) | 'click'(마우스로 누름) | 'touch'(손가락) — 누르면 '이야기 듣기 ›' 가 붙은 말풍선(10-28: 줌아웃이라 hover 말풍선이 안 뜰 때도, 폰에서 가게 카드가 떠 있을 때도 먼저 이것).
     이미 hover 로 이 주민 말풍선이 떠 있으면 다시 찍지 않고 안내 줄만 붙인다. vFull: 지금 말풍선에 안내 줄이 있나 — 있을 때 이 주민을 또 누르면 큰 상자 */
  let vFull = false;
  function villagerHook(w, script, how = 'hover'){ const full = how !== 'hover';
    if(villager?.w === w && vTalk.visible) return true;   /* 이미 이 주민과 대화 중 */
    if(villager?.w === w && vSpeech.visible){ if(full && !vFull){ vFull = true; vSpeech.setCta('이야기 듣기 ›'); hookTimer(w, TOUCH_HOOK_MS, how === 'touch'); } return true; }
    if(chiefBusy() || vTalk.visible) return false;
    speech.hide(); takeVillager(w, script); vFull = full; vSpeech.say([script.hook], { onTap: () => villagerOpen(w, script), cta: full ? '이야기 듣기 ›' : undefined });   /* 말풍선을 눌러도 큰 상자(10-26) */
    hookTimer(w, script.hook.length * 34 + (full ? TOUCH_HOOK_MS : HOOK_MS), how === 'touch');
    if(how === 'touch') focusVillager(w);
    return true; }   /* 다 찍힌 뒤 HOOK_MS(누른 것은 TOUCH_HOOK_MS) 동안 남는다(한 글자 34ms 타자) */
  function hookTimer(w, ms, touch){ clearTimeout(vHookT); vHookT = setTimeout(() => { if(villager?.w === w && !vTalk.visible){ villagerDone(); if(touch && KIOSK) idle(); } }, ms); }
  /* 터치 첫 탭에 그 주민을 비춘다(10-26): 자동 순환을 멈추고, 폰에서 가게 카드(바텀시트)가 떠 있으면 닫고(아래를 덮는다), 사람이 잘 보이는 배율로 —
     전시 보드는 + 버튼 3번(TAP_ZOOMS — 폰에서 사람 키가 21 → 42px 로 커지는 첫 배율), 평소 지도는 4.6. 더 당겨 보고 있었으면 그대로 */
  const TAP_ZOOMS = 3;
  /* 10-28: 폰에서 가게 카드가 떠 있어도 닫지 않는다 — 카드는 '이야기 듣기' 로 큰 상자를 열 때 닫힌다(villagerOpen). 그 동안 사람은 카드(바텀시트) 위쪽에 */
  function focusVillager(w){ stopCycle();
    const s0 = Math.max(scale(), KIOSK && board ? kioskTarget().s * 1.6 ** TAP_ZOOMS : 4.6);
    centerOn(w.x + w.ox, w.y + w.oy, s0, current && !desktop() ? V.ph * 0.24 : 0); }   /* 다 찍힌 뒤 HOOK_MS 동안 남는다(한 글자 34ms 타자) */
  /* 주민과 대화(10-23): 자동 순환을 멈추고 그 주민을 비춘다 — 큰 상자를 열고, 그 주민의 가게(대본 store = 가게 이름) 카드를 사이드바에 펴고,
     사이드바가 다 펴진 뒤 카메라가 주민 쪽으로 줌인(전시 보드에선 자동 순환과 같은 배율). 주민은 대화 동안 그 자리에 서 있다(hold) */
  /* 모바일(10-23): 대화 중엔 가게 카드(바텀시트)를 띄우지 않는다 — 대화 상자와 겹쳤다. 이름표 옆 '가게 카드 ›' 로 대화를 닫고 바로 열거나, 대화가 끝나면 열린다(vEndCard) */
  let vEndCard = null;
  const openStoreCard = (st) => { if(KIOSK && board){ board.select(st.id); board.focus(null); } select(st, false); };
  function villagerOpen(w, script){ if(chiefBusy()) return; endPeek(); speech.hide(); takeVillager(w, script); vSpeech.hide(); stopCycle();
    const st = script.store ? STORES.find(s => s.name === script.store) : null, wide = desktop();
    vEndCard = !wide && st ? st : null;
    vTalk.start({ name: script.store && !script.name.startsWith(script.store) ? `${script.store} · ${script.name}` : script.name,   /* 이름이 가게 이름으로 시작하면('신당야학 박소민 강학') 겹치지 않게 이름만 */
      pages: script.pages.map(p => [p]),
      action: !wide && st ? { label: '가게 카드 ›', onClick: () => { vEndCard = null; villagerDone(); openStoreCard(st); } } : undefined });
    const go = () => { if(villager?.w !== w) return;
      if(st && wide){ if(KIOSK && board){ board.select(st.id); board.focus(null); } select(st, false, true); }
      const s0 = KIOSK && board ? focusZoom() : Math.max(scale(), 4.6);
      centerOn(w.x + w.ox, w.y + w.oy, s0, wide ? V.ph * 0.1 : V.ph * 0.14); };   /* 아래 큰 상자를 피해 사람을 조금 위에 */
    if(st && wide) withSide(false, go); else if(!wide && current) closeCard(go); else go(); }   /* 폰: 떠 있던 가게 카드(바텀시트)는 닫고 대화(10-28) — 대화 상자가 카드 위에 쌓였다 */
  /* 해 디오라마 속 주민과 대화(10-28): 큰 상자만 — 가게 카드·카메라는 그대로(보드는 디오라마 아래에 있다) */
  function villagerTalk(w, script){ if(chiefBusy()) return; endPeek(); speech.hide(); takeVillager(w, script); vSpeech.hide(); stopCycle(); vEndCard = null;
    vTalk.start({ name: script.store && !script.name.startsWith(script.store) ? `${script.store} · ${script.name}` : script.name, pages: script.pages.map(p => [p]) }); }
  function villagerDone(){ endPeek(); vFull = false; clearTimeout(vHookT); vSpeech.hide(); if(vTalk.visible) vTalk.hide(); villager?.w.release(); villager = null; }
  /* 큰 상자로 대화하는 중에 다른 주민을 누르면(10-28): 바로 넘어가지 않고 그 사람 머리 위에 작은 말풍선(hook)만 — hover 와 같은 말풍선, 큰 상자는 그대로.
     그 사람은 말풍선이 떠 있는 동안 서 있고, 그 동안 한 번 더 누르거나 말풍선을 누르면 그 사람과 큰 대화로 넘어간다. 지도 빈 곳을 누르거나 시간이 지나면 닫힌다 */
  let vPeek = null, vPeekT = null;   /* { w, script } 대화 중에 말풍선을 띄운 다른 주민 */
  function villagerPeek(w, script){ if(chiefBusy()) return; endPeek(); vPeek = { w, script }; w.hold();
    vSpeech.say([script.hook], { onTap: () => villagerOpen(w, script), cta: '이야기 듣기 ›' });
    vPeekT = setTimeout(() => { if(vPeek?.w === w) endPeek(true); }, script.hook.length * 34 + TOUCH_HOOK_MS); }
  function endPeek(hide = false){ if(!vPeek) return; clearTimeout(vPeekT); const w = vPeek.w; vPeek = null; if(hide) vSpeech.hide(); if(villager?.w !== w) w.release(); }
  /* 주민이 장면에서 빠질 때(교대·폼 내리기): 그 사람과의 대화·말풍선을 닫는다 */
  function dropVillager(w){ if(villager?.w === w) villagerDone(); else if(vPeek?.w === w) endPeek(true); }
  function bindVillager(w, script){
    w.makeClickable(); w.vScript = script;   /* 해 디오라마 속 주민 명단(story villagers.roster)이 대본을 찾는다 */
    if(script.kind === 'form'){ const M = DATA.characters.chief.mark; w.showMark({ ...M, colors: M.formColors || M.colors }); }   /* 시민이 인터뷰를 남겨 생긴 주민만 세모 — 이장님(빨강)과 달리 초록(10-28, chief.json mark.formColors). 가게 인터뷰 주민(shop)은 표시 없음 */
    w.hover.onHover = P => hoverNear() && topAt(w.g, P) && villagerHook(w, script);   /* 마우스: 몸 판정 칸 위에 있으면(walker tick → HoverProbe) — pointerenter 대신(10-26) */
    /* 터치 판정(10-23): click 의 pointerType 은 iOS 사파리 등에서 비어 와 첫 탭에 바로 대화가 열렸다 → 닿는 순간(pointerdown)의 종류를 기억해 쓴다. 그것도 없으면 hover 없는 기기를 터치로 */
    let downType = '';
    w.g.addEventListener('pointerdown', e => { downType = e.pointerType; });
    w.g.addEventListener('click', e => { e.stopPropagation(); if(V.moved) return;
      const type = downType || e.pointerType || (matchMedia('(hover: none)').matches ? 'touch' : 'mouse'); downType = '';
      if(vTalk.visible && villager?.w !== w){ if(vPeek?.w === w) villagerOpen(w, script); else villagerPeek(w, script); return; }   /* 다른 주민과 대화 중: 첫 번째는 작은 말풍선, 그 말풍선이 떠 있을 때 한 번 더 누르면 이 사람과 대화(10-28) */
      if(villager?.w === w && vTalk.visible) return;   /* 이미 이 주민과 대화 중 */
      if(villager?.w === w && vSpeech.visible && vFull) villagerOpen(w, script);   /* '이야기 듣기' 말풍선이 떠 있을 때 한 번 더: 큰 상자 */
      else villagerHook(w, script, type === 'mouse' ? 'click' : 'touch'); });   /* 첫 누르기는 마우스·손가락 모두 '이야기 듣기' 말풍선부터(10-28) — hover 말풍선이 떠 있었으면 거기에 안내 줄만 붙는다 */
  }
  /* 보드 전체(시안 캔버스 1774×887)를 담는 카메라 */
  const kioskTarget = () => { const v = board.view(); return { x: v.x, y: v.y, s: desktop() ? Math.min(V.pw / v.w, V.ph / v.h) : V.pw / (v.iw * 1.08) }; };   /* 데스크톱: 캔버스 전체(하늘까지) · 폰: 섬 폭에 맞춤 */
  let walkers = [], walkerGraphs = null, walkerScene = null, extras = [];   /* WALKERS 에서 채움. extras: 대본이 없는 지나가는 주민 — 10-28 부터 없다(가게 주민은 돌아가며, 나머지는 시민 인터뷰 주민) */
  /* 전시 모드에서는 인터뷰가 있는 사람만(10-26): 이장님 · 가게 인터뷰 주민 · 시민 인터뷰 주민. 지나가는 주민은 장면에서 잠시 빼 두었다가(걷지도 그리지도 않음) 평소 지도로 돌아오면 다시 넣는다 */
  function parkExtras(off){ if(!walkerScene) return;
    for(const w of extras){ const i = walkerScene.actors.indexOf(w);
      if(off){ if(i >= 0) walkerScene.actors.splice(i, 1); w.g.setAttribute('display', 'none'); w.lastT = 'off'; }
      else if(i < 0) walkerScene.add(w); } }
  const walkersTo = (which) => { if(!walkerGraphs) return; walkers.forEach(w => w.setGraph(walkerGraphs[which])); parkExtras(which === 'kiosk'); };   /* 주민을 보드 위 길 ⇄ 평소 큰 길로 — 보이지 않을 때만 */
  /* 이장님을 보드 자리 ⇄ 평소 자리로 (고양이는 이장님을 따라간다) */
  const chiefTo = (onBoard) => { if(!chiefActor) return; if(!chiefHome) chiefHome = { x: chiefActor.x, y: chiefActor.y }; const p = onBoard ? board.chiefAt() : [chiefHome.x, chiefHome.y]; chiefActor.x = p[0]; chiefActor.y = p[1]; if(catActor){ catActor.x = p[0]; catActor.y = p[1]; } };
  let kioskStage = 'off';   /* off | play | rest */
  /* 차례 번호(10-23): 전시 연출을 시작·멈출 때마다 올린다. 사이드바 접힘·커튼·지연 시작처럼 늦게 도착하는 콜백은 자기 차례가 아니면 아무것도 안 한다
     — 인트로를 다시 열거나 버튼을 빠르게 눌렀을 때 뒤에서 옛 연출이 계속 돌던 것을 막는다 */
  let kioskSeq = 0, kioskStartT = null;
  /* 이야기 상자(10-28, features/board-story): 전시 보드 rest 에서 해·구름·별·나무·재봉틀을 누르면. 여는 것도 활동 — 카드·주민 대화·이장님 말풍선은 닫는다.
     열린 동안 자동 순환은 안 돈다(canCycle). 연출을 멈추거나 끄거나 인트로를 다시 열면 그 자리에서 닫는다 */
  const story = board ? mountStory({ host: map, svg, targets: () => board.storyTargets(), layer: board.storyLayer, islandPath: board.islandPath,
    active: () => KIOSK && board.on && !introOpen && kioskStage === 'rest' && document.documentElement.classList.contains('kb-rest'),
    busy: () => cycling || !!current || viewer.visible || talk.visible || speech.visible || vTalk.visible || vSpeech.visible || !!clusterAt,
    quiet: () => talk.visible || vTalk.visible, moved: () => V.moved, toBoard: (lat, lng) => board.toBoard(...proj(lat, lng)), spots: () => board.storeSpots(), top: board.storyTop, obstacles: () => board.propBoxes(),
    camera: (() => { let saved = null; return {   /* 이야기 장이 잠깐 카메라를 당겼다가(해 눈금 글씨가 작을 때) 되돌린다 */
      focus: (x, y, mul, dx = 0) => { const s = V.scale(); if(!saved) saved = { x: V.x + V.pw / (2 * s), y: V.y + V.ph / (2 * s), s }; const [mx, my] = board.toMapXY(x, y); centerOn(mx + dx / (s * mul), my, s * mul, 0); },   /* dx: 화면 px 만큼 오른쪽을 비운다(상자 자리) */
      restore: () => { if(!saved) return; const p = saved; saved = null; centerOn(p.x, p.y, p.s, 0); } }; })(),
    onOpen: () => { idle(); closeCluster(); viewer.close(); speech.hide(); villagerDone(); if(current) closeCard(); board.focus(null); },
    onClose: () => idle(), openPhoto: (urls, i, label) => viewer.open(urls, i, label),
    villagers: { roster: () => walkers.filter(w => w.vScript).sort((a, b) => (b.vScript.kind === 'form') - (a.vScript.kind === 'form')).map(w => ({ id: w.vScript.id, g: w.g, body: w.body, script: w.vScript })),   /* 시민 인터뷰 주민 먼저 */
      hook: (p, script) => villagerHook(p, script), talk: (p, script) => villagerTalk(p, script), talking: () => vTalk.visible, done: () => villagerDone() } }) : null;
  function kioskView(){ if(!board || introOpen) return; const my = ++kioskSeq; clearTimeout(kioskStartT); kioskStage = 'play'; syncSkip?.();
    villagerDone(); speech.hide(); closeCluster();   /* 켜기 전에 hover 로 떠 있던 주민·이장님 말풍선은 닫는다(10-26) — 주민 hook 은 3초 남짓 남아 연출 위에 떠 있었다 */
    withSide(true, () => { if(my !== kioskSeq || !KIOSK) return; walkersTo('kiosk'); chiefTo(true);
      if(kioskStage !== 'play') return;   /* 사이드바가 접히는 사이(약 0.3초) Skip 을 눌렀으면(kioskSkip → rest) 주민·이장님 자리만 옮기고 카메라·연출은 다시 틀지 않는다(10-28 — 전엔 연출이 처음부터 다시 돌았다) */
      const t2 = kioskTarget(); centerOn(t2.x, t2.y, t2.s, 0);
      /* ⑧ 이장님: 먼저 이장님 쪽으로 두 단계(×1.6²) 줌인하고, 도착하면 등장·말풍선 → 큰 상자(10-23). 대화가 끝나면 kioskRest 가 보드 전체로 물러난다 */
      board.play({ onChief: () => { if(my !== kioskSeq || !KIOSK) return; const [cx, cy] = board.chiefAt(), t = kioskTarget();
        V.centerOn(cx, cy - 12, t.s * 1.6 ** 2, 0, () => { if(my !== kioskSeq || !KIOSK) return; showChief(true); speech.say(CHIEF_LINES); }, true); } }); }); }   /* always: 줌인 도중 지도를 눌러 비행이 끊겨도 이장님은 그 자리에서 나온다(10-26) */
  /* 전시 연출을 그 자리에서 다 멈추고 평소 상태로(카메라·사이드바는 부르는 쪽이 정한다) */
  function stopKiosk(){ story?.close(true); viewer.close(); closeCluster(); kioskSeq++; clearTimeout(kioskStartT); stopCycle(); kioskStage = 'off'; syncSkip?.(); speech.hide(); talk.hide(); villagerDone(); showChief(false); board?.hide(); walkersTo('home'); chiefTo(false); sideDone?.(false); }
  function kioskRest(){ if(!KIOSK || !board || kioskStage !== 'play') return; kioskStage = 'rest'; syncSkip?.(); idle(); board.rest(); const t = kioskTarget(), k = REST_ZOOM(), [cx, cy] = board.chiefAt(); centerOn(cx + (t.x - cx) / k, cy + (t.y - cy) / k, t.s * k, 0); }
  /* 이장님 줌인에서 물러나며 범례·단추 — 보드 전체까지 다 물러나지 않고 데스크톱 ×1.25 · 폰 ×1.6(+ 버튼 한 번) 남긴다(10-28 사용자 요청).
     중심은 이장님을 고정점으로 줌아웃한 자리(보드 전체 화면에서 이장님이 있던 곳에 그대로 보인다). 30초 쉼·자동 순환 한 바퀴 끝은 보드 전체 그대로 */
  const REST_ZOOM = () => desktop() ? 1.25 : 1.6;
  function kioskSkip(){ if(!KIOSK || !board || introOpen || kioskStage !== 'play') return; speech.hide(); talk.hide(); board.skip(); showChief(true); kioskRest(); }
  /* 건너뛰기(10-23): 연출(play) 동안만 보인다. 전엔 지도를 누르거나 휠만 굴려도 건너뛰어졌다 */
  const skipBtn = document.createElement('button'); skipBtn.type = 'button'; skipBtn.className = 'kb-skip'; skipBtn.textContent = 'Skip ›'; skipBtn.setAttribute('aria-label', '전시 연출 건너뛰기'); map.appendChild(skipBtn);
  skipBtn.addEventListener('pointerdown', e => e.stopPropagation());
  skipBtn.addEventListener('click', e => { e.stopPropagation(); kioskSkip(); });
  const syncSkip = () => skipBtn.classList.toggle('show', KIOSK && !introOpen && kioskStage === 'play');
  function goHome(){ withSide(!side.classList.contains('welcome'), () => {   /* 소개가 떠 있으면 편 채로 */ const hv = homeView(); centerOn(hv.x, hv.y, hv.s, 0); }); }
  /* 이장님·고양이는 평소엔 숨겨 두고(body.chief-hidden), 보드 연출의 제목 뒤에 등장한다. 끄면 다시 숨김 */
  const showChief = (on) => { document.body.classList.toggle('chief-hidden', !on); document.querySelectorAll('.wk-chief,.wk-cat').forEach(g => g.classList.toggle('appear', on)); };
  function kioskOff(){ story?.close(true); speech.hide(); talk.hide(); kioskStage = 'off'; syncSkip?.(); const my = ++kioskSeq; clearTimeout(kioskStartT);
    withCurtain(() => { if(my !== kioskSeq) return; stopKiosk(); closeCard(); side.classList.add('closed'); V.fit(); resetHome(); }); }   /* 커튼이 덮이는 사이 다시 켰으면 되돌리지 않는다 */
  /* 인트로가 떠 있는 동안엔 상태(ON/OFF)만 바꾼다 — 연출은 인트로가 끝난 뒤(endIntro) */
  kioskBtn.onclick = () => { KIOSK=!KIOSK; renderKiosk(); if(introOpen) return; if(KIOSK){ showChief(false); closeCard(); kioskView(); } else kioskOff(); };
  renderKiosk();
  /* 쉬고 있을 때의 모습: 범례가 뜬 뒤 30초 동안 아무 입력이 없으면 카메라만 보드 전체 뷰로 돌아온다(연출은 다시 틀지 않는다) */
  /* 자동 순환(10-23): 전시 보드가 쉬는 상태(rest)에서 30초 동안 입력이 없으면 가게 단추를 하나씩 줌인해 비춘다(6초씩, 왼쪽→오른쪽).
     한 바퀴 뒤엔 보드 전체를 6초 보여 주고 다시. 범례 필터가 켜져 있으면 그 업종만. 클릭·터치·휠·키가 오면 바로 멈추고 다시 30초를 센다.
     비출 때마다 단추를 눌렀을 때처럼 가게 카드(오른쪽 사이드바·폰 바텀시트)를 연다. 사이드바가 다 펴진 뒤(withSide) 카메라를 옮긴다 — 같이 돌리면 흔들린다.
     한 바퀴 끝의 보드 전체 뷰에선 카드를 닫고 사이드바를 접는다. 사람이 끼어들어 멈추면 열린 카드는 그대로 둔다 */
  const IDLE_MS = 4000, DWELL_MS = 6000;
  let idleT = null, cycleT = null, cycleI = 0, cycling = false;
  const canCycle = () => KIOSK && board && !introOpen && kioskStage === 'rest' && !viewer.visible && !talk.visible && !speech.visible && !vTalk.visible && !vSpeech.visible && !clusterAt && !videoPlaying() && !story?.open;   /* 이야기 상자가 열린 동안에도(10-28). 묶음 말풍선을 보고 있는 동안·영상 재생 중에도 쉬지 않는다 */
  /* 영상 재생 중엔 자동 순환을 하지 않는다(10-26). 카드의 <video> 는 paused 로 바로 안다. 유튜브·구글 드라이브 iframe 은 다른 출처라 재생 여부를 못 읽으니
     iframe 을 누른 뒤(포커스가 그 안에 있는 동안)를 재생 중으로 본다 — 바깥을 누르면 풀린다. 다 보고 자리를 뜬 경우를 위해 iframe 은 VIDEO_MAX_MS 뒤엔 풀어 준다. 전체화면도 재생 중 */
  const VIDEO_MAX_MS = 60 * 1000; let frameAt = 0;
  const inCardFrame = () => { const a = document.activeElement; return !!(a && a.tagName === 'IFRAME' && a.closest('#card .poster.video')); };
  function videoPlaying(){
    const v = card.querySelector('.poster.video video'); if(v && !v.paused && !v.ended) return true;
    if(document.fullscreenElement || document.webkitFullscreenElement) return true;
    return inCardFrame() && performance.now() - frameAt < VIDEO_MAX_MS;
  }
  const focusZoom = () => kioskTarget().s * (desktop() ? 2.6 : 2.2);   /* 보드 전체 배율에서 ×2.6(폰 ×2.2) */
  function stopCycle(){ clearTimeout(cycleT); if(cycling){ cycling = false; board?.focus(null); } }
  function cycleStep(){
    if(!canCycle()){ stopCycle(); return; }
    const list = board.focusList();
    const seq = kioskSeq;
    if(!list.length || cycleI >= list.length){ cycleI = 0; board.focus(null); board.select(null);   /* 한 바퀴 끝: 카드 닫고(사이드바 접힘) 보드 전체 */
      closeCard(() => { if(!cycling || seq !== kioskSeq) return; const t = kioskTarget(); centerOn(t.x, t.y, t.s, 0); });
      cycleT = setTimeout(cycleStep, DWELL_MS); return; }
    const f = list[cycleI++], st = STORES.find(s => s.id === f.id);
    withSide(false, () => { if(!cycling || seq !== kioskSeq) return;
      board.select(f.id); board.focus(f.id); if(st) select(st, false);                    /* 단추를 눌렀을 때와 같은 카드 */
      centerOn(f.x, f.y, focusZoom(), desktop() ? 0 : V.ph * 0.24); });                    /* 폰은 바텀시트가 아래를 덮으니 조금 위로 */
    cycleT = setTimeout(cycleStep, DWELL_MS);
  }
  /* 평소 지도 자동 순환(10-26, 사용자 요청 '가게를 주인공으로'): 전시 모드가 꺼져 있어도 HOME_IDLE_MS 동안 아무 입력이 없으면
     발행된 가게(다음 호 제외)를 하나씩 비춘다 — 그 가게 카드를 열고 줌인, HOME_DWELL_MS 씩. 한 바퀴 뒤엔 카드를 닫고 처음 화면(goHome)에서 한 번 쉬었다가 다시.
     순서는 지도 위 동선: 가장 서쪽 가게에서 출발해 가장 가까운 가게로 이어 간다(섬을 가로지르는 왕복 비행을 줄인다).
     방문객이 직접 연 카드가 떠 있거나(읽는 중일 수 있다) 관리 패널·인트로·대화·사진 크게 보기·묶음 팝업·영상 재생 중·탭이 숨겨졌으면 시작하지 않는다.
     입력이 오면 전시 모드와 똑같이 바로 멈추고(출발한 카메라도 그 자리에서), 열린 카드는 그대로 둔다. 다시 쉬면 다음 가게부터 이어 간다 */
  const HOME_IDLE_MS = 6000, HOME_DWELL_MS = 6000, HOME_FOCUS = 4.6;
  let homeIdleT = null, homeCycleT = null, homeCycling = false, homeOrder = [], homeI = 0, homeCardId = null;
  const homeVideo = () => typeof videoPlaying === 'function' && videoPlaying();
  const canHomeCycle = () => !KIOSK && !introOpen && !adminOpen && !picking && !document.hidden && !viewer.visible && !talk.visible && !speech.visible && !vTalk.visible && !vSpeech.visible && !clusterAt && !homeVideo()
    && !(current && current.id !== homeCardId);   /* 방문객이 직접 연(또는 순환이 연 뒤 ‹ › 로 넘긴) 카드면 기다린다 */
  function homeRoute(){ const pub = STORES.filter(s => s.status !== 'up'); if(!pub.length) return [];
    let cur = pub.reduce((a, b) => (b.x < a.x ? b : a)); const left = new Set(pub), out = [];
    while(cur){ left.delete(cur); out.push(cur.id); let best = null, bd = Infinity; for(const s of left){ const d = (s.x - cur.x) ** 2 + (s.y - cur.y) ** 2; if(d < bd){ bd = d; best = s; } } cur = best; }
    return out; }
  function stopHomeCycle(){ clearTimeout(homeCycleT); homeCycling = false; }
  function homeStep(){
    if(!canHomeCycle()){ stopHomeCycle(); return; }
    if(homeI >= homeOrder.length){ homeI = 0; homeOrder = homeRoute(); homeCardId = null;   /* 한 바퀴 끝(가게가 늘었으면 새 동선): 카드 닫고 처음 화면 */
      closeCard(() => { if(homeCycling) goHome(); }); homeCycleT = setTimeout(homeStep, HOME_DWELL_MS); return; }
    const id = homeOrder[homeI++], st = STORES.find(s => s.id === id); if(!st){ homeStep(); return; }   /* 그새 지워진 가게는 건너뛴다 */
    withSide(false, () => { if(!homeCycling) return; homeCardId = st.id; select(st, false);                   /* 사이드바가 다 펴진 뒤 카메라(같이 돌리면 흔들린다) */
      centerOn(st.x, st.y, HOME_FOCUS, desktop() ? 0 : V.ph * 0.24); });                                    /* 폰은 바텀시트가 아래를 덮으니 조금 위로 */
    homeCycleT = setTimeout(homeStep, HOME_DWELL_MS); }
  const startHomeIdle = () => { clearTimeout(homeIdleT); homeIdleT = setTimeout(() => { if(downs.size || !canHomeCycle()){ startHomeIdle(); return; }
    if(!homeOrder.length || homeI >= homeOrder.length){ homeOrder = homeRoute(); homeI = 0; } homeCycling = true; homeStep(); }, HOME_IDLE_MS); };
  /* 활동 판정(10-23): 누르는 순간만이 아니라 손가락·마우스를 대고 있는 동안(끌기·핀치), 움직임, 스크롤(카드 읽기)도 활동.
     capture 단계로 들어서 중간에서 막는 요소가 있어도 받는다. 손가락이 닿아 있는 동안엔 30초가 지나도 순환을 시작하지 않는다.
     순환 중에 만지면 이미 출발한 카메라 이동도 그 자리에서 멈춘다(V.stop) — 전엔 카드를 만져도 카메라가 끝까지 가 '터치 중 전환'처럼 보였다 */
  const downs = new Set(); let lastIdle = 0;
  const startIdle = () => { clearTimeout(idleT); idleT = setTimeout(() => { if(downs.size || videoPlaying()){ startIdle(); return; } if(canCycle()){ cycling = true; cycleStep(); } }, IDLE_MS); };
  const idle = () => { if(cycling){ stopCycle(); V.stop(); } if(homeCycling){ stopHomeCycle(); V.stop(); } lastIdle = performance.now(); startIdle(); startHomeIdle(); };
  const idleSoft = () => { if(cycling || homeCycling || performance.now() - lastIdle > 500) idle(); };   /* 움직임·스크롤은 0.5초에 한 번만 다시 센다 */
  const opt = { passive: true, capture: true };
  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, idle, opt));
  ['pointermove', 'touchmove', 'scroll'].forEach(ev => window.addEventListener(ev, idleSoft, opt));
  window.addEventListener('pointerdown', e => downs.add(e.pointerId), opt);
  ['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, e => { downs.delete(e.pointerId); idle(); }, opt));
  window.addEventListener('blur', () => { downs.clear(); setTimeout(() => { if(inCardFrame()){ frameAt = performance.now(); idle(); } }); });   /* iframe 안을 누르면 창이 blur — 그때부터 재생 중 */
  ['play', 'pause', 'ended'].forEach(ev => window.addEventListener(ev, idle, opt));   /* <video> 재생·멈춤(버블 안 하는 이벤트라 capture 로). 멈추면 거기서부터 다시 센다 */
  idle();
  function wake(){}   /* 예전엔 30초 뒤 자동 전환을 다시 걸었다. 호출 자리는 남겨 둔다 */

  /* 인트로 (펼침) */
  let introOpen = true, introT=null;
  const intro = document.getElementById('intro');
  function endIntro(){ if(!introOpen) return; introOpen=false; intro.classList.add('done'); apply();
    document.getElementById('empty').classList.toggle('show', STORES.length===0); wake();
    /* 인트로가 끝나면 먼저 평소 지도(낮/밤 기본 화면) → 카메라가 자리 잡고 1초 뒤 전시 연출 (10-23). 그 사이 인트로를 다시 열거나 전시를 끄면 시작 안 함 */
    setTimeout(()=>{ if(introOpen) return;
      if(BOARD_DEBUG && board && !KIOSK){ withSide(true, () => { const t2 = kioskTarget(); centerOn(t2.x, t2.y, t2.s, 0); }); return; }
      goHome();
      if(KIOSK){ const my = kioskSeq; clearTimeout(kioskStartT); kioskStartT = setTimeout(() => { if(my === kioskSeq && KIOSK && !introOpen){ showChief(false); closeCard(); kioskView(); } }, 700 + 500); }   /* 카메라 0.7s + 텀 0.5s */
    }, 100); }
  function openMap(){ if(intro.classList.contains('open')) return; intro.classList.remove('back'); intro.classList.add('open'); clearTimeout(introT); introT=setTimeout(endIntro, +intro.dataset.ms || 1900); }
  /* 인트로 다시 보기: 상단바 'MORE' 글자를 누르면(10-28 — 전엔 'INTRO 다시 보기' 버튼 #replay). 전시 연출은 그 자리에서 다 멈추고 평소 지도로 되돌린다(인트로 뒤에서 아무것도 돌지 않게, 10-23).
     전시 모드 ON/OFF 상태는 그대로 — 인트로가 끝나면 다시 시작.
     부드럽게(10-28): 인트로를 먼저 덮고(.back — 0.4s 페이드, visibility 지연 없음) 다 덮인 뒤에 그 아래서 보드 끄기·카드 닫기·사이드바·카메라를 한꺼번에 정리한다.
     전엔 인트로가 나타나는 같은 프레임에 이것들이 몰려 SVG 전체를 다시 그리는 게 보였고(지지직), visibility 가 .18s 늦게 켜져 툭 튀어나왔다 */
  function playIntro(){ if(introOpen) return; story?.close(true); introOpen=true; clearTimeout(introT); stopCycle(); stopHomeCycle(); villagerDone(); speech.hide(); talk.hide(); closeCluster(); viewer.close();
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    intro.classList.remove('open'); intro.classList.add('back'); void intro.offsetWidth;   /* 숨은 채로 표지 애니메이션을 처음으로 되돌린 뒤 */
    requestAnimationFrame(() => intro.classList.remove('done'));
    let settled = false;
    const settle = async () => { if(settled) return; settled = true; if(!introOpen) return;
      closeCard(); stopKiosk();
      side.classList.remove('closed'); side.classList.add('welcome'); V.fit(); apply();   /* 인트로 아래서 사이드바(소개)를 미리 편다 */
      document.getElementById('empty').classList.remove('show');
      resetHome(); await afterRepaint(quick); };
    if(quick) settle();
    else { intro.addEventListener('transitionend', function te(e){ if(e.target !== intro || e.propertyName !== 'opacity') return; intro.removeEventListener('transitionend', te); settle(); }); setTimeout(settle, 520); } }
  const brandBtn = document.querySelector('.brand b');
  brandBtn.setAttribute('role', 'button'); brandBtn.tabIndex = 0; brandBtn.setAttribute('aria-label', '처음 화면(인트로)으로');
  brandBtn.addEventListener('click', playIntro);
  brandBtn.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); playIntro(); } });
  document.getElementById('openMap').onclick = openMap;
  intro.addEventListener('click', e => { if(intro.classList.contains('open') && !e.target.closest('.folded')) endIntro(); });

  /* ── 데이터 (db) · 관리자 ──────────────────────────────── */
  let gate = null, canWrite = false, authEmail = null, adminOpen = false, picking = false, editing = null, photoItems = [];   /* photoItems: 폼에서 고친 사진 차례({ path, url } 기존 · { file, url } 새 파일). 첫 장이 표지 */
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
    renderShrinkBtn();
    if(!STORES.length) l.innerHTML='<div class="row" style="opacity:.6">아직 가게가 없습니다. 위 버튼으로 추가하세요.</div>';
    else if(!rows.length) l.innerHTML=`<div class="row" style="opacity:.6">'${esc(search.value.trim())}'에 맞는 가게가 없어요.</div>`;
  }
  /* 사진 용량 줄이기(10-26): 예전에 원본 그대로 올라간 사진이 있을 때만 목록 아래에 단추. 한 번 누르면 전부 줄이고 사라진다(새로 올리는 사진은 저장 때 자동으로 줄어든다) */
  const shrinkBox = document.createElement('div'); shrinkBox.style.cssText = 'display:none;margin:4px 0 10px;padding:10px;border:1px dashed var(--line);font-size:12px;line-height:1.5';
  listWrap.insertBefore(shrinkBox, document.getElementById('alist').nextSibling);
  let shrinking = false;
  function renderShrinkBtn(){ if(shrinking) return; const n = storeApi.originalPhotoCount(STORES);
    shrinkBox.style.display = n && canWrite && storeApi.canUpload() ? '' : 'none'; if(!n) return;
    shrinkBox.innerHTML = `예전에 올린 사진 <b>${n}장</b>이 원본 크기 그대로예요(카드가 늦게 뜨는 원인).<br><button type="button" class="btn pri" style="margin-top:6px">사진 용량 줄이기</button> <span style="color:#9a9188">한 번만 누르면 돼요</span>`;
    shrinkBox.querySelector('button').onclick = runShrink; }
  async function runShrink(){ if(shrinking) return; shrinking = true; const mb = b => (b / 1048576).toFixed(1) + 'MB';
    shrinkBox.innerHTML = '사진 줄이는 중… 창을 닫지 마세요';
    try{ const r = await storeApi.shrinkStoredPhotos((d, t) => { shrinkBox.textContent = `사진 줄이는 중… ${d} / ${t}  (창을 닫지 마세요)`; });
      shrinking = false; await reload(); renderAdminList();
      toast(r.count ? `사진 ${r.count}장: ${mb(r.before)} → ${mb(r.after)}${r.failed ? ` · 가게 ${r.failed}곳은 실패(다시 누르면 그것만)` : ''}` : '줄일 사진이 없어요'); }
    catch(e){ shrinking = false; renderShrinkBtn(); toast('실패: ' + (e.message || e)); } }
  function editStore(s){
    editing = s; form.reset();
    if(s){ form.name.value=s.name; form.issue.value=s.issue||''; form.status.value=s.status; form.ig.value=s.ig||''; form.video.value=s.video||''; form.category.value=s.category||'etc'; form.interview.value=s.interview||''; form.addr.value=s.addr||''; form.latlng.value=`${s.lat}, ${s.lng}`; select(s,true); }
    const urls = s?.photos || (s?.photoUrl ? [s.photoUrl] : []), paths = s?.photoPaths || urls;
    photoItems = urls.map((url, i) => ({ path: paths[i], url })); form.photo.value=''; renderPhotos();
    form.photo.disabled = !storeApi.canUpload(); document.getElementById('photo-note').textContent = storeApi.canUpload() ? '폰·PC 원본 그대로 올리면 저장할 때 자동으로 줄여요. 없으면 기본 이미지로 표시됩니다.' : '이 화면에서는 사진 업로드가 지원되지 않아요.';
    document.getElementById('delbtn').style.display = s?'':'none';
    cancelDelete();
    form.classList.add('open'); renderLogin(); admin.scrollTop = 0;
  }
  /* 사진 여러 장(10-26): 썸네일마다 ✕(빼기)·‹(앞으로). 맨 앞이 표지. 저장할 때 새 파일을 올리고 빠진 사진은 보관함에서 지운다(store/api) */
  const PHOTO_MAX = 10;
  function renderPhotos(){ const box = document.getElementById('photo-prev'), up = storeApi.canUpload();
    box.innerHTML = photoItems.map((p, i) => `<div class="photo-prev pl-item" style="background-image:url('${esc(p.url)}')">${i === 0 ? '<span class="pl-cover">표지</span>' : `<button type="button" class="pl-btn pl-left" data-i="${i}" aria-label="앞으로">‹</button>`}${up ? `<button type="button" class="pl-btn pl-rm" data-i="${i}" aria-label="사진 빼기">✕</button>` : ''}</div>`).join('') || '<div class="photo-prev empty"></div>'; }
  document.getElementById('photo-prev').addEventListener('click', e => { const b = e.target.closest('.pl-btn'); if(!b) return; const i = +b.dataset.i;
    if(b.classList.contains('pl-rm')) photoItems.splice(i, 1); else if(i > 0) [photoItems[i - 1], photoItems[i]] = [photoItems[i], photoItems[i - 1]];
    renderPhotos(); });
  form.photo.addEventListener('change', () => { const files = [...form.photo.files]; form.photo.value='';
    for(const f of files){ if(photoItems.length >= PHOTO_MAX){ toast(`사진은 ${PHOTO_MAX}장까지예요`); break; } if(f.size>20*1024*1024){ toast(`${f.name}: 20MB 이하로 올려주세요`); continue; } photoItems.push({ file: f, url: URL.createObjectURL(f) }); }
    renderPhotos(); });
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
      const nNew = photoItems.filter(p => p.file).length; if(nNew) toast(`사진 ${nNew}장 올리는 중…`);
      const r = await storeApi.saveStore(editing, input, photoItems);
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
    walkerScene = scene;
    walkerGraphs = { home: graph, kiosk: board ? buildRoadGraph(board.roadPath(), board.land, { minLen: 40 }) : graph };   /* 전시 모드: 보드 위의 실제 길(골목까지) */
    const offscreen = (x, y) => { const s = scale(), px = (x - V.x) * s, py = (y - V.y) * s; return px < -40 || py < -40 || px > V.pw + 40 || py > V.ph + 40; };
    /* 걷는 주민은 모두 WALK_MAX 명까지(10-28): 시민 인터뷰 주민(아래 구글폼)이 먼저 FORM_SLOTS 명까지, 남은 자리를 가게 인터뷰 주민으로 채운다
       (구글폼 0명 → 가게 대본 전부(7명 넘으면 무작위 7명), 4명 → 가게 3명, 10명 → 구글폼 5 + 가게 2). 구글폼 인원이 바뀔 때마다 shopFit 이 맞춘다.
       가게 인터뷰 주민: 대본(content/characters/villagers/*.json) 중 무작위로 남은 자리만큼 나와 있고, SHOP_SWAP_MS 마다 가장 먼저 나온 사람이
       퇴장하고 아직 안 나온 사람이 화면 밖 길에서 걸어 들어온다. 퇴장은 화면 밖이면 바로, 보이는 곳이면 살짝 사라지며. 말을 거는 중인 사람은 내보내지 않는다.
       모습은 대본 id 로 정해져(다시 나와도 같은 사람) look 이 있으면 그 모습. 대본 없는 지나가는 사람은 없다 */
    const WALK_MAX = 7, FORM_SLOTS = 5, SHOP_SWAP_MS = 40000, shopScripts = (DATA.villagers || []).slice(), shopOn = [];   /* shopOn: 나온 순서대로 { script, w } */
    function shopEnter(script, walkIn){
      const w = spawnWalker(scene, { graph: walkerGraphs[board?.on ? 'kiosk' : 'home'], parts: DATA.characters, palette: DATA.characters.palette, looks: DATA.characters.looks, speed: 6.5, seed: seedOf(script.id), offscreen: walkIn ? offscreen : undefined, fixed: script.look });
      w.g.dataset.script = script.id; walkers.push(w); shopOn.push({ script, w }); bindVillager(w, script); }   /* data-script: 지금 누가 나와 있는지 개발자 도구에서 보이게 */
    function shopLeave(o){
      shopOn.splice(shopOn.indexOf(o), 1); const w = o.w, i = walkers.indexOf(w); if(i >= 0) walkers.splice(i, 1); dropVillager(w);
      if(w.lastT === 'off' || offscreen(w.x, w.y)){ scene.remove(w); return; }
      w.g.style.pointerEvents = 'none'; w.g.style.transition = 'opacity .8s'; w.g.style.opacity = '0'; setTimeout(() => scene.remove(w), 800); }
    function shopSwap(){
      const out = shopOn.find(o => villager?.w !== o.w && vPeek?.w !== o.w), rest = shopScripts.filter(v => !shopOn.some(o => o.script === v) && v !== out?.script);
      if(!out || !rest.length) return;
      shopLeave(out); shopEnter(rest[Math.floor(Math.random() * rest.length)], true); }
    let shopReady = false;
    function shopFit(){   /* 구글폼 주민 수에 맞춰 가게 주민 수를 맞춘다. 첫 맞춤(구글폼을 처음 읽은 뒤)은 길 위 아무 데서나, 그 뒤로는 화면 밖에서 걸어 들어온다 */
      const want = Math.min(shopScripts.length, Math.max(0, WALK_MAX - formOn.size)), walkIn = shopReady; shopReady = true;
      while(shopOn.length > want){ const out = shopOn.find(o => villager?.w !== o.w && vPeek?.w !== o.w); if(!out) break; shopLeave(out); }   /* 말 거는 중이면 다음 맞춤 때 */
      const rest = shopScripts.filter(v => !shopOn.some(o => o.script === v)).sort(() => Math.random() - 0.5);
      while(shopOn.length < want && rest.length) shopEnter(rest.pop(), walkIn); }
    setInterval(shopSwap, SHOP_SWAP_MS);   /* 안 나온 대본이 없으면 shopSwap 이 그냥 돌아간다 */
    /* 시민 인터뷰 주민(10-23): 구글폼 응답 → Apps Script(tools/apps-script/form_to_supabase.gs) → Supabase characters(approved) + interviews(answers).
       앱이 답으로 대본을 만들고(features/villagers/formScript — 폼을 낸 사람은 모두, 답이 적으면 맺음말로 채움) 초록 세모 주민으로 띄운다. 동시에 FORM_SLOTS 명까지,
       새 사람이 오면 가장 먼저 온 사람부터 퇴장(FIFO, 인터뷰는 DB 에 남는다). 표가 바뀌면 실시간으로, 아니어도 20초마다 맞춘다.
       새 주민은 화면 밖 길에서 걸어 들어온다. status 를 hidden 으로 바꾸면 다음 맞춤 때 사라진다. ?formdemo=N 은 DB 대신 견본 응답 N건(content/characters/form-samples.json) */
    const formOn = new Map();   /* 캐릭터 id → 주민 */
    function syncForm(rows){
      const want = rows.map(r => ({ id: r.id, script: scriptFromRow(r.id, r.answers, r.summary) })).filter(r => r.script).slice(-FORM_SLOTS), ids = new Set(want.map(r => r.id));
      for(const [id, w] of [...formOn]) if(!ids.has(id)){ dropVillager(w); scene.remove(w); formOn.delete(id); const i = walkers.indexOf(w); if(i >= 0) walkers.splice(i, 1); }
      for(const r of want){ if(formOn.has(r.id)) continue;
        const w = spawnWalker(scene, { graph: walkerGraphs[board?.on ? 'kiosk' : 'home'], parts: DATA.characters, palette: DATA.characters.palette, looks: DATA.characters.looks, speed: 6.5, seed: seedOf(r.id), offscreen });
        walkers.push(w); formOn.set(r.id, w); bindVillager(w, r.script); }
      shopFit();
    }
    const formDemo = Math.min(formSamples.length, Number(new URLSearchParams(location.search).get('formdemo')) || 0);
    if(formDemo) syncForm(formSamples.slice(0, formDemo).map(s => ({ id: s.id, answers: s.answers, summary: null })));
    else { let busy = false, again = false;
      const refresh = async () => { if(busy){ again = true; return; } busy = true; try { syncForm(await listFormVillagers(FORM_SLOTS * 2)); } finally { busy = false; if(!shopReady) shopFit();   /* 구글폼을 못 읽어도 가게 주민은 나온다 */ if(again){ again = false; refresh(); } } };
      refresh(); watchFormVillagers(refresh); }
    const chief = new Chief(scene.layer, DATA.characters.body, DATA.characters.chief); scene.add(chief); chiefActor = chief;
    chief.makeHoverable();
    chief.hover.onHover = P => hoverNear() && topAt(chief.g, P) && chiefHook();   /* 주민과 같은 몸 판정 칸·다시 판정하기(10-26) */
    chief.g.addEventListener('click', e => { e.stopPropagation(); if(V.moved) return; chiefHook(); });
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
  Object.assign(window, {cancelDelete, cancelEdit, closeAdmin, closeCard, confirmDelete, deleteStore, editStore, geocode, saveStore, startPick, step, toggleAccount});
  return { centerOn, select, setTheme, getStores: () => STORES, proj, unproj };
}
