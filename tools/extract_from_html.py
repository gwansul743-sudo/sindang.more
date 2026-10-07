#!/usr/bin/env python3
"""한 장짜리 HTML(게임_낮밤_초안.html, REV 28)을 폴더 구조로 푸는 스크립트.
   사용: python3 tools/extract_from_html.py 게임_낮밤_초안.html
   · 그림·도로·좌표·파츠 → content/   · 스타일 → src/shared/styles/   · 가게 → supabase/ + public/seed-photos/
   · 스크립트(CORE·WALKERS·NIGHT) → src/map/legacy/engine.legacy.js (데이터 상수만 DATA 참조로 바꾼 임시 엔진)
   손으로 옮기지 않기 위한 도구입니다. 이전이 끝나면 지워도 됩니다."""
import sys, re, json, os, base64, subprocess, textwrap
SRC = sys.argv[1]; ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(SRC, encoding='utf-8').read(); L = html.split('\n')
def w(path, text):
    p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(text); print('  wrote', path, len(text.encode()))
def wj(path, obj, **kw): w(path, json.dumps(obj, ensure_ascii=False, **kw) + '\n')
def idx(pred, start=0):
    for i in range(start, len(L)):
        if pred(L[i]): return i
    raise SystemExit('marker not found')

# ── 1. 스타일 ─────────────────────────────────────────────────────────
i_day = idx(lambda l: l.startswith('<style id="css-day"')); e_day = idx(lambda l: l.strip() == '</style>', i_day)
i_ngt = idx(lambda l: l.startswith('<style id="css-night"')); e_ngt = idx(lambda l: l.strip() == '</style>', i_ngt)
w('src/shared/styles/theme.day.css', '\n'.join(L[i_day+1:e_day]) + '\n')
w('src/shared/styles/theme.night.css', '\n'.join(L[i_ngt+1:e_ngt]) + '\n')
boot = L[e_ngt+1]; assert boot.startswith('<script>') and 'more-theme' in boot
boot_js = boot[len('<script>'):-len('</script>')]
head_links = [l for l in L[:i_day] if l.startswith('<link') or l.startswith('<meta') or l.startswith('<title')]

# ── 2. 마크업 ─────────────────────────────────────────────────────────
i_body = idx(lambda l: l.startswith('<body>')); i_mend = idx(lambda l: l.startswith('<!-- [B] MARKUP:END'))
w('src/app/legacy-markup.html', '\n'.join(L[i_body+1:i_mend]).strip() + '\n')

# ── 3. 스크립트 세 덩어리 ─────────────────────────────────────────────
def script_after(marker):
    i = idx(lambda l: l.startswith(marker)); a = idx(lambda l: l.strip() == '<script>', i); b = idx(lambda l: l.strip() == '</script>', a)
    return L[a+1:b]
core = script_after('<!-- [C] SCRIPT: CORE'); walk = '\n'.join(script_after('<!-- [C-3] WALKERS')); night = '\n'.join(script_after('<!-- [C-4] NIGHT'))
def line_i(lines, prefix):
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]; assert len(hits) == 1, (prefix, len(hits)); return hits[0]

# 도로
i = line_i(core, 'const ROADS = '); roads = json.loads(core[i][len('const ROADS = '):].rstrip().rstrip(';')); core[i] = 'const ROADS = DATA.roads;'
wj('content/map/roads.json', roads)
# 범위·랜드마크·권역·초점
i = line_i(core, 'const BBOX = '); m = re.search(r'\{lon0:([\d.]+),lon1:([\d.]+),lat0:([\d.]+),lat1:([\d.]+)\}', core[i]); bbox = dict(zip(('lon0','lon1','lat0','lat1'), map(float, m.groups()))); core[i] = 'const BBOX = DATA.land.bbox;'
a = line_i(core, 'const LANDMARKS = ['); b = next(k for k in range(a, len(core)) if core[k].strip() == '];')
ART = {'train':'station','market':'market','pot':'pot','pan':'pan','blob':'ddp'}; lms = []
for l in core[a+1:b]:
    m = re.search(r"\{name:'([^']+)', lat:([\d.]+), lng:([\d.]+), icon:'(\w+)'\}", l); lms.append(dict(name=m.group(1), lat=float(m.group(2)), lng=float(m.group(3)), art=ART[m.group(4)]))
