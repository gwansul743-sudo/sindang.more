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
import { SW, FEET, SHADOW, mountFrames } from '../sprites/compose';
import { walkerFrames, chiefFrames, dogFrames } from '../sprites/frames';

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
  const zoomAt = (f,cx,cy) => V.zoomAt(f,cx,cy), centerOn = (x,y,s,oy) => V.centerOn(x,y,s,oy);
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
  let current = null;
  function select(s, focus){
    current = s; dots.select(s._dot);
    const up = s.status==='up', href = s.ig || IG;
    const list = STORES, idx = list.indexOf(s)+1;
    card.innerHTML = `
      <button class="x" aria-label="닫기" onclick="closeCard()">✕</button>
      <div class="ig-meta"><span class="account">@sindang.more</span><span class="num">${idx} / ${list.length}</span></div>
      <div class="poster ${up?'up':''} ${(s.photoUrl||s.photo)?'photo':''}" ${(s.photoUrl||s.photo)?`style="background-image:url('${s.photoUrl||('/_blob/'+esc(s.photo))}')"`:''}><div class="grid"></div><div class="poster-brand">MORE · SINDANG</div><div class="poster-tag">${esc(s.issue||'')}</div><div class="poster-title">${up?'Coming<br>soon':esc(s.name)}</div></div>
      <div class="detail">
        <h3>${esc(s.name)}</h3>
        ${up?'<p class="copy">인터뷰가 끝나면 이 자리에 카드뉴스가 올라옵니다.</p>':''}
        ${up?'<div class="tags"><span class="tag">다음 호</span></div>':''}
        <a class="ig-link ${up?'up':''}" href="${esc(href)}" target="_blank" rel="noopener"><span>${up?'매거진 팔로우하기':'Instagram에서 보기'}</span><span>↗</span></a>
        <div class="navs"><button class="nav" aria-label="이전" onclick="step(-1)">‹</button><button class="nav" aria-label="다음" onclick="step(1)">›</button></div>
        <div class="small-note">카드뉴스 전체는 인스타그램 게시물에서 볼 수 있습니다.</div>
      </div>
      ${renderInterview(s.interview)}`;
    sheet.classList.add('open'); document.getElementById('side').classList.add('has');
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
  document.getElementById('zin').onclick = () => { zoomAt(1.6, V.pw/2, V.ph/2); wake(); };
  document.getElementById('zout').onclick = () => { zoomAt(1/1.6, V.pw/2, V.ph/2); wake(); };
  let msgT; function toast(t){ const m=document.getElementById('msg'); m.textContent=t; m.classList.add('show'); clearTimeout(msgT); msgT=setTimeout(()=>m.classList.remove('show'),2200); }

  /* 전시 모드: 30초 무입력 시 자동 순환 */
  let idleT=null, cycleT=null;
  let KIOSK = new URLSearchParams(location.search).has('kiosk');
  const kioskBtn = document.getElementById('kiosk');
  function renderKiosk(){ kioskBtn.textContent = '전시 모드 ' + (KIOSK?'ON':'OFF'); kioskBtn.setAttribute('aria-pressed', KIOSK); }
  kioskBtn.onclick = () => { KIOSK=!KIOSK; renderKiosk(); if(KIOSK){ closeCard(); startCycle(); } else wake(); };
  renderKiosk();
  function wake(){ clearTimeout(idleT); clearInterval(cycleT); cycleT=null; if(KIOSK && !adminOpen) idleT=setTimeout(startCycle, 30000); }
  function startCycle(){ clearInterval(cycleT); const pubs = STORES.filter(s=>s.status==='pub'); if(!pubs.length) return; let i = current? pubs.indexOf(current) : -1;
    const next = () => { i=(i+1)%pubs.length; select(pubs[i], true); }; next(); cycleT = setInterval(next, 6000); }
  document.addEventListener('pointerdown', wake, true); document.addEventListener('keydown', wake, true);

  /* 인트로 (펼침) */
  let introOpen = true, introT=null;
  const intro = document.getElementById('intro');
  function endIntro(){ if(!introOpen) return; introOpen=false; intro.classList.add('done'); apply();
    document.getElementById('empty').classList.toggle('show', STORES.length===0); wake();
    setTimeout(()=>{ const hv=homeView(); centerOn(hv.x, hv.y, hv.s, 0); }, 100); }
  function openMap(){ if(intro.classList.contains('open')) return; intro.classList.add('open'); clearTimeout(introT); introT=setTimeout(endIntro, +intro.dataset.ms || 1900); }
  function playIntro(){ introOpen=true; closeCard(); clearTimeout(introT); intro.classList.remove('open'); intro.classList.remove('done'); apply();
    document.getElementById('empty').classList.remove('show');
    resetHome(); }
  document.getElementById('openMap').onclick = openMap;
  intro.addEventListener('click', e => { if(intro.classList.contains('open') && !e.target.closest('.folded')) endIntro(); });
  document.getElementById('replay').onclick = playIntro;

  /* ── 데이터 (db) · 관리자 ──────────────────────────────── */
  let db = null, assets = null, canWrite = false, adminOpen = false, picking = false, editing = null, photoPending = null, photoRemove = false;
  const admin = document.getElementById('admin'), form = document.getElementById('form'), listWrap = document.getElementById('alist-wrap');
  /* [C-2] EMBEDDED-DATA — 내장 가게 데이터(사진 포함). claude.ai 밖에서 열면 이 데이터로 동작. 수정 금지 */
  const EMBEDDED_STORES = DATA.stores;
  /* 목업 모드: claude.ai 밖(로컬 파일, 다른 호스팅)에서 열면 내장 데이터로 동작.
     REV 2: claude.ai 안이어도 이 페이지에 db가 연결돼 있지 않으면(디자인 시안 미리보기) 내장 데이터로 동작 */
  const MOCK = !window.claude;
  function mockDb(){
    const docs=EMBEDDED_STORES;
    return {collection:()=>({orderBy:()=>({onSnapshot:(f)=>{ setTimeout(()=>f({docs:docs.map(d=>({id:d.id,data:()=>d}))}),200); }}),doc:()=>({set:async()=>{toast('목업 모드: 저장은 흉내만 냅니다');},delete:async()=>{}})})};
  }
  async function connect(){
    const useEmbedded = () => { const m = mockDb(); db = m; m.collection('stores').orderBy('order').onSnapshot(snap => { if(db===m) setStores(snap.docs.map(d => ({id:d.id, ...d.data()}))); });
      assets = {upload:async f=>({id:'mock',url:URL.createObjectURL(f)}), delete:async()=>({deleted:true})};
      canWrite = true; document.getElementById('admin-btn').classList.toggle('show', V.pw<900); document.getElementById('admin-top').style.display = V.pw>=900?'':'none'; };
    if(MOCK || typeof claude.use!=='function'){ useEmbedded(); return; }
    let live = null, settled = false;
    const slow = setTimeout(() => { if(!settled) useEmbedded(); }, 1500);      /* 응답이 늦으면 일단 내장 데이터로 보여주고, 진짜 db가 오면 바꿔 끼움 */
    try{ live = await claude.use('db'); }catch(_){}
    settled = true; clearTimeout(slow);
    if(!live){ if(!db) useEmbedded(); return; }
    db = live;
    db.collection('stores').orderBy('order').onSnapshot(snap => {
      setStores(snap.docs.map(d => ({id:d.id, ...d.data()})));
    }, e => toast('데이터를 불러오지 못했어요: '+e.code));
    assets = await claude.use('assets');
    const user = await claude.use('user');
    canWrite = (await user?.canEdit()) ?? false;
    document.getElementById('admin-btn').classList.toggle('show', canWrite && V.pw<900); document.getElementById('admin-top').style.display = canWrite && V.pw>=900 ? '' : 'none';
  }
  const openAdmin = () => { adminOpen=true; admin.classList.add('open'); clearTimeout(idleT); clearInterval(cycleT); };
  document.getElementById('admin-btn').onclick = openAdmin; document.getElementById('admin-top').onclick = openAdmin;
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
    setPhotoPrev(s?.photoUrl || (s?.photo ? '/_blob/'+s.photo : null));
    form.photo.disabled = !assets; document.getElementById('photo-note').textContent = assets ? '없으면 레드 포스터로 표시됩니다.' : '이 화면에서는 사진 업로드가 지원되지 않아요.';
    document.getElementById('delbtn').style.display = s?'':'none';
    listWrap.style.display='none'; form.classList.add('open');
  }
  function setPhotoPrev(url){ const p=document.getElementById('photo-prev'); p.classList.toggle('empty',!url); p.style.backgroundImage = url?`url('${url}')`:''; document.getElementById('photo-rm').style.display = url?'':'none'; }
  form.photo.addEventListener('change', () => { const f=form.photo.files[0]; if(!f) return; if(f.size>20*1024*1024){ toast('20MB 이하로 올려주세요'); form.photo.value=''; return; } photoPending=f; photoRemove=false; setPhotoPrev(URL.createObjectURL(f)); });
  function removePhoto(){ photoPending=null; photoRemove=true; form.photo.value=''; setPhotoPrev(null); }
  function cancelEdit(){ endPick(); form.classList.remove('open'); listWrap.style.display=''; editing=null; }
  const GEO = DATA.geo;   /* 임시: 카카오 geocoder로 바꾸면 삭제 */
  function geocode(){
    const raw = form.addr.value.trim().replace(/\s+/g,' ');
    const m = raw.match(/([가-힣A-Za-z0-9]+(?:로|길)(?:\s?\d+(?:번)?길)?)\s*(\d+(?:-\d+)?)/);
    if(!m){ toast('도로명 주소 형식으로 적어주세요 (예: 퇴계로87길 15)'); return; }
    const street = m[1].replace(/\s/g,''), num = m[2];
    const table = GEO[street];
    if(!table){ toast(`'${street}'은 이 지도 범위에 없어요. 지도에서 찍어주세요.`); return; }
    let hit = table[num], note='';
    if(!hit){
      const want = parseInt(num,10), odd = want%2;
      const cands = Object.keys(table).map(k=>({k, n:parseInt(k,10)})).filter(c=>!isNaN(c.n));
      cands.sort((x,y)=> (Math.abs(x.n-want)+(x.n%2!==odd?4:0)) - (Math.abs(y.n-want)+(y.n%2!==odd?4:0)));
      if(!cands.length){ toast('번지를 못 찾았어요. 지도에서 찍어주세요.'); return; }
      const best = cands[0]; if(Math.abs(best.n-want) > 40){ toast(`${street} ${num}번 근처 번지가 자료에 없어요. 지도에서 찍어주세요.`); return; }
      hit = table[best.k]; note = ` (${num}번은 없어서 ${best.k}번 자리예요. 지도에서 확인하세요)`;
    }
    form.latlng.value = `${hit[0]}, ${hit[1]}`;
    const [x,y] = proj(hit[0],hit[1]); centerOn(x,y,Math.max(scale(),5), V.pw<900?V.ph*0.24:0);
    if(editing){ dots.move(editing._dot, x, y); editing.x=x; editing.y=y; }
    toast('좌표를 채웠어요' + note);
  }
  function startPick(){ picking=true; document.body.classList.add('picking'); document.getElementById('pickhint').classList.add('show'); if(V.pw<900) admin.classList.remove('open'); }
  function endPick(){ picking=false; document.body.classList.remove('picking'); document.getElementById('pickhint').classList.remove('show'); if(adminOpen) admin.classList.add('open'); }
  async function saveStore(e){
    e.preventDefault();
    const m = form.latlng.value.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if(!m){ toast('위치는 "위도, 경도" 형식으로'); return; }
    const lat=+m[1], lng=+m[2];
    if(lat<BBOX.lat0||lat>BBOX.lat1||lng<BBOX.lon0||lng>BBOX.lon1){ toast('지도 범위 밖 좌표예요'); return; }
    const data = {name:form.name.value.trim(), issue:form.issue.value.trim(), status:form.status.value,
      line:(editing&&editing.line)||'', quote:(editing&&editing.quote)||'', ig:form.ig.value.trim(), interview:form.interview.value.trim(), addr:form.addr.value.trim(), lat, lng, order: editing?.order ?? (Date.now())};
    let photo = editing?.photo || '';
    try{
      if(photoPending){ if(!assets){ toast('사진 업로드가 지원되지 않는 화면이에요'); return; }
        toast('사진 올리는 중…'); const up = await assets.upload(photoPending); if(photo && photo!==up.id){ try{ await assets.delete(photo); }catch(_){} } photo = up.id; }
      else if(photoRemove && photo){ try{ await assets.delete(photo); }catch(_){} photo=''; }
      data.photo = photo;
      await db.collection('stores').doc(editing?.id).set(data); toast('저장했어요'); cancelEdit(); }
    catch(err){ toast('저장 실패: '+err.code); }
  }
  async function deleteStore(){ if(!editing || !confirm(`'${editing.name}'을(를) 지울까요?`)) return;
    try{ await db.collection('stores').doc(editing.id).delete(); toast('지웠어요'); cancelEdit(); } catch(err){ toast('삭제 실패: '+err.code); } }

  /* 시작 */
  function init(){
    V.fit(); V.resetHome();
    connect();
  }
  document.fonts ? document.fonts.ready.then(init) : init();

