import { supabase } from '../../shared/lib/supabase';
import type { FormAnswers } from '../../features/villagers/formScript';

/* 시민 인터뷰(구글폼) 주민 읽기 — characters(status=approved) + 연결된 interviews(source=form).
   · list(n): 최근 승인 n명. 오래된 것부터 돌려준다(먼저 온 주민이 먼저 퇴장 — FIFO).
   · watch(cb): 표가 바뀌면(실시간) 그리고 20초마다(실시간이 꺼져 있거나 끊겼을 때) cb. 멈추는 함수를 돌려준다.
   DB 가 없으면 빈 목록. 대본은 features/villagers/formScript 가 이 answers 로 만든다. */
export interface FormVillagerRow { id: string; createdAt: string; answers: FormAnswers | null; summary: string | null }

export async function listFormVillagers(n: number): Promise<FormVillagerRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('characters')
    .select('id, created_at, interview:interviews(id, source, answers, summary_md)')
    .eq('status', 'approved').order('created_at', { ascending: false }).limit(n * 3);
  if (error) { console.warn('시민 인터뷰 주민 조회 실패:', error.message); return []; }
  type Row = { id: string; created_at: string; interview: { source: string; answers: FormAnswers | null; summary_md: string | null } | null };
  return ((data || []) as unknown as Row[]).filter((r) => r.interview && r.interview.source === 'form').slice(0, n).reverse()
    .map((r) => ({ id: r.id, createdAt: r.created_at, answers: r.interview!.answers, summary: r.interview!.summary_md }));
}

export function watchFormVillagers(cb: () => void, pollMs = 20000): () => void {
  if (!supabase) return () => {};
  const ch = supabase.channel('form-villagers').on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => cb()).subscribe();
  const t = window.setInterval(cb, pollMs);
  return () => { window.clearInterval(t); supabase!.removeChannel(ch); };
}
