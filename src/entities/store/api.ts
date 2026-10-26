import seed from '../../../supabase/seed.stores.json';
import { supabase, PHOTO_BUCKET } from '../../shared/lib/supabase';
import type { Store } from './types';
import { shrinkPhoto, extOf, isShrunk, SHRUNK_MARK } from '../../shared/lib/image';

/* 가게 읽기·쓰기.
   · DB(Supabase)가 연결돼 있으면 stores 표를 읽고 쓴다. 사진은 Storage 버킷 photos 에 올리고 경로만 저장한다(여러 장은 photo_paths, 첫 장은 photo_path 에도).
   · DB가 없거나 조회에 실패하면 씨앗(seed.stores.json)으로 지도를 채운다 — 전시장 네트워크 끊김 대비.
     이때 저장은 개발 중(import.meta.env.DEV)에만 메모리 목업으로 흉내 내고, 운영에서는 막는다(읽기 전용). */

type Row = {
  id: string; slug: string | null; name: string; addr: string | null; lat: number; lng: number;
  ig_url: string | null; photo_path: string | null; interview_md: string | null; issue: string | null;
  order: number; published: boolean; video_url?: string | null;   // video_url 은 10-21 추가 컬럼(없는 DB 도 읽힌다)
  category?: string | null;    // category 는 10-23 추가 컬럼(업종 키). 없거나 비면 'etc'
  photo_paths?: string[] | null;   // 10-26 추가 컬럼(사진 여러 장, 첫 장이 표지). 없거나 비면 photo_path 한 장
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
const isStored = (path: string) => !path.startsWith('/') && !path.startsWith('http');   // Storage 경로인지(정적 파일·완전한 URL 이 아닌지) — 지울 때
function rowToStore(r: Row): Store {
  const paths = r.photo_paths?.length ? r.photo_paths : r.photo_path ? [r.photo_path] : [], photos = paths.map((p) => photoUrl(p)!);
  return { id: r.id, name: r.name, addr: r.addr ?? '', lat: r.lat, lng: r.lng, ig: r.ig_url ?? '', video: r.video_url ?? '', category: r.category ?? 'etc', photoUrl: photos[0],
    interview: r.interview_md ?? '', issue: r.issue ?? '', order: r.order, status: r.published ? 'pub' : 'up', photoPath: paths[0], photos, photoPaths: paths };
}
/* 씨앗·목업은 photoUrl 한 장만 있을 수 있다 → photos 로 맞춘다 */
const withPhotos = (s: Store): Store => ({ ...s, photos: s.photos ?? (s.photoUrl ? [s.photoUrl] : []) });

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
  if (!mock.length) mock = (seed as Store[]).map(withPhotos);
  return mock.map((s) => ({ ...s }));
}

export type StoreInput = Pick<Store, 'name' | 'addr' | 'lat' | 'lng' | 'ig' | 'video' | 'category' | 'interview' | 'issue' | 'status'>;

/* 사진 한 장: 이미 올라가 있는 것(path·url) 또는 새로 고른 파일(file, url 은 미리보기용) */
export interface PhotoItem { path?: string; url: string; file?: File }