/* ═══════════════ WALKERS (주민 · 이장님 · 강아지) ═══════════════ */
  /* [C-3] WALKERS:START — 큰 길(ROADS.p.a·b, 지도에서 굵게 보이는 길)을 걸어다니는 주민들. CORE는 읽기만 하고 고치지 않습니다.
     · 사람 수: WALKER_COUNT (지도 전체에 이만큼만 있음)
     · 걷는 속도: WALKER_SPEED (지도 단위/초)
     · 인원이 적어도 화면이 비지 않게, 화면에서 멀리 벗어난 주민은 화면 바로 바깥 길로 옮겨져 다시 걸어 들어옵니다 (relocate)
     · 손 흔드는 거리: waveRadius() (화면 px)
     캐릭터는 이 지도용으로 새로 그린 픽셀 스프라이트입니다. */
  (function(){
    const WALKER_COUNT = 5, WALKER_SPEED = 6.5;
    const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = (a,b) => a + Math.random()*(b-a), pick = a => a[Math.floor(Math.random()*a.length)];

    /* ── 1. 걸을 수 있는 길: 큰 길 중 땅 안쪽 구간만 ───────────────── */
    const landNums = ((document.querySelector('#px-land path')||{getAttribute:()=>''}).getAttribute('d').match(/-?\d+\.?\d*/g)||[]).map(Number);
    const land = []; for(let i=0;i+1<landNums.length;i+=2) land.push([landNums[i],landNums[i+1]]);
    const inLand = (x,y) => {
      if(land.length<3) return x>20 && y>20 && x<W-20 && y<H-20;
      let c=false;
      for(let i=0,j=land.length-1;i<land.length;j=i++){
        const x1=land[i][0],y1=land[i][1],x2=land[j][0],y2=land[j][1];
        if((y1>y)!==(y2>y) && x < (x2-x1)*(y-y1)/(y2-y1)+x1) c=!c;
      }
      return c;
    };
    const EDGE = 14;                                   /* 해안선에서 띄울 여유 */
    const safe = (x,y) => inLand(x,y) && inLand(x-EDGE,y) && inLand(x+EDGE,y) && inLand(x,y-EDGE-8) && inLand(x,y+EDGE);

    const nodes = [], nodeAt = new Map();
    const node = (x,y) => { const k=Math.round(x*2)+','+Math.round(y*2); let i=nodeAt.get(k);
      if(i===undefined){ i=nodes.length; nodes.push({x,y,nb:[],ok:safe(x,y),comp:-1}); nodeAt.set(k,i); } return i; };
    const link = (a,b) => { if(a===b) return; if(!nodes[a].nb.includes(b)) nodes[a].nb.push(b); if(!nodes[b].nb.includes(a)) nodes[b].nb.push(a); };
    (String(ROADS.p.a||'')+String(ROADS.p.b||'')).split('M').forEach(part => {
      const n=(part.match(/-?\d+\.?\d*/g)||[]).map(Number); let prev=-1, px=0, py=0;
      for(let i=0;i+1<n.length;i+=2){
        const x=n[i], y=n[i+1];
        if(prev<0){ prev=node(x,y); px=x; py=y; continue; }
        const steps=Math.max(1,Math.ceil(Math.hypot(x-px,y-py)/12));       /* 긴 선분은 잘게 나눠 해안 판정을 촘촘히 */
        for(let k=1;k<=steps;k++){ const cur=node(px+(x-px)*k/steps, py+(y-py)*k/steps);
          if(nodes[prev].ok && nodes[cur].ok) link(prev,cur); prev=cur; }
        px=x; py=y;
      }
    });
    const dist = (a,b) => Math.hypot(nodes[a].x-nodes[b].x, nodes[a].y-nodes[b].y);
    /* 짧게 끊긴 토막길은 제외 (제자리걸음 방지) */
    const edges = []; let comps = 0; const compLen = [];
    nodes.forEach((n,i) => { if(n.comp>=0 || !n.nb.length) return; const id=comps++; let len=0; const st=[i]; n.comp=id;
      while(st.length){ const a=st.pop(); nodes[a].nb.forEach(b => { len+=dist(a,b)/2; if(nodes[b].comp<0){ nodes[b].comp=id; st.push(b); } }); }
      compLen[id]=len; });
    let total = 0;
    nodes.forEach((n,a) => { if(n.comp<0 || compLen[n.comp]<90) return; n.nb.forEach(b => { if(b>a){ const l=dist(a,b); edges.push({a,b,l}); total+=l; } }); });
    if(!edges.length) return;

    /* ── 2. 스프라이트 — map/sprites/* (4-1 ④) ─────────────────────── */
    const BODY = DATA.characters.body;
    const {skin:SKIN, hair:HAIR, top:TOP, pant:PANT, shoe:SHOE, hat:HATC, bag:BAGC} = DATA.characters.palette, LOOKS = DATA.characters.looks;
    /* ── 3. 주민 만들기 ───────────────────────────────────────────── */
    const layer = el('g',{class:'walkers','aria-hidden':'true','pointer-events':'none'});
    if(typeof gDist!=='undefined' && gDist.parentNode===svg) svg.insertBefore(layer,gDist); else svg.appendChild(layer);
    /* 랜드마크 건물 '앞'을 지날 때 쓰는 층 (랜드마크 아이콘 위, 가게 점 아래). 건물 뒤를 지날 때는 원래 층에 있어 가려짐 */
    const layerFront = el('g',{class:'walkers walkers-front','aria-hidden':'true','pointer-events':'none'});
    if(typeof gDots!=='undefined' && gDots.parentNode===svg) svg.insertBefore(layerFront,gDots); else svg.appendChild(layerFront);
    const LMS = (typeof LANDMARKS!=='undefined') ? LANDMARKS : [];
    /* 랜드마크 이름표는 주민보다 위로: 이름표만 별도 층으로 옮김 (CORE가 쥐고 있는 l.t 요소 그대로라 크기·위치 갱신은 종전처럼 동작) */
    if(LMS.length && typeof gDots!=='undefined' && gDots.parentNode===svg){
      const lmLabels = el('g',{class:'layer lm-labels'}); svg.insertBefore(lmLabels,gDots);
      LMS.forEach(l => { if(l.t && l.g) el('g',{class:'lm',transform:l.g.getAttribute('transform')},lmLabels).appendChild(l.t); });
    }
    const count = WALKER_COUNT;
    const tops = TOP.slice().sort(() => Math.random()-.5);            /* 적은 인원이니 윗옷 색이 겹치지 않게 */
    const home = (typeof LANDMARKS!=='undefined' && LANDMARKS[0]) || {x:W/2,y:H/2};
    const walkers = [];
    function spawnEdge(nearHome){
      for(let tries=0;tries<60;tries++){
        let r=Math.random()*total, e=edges[0]; for(const c of edges){ r-=c.l; if(r<=0){ e=c; break; } }
        const x=(nodes[e.a].x+nodes[e.b].x)/2, y=(nodes[e.a].y+nodes[e.b].y)/2;
        if(nearHome && Math.hypot(x-home.x,y-home.y)>210) continue;
        if(walkers.some(w => Math.hypot(w.x-x,w.y-y) < (tries<40?46:20))) continue;
        return e;
      }
      return pick(edges);
    }
    for(let i=0;i<count;i++){
      const look = LOOKS[i%LOOKS.length], e = spawnEdge(i<5), flip = Math.random()<.5;
      const top = tops[i%tops.length]; let pant = pick(PANT), hat = pick(HATC);
      if(hat===top) hat = '#f4e8b5';
      const col = {o:'#2b3f33', e:'#2b3028', c:'#ef9f8a', m:'#a5402f', s:pick(SKIN), h:pick(i%7===4?HAIR.slice(4):HAIR.slice(0,4)), t:top, p:pant, b:pick(SHOE), a:hat, g:pick(BAGC)};
      const g = el('g',{class:'wk'},layer);
      el('path',{d:SHADOW,fill:'#24382d',opacity:'.22',transform:`translate(${-SW/2},${-FEET})`},g);
      const fs = mountFrames(g, walkerFrames(DATA.characters, look.style, look.bun, look.bag), col);
      const a = flip?e.b:e.a, b = flip?e.a:e.b;
      walkers.push({g, body:fs.body, fs, a, b, d:Math.random()*e.l, len:e.l, x:nodes[a].x, y:nodes[a].y, ox:0, oy:0,
        face:'front', faceWant:'front', faceT:0, dir:1, mode:'walk', until:0, nextPause:rnd(4,16), walkT:Math.random()*4,
        speed:WALKER_SPEED*rnd(.8,1.2), offT:0, offLimit:rnd(1,3.5), armed:true, front:false, waveStart:0, waveMin:0, waveEnd:0, dirWant:1, lastT:'', lastB:''});
    }
    /* ── 3b. 이장님: 정해진 자리에 가만히 서 있다가, 포인터가 다가오면 폴짝 뛰고 손을 흔든 뒤 꾸벅 인사. 머리 위에 빨간 세모(NPC 표시) ──
       · 서 있는 자리: CHIEF.x / CHIEF.y (지도 단위, 발끝 기준)
       · 도안: 사용자가 준 시안(갈색 헌팅캡·회색 곱슬머리·선글라스·빨간 조끼·완장·명찰)을 주민과 같은 17×18칸 규격으로 다시 그린 것.
         CHIEF_ART의 네 장(front0·wave0·wave1·bow)과 CHIEF.col(색)만 바꾸면 교체됩니다 */
    const CHIEF = DATA.characters.chief;
    (function(){
      const g = el('g',{class:'wk wk-chief'},layer);
      el('path',{d:SHADOW,fill:'#24382d',opacity:'.22',transform:`translate(${-SW/2},${-FEET})`},g);
      const fs = mountFrames(g, chiefFrames(BODY, CHIEF.art), CHIEF.col);
      /* 머리 위 NPC 표시 (content/characters/chief.json 의 mark). 몸과 따로 까딱까딱 */
      const mark = el('g',{class:'wk-mark'},g), M = CHIEF.mark;
      el('path',{d:M.outline,fill:M.colors.outline},mark); el('path',{d:M.fill,fill:M.colors.fill},mark); el('path',{d:M.shine,fill:M.colors.shine},mark);
      walkers.push({g, body:fs.body, fs, mark, markB:-1, fixed:true, x:CHIEF.x, y:CHIEF.y, ox:0, oy:0, mode:'stand', until:0, nextPause:rnd(8,16),
        armed:true, front:false, waveStart:0, waveMin:0, waveEnd:0, lastT:'', lastB:''});
    })();

    /* ── 3c. 이장님의 강아지: 이장님 오른쪽에 앉아 꼬리를 흔들다가, 포인터가 다가오면 혀를 내밀고 깡충깡충 ──
       · 자리: 이장님에서 오른쪽으로 DOG.cells칸 (어느 줌에서나 같은 간격) · 그림은 17×18칸 격자의 아래쪽 7줄 */
    const DOG = DATA.characters.dog;
    (function(){
      const g = el('g',{class:'wk wk-dog'},layer);
      el('path',{d:DOG.shadow,fill:'#24382d',opacity:'.22',transform:`translate(${-SW/2},${-FEET})`},g);
      const fs = mountFrames(g, dogFrames(DOG.art), DOG.col);
      walkers.push({g, body:fs.body, fs, fixed:true, pet:true, dxCells:DOG.cells, x:CHIEF.x, y:CHIEF.y, ox:0, oy:0, happyUntil:0, front:false, lastT:'', lastB:''});
    })();

    function nextNode(at, from){
      const nb = nodes[at].nb.filter(n => n!==from && nodes[n].comp===nodes[at].comp);
      if(!nb.length) return from;
      if(nb.length===1) return nb[0];
      const dx=nodes[at].x-nodes[from].x, dy=nodes[at].y-nodes[from].y, dl=Math.hypot(dx,dy)||1;
      const wts = nb.map(n => { const ex=nodes[n].x-nodes[at].x, ey=nodes[n].y-nodes[at].y, c=(dx*ex+dy*ey)/(dl*(Math.hypot(ex,ey)||1)); return .35+Math.max(0,c)*Math.max(0,c)*1.6; });
      let r=Math.random()*wts.reduce((p,c)=>p+c,0); for(let i=0;i<nb.length;i++){ r-=wts[i]; if(r<=0) return nb[i]; } return nb[0];
    }

    /* 화면에서 멀어진 주민을 화면 바로 바깥의 큰 길로 옮김 (보이지 않는 곳에서만 일어남) */
    function relocate(w, s, q, nearPx){
      const x0=V.x, y0=V.y, x1=V.x+V.pw/s, y1=V.y+V.ph/s, m=nearPx/s, padX=(9*q+4)/s, padT=3/s, padB=(17*q+4)/s, cand=[];
      for(const e of edges){
        const x=(nodes[e.a].x+nodes[e.b].x)/2, y=(nodes[e.a].y+nodes[e.b].y)/2;
        if(x<x0-m || x>x1+m || y<y0-m || y>y1+m) continue;                         /* 너무 멂 */
        if(x>x0-padX && x<x1+padX && y>y0-padT && y<y1+padB) continue;             /* 화면 안 — 눈앞에 갑자기 나타나면 안 됨 */
        if(walkers.some(o => o!==w && Math.hypot(o.x-x,o.y-y)<24)) continue;
        cand.push({e, d:Math.max(x0-x, x-x1, y0-y, y-y1, 0)});
      }
      if(!cand.length) return;
      cand.sort((a,b) => a.d-b.d);
      const e = cand[Math.floor(Math.random()*Math.min(8,cand.length))].e, cx=(x0+x1)/2, cy=(y0+y1)/2;
      const da=Math.hypot(nodes[e.a].x-cx,nodes[e.a].y-cy), db=Math.hypot(nodes[e.b].x-cx,nodes[e.b].y-cy);
      w.a = da>db?e.a:e.b; w.b = da>db?e.b:e.a; w.d=0; w.len=e.l||.01; w.ox=0; w.oy=0;      /* 화면 쪽을 향해 출발 */
      w.x=nodes[w.a].x; w.y=nodes[w.a].y; w.mode='walk'; w.nextPause=rnd(6,16);
    }

    /* ── 4. 포인터: 가까이 오면 멈춰서 손 흔들기 ───────────────────── */
    let P = null;
    const track = e => { const r=map.getBoundingClientRect(); P={x:e.clientX-r.left, y:e.clientY-r.top, t:performance.now()}; };
    map.addEventListener('pointermove', track, {passive:true});
    map.addEventListener('pointerdown', track, {passive:true});
    map.addEventListener('pointerleave', e => { if(e.pointerType==='mouse') P=null; });
    const waveRadius = q => 40 + 12*q;
    const pixelSize = s => s<1.15 ? 1 : Math.max(2, Math.min(5, Math.round(s*.8)));   /* 스프라이트 1칸 = 화면 q픽셀 (정수 → 또렷함) */

    const show = (w, name) => w.fs.show(name);

    const CYCLE = [1,2,3,2];                         /* 디딤 → 모음(살짝 올라감) → 반대 디딤 → 모음 */
    let last = performance.now();
    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(.1,(now-last)/1000); last = now;
      const s = scale(); if(!(s>0) || V.pw<10) return;
      const q = pixelSize(s), k = q/s, R = waveRadius(q), live = P && !STILL;
      const kiosk = (typeof KIOSK!=='undefined') && KIOSK;
      const LK = (typeof lmK==='function') ? lmK(s) : 1.35/s;      /* 랜드마크 아이콘 배율 (지도 단위) */
      const nearPx = 15*q + 50;                         /* 화면 가장자리에서 이만큼(px) 넘게 벗어나면 '멀어진' 것으로 봄 */
      for(const w of walkers){
        if(w.fixed){                                  /* 이장님: 걷지 않음. 인사 규칙은 주민과 같음 */
          const sx=(w.x-V.x)*s + (w.dxCells||0)*q, sy=(w.y-V.y)*s;
          const pd = live ? Math.hypot(P.x-sx, P.y-(sy-(w.pet?4:8)*q)) : Infinity, near = pd<R;
          if(w.pet){                                    /* 강아지: 평소엔 0.45초마다 꼬리, 포인터가 가까우면 혀 내밀고 깡충 */
            if(near && now-P.t<2400) w.happyUntil = now+900;
            const happy = now<w.happyUntil && !STILL, f = Math.floor(now/(happy?140:450))%2;
            show(w, (happy?'happy':'sit') + (STILL?0:f));
            place(w, sx, sy, s, q, k, 1, happy ? f : 0); continue;
          }
          if(pd>R*1.4) w.armed=true;
          if(near && w.mode!=='wave' && (w.armed || (now-P.t<140 && now-w.waveEnd>900))){ w.mode='wave'; w.waveStart=now; w.waveMin=now+1200; w.armed=false; }
          if(w.mode==='wave' && now>w.waveMin && !(near && now-P.t<2400)){ w.mode='bow'; w.until=now+650; w.waveEnd=now; }      /* 손을 내리며 꾸벅 */
          if(w.mode==='bow' && now>w.until){ w.mode='stand'; w.waveEnd=now; }
          if(w.mode==='stand' && kiosk && !STILL){ w.nextPause-=dt; if(w.nextPause<=0){ w.mode='wave'; w.waveStart=now; w.waveMin=now+rnd(1500,2400); w.nextPause=rnd(10,22); } }   /* 전시 모드: 가끔 먼저 인사 */
          let hop=0;
          if(w.mode==='wave'){ const wt=now-w.waveStart, f=Math.floor(wt/170)%2; show(w,'wave'+f); hop = wt<110?1 : wt<230?2 : wt<330?1 : 1-f; }
          else show(w, w.mode==='bow' ? 'bow' : 'front0');
          if(w.mark){ const mb = STILL ? 0 : Math.floor(now/520)%2;                 /* 세모: 0.52초마다 한 칸 오르내림 */
            if(mb!==w.markB){ w.mark.setAttribute('transform',`translate(${-SW/2},${-FEET-mb})`); w.markB=mb; } }
          place(w, sx, sy, s, q, k, 1, hop); continue;
        }
        if(!STILL){
          const fx=(w.x-V.x)*s, fy=(w.y-V.y)*s;
          w.offT = (fx<-nearPx || fx>V.pw+nearPx || fy<-nearPx || fy>V.ph+nearPx) ? w.offT+dt : 0;
          if(w.offT>w.offLimit){ relocate(w,s,q,nearPx); w.offT=0; w.offLimit=rnd(1,3.5); }
        }
        /* 포인터와의 거리(화면 px, 몸통 중심 기준) */
        const sx=(w.x+w.ox-V.x)*s, sy=(w.y+w.oy-V.y)*s;
        const pd = live ? Math.hypot(P.x-sx, P.y-(sy-8*q)) : Infinity, near = pd<R;
        if(pd>R*1.4) w.armed=true;
        if(near && w.mode!=='wave' && (w.armed || (now-P.t<140 && now-w.waveEnd>700))){ w.mode='wave'; w.waveStart=now; w.waveMin=now+1200; w.armed=false; }
        /* 최소 1.2초는 흔들고, 포인터가 곁에서 움직이는 동안은 계속. 포인터가 2.4초 멈춰 있으면 다시 걷기 */
        if(w.mode==='wave' && now>w.waveMin && !(near && now-P.t<2400)){ w.mode='walk'; w.waveEnd=now; }
        if(w.mode==='pause' && now>w.until){ w.mode='walk'; w.nextPause=rnd(9,24); }
        if(w.mode==='walk' && !STILL){
          w.nextPause-=dt;
          if(w.nextPause<=0){
            if(kiosk && Math.random()<.5){ w.mode='wave'; w.waveStart=now; w.waveMin=now+rnd(1500,2400); }   /* 전시 모드: 가끔 먼저 인사 */
            else { w.mode='pause'; w.until=now+rnd(1200,3200); }
            w.nextPause=rnd(9,24);
          } else {
            w.d+=w.speed*dt; w.walkT+=dt;
            let guard=0; while(w.d>=w.len && guard++<8){ w.d-=w.len; const nx=nextNode(w.b,w.a); w.a=w.b; w.b=nx; w.len=dist(w.a,w.b)||.01; }
          }
        }
        const A=nodes[w.a], B=nodes[w.b], t=Math.min(1,w.d/w.len), dx=B.x-A.x, dy=B.y-A.y, dl=Math.hypot(dx,dy)||1;
        w.x=A.x+dx*t; w.y=A.y+dy*t;
        /* 길 가운데가 아니라 진행 방향 오른쪽으로 살짝 — 마주 오는 사람과 비켜 걷기 */
        const tox=-dy/dl*3/s, toy=dx/dl*3/s, ease=Math.min(1,dt*4); w.ox+=(tox-w.ox)*ease; w.oy+=(toy-w.oy)*ease;
        /* 바라보는 방향 (잔떨림 방지로 0.25초 유지돼야 바뀜) */
        const want = Math.abs(dx)>Math.abs(dy)*.9 ? 'side' : dy>0 ? 'front' : 'back', wdir = dx<0?-1:1;
        if(want!==w.faceWant || (want==='side' && wdir!==w.dirWant)){ w.faceWant=want; w.dirWant=wdir; w.faceT=now; }
        if((w.face!==w.faceWant || w.dir!==w.dirWant) && now-w.faceT>250){ w.face=w.faceWant; if(want==='side') w.dir=w.dirWant; }
        /* 프레임 */
        let hop=0;
        if(w.mode==='wave'){ const wt=now-w.waveStart, f=Math.floor(wt/170)%2; show(w,'wave'+f); hop = wt<110?1 : wt<230?2 : wt<330?1 : 1-f; }   /* 폴짝 → 흔들며 까딱까딱 */
        else if(w.mode==='pause' || STILL) show(w,'front0');
        else show(w, w.face+CYCLE[Math.floor(w.walkT/.19)%4]);
        /* 랜드마크 건물 발치(앞)에 있으면 앞 층으로 */
        let front=false; const fx=w.x+w.ox, fy=w.y+w.oy;
        for(const l of LMS){ if(Math.abs(fx-l.x)<18*LK+5*k && fy>l.y-2.5*LK && fy<l.y+2*LK+18*k){ front=true; break; } }
        if(front!==w.front){ (front?layerFront:layer).appendChild(w.g); w.front=front; }
        place(w, sx, sy, s, q, k, (w.mode==='walk' && w.face==='side' && w.dir<0) ? -1 : 1, hop);
      }
    }
    /* 화면에 놓기: 화면 밖이면 생략, 안이면 정수 픽셀에 맞춤 */
    function place(w, sx, sy, s, q, k, flip, hop){
      const vis = sx>-60 && sx<V.pw+60 && sy>-20 && sy<V.ph+90;
      if(!vis){ if(w.lastT!=='off'){ w.g.setAttribute('display','none'); w.lastT='off'; } return; }
      const tx = V.x + (Math.round(sx - SW/2*q) + SW/2*q)/s, ty = V.y + Math.round(sy)/s;
      const T = `translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${k.toFixed(5)})`;
      if(T!==w.lastT){ if(w.lastT==='off') w.g.removeAttribute('display'); w.g.setAttribute('transform',T); w.lastT=T; }
      const Bt = flip+','+hop;
      if(Bt!==w.lastB){ w.body.setAttribute('transform',`translate(${flip<0?SW/2:-SW/2},${-FEET-hop}) scale(${flip},1)`); w.lastB=Bt; }
    }
    requestAnimationFrame(tick);
  })();
  /* [C-3] WALKERS:END */

