import { project, type Aff, type LocalFrame } from './sunStage';

/* 하늘을 나는 2호선(10-29, TASK_13) — 서쪽 끝 하늘에서 내려와 굴로 들어가 왕십리로 밑을 지나 동쪽에서 다시 하늘로 오르는 6량 열차.
   · 영상 셋(VP9 알파, 1440×1080 = 전환 영상과 같은 기준 상자 → 세계 상자 1920×1440 에 꽉): xray(땅·건물에 가리지 않는 초록 실루엣, 낮 0.75 · 밤 0.55) 밑에
     day / night(땅·건물에 이미 가려진 열차, 1). 둘 다 같이 틀고, 보이는 쪽을 xray 시각에 맞춘다(1/30 초 넘게 어긋나면).
   · 밤 프레임(18–21시)이면 night, 아니면 day. 기울어진 보기(axon·zoom)에서만, 다 내려앉은 뒤 4초에 첫 번, 그다음 35초마다(manifest.subway.period_s).
     전환 중엔 멈추고(stop), 동작 줄이기면 틀지 않는다. 처음 내려앉은 뒤에야 받는다(preload auto). 닫으면 src 를 놓는다.
   · xray 는 낮 0.75, 밤 0.55(밤엔 그만큼으로 충분히 밝다). 건물로 다가간 보기(level 2)에선 열차 층을 세 겹 흐림 막 위로 옮겨 또렷하게(햇볕 지도·테두리 아래).
   · TASK_16(4): 첫 번은 내려앉고 3초 뒤. 재생이 막히면(play 거절) 1초 뒤 한 번 더. 상태는 세계 상자의 data-subway 에(콘솔 없이 요소 보기로 확인):
     idle · wait · playing · blocked:reduced(동작 줄이기 — 윈도 '애니메이션 효과' 끔도 이렇게 보인다) · error:이름. ?subway=now 면 내려앉자마자 틀고 동작 줄이기도 무시한다.
   · 이야기를 열 때마다 한 번, 열차가 들어올 때 서쪽 끝(섬 윤곽에서 가장 서쪽)에 작은 천 꼬리표 '2호선' — 3초 뒤 사라진다. */
export interface SubwaySpec { day: string; night: string; xray: string; fps: number; duration: number; period_s?: number; visible_frames?: { sky_in?: number[] } }
export interface SubwayOpts { world: HTMLElement; base: string; spec: SubwaySpec; axon: Aff; local: LocalFrame; island?: number[][]; night(): boolean; scale(): number; zoom?(): boolean }