/* 저장. editing 이 있으면 수정, 없으면 추가. photos: 저장할 사진 차례대로(첫 장이 표지) — 빠진 기존 사진은 보관함에서도 지운다 */
export async function saveStore(editing: Store | null, input: StoreInput, photos: PhotoItem[]): Promise<{ warning?: string } | void> {   /* 저장은 됐지만 알릴 게 있으면 warning (실패가 아니다 — 10-21 중복 저장 사고의 교훈) */
  if (!canWrite()) throw new Error('저장 권한이 없습니다');
  if (source !== 'db') {                                                           // DEV 목업
    const urls = photos.map((p) => p.url);
    const s: Store = { ...(editing ?? { id: 'mock-' + Date.now(), order: mock.length + 1 }), ...input, photos: urls, photoUrl: urls[0] } as Store;
    const i = mock.findIndex((m) => m.id === s.id); if (i >= 0) mock[i] = s; else mock.push(s);
    return;
  }
  const db = supabase!;
  /* 새 파일을 차례대로 올린다. 하나라도 실패하면 이번에 올린 것을 지우고 멈춘다(표는 그대로) */
  const uploaded: string[] = [], paths: string[] = [];
  for (const p of photos) {
    if (!p.file) { if (p.path) paths.push(p.path); continue; }
    const body = await shrinkPhoto(p.file).catch(() => p.file!);   /* 원본 그대로 골라도 여기서 자동으로 줄인다(10-26, shared/lib/image). 못 읽는 형식이면 원본 */
    const path = newPhotoPath(body, body !== p.file);
    const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: body.type || p.file.type, upsert: false, cacheControl: CACHE_1Y });
    if (error) { if (uploaded.length) await db.storage.from(PHOTO_BUCKET).remove(uploaded).catch(() => {}); throw error; }
    uploaded.push(path); paths.push(path);
  }
  let order = editing?.order;
  if (order == null) {
    const { data } = await db.from('stores').select('order').order('order', { ascending: false }).limit(1);
    order = ((data?.[0] as { order: number } | undefined)?.order ?? 0) + 1;
  }
  const row: Record<string, unknown> = { name: input.name, addr: input.addr || null, lat: input.lat, lng: input.lng, ig_url: input.ig || null, photo_path: paths[0] ?? null, photo_paths: paths,
    interview_md: input.interview || null, issue: input.issue || null, order, published: input.status === 'pub', video_url: input.video || null, category: input.category || null };
  const write = (r: Record<string, unknown>) => (editing ? db.from('stores').update(r).eq('id', editing.id) : db.from('stores').insert(r));
  let { error } = await write(row);
  const dropped: string[] = [];
  while (error) {   /* DB 에 아직 나중에 붙인 컬럼이 없으면(schema.sql 의 alter 미실행) 그 칸만 빼고 다시 저장. 둘 다 없을 수도 있어 반복 */
    const msg = error.message;
    const col = Object.keys(LATE_COLUMNS).find((c) => c in row && new RegExp(`\\b${c}\\b`).test(msg));   // \b: 'stores_category_chk'(값 제한 위반)는 컬럼 없음으로 치지 않는다
    if (!col) break;
    delete row[col]; dropped.push(col); ({ error } = await write(row));
  }
  if (error) { if (uploaded.length) await db.storage.from(PHOTO_BUCKET).remove(uploaded).catch(() => {}); throw error; }
  /* 표에 남은 사진만 남기고 나머지(빠진 기존 사진, photo_paths 칸이 없어 표지만 저장됐을 때의 나머지 새 사진)는 보관함에서 지운다 */
  const kept = new Set(dropped.includes('photo_paths') ? paths.slice(0, 1) : paths);
  const gone = [...(editing?.photoPaths ?? []), ...uploaded].filter((p) => !kept.has(p) && isStored(p));
  if (gone.length) await db.storage.from(PHOTO_BUCKET).remove([...new Set(gone)]).catch(() => {});
  if (dropped.length) return { warning: dropped.map((c) => LATE_COLUMNS[c]).join(' ') };
}

/* 나중에 붙인 컬럼 → DB 에 그 컬럼이 없어 빼고 저장했을 때의 안내 */
const LATE_COLUMNS: Record<string, string> = {
  video_url: '저장했지만 영상 주소는 빠졌어요. Supabase SQL 에서 alter table stores add column video_url text; 를 한 번 실행한 뒤 다시 저장하세요.',
  category: '저장됐지만 업종은 빠졌어요. Supabase SQL 에서 alter table stores add column category text; 를 한 번 실행하세요.',
  photo_paths: '저장됐지만 사진은 첫 장(표지)만 남았어요. Supabase SQL 에서 alter table stores add column photo_paths text[]; 를 한 번 실행한 뒤 다시 올려 주세요.',
};

