import type { SupabaseClient } from '@supabase/supabase-js';

/* Supabase. .env 에 URL·키가 없으면 DB 없음 — 그때는 앱이 씨앗 데이터(읽기 전용, 개발 중에는 목업 저장)로 돈다.
   · 공개 읽기(가게·시민 인터뷰 주민)는 라이브러리 없이 REST 를 fetch 로 바로 부른다(restGet, publicPhotoUrl).
   · 로그인·쓰기·사진 올리기·실시간은 getSupabase() — 라이브러리(약 200KB)를 그때 처음 받는다. 첫 화면 JS 를 줄이려고(10-26) */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = !!(url && key);
export const PHOTO_BUCKET = 'photos';

let client: Promise<SupabaseClient | null> | null = null;
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!hasSupabase) return Promise.resolve(null);
  return (client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url!, key!)));
}

/* PostgREST 읽기. query 는 'stores?select=*&order=order.asc' 처럼 */
export async function restGet<T>(query: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

/* 공개 버킷 사진 주소 — supabase.storage.from(bucket).getPublicUrl(path) 와 같은 모양 */
export const publicPhotoUrl = (path: string) => encodeURI(`${url}/storage/v1/object/public/${PHOTO_BUCKET}/${path.replace(/^\/+/, '')}`);