/* ═══════════════ NIGHT (밤 장식 · 낮/밤 전환) ═══════════════ */
  /* [C-4] NIGHT:START — 밤 장식: 달·구름·물비늘·얕은 물빛(바다), 땅의 픽셀 결, 큰 길 가로등과 불빛 번짐,
     집의 작은 불빛, 나무·집·랜드마크 그림자, 랜드마크 뒤 불빛, 화면 가장자리 어둠. CORE는 읽기만 합니다. */
  (function(){
    const defs = el('defs',{},svg);
    const grad = (id,stops) => `<radialGradient id="${id}">`+stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]}"/>`).join('')+'</radialGradient>';
    defs.innerHTML =
      grad('n-lamp',[[0,'#ffeab4',1],[.12,'#ffd27e',.68],[.26,'#ffc466',.44],[.41,'#ffb955',.27],[.62,'#ffb04a',.15],[.82,'#ffac45',.07],[1,'#ffac45',0]])+
      grad('n-lm',[[0,'#ffd98a',.85],[.4,'#ffb650',.4],[1,'#ff9c35',0]])+
      grad('n-pool',[[0,'#ffcf7a',.36],[.6,'#ffb040',.12],[1,'#ffb040',0]])+
      grad('n-house',[[0,'#fff3b0',.85],[.28,'#ffd568',.52],[.58,'#ffa33c',.2],[1,'#ff9030',0]])+
      grad('n-moon',[[0,'#ffb47a',.55],[.45,'#f09a62',.18],[1,'#f09a62',0]])+
      grad('n-glint',[[0,'#ffb655',.34],[1,'#ffb655',0]])+
      /* 땅의 픽셀 결: 밝고 어두운 낱알 */
      '<pattern id="n-grain" width="53" height="47" patternUnits="userSpaceOnUse">'+
        '<path d="M3 5h2v1h-2zM19 2h1v1h-1zM41 9h2v1h-2zM11 14h1v1h-1zM31 17h1v1h-1zM6 25h1v1h-1zM47 23h1v1h-1zM22 30h2v1h-2zM15 38h1v1h-1zM36 41h2v1h-2zM50 36h1v1h-1zM28 44h1v1h-1z" fill="#6b8250" opacity=".5"/>'+
        '<path d="M9 3h1v1h-1zM34 4h1v1h-1zM2 13h2v1h-2zM24 11h1v1h-1zM45 15h1v1h-1zM17 21h1v1h-1zM38 27h2v1h-2zM12 31h2v1h-2zM4 40h1v1h-1zM27 36h1v1h-1zM44 44h1v1h-1zM20 45h1v1h-1z" fill="#16261a" opacity=".42"/>'+
      '</pattern>';
    /* 땅 모양 */
    const landD = (document.querySelector('#px-land path')||{getAttribute:()=>''}).getAttribute('d')||'';
    const ln = (landD.match(/-?\d+\.?\d*/g)||[]).map(Number);
    const land = []; for(let i=0;i+1<ln.length;i+=2) land.push([ln[i],ln[i+1]]);
    const inLand = (x,y) => { let c=false; for(let i=0,j=land.length-1;i<land.length;j=i++){ const a=land[i],b=land[j]; if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
    let seed = 7; const rnd = () => (seed = (seed*16807)%2147483647)/2147483647;

    /* 1) 바다 — 땅보다 아래 층: 섬 둘레의 얕은 물빛, 달, 구름, 물비늘 */
    const sky = el('g',{class:'night-sky','pointer-events':'none','aria-hidden':'true'}); svg.insertBefore(sky, svg.firstChild);
    [[60,'#0b3d4c3d'],[34,'#0f4c5a33'],[14,'#155f6e29']].forEach(([w,c]) => el('path',{d:landD,fill:'none',stroke:c,'stroke-width':w,'stroke-linejoin':'miter',transform:'translate(0,10)'},sky));
    const MX = Math.max.apply(null, land.map(p => p[0])) - 84, MY = 92;      /* 섬 북동쪽 바다 위 */
    el('circle',{cx:MX,cy:MY,r:66,fill:'url(#n-moon)'},sky);
    el('path',{d:`M${MX-6} ${MY-14}h12v2h4v2h2v2h2v4h2v8h-2v4h-2v2h-2v2h-4v2h-12v-2h-4v-2h-2v-2h-2v-4h-2v-8h2v-4h2v-2h2v-2h4z`,fill:'#e89866'},sky);
    el('path',{d:`M${MX-4} ${MY-12}h8v2h4v2h2v2h-12v-2h-4v-2h2zM${MX+4} ${MY+2}h4v4h-4zM${MX-8} ${MY+4}h3v3h-3z`,fill:'#f7b98a',opacity:'.8'},sky);
    el('path',{d:`M${MX-9} ${MY-3}h4v3h-4zM${MX+2} ${MY-5}h3v2h-3zM${MX-2} ${MY+8}h5v2h-5z`,fill:'#c97a55',opacity:'.7'},sky);
    const cloud = (x,y,k) => { const g = el('g',{transform:`translate(${x},${y}) scale(${k})`},sky);
      el('path',{d:'M10 0h10v2h6v2h4v2h6v2h4v2h4v4h-52v-4h4v-2h4v-2h4v-2h4v-2h2z',fill:'#3d4a58'},g);
      el('path',{d:'M12 2h8v2h-8zM22 6h6v2h-6zM4 8h6v2h-6z',fill:'#55606c'},g);
      el('path',{d:'M-8 10h52v2h-52z',fill:'#6a5a5c'},g);
      el('path',{d:'M-6 12h48v2h-48zM2 14h30v1h-30z',fill:'#d0835a',opacity:'.85'},g); };
    cloud(MX-150, MY-14, 1.5); cloud(MX-84, MY+30, 1.05); cloud(MX+30, MY+34, 1.2); cloud(MX-226, MY+50, .8);
    let d1 = '', d2 = '';
    const dash = (x,y,w,h) => `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h}h-${w.toFixed(1)}z`;
    for(let i=0;i<170;i++){
      const x = -320 + rnd()*(W+640), y = -260 + rnd()*(H+520), w = 5 + rnd()*10;
      if(inLand(x,y) || inLand(x+w,y) || inLand(x,y-22) || inLand(x,y+14)) continue;
      if(rnd()<.45) d1 += dash(x,y,w,1.4); else d2 += dash(x,y,w*.7,1.2);
    }
    for(let i=0;i<14;i++){                                           /* 물비늘이 모여 반짝이는 곳 */
      let cx, cy, t=0; do { cx = -240 + rnd()*(W+480); cy = -160 + rnd()*(H+320); } while((inLand(cx,cy)||inLand(cx-40,cy)||inLand(cx+40,cy)||inLand(cx,cy-30)||inLand(cx,cy+30)) && ++t<30);
      if(t>=30) continue;
      el('ellipse',{cx:cx.toFixed(1),cy:cy.toFixed(1),rx:30,ry:13,fill:'url(#n-glint)'},sky);
      for(let k=0;k<7;k++){ const w = 4+rnd()*11; d1 += dash(cx-w/2+(rnd()-.5)*30, cy+(k-3)*3.4+(rnd()-.5)*1.5, w, 1.6); }
    }
    el('ellipse',{cx:MX,cy:MY+150,rx:34,ry:120,fill:'url(#n-glint)'},sky);
    for(let i=0;i<30;i++){ const y = MY+34+i*8+rnd()*5, w = 6+rnd()*18, x = MX-w/2+(rnd()-.5)*28; if(!inLand(x,y) && !inLand(x+w,y)) d1 += dash(x,y,w,1.6); }   /* 달빛 길 */
    el('path',{d:d1,fill:'#f0a850',opacity:'.8'},sky); el('path',{d:d2,fill:'#f2c070',opacity:'.3'},sky);

    /* 2) 땅 위: 픽셀 결 → 큰 길 불빛 번짐 (모두 길보다 아래 층) */
    const under = el('g',{class:'night-ground','clip-path':'url(#px-land)','pointer-events':'none','aria-hidden':'true'}); svg.insertBefore(under, gRoads);
    el('rect',{x:0,y:0,width:W,height:H,fill:'url(#n-grain)'},under);
    const big = String(ROADS.p.a||'') + String(ROADS.p.b||'');
    [[30,.03],[16,.055]].forEach(([w,o]) => el('path',{d:big,fill:'none',stroke:'#ffb648','stroke-opacity':o,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},under));

    /* 3) 가로등 — 길 위 층. 작은 불빛 점 + 은은한 번짐 (세기는 시안의 밝기 분포에 맞춤) */
    const lamps = el('g',{class:'night-lamps','pointer-events':'none','aria-hidden':'true'}); svg.insertBefore(lamps, gRoads.nextSibling);
    /* 위치와 개수는 시안 이미지에서 읽어 큰 길 위로 옮긴 것 (53개) + 동쪽으로 넓힌 땅에 같은 밀도로 7개 */
    const pts = DATA.props.lamps;
    let core = '';
    pts.forEach(([x,y]) => { el('circle',{cx:x,cy:y,r:18,fill:'url(#n-lamp)'},lamps); core += `M${(x-1).toFixed(1)} ${(y-1).toFixed(1)}h2v2h-2z`; });
    el('path',{d:core,fill:'#fff3cf'},lamps);

    /* 4) 집·나무: 그림자와 집의 작은 불빛 — 장식(집·나무)보다 아래 층 */
    const props = (typeof pixelProps!=='undefined' && pixelProps) || svg.querySelector('.pixel-props');
    if(props && props.parentNode){
      const sh = el('g',{class:'night-shadows','clip-path':'url(#px-land)','pointer-events':'none','aria-hidden':'true'}); props.parentNode.insertBefore(sh, props);
      const halo = el('g',{class:'night-houselight','pointer-events':'none','aria-hidden':'true'}); props.parentNode.insertBefore(halo, props.nextSibling);   /* 집 그림 '위'에 얹어 빛이 벽과 주변으로 자연스럽게 번지게 */
      let shd = '';
      props.querySelectorAll('use').forEach(u => {
        const x=+u.getAttribute('x'), y=+u.getAttribute('y'), w=+u.getAttribute('width'), h=+u.getAttribute('height'), href=u.getAttribute('href')||'';
        const chief=href.includes('chiefhome'), house=href.includes('house')||chief;
        const bx = x+w*(house?.50:.52), by = y+h*(house?.905:.955), rw = w*(house?.46:.34);
        /* 오른쪽 아래로 드리운 픽셀 계단 그림자 */
        for(let k=0;k<4;k++){ const ww = rw*2*(1-k*.2), xx = bx-rw+k*w*.09; shd += `M${xx.toFixed(1)} ${(by+k*w*.045).toFixed(1)}h${ww.toFixed(1)}v${(w*.05).toFixed(2)}h-${ww.toFixed(1)}z`; }
        if(chief){ el('ellipse',{cx:(x+w*.5).toFixed(1),cy:(y+h*.9).toFixed(1),rx:(w*.62).toFixed(1),ry:(w*.2).toFixed(1),fill:'url(#n-pool)'},sh);        /* 이장님 집: 랜드마크처럼 뒤에 불빛 */
                   el('ellipse',{cx:(x+w*.5).toFixed(1),cy:(y+h*.6).toFixed(1),rx:(w*.78).toFixed(1),ry:(w*.62).toFixed(1),fill:'url(#n-lm)'},sh); }
        else if(house) el('circle',{cx:(x+w*.5).toFixed(1),cy:(y+h*.68).toFixed(1),r:(w*.6).toFixed(1),fill:'url(#n-house)'},halo);
      });
      el('path',{d:shd,fill:'#04110d',opacity:'.5'},sh);
    }

    /* 5) 랜드마크: 바닥 그림자 → 바닥에 번진 불빛 → 뒤쪽 불빛 */
    LANDMARKS.forEach(l => { if(!l.g) return; const f = l.g.firstChild;
      l.g.insertBefore(el('path',{class:'night-only',d:'M-17 -1h36v1.6h-36zM-13 .6h34v1.6h-34zM-8 2.2h30v1.4h-30z',fill:'#04110d',opacity:'.45'}), f);
      l.g.insertBefore(el('ellipse',{class:'night-only',cx:0,cy:1,rx:30,ry:8,fill:'url(#n-pool)'}), f);
      l.g.insertBefore(el('ellipse',{class:'night-only',cx:0,cy:-15,rx:42,ry:36,fill:'url(#n-lm)'}), f); });

    /* 6) 화면 가장자리를 어둡게 */
    const vig = document.createElement('div'); vig.className = 'night-vignette'; vig.setAttribute('aria-hidden','true'); map.appendChild(vig);

    /* 7) 낮/밤 전환 — 스타일시트 두 벌(css-day / css-night)을 바꿔 끼우고, 그림의 색은 요소마다 남겨 둔 낮 색(data-df·data-ds)과 맞바꿈.
          밤 장식은 낮 스타일시트에서 숨겨집니다. 선택은 이 브라우저에 기억됩니다. */
    const btn = document.getElementById('theme'), cssDay = document.getElementById('css-day'), cssNight = document.getElementById('css-night');
    function paint(t){
      document.querySelectorAll('[data-df],[data-ds]').forEach(e => {
        if(e.dataset.df){ if(!e.dataset.nf) e.dataset.nf = e.getAttribute('fill'); e.setAttribute('fill', t==='day' ? e.dataset.df : e.dataset.nf); }
        if(e.dataset.ds){ if(!e.dataset.ns) e.dataset.ns = e.getAttribute('stroke'); e.setAttribute('stroke', t==='day' ? e.dataset.ds : e.dataset.ns); }
      });
    }
    function setTheme(t, remember){
      if(cssDay && cssNight){ cssDay.media = t==='day' ? 'all' : 'not all'; cssNight.media = t==='day' ? 'not all' : 'all'; }
      document.documentElement.setAttribute('data-theme', t); paint(t);
      if(btn){ btn.textContent = t==='day' ? '☾ 밤' : '☀ 낮'; btn.setAttribute('aria-label', t==='day' ? '밤 테마로 바꾸기' : '낮 테마로 바꾸기'); }
      if(remember){ try{ localStorage.setItem('more-theme', t); }catch(_){} }
    }
    window.setTheme = setTheme;
    if(btn) btn.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme')==='day' ? 'night' : 'day', true));
    setTheme(document.documentElement.getAttribute('data-theme')==='day' ? 'day' : 'night', false);
  })();
  /* [C-4] NIGHT:END */

  /* 마크업·카드 템플릿의 on* 속성이 부르는 함수들 (컴포넌트로 옮기면 필요 없어짐) */
  Object.assign(window, {cancelEdit, closeAdmin, closeCard, deleteStore, editStore, geocode, removePhoto, saveStore, startPick, step});
  return { centerOn, select, setTheme: window.setTheme, getStores: () => STORES, proj, unproj };
}