core[a:b+1] = ["const LANDMARKS = DATA.landmarks.items.map(l => ({name:l.name, lat:l.lat, lng:l.lng, icon:l.art}));   /* icon = 그림 파일 이름 */"]
a = line_i(core, 'const ICONS = {'); b = next(k for k in range(a, len(core)) if core[k].strip() == '};')
core[a:b+1] = ["const ICONS = {}; LANDMARKS.forEach(l => { ICONS[l.icon] = g => pixelLandmark(g, l.icon); });"]
i = line_i(core, 'const DISTRICTS = '); districts = [dict(name=n, lat=float(la), lng=float(lo)) for n, la, lo in re.findall(r"\{name:'(\w+)', lat:([\d.]+), lng:([\d.]+)\}", core[i])]; core[i] = 'const DISTRICTS = DATA.land.districts.map(d => ({...d}));'
i = line_i(core, 'const LM_WORLD = '); m = re.search(r'LM_WORLD = ([\d.]+), LM_MIN_PX = ([\d.]+)', core[i]); lmw, lmp = float(m.group(1)), float(m.group(2)); core[i] = 'const LM_WORLD = DATA.landmarks.worldScale, LM_MIN_PX = DATA.landmarks.minPx;'
i = line_i(core, 'const FOCUS = '); m = re.search(r'\{x:([\d.]+), y:([\d.]+)\}', core[i]); focus = dict(x=float(m.group(1)), y=float(m.group(2))); core[i] = 'const FOCUS = DATA.land.focus;'
# 아이콘 정의(PIXEL_DEFS)와 땅 그림
i = line_i(core, 'const PIXEL_DEFS = `'); defs = core[i][len('const PIXEL_DEFS = `'):-2]; core[i] = 'const PIXEL_DEFS = DATA.pixelDefs;'
land_d = re.search(r'<clipPath id="px-land"><path d="([^"]+)"', defs).group(1)
LM_IDS = ['station','market','pot','pan','ddp']; rest = defs
for m in re.finditer(r'<symbol id="px-([\w-]+)"[^>]*>.*?</symbol>', defs, re.S):
    name = m.group(1); w(('content/landmarks/%s.pixel.txt' if name in LM_IDS else 'content/map/decor/%s.pixel.txt') % name, m.group(0) + '\n'); rest = rest.replace(m.group(0), '')
w('content/map/terrain.defs.svg.txt', rest.replace(land_d, '{{LAND}}') + '\n')
i = line_i(core, 'pixelTerrain.innerHTML = `'); ter = core[i][len('pixelTerrain.innerHTML = `'):-2]; core[i] = 'pixelTerrain.innerHTML = DATA.terrain;'
m = re.search(r'(<g class="pixel-props"[^>]*>)((?:<use [^>]*/>)+)', ter); decor = []
for u in re.findall(r'<use [^>]*/>', m.group(2)):
    g = lambda k: re.search(r' %s="([^"]+)"' % k, u).group(1); decor.append(dict(kind=g('href').replace('#px-', ''), x=float(g('x')), y=float(g('y')), w=float(g('width')), h=float(g('height'))))
ter = ter.replace(m.group(2), '<!--PROPS-->'); n_land = ter.count(land_d); ter = ter.replace(land_d, '{{LAND}}')
w('content/map/terrain.svg.txt', ter + '\n')
# 가로등
m = re.search(r'  const pts = (\[\[.*?\]\]);\n', night); lamps = json.loads(m.group(1)); night = night[:m.start(1)] + 'DATA.props.lamps' + night[m.end(1):]
wj('content/map/props.json', dict(decor=decor, lamps=lamps))
wj('content/map/land.json', dict(bbox=bbox, focus=focus, districts=districts, landPath=land_d), indent=1)
wj('content/landmarks/landmarks.json', dict(worldScale=lmw, minPx=lmp, items=lms), indent=1)
# 가게·주소표
i = line_i(core, 'const EMBEDDED_STORES = '); stores = json.loads(core[i][len('const EMBEDDED_STORES = '):].rstrip().rstrip(';')); core[i] = 'const EMBEDDED_STORES = DATA.stores;'
i = line_i(core, 'const GEO = '); geo = json.loads(core[i][len('const GEO = '):].rstrip().rstrip(';')); core[i] = 'const GEO = DATA.geo;   /* 임시: 카카오 geocoder로 바꾸면 삭제 */'
wj('content/_legacy/geo.json', geo)
photo_key = next((k for k in ('photoUrl','photo','img') if any(str(s.get(k,'')).startswith('data:') for s in stores)), None); print('  store keys:', sorted({k for s in stores for k in s}), '| photo key:', photo_key)
os.makedirs(os.path.join(ROOT, 'public/seed-photos'), exist_ok=True); n_ph = 0
for s in stores:
    v = s.get(photo_key) if photo_key else None
    if v and v.startswith('data:'):
        mime, b64 = re.match(r'data:([^;]+);base64,(.*)', v, re.S).groups(); ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}.get(mime, 'bin')
        fn = '%s.%s' % (s.get('id') or ('store-%02d' % s.get('order', 0)), ext); open(os.path.join(ROOT, 'public/seed-photos', fn), 'wb').write(base64.b64decode(b64)); s[photo_key] = '/seed-photos/' + fn; n_ph += 1
wj('supabase/seed.stores.json', stores, indent=1); print('  photos extracted:', n_ph)
q = lambda v: 'null' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"
rows = ['  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)' % (q(s.get('id')), q(s.get('name')), q(s.get('addr')), s.get('lat'), s.get('lng'), q(s.get('ig')), q(s.get(photo_key) if photo_key else None), q(s.get('interview')), q(s.get('issue')), int(s.get('order') or 0), 'true' if s.get('status') == 'pub' else 'false') for s in stores]
w('supabase/seed.sql', '-- 현재 내장 가게 %d곳 (게임_낮밤_초안.html의 EMBEDDED_STORES). photo_path는 Storage에 올린 뒤 경로를 맞출 것\ninsert into stores (slug, name, addr, lat, lng, ig_url, photo_path, interview_md, issue, "order", published) values\n%s;\n' % (len(stores), ',\n'.join(rows)))

