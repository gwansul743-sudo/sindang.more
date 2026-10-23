-- 구글폼 → 시민 인터뷰 주민 (10-23). SQL Editor 에서 한 번 실행. 여러 번 실행해도 괜찮다.
-- 표(interviews · characters)와 읽기 권한은 schema.sql 에 이미 있다: 승인된(status='approved') 캐릭터와 그 인터뷰만 누구나 읽는다.

-- 1) 실시간: characters 에 줄이 생기거나 status 가 바뀌면 열려 있는 지도(전시 화면)가 바로 알게 한다
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'characters') then
    alter publication supabase_realtime add table public.characters;
  end if;
end $$;

-- 2) 최근 승인 순으로 자주 읽으므로
create index if not exists characters_status_created on public.characters (status, created_at desc);

-- 확인: 아래가 한 줄 나오면 실시간 켜짐
-- select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'characters';

-- 지도에서 내리기(예): update characters set status = 'hidden' where id = '…';
