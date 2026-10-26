/* 커튼을 걷기 전 '다 다시 그려졌는지' 기다리기 — 낮/밤 전환(theme-toggle)과 전시 끔 커튼(kiosk-board/curtain)이 같이 쓴다.
   프레임 간격이 두 번 연달아 25ms 아래가 될 때까지(최대 1.5s) 기다린 뒤, 그동안 바빴던 만큼 더 덮어 둔다.
   칠한 뒤의 타일 래스터는 다른 스레드라 재지 못한다. 느린 폰은 그게 늦어 커튼을 걷을 때 옛 색 타일이 잔상으로 남았다(10-26, 전엔 두 프레임 + 120ms 고정)
   → 폰(터치)은 최소 300ms, 그 밖은 120ms, 최대 700ms. quick(움직임 줄이기)이면 두 프레임만 */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function afterRepaint(quick = false): Promise<void> {
  if (quick) { await nextFrame(); await nextFrame(); return; }
  const t0 = performance.now(); let last = t0, calm = 0;
  while (calm < 2 && performance.now() - t0 < 1500) { await nextFrame(); const now = performance.now(); calm = now - last < 25 ? calm + 1 : 0; last = now; }
  const busy = performance.now() - t0, min = matchMedia('(pointer: coarse)').matches ? 300 : 120;
  await new Promise<void>((r) => setTimeout(r, Math.min(700, Math.max(min, busy))));
}
