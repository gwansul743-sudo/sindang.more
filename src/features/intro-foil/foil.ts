import './foil.css';

/* 인트로 표지 뒤에 깔리는 반짝이 가루(Originkit 'Foil Drift' 셰이더를 React 없이 옮김).
   · #intro 맨 앞에 <canvas class="intro-foil"> 를 넣는다(글·섬 그림 뒤, pointer-events 없음). 마우스는 #intro 에서 받는다.
   · 색은 테마마다(html[data-theme]) — 밤은 원본처럼 빛을 더하고(어두운 바탕), 낮은 크림 바탕이라 더하면 안 보이므로 색을 칠하고 가루를 키운다(uPaper·size·rest).
   · 인트로가 떠 있는 동안만 그린다: #intro.done 이면 rAF 를 멈추고, 다시 보기(.done 이 빠짐)면 다시 켠다. 탭이 숨으면 멈춘다.
   · prefers-reduced-motion 이면 한 장만 그리고 멈춘다. WebGL 이 없으면 아무것도 안 한다(바탕색 그대로). */

const MAX_DPR = 2;
const DENSITY = 1500;                       // 가루 수
const FLAKE = { tumble: 3, tilt: 3 * 0.85, sharp: 55 * 0.24, drift: 3, spread: 2 };   // 프리셋(tumble·tilt·drift 300, spread 200, sharpness 24)
const DOT = 0.5, SPEED = 1, HOVER = 1;      // dotSize 50 · speed 50 · hover 100

type RGB = [number, number, number];
/* 인트로 CSS·그림에 이미 있는 색만 쓴다 */
/* paper: 0 = 빛을 더함(어두운 바탕), 1 = 색을 칠함(밝은 바탕). size = 가루 크기 배율, rest = 빛을 안 받을 때 진하기 */
const PALETTE: Record<'day' | 'night', { base: string; accent: string; high: string; paper: number; size: number; rest: number }> = {
  night: { base: '#273c42', accent: '#c9a25c', high: '#f4e3b5', paper: 0, size: 1,    rest: 0.055 },   // 섬 뒤 판 · 길 금색 · MORE 글자 크림
  day:   { base: '#d9c49b', accent: '#f2d37e', high: '#bf6549', paper: 1, size: 1.65, rest: 0.27 },    // 노을: 베이지 · 등불 노랑 · WORLD 01 벽돌색 (10-26 사용자 선택 E, 크림 위에서 보이게 크고 진하게)
};

const VERT = `
precision highp float;
attribute vec2 a_seed;
attribute vec4 a_rnd;
uniform vec2  uRes;
uniform float uTime, uPx, uTumble, uSharp, uDrift, uSpread, uTilt;
uniform vec2  uLight;
varying float v_spec;
void main(){
  float ar = uRes.x / max(uRes.y, 1.0);
  float par = mix(0.55, 1.35, a_rnd.z);
  vec2 q = a_seed;
  q.x = fract(q.x + uTime * uDrift * 0.010 * par);
  q.y = fract(q.y + uTime * uDrift * 0.004 * par + 0.10 * sin(uTime * 0.20 + a_rnd.x * 6.283));
  vec2 p = (q - 0.5) * 2.05 * vec2(ar, 1.0);
  float spin = uTime * uTumble * (0.50 + a_rnd.y) + a_rnd.x * 6.283;
  float amp = uTilt * a_rnd.w * a_rnd.w;
  vec3 N = normalize(vec3(amp * cos(spin), amp * sin(spin), 1.0));
  vec3 lv = vec3(uLight, uSpread) - vec3(p, 0.0);
  vec3 L = normalize(lv);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float atten = 1.0 / (1.0 + dot(lv, lv) * 0.42);
  float spec = pow(max(dot(N, H), 0.0), uSharp) * atten;
  v_spec = spec;
  float sz = uPx * (0.55 + 0.85 * fract(a_rnd.x * 7.13)) * par * (1.0 + 1.6 * spec);
  gl_PointSize = clamp(sz, 0.0, 120.0);
  gl_Position = vec4(p / vec2(ar, 1.0), 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uBase, uAccent, uHigh;
uniform float uPaper, uRest;
varying float v_spec;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.55, 1.0, length(q) * 2.0);
  float s = v_spec;
  vec3 tint = mix(uAccent, uHigh, clamp(s * 0.85, 0.0, 1.0));
  vec3 glow = uBase * 0.45 + tint * s * 2.8;                       /* 밤: 빛을 더한다(원본) */
  vec3 ink  = mix(uBase, tint, clamp(s * 2.2, 0.0, 1.0));          /* 낮: 바탕보다 진한 금박 색으로 칠한다 */
  vec3 col = mix(glow, ink, uPaper);
  float a = m * clamp(uRest + s * 2.6, 0.0, 1.0);
  gl_FragColor = vec4(min(col * a, vec3(1.0)), a);
}`;