/* 보관함 사진 이름: 시각-무작위(줄인 것은 끝에 -s).확장자. 이름이 늘 새로우니 브라우저가 1년 캐시해도 된다 */
const CACHE_1Y = '31536000';
const newPhotoPath = (b: Blob, shrunk: boolean) => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${shrunk ? SHRUNK_MARK : ''}.${extOf(b)}`;

/* 아직 원본 그대로인 보관함 사진 수(관리 패널 '사진 용량 줄이기' 단추를 보일지) */
export const originalPhotoCount = (stores: Store[]) => stores.reduce((n, s) => n + (s.photoPaths ?? []).filter((p) => isStored(p) && !isShrunk(p)).length, 0);

/* 이미 올라가 있는 원본 사진을 한 번에 줄이기(10-26). 가게마다: 원본을 받아 줄여 새 이름으로 올리고 → 표를 새 경로로 → 옛 파일 삭제.
   한 가게가 실패해도 그 가게만 그대로 두고 다음으로. 이미 줄인 사진(-s)·정적 파일(/seed-photos)은 건드리지 않는다 */
export async function shrinkStoredPhotos(onStep?: (done: number, total: number) => void): Promise<{ count: number; before: number; after: number; failed: number }> {
  if (!canWrite() || source !== 'db') throw new Error('저장 권한이 없습니다');
  const db = supabase!;
  const { data, error } = await db.from('stores').select('id, photo_path, photo_paths');
  if (error) throw error;
  const rows = (data as Pick<Row, 'id' | 'photo_path' | 'photo_paths'>[]).map((r) => ({ id: r.id, paths: r.photo_paths?.length ? r.photo_paths : r.photo_path ? [r.photo_path] : [] }));
  const total = rows.reduce((n, r) => n + r.paths.filter((p) => isStored(p) && !isShrunk(p)).length, 0);
  let done = 0, before = 0, after = 0, count = 0, failed = 0;
  onStep?.(0, total);
  for (const r of rows) {
    if (!r.paths.some((p) => isStored(p) && !isShrunk(p))) continue;
    const next: string[] = [], made: string[] = [], old: string[] = [];
    try {
      for (const p of r.paths) {
        if (!isStored(p) || isShrunk(p)) { next.push(p); continue; }
        const { data: blob, error: e1 } = await db.storage.from(PHOTO_BUCKET).download(p); if (e1 || !blob) throw e1 ?? new Error('받기 실패');
        const out = await shrinkPhoto(blob);
        const np = newPhotoPath(out, true);   /* 원본이 이미 작아 그대로여도 -s 를 붙여 다시 묻지 않게 */
        const { error: e2 } = await db.storage.from(PHOTO_BUCKET).upload(np, out, { contentType: out.type || blob.type, upsert: false, cacheControl: CACHE_1Y }); if (e2) throw e2;
        made.push(np); old.push(p); next.push(np); before += blob.size; after += out.size; count++;
        onStep?.(++done, total);
      }
      const { error: e3 } = await db.from('stores').update({ photo_path: next[0] ?? null, photo_paths: next }).eq('id', r.id); if (e3) throw e3;
      await db.storage.from(PHOTO_BUCKET).remove(old).catch(() => {});
    } catch (e) {
      console.warn('사진 줄이기 실패:', r.id, e); failed++;
      if (made.length) await db.storage.from(PHOTO_BUCKET).remove(made).catch(() => {});
    }
  }
  return { count, before, after, failed };
}

export async function deleteStore(s: Store): Promise<void> {
  if (!canWrite()) throw new Error('삭제 권한이 없습니다');
  if (source !== 'db') { mock = mock.filter((m) => m.id !== s.id); return; }
  const db = supabase!;
  const { error } = await db.from('stores').delete().eq('id', s.id);
  if (error) throw error;
  const stored = (s.photoPaths ?? (s.photoPath ? [s.photoPath] : [])).filter(isStored);
  if (stored.length) await db.storage.from(PHOTO_BUCKET).remove(stored).catch(() => {});
}