# ── 4. 캐릭터 파츠·팔레트·이장님 (node로 평가해 JSON으로) ─────────────
def cut(text, a, b): i = text.index(a); j = text.index(b, i); return i, j
a1, b1 = cut(walk, '  const HEAD = {', '  const SW = 17'); a2, b2 = cut(walk, '  const SKIN = [', '  /* ── 3. 주민 만들기'); a3, b3 = cut(walk, '  const CHIEF = {', '  (function(){\n    const b = BODY.front, A = CHIEF_ART')
snippet = walk[a1:b1] + walk[a2:b2] + walk[a3:b3] + '\nconsole.log(JSON.stringify({HEAD,BODY,WAVE_TORSO,WAVE_ARM,SKIN,HAIR,TOP,PANT,SHOE,HATC,BAGC,LOOKS,CHIEF,CHIEF_ART}));'
J = json.loads(subprocess.run(['node', '-e', snippet], capture_output=True, text=True, check=True).stdout)
wj('content/characters/parts/head.json', J['HEAD'], indent=1); wj('content/characters/parts/body.json', J['BODY'], indent=1)
wj('content/characters/parts/wave.json', dict(torso=J['WAVE_TORSO'], arm=J['WAVE_ARM']), indent=1)
wj('content/characters/palette.json', dict(skin=J['SKIN'], hair=J['HAIR'], top=J['TOP'], pant=J['PANT'], shoe=J['SHOE'], hat=J['HATC'], bag=J['BAGC']), indent=1)
wj('content/characters/looks.json', J['LOOKS'], indent=1)
wj('content/characters/chief.json', dict(x=J['CHIEF']['x'], y=J['CHIEF']['y'], col=J['CHIEF']['col'], art=J['CHIEF_ART']), indent=1)
walk = (walk[:a1] + "  const HEAD = DATA.characters.head, BODY = DATA.characters.body, WAVE_TORSO = DATA.characters.wave.torso, WAVE_ARM = DATA.characters.wave.arm;\n"
        + walk[b1:a2] + "  const {skin:SKIN, hair:HAIR, top:TOP, pant:PANT, shoe:SHOE, hat:HATC, bag:BAGC} = DATA.characters.palette, LOOKS = DATA.characters.looks;\n"
        + walk[b2:a3] + "  const CHIEF = {x:DATA.characters.chief.x, y:DATA.characters.chief.y, col:DATA.characters.chief.col}, CHIEF_ART = DATA.characters.chief.art;\n" + walk[b3:])

# ── 5. 임시 엔진 파일 ─────────────────────────────────────────────────
HANDLERS = sorted(set(re.findall(r'on(?:click|change|input|submit)=\\?"(\w+)\(', html)))
ind = lambda t: textwrap.indent(t, '  ')
w('src/map/legacy/engine.legacy.js', '''// @ts-nocheck
/* 임시 엔진 — 한 장짜리 HTML(REV 28)의 스크립트 세 덩어리(CORE · WALKERS · NIGHT)를 거의 그대로 옮긴 것.
   바뀐 점은 두 가지뿐: (1) 그림·도로·좌표·파츠·가게 상수를 DATA(= content/ 와 seed)에서 받음, (2) 전체를 bootLegacy()로 감쌈.
   마크업(src/app/legacy-markup.html)이 문서에 들어간 뒤 한 번만 호출할 것. 화면의 id에 의존하므로 두 번 부르면 안 됨.
   이 파일은 폴더구조_지침 §9의 3·4·7단계에서 map/ 과 features/ 로 쪼개며 줄여 나가다가 마지막에 삭제한다. */
export function bootLegacy(DATA){
/* ═══════════════ CORE (투영 · 팬줌 · 가게 점 · 카드 · 관리 · 인트로) ═══════════════ */
%s

/* ═══════════════ WALKERS (주민 · 이장님 · 강아지) ═══════════════ */
%s

/* ═══════════════ NIGHT (밤 장식 · 낮/밤 전환) ═══════════════ */
%s

  /* 마크업·카드 템플릿의 on* 속성이 부르는 함수들 (컴포넌트로 옮기면 필요 없어짐) */
  Object.assign(window, {%s});
  return { centerOn, select, setTheme: window.setTheme, getStores: () => STORES, proj, unproj };
}
''' % (ind('\n'.join(core)), ind(walk), ind(night), ', '.join(HANDLERS)))
wj('tools/.extract-meta.json', dict(headLinks=head_links, bootJs=boot_js, handlers=HANDLERS, landPathUses=n_land))
print('done. decor', len(decor), 'lamps', len(lamps), 'landmarks', len(lms), 'stores', len(stores), 'handlers', HANDLERS)
