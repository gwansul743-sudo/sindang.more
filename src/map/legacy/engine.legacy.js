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
import { majorRoadPath } from '../layers/roads';
import { buildRoadGraph } from '../actors/roadGraph';
import { createScene } from '../actors/scene';
import { spawnWalkers } from '../actors/walker';
import { Chief } from '../actors/chief';
import { Dog } from '../actors/dog';
import { mountNight } from '../night';
import { setTheme, bindThemeButton, currentTheme } from '../../features/theme-toggle/mountThemes';
import * as storeApi from '../../entities/store/api';
import { watchAuth, signInWithPassword, setPassword, sendLoginLink, signOut } from '../../shared/lib/auth';
import { geocode as kakaoGeocode } from '../../shared/lib/geocode';
import { mountHoldGate } from '../../features/admin-gate/holdGate';

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

  /* 가게 · 컬렉션 (데이터는 db에서 옴) */
  let STORES = [];
  const dots = mountDots(svg, P, it => { if(picking) return; select(STORES.find(s => s._dot===it), true); }), gDots = dots.g;
  function setStores(list){
    STORES = dots.set(list).map(it => ({...it.store, x:it.x, y:it.y, g:it.g, t:it.t, _dot:it}));   /* 옛 모양 유지 (카드·관리 코드가 쓴다). 4-2에서 정리 */
    if(current){ const again = STORES.find(s=>s.id===current.id); current=null; if(again) select(again,false); else closeCard(); }
    document.getElementById('empty').classList.toggle('show', STORES.length===0 && !introOpen);
    renderAdminList(); apply();
  }

  /* 뷰포트 — map/viewport.ts (4-1 ②). 그림 갱신은 render(scale)가 맡는다 */
  const map = document.getElementById('map');
  const LAND = createLand(DATA.land.landPath, W, H);
  const V = createViewport({ map, svg, W, H, landBounds: LAND.bounds, focus: DATA.land.focus, onApply: render, onActivity: () => wake(), keepViewOnResize: () => !introOpen });
  const scale = () => V.scale(), apply = () => V.apply(), homeView = () => V.homeView(), resetHome = () => V.resetHome();
  const centerOn = (x,y,s,oy) => V.centerOn(x,y,s,oy);
  function render(s){
    document.body.classList.toggle('far', s < 3.5);
    lmLayer.update(s); districts.update(s); dots.update(s);
    document.getElementById('hint').classList.toggle('hide', s >= 2.2 || introOpen || STORES.length===0);
  }
  svg.addEventListener('click', e => {
    if(V.moved) return;
    if(picking){ const [lat,lng] = unproj(...V.toMap(e.clientX, e.clientY));
      form.latlng.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; endPick(); return; }
    if(!e.target.closest('.dot,.col-pill')) closeCard();
  });

  /* 카드 */
  const sheet = document.getElementById('sheet'), card = document.getElementById('card');
  const side = document.getElementById('side');   /* 데스크톱 사이드바 X 하나로: 카드가 열려 있으면 카드만 닫고, 아니면 사이드바를 접는다. 가게를 고르면 다시 열린다 */
  document.getElementById('side-close').onclick = () => { if(current) closeCard(); else side.classList.add('closed'); };
  document.getElementById('side-open').onclick = () => side.classList.remove('closed');
  let current = null;
  function select(s, focus){
    current = s; dots.select(s._dot);
    const up = s.status==='up', href = s.ig || IG;
    const list = STORES, idx = list.indexOf(s)+1;
    card.innerHTML = `
      <button class="x" aria-label="닫기" onclick="closeCard()">✕</button>
      <div class="ig-meta"><span class="account">@sindang.more</span><span class="num">${idx} / ${list.length}</span></div>
      <div class="poster ${up?'up':''} ${s.photoUrl?'photo':''}" ${s.photoUrl?`style="background-image:url('${s.photoUrl}')"`:''}><div class="grid"></div><div class="poster-brand">MORE · SINDANG</div><div class="poster-tag">${esc(s.issue||'')}</div><div class="poster-title">${up?'Coming<br>soon':esc(s.name)}</div></div>
      <div class="detail">
        <h3>${esc(s.name)}</h3>
        ${up?'<p class="copy">인터뷰가 끝나면 이 자리에 카드뉴스가 올라옵니다.</p>':''}
        ${up?'<div class="tags"><span class="tag">다음 호</span></div>':''}
        <a class="ig-link ${up?'up':''}" href="${esc(href)}" target="_blank" rel="noopener"><span>${up?'매거진 팔로우하기':'Instagram에서 보기'}</span><span>↗</span></a>
        <div class="navs"><button class="nav" aria-label="이전" onclick="step(-1)">‹</button><button class="nav" aria-label="다음" onclick="step(1)">›</button></div>
        <div class="small-note">카드뉴스 전체는 인스타그램 게시물에서 볼 수 있습니다.</div>
      </div>
      ${renderInterview(s.interview)}`;
    sheet.classList.add('open'); side.classList.add('has'); side.classList.remove('closed');
    if(focus){ const s0 = Math.max(scale(), 4.6); centerOn(s.x, s.y, s0, V.pw>=900?0:V.ph*0.24); } else apply();
  }
  function step(d){ const i=(STORES.indexOf(current)+d+STORES.length)%STORES.length; select(STORES[i], true); }
  function closeCard(){ if(current){ dots.select(null); current=null; } sheet.classList.remove('open'); document.getElementById('side').classList.remove('has'); apply(); }
  function renderInterview(text){
    if(!text || !text.trim()) return '';
    const blocks=[]; let cur=null, sec='';
    text.split(/\r?\n/).map(l=>l.trim()).forEach(l => {
      if(!l) return;
      let m;
      if((m=l.match(/^슬라이드\s*\d+\s*[—–-]\s*(.+)$/))){ sec=m[1].trim(); return; }
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

  /* 전시 모드: 30초 무입력 시 자동 순환 */
  /* 전시 모드: 켜면 카메라가 전시용 구역(KIOSK_VIEW)으로 이동하고 거기 머문다. 가게를 자동으로 넘기던 기능은 10-14에 뺐다.
     KIOSK_VIEW 는 지도 좌표(x,y)와 배율(s). 지도 좌표는 콘솔에서 document.getElementById('svg').getAttribute('viewBox') 로 읽을 수 있다. */
  const KIOSK_VIEW = { x: DATA.land.focus.x, y: DATA.land.focus.y, s: 2.2 };   // TODO 전시 사진의 블러 없는 구역으로 맞출 것
  let KIOSK = new URLSearchParams(location.search).has('kiosk');
  const kioskBtn = document.getElementById('kiosk');
  function renderKiosk(){ kioskBtn.textContent = '전시 모드 ' + (KIOSK?'ON':'OFF'); kioskBtn.setAttribute('aria-pressed', KIOSK); }
  function kioskView(){ centerOn(KIOSK_VIEW.x, KIOSK_VIEW.y, KIOSK_VIEW.s, 0); }
  kioskBtn.onclick = () => { KIOSK=!KIOSK; renderKiosk(); if(KIOSK){ closeCard(); kioskView(); } };
  renderKiosk();
  function wake(){}   /* 예전엔 30초 뒤 자동 전환을 다시 걸었다. 호출 자리는 남겨 둔다 */

  /* 인트로 (펼침) */
  let introOpen = true, introT=null;
  const intro = document.getElementById('intro');
  function endIntro(){ if(!introOpen) return; introOpen=false; intro.classList.add('done'); apply();
    document.getElementById('empty').classList.toggle('show', STORES.length===0); wake();
    setTimeout(()=>{ if(KIOSK){ kioskView(); return; } const hv=homeView(); centerOn(hv.x, hv.y, hv.s, 0); }, 100); }
  function openMap(){ if(intro.classList.contains('open')) return; intro.classList.add('open'); clearTimeout(introT); introT=setTimeout(endIntro, +intro.dataset.ms || 1900); }
  function playIntro(){ introOpen=true; closeCard(); clearTimeout(introT); intro.classList.remove('open'); intro.classList.remove('done'); apply();
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
  let loginKey = null;   /* 같은 상태면 다시 그리지 않는다 — 탭을 떠났다 돌아오면 Supabase가 SIGNED_IN 을 또 쏘는데, 그때마다 입력 중인 칸이 지워지면 안 된다 */
  function renderLogin(){
    const editingNow = form.classList.contains('open');   /* 가게 하나를 열면 그 수정 폼만 보인다 — 목록·로그인 상자는 숨기고 제목 왼쪽에 ‹ 뒤로 */
    listWrap.style.display = canWrite && !editingNow ? '' : 'none';
    loginBox.style.display = storeApi.hasDb() && !editingNow ? 'flex' : 'none';
    document.getElementById('aback').style.display = editingNow ? '' : 'none';
    if(!storeApi.hasDb()) return;
    const key = `${authEmail}|${canWrite}`; if(key===loginKey) return; loginKey = key;
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
  const openAdmin = () => { adminOpen=true; admin.classList.add('open'); renderLogin(); };
  gate = mountHoldGate(document.getElementById('admin-top'), { holdMs: 2000, canOpen: () => canWrite, onOpen: openAdmin });
  function closeAdmin(){ adminOpen=false; admin.classList.remove('open'); cancelEdit(); wake(); }
  function renderAdminList(){
    const l = document.getElementById('alist'); l.innerHTML='';
    STORES.forEach(s => { const r=document.createElement('button'); r.type='button'; r.className='row'+(s.status==='up'?' up':''); r.innerHTML=`<b>${esc(s.name)}</b><small>${esc(s.issue||'')}</small>`; r.onclick=()=>editStore(s); l.appendChild(r); });
    if(!STORES.length) l.innerHTML='<div class="row" style="opacity:.6">아직 가게가 없습니다. 위 버튼으로 추가하세요.</div>';
  }
  function editStore(s){
    editing = s; form.reset();
    if(s){ form.name.value=s.name; form.issue.value=s.issue||''; form.status.value=s.status; form.ig.value=s.ig||''; form.interview.value=s.interview||''; form.addr.value=s.addr||''; form.latlng.value=`${s.lat}, ${s.lng}`; select(s,true); }
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
    const [x,y] = proj(hit.lat,hit.lng); centerOn(x,y,Math.max(scale(),5), V.pw<900?V.ph*0.24:0);
    if(editing){ dots.move(editing._dot, x, y); editing.x=x; editing.y=y; }
    toast('좌표를 채웠어요: '+hit.address+note+'. 지도에서 자리를 확인하세요');
  }
  form.addr.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); geocode(); } });
  form.addr.addEventListener('change', () => { if(form.addr.value.trim()) geocode(); });
  function startPick(){ picking=true; document.body.classList.add('picking'); document.getElementById('pickhint').classList.add('show'); if(V.pw<900) admin.classList.remove('open'); }
  function endPick(){ picking=false; document.body.classList.remove('picking'); document.getElementById('pickhint').classList.remove('show'); if(adminOpen) admin.classList.add('open'); }
  async function saveStore(e){
    e.preventDefault();
    const m = form.latlng.value.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if(!m){ toast('위치는 "위도, 경도" 형식으로'); return; }
    const lat=+m[1], lng=+m[2];
    if(lat<BBOX.lat0||lat>BBOX.lat1||lng<BBOX.lon0||lng>BBOX.lon1){ toast('지도 범위 밖 좌표예요'); return; }
    const input = {name:form.name.value.trim(), issue:form.issue.value.trim(), status:form.status.value, ig:form.ig.value.trim(), interview:form.interview.value.trim(), addr:form.addr.value.trim(), lat, lng};
    try{
      if(photoPending) toast('사진 올리는 중…');
      await storeApi.saveStore(editing, input, photoPending, photoRemove);
      await reload(); toast('저장했어요'); cancelEdit(); }
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
  }
  document.fonts ? document.fonts.ready.then(init) : init();

/* ═══════════════ WALKERS — map/actors/* (4-1 ⑤) ═══════════════ */
  const graph = buildRoadGraph(majorRoadPath(ROADS), LAND);
  if(graph.edges.length){
    const scene = createScene({ svg, map, V, landmarks: lmLayer, before: gDist, frontBefore: gDots, isKiosk: () => KIOSK });
    spawnWalkers(scene, { graph, parts: DATA.characters, palette: DATA.characters.palette, looks: DATA.characters.looks, count: 5, speed: 6.5, home: LANDMARKS[0] || {x:W/2, y:H/2} });
    const chief = new Chief(scene.layer, DATA.characters.body, DATA.characters.chief); scene.add(chief);
    scene.add(new Dog(scene.layer, DATA.characters.dog, chief));
    scene.start();
  }

/* ═══════════════ NIGHT — map/night.ts · 낮/밤 전환은 features/theme-toggle (4-1 ⑥) ═══════════════ */
  mountNight({ svg, map, W, H, land: LAND, landPath: DATA.land.landPath, majorRoads: majorRoadPath(ROADS), lamps: DATA.props.lamps, roads: gRoads, props: pixelProps, landmarks: LANDMARKS });
  bindThemeButton(document.getElementById('theme'));
  setTheme(currentTheme(), false);

  /* 마크업·카드 템플릿의 on* 속성이 부르는 함수들 (컴포넌트로 옮기면 필요 없어짐) */
  Object.assign(window, {cancelDelete, cancelEdit, closeAdmin, closeCard, confirmDelete, deleteStore, editStore, geocode, removePhoto, saveStore, startPick, step});
  return { centerOn, select, setTheme, getStores: () => STORES, proj, unproj };
}
