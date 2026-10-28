/* 전시 상태가 바뀐 까닭 기록(TASK_20, 개발용) — window.__kbLog 에 { t(초), ev, why } 를 쌓는다(최근 500개).
   개발 서버이거나 주소에 ?kblog 가 있을 때만. 이야기 닫힘·한 단계 위로·자동 순환·인트로·전시 끄기 등 '밖으로 돌아감'의 이유를 보려고 */
const ON = import.meta.env.DEV || new URLSearchParams(location.search).has('kblog');
type Entry = { t: number; ev: string; why: string };
export function kbLog(ev: string, why = '') {
  if (!ON) return;
  const w = window as unknown as { __kbLog?: Entry[] }, a = (w.__kbLog ||= []);
  a.push({ t: Math.round(performance.now()) / 1000, ev, why });
  if (a.length > 500) a.splice(0, a.length - 500);
}