const NOW = new URLSearchParams(location.search).get('subway') === 'now';
const FIRST_MS = NOW ? 0 : 3000, LABEL_MS = 3000, RETRY_MS = 1000;
const reduced = () => !NOW && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountSubway(o: SubwayOpts) {
  let made = false, x: HTMLVideoElement, day: HTMLVideoElement, night: HTMLVideoElement, tag: HTMLDivElement;
  let run = 0, timer = 0, raf = 0, labelled = false, vis: HTMLVideoElement | null = null;
  const period = (o.spec.period_s || 35) * 1000;
  function make() {
    if (made) return; made = true;
    const v = (src: string, cls: string) => { const e = document.createElement('video'); e.muted = true; e.defaultMuted = true; e.playsInline = true; e.setAttribute('muted', ''); e.setAttribute('playsinline', ''); e.preload = 'auto';   /* 자동 재생 규칙: 소리 없음·인라인을 src 보다 먼저 */ e.className = 'kb-sub ' + cls; e.setAttribute('aria-hidden', 'true'); e.src = o.base + src;
      o.world.insertBefore(e, o.world.querySelector('.kb-dio-mask')); return e; };   /* 그림 위, 흐림 막 아래 */
    x = v(o.spec.xray, 'x'); day = v(o.spec.day, 'v'); night = v(o.spec.night, 'v');
    tag = document.createElement('div'); tag.className = 'kb-sub-tag'; tag.textContent = '2호선'; o.world.appendChild(tag);
    /* 서쪽 끝: 섬 윤곽(위경도)을 지역 m → axon 으로 옮겨 가장 서쪽 점 */
    const L = o.local, pts = (o.island || []).map(([lat, lng]) => ({ lng, p: project(o.axon, (lng - L.lng0) * L.kx, (lat - L.lat0) * L.ky, 0) }));
    const w = pts.reduce((a, q) => (q.lng < a.lng ? q : a), pts[0] || { lng: 0, p: [960, 720] });
    tag.style.left = w.p[0].toFixed(1) + 'px'; tag.style.top = w.p[1].toFixed(1) + 'px';
  }
  function hide() { cancelAnimationFrame(raf); [x, day, night].forEach((e) => { if (!e) return; e.pause(); e.classList.remove('on'); }); vis = null; }
  const state = (v: string) => { o.world.dataset.subway = v; };
  function pass(retry = false) {
    const my = run; if (!made) return; if (reduced()) { state('blocked:reduced'); return; }
    const n = o.night(); vis = n ? night : day; x.classList.toggle('n', n);
    /* 자리: level 2 면 흐림 막 위(햇볕 지도 앞), 아니면 그림 바로 위(막 아래) — 틀기 전에 옮긴다 */
    const ref = o.zoom?.() ? o.world.querySelector('.kb-dio-heat') || o.world.querySelector('.kb-dio-mask')?.nextSibling || null : o.world.querySelector('.kb-dio-mask');
    if (ref !== night.nextSibling) [x, day, night].forEach((e) => o.world.insertBefore(e, ref));
    const both = [x, vis];
    both.forEach((e) => { e.currentTime = 0; });
    Promise.all(both.map((e) => e.play())).then(() => {
      if (my !== run) { both.forEach((e) => e.pause()); return; }
      both.forEach((e) => e.classList.add('on')); state('playing');
      const sync = () => { if (my !== run || !vis) return; if (Math.abs(vis.currentTime - x.currentTime) > 1 / 30) vis.currentTime = x.currentTime; if (x.ended) { hide(); state('wait'); return; } raf = requestAnimationFrame(sync); };   /* xray 가 기준 */
      raf = requestAnimationFrame(sync);
      if (!labelled) { labelled = true; const t0 = ((o.spec.visible_frames?.sky_in?.[0] ?? 8) / (o.spec.fps || 15)) * 1000;
        window.setTimeout(() => { if (my !== run) return; tag.style.fontSize = (14 / Math.max(0.05, o.scale())).toFixed(1) + 'px'; tag.classList.add('on'); window.setTimeout(() => tag.classList.remove('on'), LABEL_MS); }, t0); }
    }).catch((err: Error) => {   /* 막히면(자동 재생 규칙·아직 못 받음) 1초 뒤 한 번 더, 그다음은 다음 차례에 */
      state('error:' + (err?.name || 'play')); vis = null;
      if (!retry && my === run) window.setTimeout(() => { if (my === run) { clearTimeout(timer); pass(true); } }, RETRY_MS);
    });
    clearTimeout(timer); timer = window.setTimeout(() => { if (my === run) pass(); }, period);
  }
  return {
    /* 기울어진 보기에 내려앉았다: 받기 시작하고 4초 뒤 첫 번 */
    arm() { if (reduced()) { state('blocked:reduced'); return; } make(); run++; clearTimeout(timer); hide(); state('wait'); const my = run; timer = window.setTimeout(() => { if (my === run) pass(); }, FIRST_MS); },
    stop() { run++; clearTimeout(timer); if (made) hide(); state('idle'); },
    get playing() { return !!vis; },
    destroy() { run++; clearTimeout(timer); if (!made) return; hide(); [x, day, night].forEach((e) => { e.removeAttribute('src'); e.load(); e.remove(); }); tag.remove(); },
  };
}
export type Subway = ReturnType<typeof mountSubway>;
