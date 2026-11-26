-- Wizard Chess 3D — Phase 4 Online Multiplayer Schema
-- Idempotent DDL for public.rooms, RLS policies, and Supabase Realtime publication.

create table if not exists public.rooms (
  code text primary key check (code ~ '^[A-Z0-9]{4}$'),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  white_token text,
  black_token text,
  turn text not null default 'w' check (turn in ('w', 'b')),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array'),
  reset_count integer not null default 0 check (reset_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_updated_at_idx
  on public.rooms (updated_at desc);

create or replace function public.set_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
  before update on public.rooms
  for each row
  execute function public.set_rooms_updated_at();

alter table public.rooms enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.rooms to anon, authenticated;

drop policy if exists "rooms_select_all" on public.rooms;
create policy "rooms_select_all"
  on public.rooms
  for select
  to anon, authenticated
  using (true);

drop policy if exists "rooms_insert_all" on public.rooms;
create policy "rooms_insert_all"
  on public.rooms
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "rooms_update_all" on public.rooms;
create policy "rooms_update_all"
  on public.rooms
  for update
  to anon, authenticated
  using (true)
  with check (true);

alter table public.rooms replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end
$$;
