import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Supabase 클라이언트 하나. .env 에 URL·키가 없으면 null — 그때는 앱이 씨앗 데이터(읽기 전용, 개발 중에는 목업 저장)로 돈다. */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const PHOTO_BUCKET = 'photos';
