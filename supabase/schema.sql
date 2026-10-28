-- sindang.more 지도 — 테이블과 RLS
-- published=false 는 지금 화면에서 '다음 호'(점선 점)로 보인다. 완전히 숨기는 상태가 필요해지면 status 컬럼으로 바꿀 것.

create table if not exists stores (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique, -- 옛 id 보존용
  name          text not null,
  addr          text,
  lat           double precision not null,
  lng           double precision not null,
  ig_url        text,
  photo_path    text, -- 표지(= photo_paths 의 첫 장). 칸이 없는 옛 화면·목록 썸네일용으로 같이 둔다
  photo_paths   text[], -- 사진 여러 장(첫 장이 표지). 10-26 추가. 기존 DB: alter table stores add column if not exists photo_paths text[];
  video_url     text, -- 영상 주소(유튜브·구글 드라이브·mp4). 10-21 추가. 기존 DB: alter table stores add column if not exists video_url text;
  category      text, -- 업종 키(sewing·supermarket·coffee·restaurant·wine·etc). 10-23 추가. 기존 DB: alter table stores add column if not exists category text;
  featured      boolean not null default false, -- 전시 보드에서 강조(큰 단추 + 이름표). 10-28 추가. 기존 DB: alter table stores add column if not exists featured boolean not null default false;
  interview_md  text,
  issue         text, -- '6호' 표시
  "order"       integer not null default 0,
  published     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists interviews (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('form','shop')),
  answers     jsonb not null default '{}'::jsonb,
  summary_md  text,
  store_id    uuid references stores(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists characters (
  id            uuid primary key default gen_random_uuid(),
  nickname      text not null,
  look          jsonb,
  interview_id  uuid references interviews(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at    timestamptz not null default now()
);

-- 쓰기 권한: 이 표에 이메일이 있는 사람만
create table if not exists admins (email text primary key);

alter table stores enable row level security;
alter table interviews enable row level security;
alter table characters enable row level security;
alter table admins enable row level security;

create or replace function is_admin() returns boolean language sql stable security definer as
$$ select exists (select 1 from admins where email = auth.jwt() ->> 'email') $$;

create policy "stores read"      on stores     for select using (true);
create policy "stores write"     on stores     for all    using (is_admin()) with check (is_admin());
create policy "characters read"  on characters for select using (status = 'approved' or is_admin());
create policy "characters write" on characters for all    using (is_admin()) with check (is_admin());
create policy "interviews read"  on interviews for select using (
  is_admin() or exists (select 1 from characters c where c.interview_id = interviews.id and c.status = 'approved')
  or store_id is not null);
create policy "interviews write" on interviews for all    using (is_admin()) with check (is_admin());
-- 구글폼 → Apps Script 는 service role 키로 넣으므로 RLS를 거치지 않는다 (키는 Apps Script 속성에만).
