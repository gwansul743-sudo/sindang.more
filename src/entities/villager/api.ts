import { hasSupabase, getSupabase, restGet } from '../../shared/lib/supabase';
import type { FormAnswers } from '../../features/villagers/formScript';

/* 시민 인터뷰(구글폼) 주민 읽기 — characters(status=approved) + 연결된 interviews(source=form).
   · list(n?): 최근 승인 n명(없으면 전부 — 10-30부터 지도는 전부 띄운다). 오래된 것부터 돌려준다.
   · watch(cb): 표가 바뀌면(실시간) 그리고 20초마다(실시간이 꺼져 있거나 끊겼을 때) cb. 멈추는 함수를 돌려준다.
   읽기는 REST fetch, 실시간 구독만 Supabase 라이브러리(getSupabase). DB 가 없으면 빈 목록. 대본은 features/villagers/formScript 가 이 answers 로 만든다. */
export interface FormVillagerRow { id: string; createdAt: string; answers: FormAnswers | null; summary: string | null }

export async function listFormVillagers(n?: number): Promise<FormVillagerRow[]> {   /* n 없으면 전부(10-30, 인원 제한 없음) */
  if (!hasSupabase) return [];
  let data: unknown[];
  try { data = await restGet<unknown[]>(`characters?select=id,created_at,interview:interviews(id,source,answers,summary_md)&status=eq.approved&order=created_at.desc${n ? `&limit=${n * 3}` : ''}`); }
  catch (e) { console.warn('시민 인터뷰 주민 조회 실패:', e); return []; }
  type Row = { id: string; created_at: string; interview: { source: string; answers: FormAnswers | null; summary_md: string | null } | null };
  return ((data || []) as unknown as Row[]).filter((r) => r.interview && r.interview.source === 'form').slice(0, n ?? Infinity).reverse()
    .map((r) => ({ id: r.id, createdAt: r.created_at, answers: r.interview!.answers, summary: r.interview!.summary_md }));
}

export function watchFormVillagers(cb: () => void, pollMs = 20000): () => void {
  if (!hasSupabase) return () => {};
  let stopped = false, stopCh = () => {};
  getSupabase().then((db) => {
    if (!db || stopped) return;
    const ch = db.channel('form-villagers').on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => cb()).subscribe();
    stopCh = () => { db.removeChannel(ch); };
  });
  const t = window.setInterval(cb, pollMs);
  return () => { stopped = true; window.clearInterval(t); stopCh(); };
}