function hex(h: string): RGB {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function flakes(n: number) {
  const R = rng(31337);
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.5))), rows = Math.max(1, Math.ceil(n / cols)), count = cols * rows;
  const seed = new Float32Array(count * 2), rnd = new Float32Array(count * 4);
  let k = 0;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++, k++) {
    seed[k * 2] = (gx + R()) / cols; seed[k * 2 + 1] = (gy + R()) / rows;
    rnd[k * 4] = R(); rnd[k * 4 + 1] = R(); rnd[k * 4 + 2] = R(); rnd[k * 4 + 3] = R();
  }
  return { seed, rnd, count };
}
function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('intro-foil shader:', gl.getShaderInfoLog(sh)); return null; }
  return sh;
}

export function mountIntroFoil(intro: HTMLElement | null) {
  if (!intro || intro.querySelector('.intro-foil')) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'intro-foil'; canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
  if (!gl) return;
  const vs = shader(gl, gl.VERTEX_SHADER, VERT), fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('intro-foil link:', gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);
  intro.prepend(canvas);

  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const n of ['uRes', 'uTime', 'uPx', 'uTumble', 'uSharp', 'uDrift', 'uSpread', 'uTilt', 'uLight', 'uBase', 'uAccent', 'uHigh', 'uPaper', 'uRest']) U[n] = gl.getUniformLocation(prog, n);
  const f = flakes(DENSITY);
  const bind = (name: string, data: Float32Array, size: number) => {
    const loc = gl.getAttribLocation(prog, name), buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  bind('a_seed', f.seed, 2); bind('a_rnd', f.rnd, 4);
  gl.uniform1f(U.uTumble, FLAKE.tumble); gl.uniform1f(U.uTilt, FLAKE.tilt); gl.uniform1f(U.uSharp, FLAKE.sharp);
  gl.uniform1f(U.uDrift, FLAKE.drift); gl.uniform1f(U.uSpread, FLAKE.spread);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let painted = '', sizeK = 1;
  const paint = () => {
    const t = document.documentElement.getAttribute('data-theme') === 'day' ? 'day' : 'night';
    if (t === painted) return;
    painted = t; const p = PALETTE[t];
    gl.uniform3fv(U.uBase, hex(p.base)); gl.uniform3fv(U.uAccent, hex(p.accent)); gl.uniform3fv(U.uHigh, hex(p.high)); gl.uniform1f(U.uPaper, p.paper); gl.uniform1f(U.uRest, p.rest); sizeK = p.size;
  };

  const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, onT: 0 };
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0, last = performance.now(), clock = 0;

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    clock = (clock + dt * SPEED) % 3600;
    const k = 1 - Math.exp(-6 * dt);
    ptr.on += (ptr.onT - ptr.on) * k;
    ptr.x += ((ptr.onT > 0 ? ptr.tx : 0.5) - ptr.x) * k;
    ptr.y += ((ptr.onT > 0 ? ptr.ty : 0.5) - ptr.y) * k;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const bw = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr)), bh = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    gl.viewport(0, 0, bw, bh);
    const ar = bw / bh;
    const hv = Math.min(1, ptr.on) * HOVER;
    const dx = 0.62 * ar * Math.cos(clock * 0.30), dy = 0.40 * Math.sin(clock * 0.23);
    const mx = (ptr.x - 0.5) * 2.05 * ar, my = (0.5 - ptr.y) * 2.05;

    paint();
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, bw, bh); gl.uniform1f(U.uTime, clock);
    gl.uniform1f(U.uPx, Math.max(1, (Math.min(bw, bh) / 1080) * 5 * DOT * sizeK));
    gl.uniform2f(U.uLight, dx + (mx - dx) * hv, dy + (my - dy) * hv);
    gl.drawArrays(gl.POINTS, 0, f.count);
    raf = still.matches ? 0 : requestAnimationFrame(frame);
  };

  const shouldRun = () => !intro.classList.contains('done') && !document.hidden;
  const sync = () => {
    if (shouldRun()) { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new MutationObserver(sync).observe(intro, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { if (still.matches && shouldRun()) requestAnimationFrame(frame); })   // 멈춘 화면이어도 테마가 바뀌면 다시 한 장
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', sync);

  const track = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;                       // 터치는 빛을 끌어당기지 않는다(탭 = 시작 버튼)
    const r = intro.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    ptr.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    ptr.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    ptr.onT = 1;
  };
  intro.addEventListener('pointermove', track);
  intro.addEventListener('pointerenter', track);
  intro.addEventListener('pointerleave', () => { ptr.onT = 0; });
  sync();
}
