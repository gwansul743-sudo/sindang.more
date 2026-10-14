-- 사진 보관함 (Storage 버킷 photos, 공개 읽기 · 관리자만 쓰기). schema.sql 뒤에 한 번 실행.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
create policy "photos read"  on storage.objects for select using (bucket_id = 'photos');
create policy "photos write" on storage.objects for all using (bucket_id = 'photos' and is_admin()) with check (bucket_id = 'photos' and is_admin());
