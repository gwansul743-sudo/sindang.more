import { supabase } from './supabase';

/* 관리자 로그인 — 매직링크(이메일로 온 링크를 누르면 로그인). 관리자 여부는 DB의 admins 표를 is_admin() 으로 묻는다.
   비밀번호도, 서버도 없다. Supabase 대시보드 Authentication → URL Configuration 에 사이트 주소가 등록돼 있어야 링크가 돌아온다. */
export type AuthState = { email: string | null; admin: boolean };

export async function currentAuth(): Promise<AuthState> {
  if (!supabase) return { email: null, admin: false };
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email ?? null;
  if (!email) return { email: null, admin: false };
  const { data: admin } = await supabase.rpc('is_admin');
  return { email, admin: admin === true };
}

/* 로그인 상태가 바뀔 때마다 fn 호출 (처음 한 번 포함) */
export function watchAuth(fn: (s: AuthState) => void): () => void {
  currentAuth().then(fn);
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => { currentAuth().then(fn); });
  return () => data.subscription.unsubscribe();
}

export async function sendLoginLink(email: string): Promise<void> {
  if (!supabase) throw new Error('DB가 연결돼 있지 않습니다');
  const redirect = `${location.origin}${location.pathname}?admin=1`;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
