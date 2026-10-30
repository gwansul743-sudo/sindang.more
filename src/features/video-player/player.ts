import './player.css';

/* 영상 크게 보기(10-28) — 가게 카드의 영상 썸네일을 누르면 화면 가운데에 크게 띄워 재생한다. 순수 UI: 지도 엔진·데이터를 모른다.
   · 모양은 사진 크게 보기(features/photo-viewer)와 한 벌: 바탕 검정 #000000fa(10-30), 둥근 모서리(짧은 변 × 0.04 — 사진 뷰어의 0.075 는 가로로 긴 영상 칸엔 너무 둥글었다), 그림자, 아래 글자.
   · 영상 칸은 16:9, 화면 94% × 80% 안에서 가장 크게(좁은 화면은 폭 94%). 받는 동안은 썸네일을 깔고 반짝이는 띠(카드 스켈레톤과 같은 결).
   · 구글 드라이브 플레이어는 폭 512px 아래에서 영상을 잘라 보인다 → 그보다 좁으면 560×315 로 그려 줄인다(카드 때와 같은 방법).
     드라이브는 자동 재생을 받지 않아 열린 뒤 한 번 더 눌러야 한다. 유튜브·mp4 는 바로 재생.
   · 드라이브는 로딩이 한 번만 보이게(10-30): 드라이브 플레이어는 자기 동그란 로딩·검은 재생 단추를 그린다(iframe 안이라 못 고친다).
     그래서 누를 때까지 iframe 위를 썸네일 막으로 덮고(누르기는 막을 지나 iframe 으로 간다 — 드라이브는 화면 어디를 눌러도 재생) 그 위에 썸네일 + 카드와 같은 유리 재생 단추.
     받는 동안은 스켈레톤. 누른 걸 창 blur(포커스가 iframe 으로)로 알고, 드라이브가 버퍼링하는 PLAY_HOLD 동안 스켈레톤을 한 번 더 깔았다 영상을 드러낸다.
     썸네일이 없으면(이장님·매니저님) 드라이브 썸네일 주소를 쓴다.
   · 닫기: 영상 밖(어두운 곳) 누르기 · Esc · 오른쪽 위 ✕. iframe 안을 누르면 키가 iframe 으로 가므로 ✕ 를 둔다(사진 뷰어와 다른 점). */
export type VideoSource = { kind: 'drive' | 'youtube' | 'file'; src: string; thumb?: string };
export interface VideoPlayer { open(v: VideoSource, opt?: { poster?: string; label?: string; onClose?: () => void }): void; close(): void; readonly visible: boolean; readonly openedAt: number }   // onClose(10-29): 닫힐 때 한 번(이장님·매니저님 대화 상자가 장 넘김을 이어 간다)

/* 영상 주소 → 끼워 넣을 수 있는 원본. 못 끼우면 null(카드가 '영상 보기' 링크로) */
export function parseVideo(url: string | null | undefined): VideoSource | null {
  url = (url || '').trim(); if (!url) return null;
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  if (drive) return { kind: 'drive', src: `https://drive.google.com/file/d/${drive[1]}/preview`, thumb: `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1280` };
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
  if (yt) return { kind: 'youtube', src: `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1&autoplay=1` };
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return { kind: 'file', src: url };
  return null;
}

const BOX_W = 0.94, BOX_H = 0.8, AR = 16 / 9, DRIVE_W = 560, DRIVE_MIN = 512, ROUND = 0.04;
const READY_HOLD = 600, PLAY_HOLD = 900;   // 드라이브: load 뒤 재생 단추를 띄우기까지 · 누른 뒤 영상을 드러내기까지(헤드리스 측정: 누르고 약 0.4초 검정 → 0.9초 재생)
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8a1 1 0 0 0 1.52.85l12.1-7.4a1 1 0 0 0 0-1.7L8.52 3.75A1 1 0 0 0 7 4.6z"/></svg>';   // 카드 썸네일(engine.legacy.js)과 같은 세모

