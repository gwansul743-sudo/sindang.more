"""전시 구역(content/map/kiosk-area.json)의 다각형을 길(content/map/roads.json) 위로 붙인다.
   꼭짓점을 가장 가까운 길 위 점으로 옮기고, 꼭짓점 사이는 길 그래프의 최단 경로로 잇는다. 결과를 같은 파일에 위경도로 다시 쓴다.
   사용: python3 -I tools/snap_area.py "$PWD"   (손으로 구역을 다시 그린 뒤 한 번)"""
import json, math, re, heapq, sys
root = sys.argv[1]
land = json.load(open(f'{root}/content/map/land.json')); bb = land['bbox']
roads = json.load(open(f'{root}/content/map/roads.json')); W, H = roads['W'], roads['H']
area = json.load(open(f'{root}/content/map/kiosk-area.json'))
merc = lambda lat: math.log(math.tan(math.pi/4 + lat*math.pi/360))
my0, my1 = merc(bb['lat0']), merc(bb['lat1'])
def proj(lat, lng): return ((lng-bb['lon0'])/(bb['lon1']-bb['lon0'])*W, (my1-merc(lat))/(my1-my0)*H)
def unproj(x, y):
    lng = bb['lon0'] + x/W*(bb['lon1']-bb['lon0']); my = my1 - y/H*(my1-my0)
    return ((2*math.atan(math.exp(my)) - math.pi/2)*180/math.pi, lng)
# 길 → 선분
segs = []
for k in 'abcd':
    cur = None
    for cmd, xs, ys in re.findall(r'([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)', roads['p'][k]):
        p = (float(xs), float(ys))
        if cmd == 'L' and cur: segs.append((cur, p, k))
        cur = p
# 그래프
def key(p): return (round(p[0]*4)/4, round(p[1]*4)/4)
adj = {}
def add_edge(a, b):
    a, b = key(a), key(b); d = math.dist(a, b)
    if d == 0: return
    adj.setdefault(a, {})[b] = min(d, adj.get(a, {}).get(b, 1e9)); adj.setdefault(b, {})[a] = min(d, adj.get(b, {}).get(a, 1e9))
for a, b, k in segs: add_edge(a, b)
def nearest(p):
    best = None
    for a, b, k in segs:
        ax, ay = a; bx, by = b; px, py = p
        dx, dy = bx-ax, by-ay; L2 = dx*dx+dy*dy
        t = 0 if L2 == 0 else max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L2))
        q = (ax+dx*t, ay+dy*t); d = math.dist(p, q)
        if best is None or d < best[0]: best = (d, q, a, b, k)
    d, q, a, b, k = best
    # 끝점에 가까우면 그 노드, 아니면 선분을 쪼개 노드 삽입
    if math.dist(q, a) < 2: return d, key(a), k
    if math.dist(q, b) < 2: return d, key(b), k
    qk = key(q); add_edge(a, q); add_edge(q, b); return d, qk, k
def route(s, t):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dist.get(u, 1e18): continue
        for v, w in adj.get(u, {}).items():
            nd = d + w
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if t not in dist: return None
    path = [t]
    while path[-1] != s: path.append(prev[path[-1]])
    return path[::-1]
verts = [proj(lat, lng) for lat, lng in area['polygon']]
snapped = []
for i, v in enumerate(verts):
    d, n, k = nearest(v); snapped.append(n); print(f'꼭짓점 {i:2d}: 길 {k} 까지 {d:5.1f} 단위 → {n}')
poly = []
for i in range(len(snapped)):
    a, b = snapped[i], snapped[(i+1) % len(snapped)]
    r = route(a, b)
    if r is None: print('경로 없음', i); sys.exit(1)
    straight = math.dist(a, b); along = sum(math.dist(r[j], r[j+1]) for j in range(len(r)-1))
    print(f'변 {i:2d}: 직선 {straight:5.1f} / 길 따라 {along:5.1f} ({len(r)} 점)')
    poly.extend(r[:-1])
# 같은 점·일직선 점 정리
out = []
for p in poly:
    if out and math.dist(out[-1], p) < 0.3: continue
    out.append(p)
def collinear(a, b, c): return abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) < 0.15 * max(1, math.dist(a, c))
i = 0
while len(out) > 3 and i < len(out):
    a, b, c = out[i-1], out[i], out[(i+1) % len(out)]
    if collinear(a, b, c): out.pop(i)
    else: i += 1
print('새 꼭짓점 수', len(out))
area['polygon'] = [[round(lat, 6), round(lng, 6)] for lat, lng in (unproj(x, y) for x, y in out)]
area['note'] = '전시 모드에서 외곽선을 띄우는 구역. 2026-10-16 사용자가 전시 화면 위에 그린 검정선을 위경도로 옮긴 것을, 10-21 길(roads.json) 위로 붙였다: 꼭짓점을 가장 가까운 길에 놓고 꼭짓점 사이는 길을 따라 잇는다(스크립트는 git 이력의 tools/snap_area.py)'
json.dump(area, open(f'{root}/content/map/kiosk-area.json', 'w'), ensure_ascii=False, indent=1)
