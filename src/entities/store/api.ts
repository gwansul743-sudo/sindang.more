import seed from '../../../supabase/seed.stores.json';
import { supabase, PHOTO_BUCKET } from '../../shared/lib/supabase';
import type { Store } from './types';

/* 가게 읽기·쓰기.
   · DB(Supabase)가 연결돼 있으면 stores 표를 읽고 쓴다. 사진은 Storage 버킷 photos 에 올리고 경로만 저장한다.
   · DB가 없거나 조회에 실패하면 씨앗(seed.stores.json)으로 지도를 채운다 — 전시장 네트워크 끊김 대비.
     이때 저장은 개발 중(import.meta.env.DEV)에만 메모리 목업으로 흉내 내고, 운영에서는 막는다(읽기 전용). */

type Row = {
  id: string; slug: string | null; name: string; addr: string | null; lat: number; lng: number;
  ig_url: string | null; photo_path: string | null; interview_md: string | null; issue: string | null;
  order: number; published: boolean;
};

export type StoreSource = 'db' | 'seed';
let source: StoreSource = 'seed';
let mock: Store[] = [];           // DEV 목업 저장용

export const hasDb = () => !!supabase;
export const storeSource = () => source;
export const canWrite = () => (source === 'db') || (!supabase && import.meta.env.DEV);
export const canUpload = () => source === 'db';

function photoUrl(path: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('/') || path.startsWith('http')) return path;              // 정적 파일(seed-photos) 또는 완전한 URL
  return supabase!.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
function rowToStore(r: Row): Store {
  return { id: r.id, name: r.name, addr: r.addr ?? '', lat: r.lat, lng: r.lng, ig: r.ig_url ?? '', photoUrl: photoUrl(r.photo_path),
    interview: r.interview_md ?? '', issue: r.issue ?? '', order: r.order, status: r.published ? 'pub' : 'up', photoPath: r.photo_path ?? undefined };
}

export async function listStores(): Promise<Store[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('stores').select('*').order('order');
      if (!error && data && data.length) { source = 'db'; return (data as Row[]).map(rowToStore); }
      if (error) console.warn('stores 조회 실패, 씨앗으로 대체:', error.message);
      else console.warn('stores 표가 비어 있어 씨앗으로 대체');
    } catch (e) { console.warn('DB 접속 실패, 씨앗으로 대체:', e); }
  }
  source = 'seed';
  if (!mock.length) mock = (seed as Store[]).map((s) => ({ ...s }));
  return mock.map((s) => ({ ...s }));
}

export type StoreInput = Pick<Store, 'name' | 'addr' | 'lat' | 'lng' | 'ig' | 'interview' | 'issue' | 'status'>;

/* 저장. editing 이 있으면 수정, 없으면 추가. photo: 새 사진 파일, removePhoto: 기존 사진 지우기 */
export async function saveStore(editing: Store | null, input: StoreInput, photo: File | null, removePhoto: boolean): Promise<void> {
  if (!canWrite()) throw new Error('저장 권한이 없습니다');
  if (source !== 'db') {                                                           // DEV 목업
    const s: Store = { ...(editing ?? { id: 'mock-' + Date.now(), order: mock.length + 1 }), ...input, photoUrl: photo ? URL.createObjectURL(photo) : removePhoto ? undefined : editing?.photoUrl } as Store;
    const i = mock.findIndex((m) => m.id === s.id); if (i >= 0) mock[i] = s; else mock.push(s);
    return;
  }
  const db = supabase!;
  let photo_path: string | null = editing?.photoPath ?? null;
  if (photo) {
    const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: photo.type, upsert: false });
    if (error) throw error;
    if (photo_path && !photo_path.startsWith('/') && !photo_path.startsWith('http')) await db.storage.from(PHOTO_BUCKET).remove([photo_path]).catch(() => {});
    photo_path = path;
  } else if (removePhoto && photo_path) {
    if (!photo_path.startsWith('/') && !photo_path.startsWith('http')) await db.storage.from(PHOTO_BUCKET).remove([photo_path]).catch(() => {});
    photo_path = null;
  }
  let order = editing?.order;
  if (order == null) {
    const { data } = await db.from('stores').select('order').order('order', { ascending: false }).limit(1);
    order = ((data?.[0] as { order: number } | undefined)?.order ?? 0) + 1;
  }
  const row = { name: input.name, addr: input.addr || null, lat: input.lat, lng: input.lng, ig_url: input.ig || null, photo_path,
    interview_md: input.interview || null, issue: input.issue || null, order, published: input.status === 'pub' };
  const q = editing ? db.from('stores').update(row).eq('id', editing.id) : db.from('stores').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteStore(s: Store): Promise<void> {
  if (!canWrite()) throw new Error('삭제 권한이 없습니다');
  if (source !== 'db') { mock = mock.filter((m) => m.id !== s.id); return; }
  const db = supabase!;
  const { error } = await db.from('stores').delete().eq('id', s.id);
  if (error) throw error;
  if (s.photoPath && !s.photoPath.startsWith('/') && !s.photoPath.startsWith('http')) await db.storage.from(PHOTO_BUCKET).remove([s.photoPath]).catch(() => {});
}
