import { supabase } from './supabase';

/* 관리자 로그인 — 이메일+비밀번호. 관리자 여부는 DB의 admins 표를 is_admin() 으로 묻는다.
   비밀번호를 잊었을 때만 메일 링크(매직링크)를 쓴다. 링크가 돌아올 주소는 Supabase Authentication → URL Configuration 에 등록돼 있어야 한다. */
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

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('DB가 연결돼 있지 않습니다');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다' : error.message);
}

/* 로그인된 상태에서 비밀번호 바꾸기 (처음 정할 때도 이걸로) */
export async function setPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('DB가 연결돼 있지 않습니다');
  if (password.length < 8) throw new Error('비밀번호는 8자 이상');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/* 비밀번호를 잊었을 때: 메일로 로그인 링크 */
export async function sendLoginLink(email: string): Promise<void> {
  if (!supabase) throw new Error('DB가 연결돼 있지 않습니다');
  const redirect = `${location.origin}${location.pathname}?admin=1`;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