export function mountVideoPlayer(): VideoPlayer {
  const el = document.createElement('div'); el.className = 'vv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1; el.hidden = true;
  el.innerHTML = `<div class="vv-box"><div class="vv-media"></div><span class="vt-play">${PLAY_ICON}</span></div><span class="vv-label"></span>`
    + '<button type="button" class="vv-x" aria-label="영상 닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  document.body.appendChild(el);
  const box = el.querySelector('.vv-box') as HTMLElement, media = el.querySelector('.vv-media') as HTMLElement, label = el.querySelector('.vv-label') as HTMLElement;
  let visible = false, openedAt = 0, kind: VideoSource['kind'] = 'file', back: Element | null = null, onClose: (() => void) | undefined, seq = 0;

  function layout() {
    const w = Math.min(el.clientWidth * BOX_W, el.clientHeight * BOX_H * AR), h = w / AR;
    box.style.width = `${w}px`; box.style.height = `${h}px`; box.style.setProperty('--vv-r', `${Math.round(Math.min(w, h) * ROUND)}px`);
    const f = media.querySelector('iframe.drive') as HTMLElement | null;   // 좁으면 560×315 로 그려 줄이고, 넓으면 칸 그대로
    if (f) { const small = w < DRIVE_MIN; f.classList.toggle('fit', small); f.style.transform = small ? `scale(${w / DRIVE_W})` : ''; }
  }
  function open(v: VideoSource, opt: { poster?: string; label?: string; onClose?: () => void } = {}) {
    back = document.activeElement; kind = v.kind; onClose = opt.onClose;
    const my = ++seq, poster = opt.poster || v.thumb;
    box.style.backgroundImage = poster ? `url("${poster.replace(/"/g, '%22')}")` : '';
    box.classList.toggle('cover', kind === 'drive'); box.classList.remove('ready');
    label.textContent = opt.label || ''; el.setAttribute('aria-label', `${opt.label || ''} 영상`);
    media.textContent = '';
    const m = kind === 'file' ? document.createElement('video') : document.createElement('iframe');
    if (m instanceof HTMLVideoElement) { m.controls = true; m.autoplay = true; m.playsInline = true; m.preload = 'auto'; }
    else { m.allow = 'autoplay; fullscreen; picture-in-picture'; m.allowFullscreen = true; m.title = `${opt.label || ''} 영상`; if (kind === 'drive') m.className = 'drive'; }
    box.classList.add('loading');
    const done = kind === 'drive'
      ? () => setTimeout(() => { if (my === seq && box.classList.contains('loading')) { box.classList.remove('loading'); box.classList.add('ready'); } }, READY_HOLD)
      : () => box.classList.remove('loading');
    m.addEventListener(m instanceof HTMLVideoElement ? 'loadeddata' : 'load', done, { once: true }); m.addEventListener('error', done, { once: true }); setTimeout(done, 12000);
    m.src = v.src; media.appendChild(m);
    el.hidden = false; visible = true; openedAt = performance.now(); layout();
    requestAnimationFrame(() => el.classList.add('show')); el.focus({ preventScroll: true });
  }
  function close() {
    if (!visible) return; visible = false; seq++; el.classList.remove('show'); el.hidden = true; media.textContent = '';   // iframe 을 떼어 내야 소리가 멈춘다
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
    const fn = onClose; onClose = undefined; fn?.();
  }
  window.addEventListener('blur', () => setTimeout(() => {   // 드라이브 iframe 을 눌렀다 = 재생 시작
    const f = media.querySelector('iframe.drive');
    if (!visible || !f || document.activeElement !== f || !box.classList.contains('cover')) return;
    if (!box.classList.contains('ready')) { el.focus({ preventScroll: true }); return; }   // 드라이브가 덜 떴을 땐 누르기가 안 먹는다 → 포커스를 되찾아 다음 누르기를 다시 잡는다
    const my = seq; box.classList.remove('ready'); box.classList.add('loading');
    setTimeout(() => { if (my === seq) box.classList.remove('loading', 'cover'); }, PLAY_HOLD);
  }, 0));
  el.addEventListener('click', (e) => { if (!(e.target as Element).closest('.vv-box')) close(); });   // 영상 밖(✕ 포함)
  document.addEventListener('keydown', (e) => { if (visible && e.key === 'Escape') { e.preventDefault(); close(); } });
  window.addEventListener('resize', () => { if (visible) layout(); });

  return { open, close, get visible() { return visible; }, get openedAt() { return openedAt; } };
}
