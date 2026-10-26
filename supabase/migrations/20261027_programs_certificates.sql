-- Ark Progress: multi-program curriculum, student program tracks, Saturday plans, certificates gallery.
-- Additive and idempotent. No DROP/TRUNCATE of data tables. Existing 9 General English books keep
-- id / title / level / avg_weeks / planned_lessons / active / position; they only gain program_id.
--
-- Run only after a verified backup (snapshot schema backup_20261027).
-- Rollback: supabase/migrations/20261027_programs_certificates_rollback.sql

begin;

-- ---------------------------------------------------------------- programs
create table if not exists public.curriculum_programs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null check (key in ('general', 'kids', 'president')),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  position   integer not null default 1,
  created_at timestamptz not null default now(),
  constraint curriculum_programs_owner_key_uq unique (owner_id, key)
);
create index if not exists curriculum_programs_owner_idx on public.curriculum_programs (owner_id);

-- three programs per owner that already uses the journal (books are NOT seeded for Kids / President)
insert into public.curriculum_programs (owner_id, key, name, position)
select o.owner_id, p.key, p.name, p.position
from (select owner_id from public.groups union select owner_id from public.curriculum_books) o
cross join (values ('general', 'General English', 1), ('kids', 'Kids English', 2), ('president', 'Prezident maktabiga tayyorgarlik', 3)) as p (key, name, position)
on conflict (owner_id, key) do nothing;

-- ---------------------------------------------------------------- books: program + archive
alter table public.curriculum_books add column if not exists program_id uuid references public.curriculum_programs (id) on delete restrict;
alter table public.curriculum_books add column if not exists archived_at timestamptz;

update public.curriculum_books b
   set program_id = p.id
  from public.curriculum_programs p
 where p.owner_id = b.owner_id and p.key = 'general' and b.program_id is null;

alter table public.curriculum_books alter column program_id set not null;
create index if not exists curriculum_books_program_idx on public.curriculum_books (program_id);

-- position was limited to 1..9 (General English only); other programs have any number of books
alter table public.curriculum_books drop constraint if exists curriculum_books_position_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'curriculum_books_position_ck') then
    alter table public.curriculum_books add constraint curriculum_books_position_ck check (position >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'curriculum_books_program_position_uq') then
    -- deferred so two books can swap positions inside one statement
    alter table public.curriculum_books add constraint curriculum_books_program_position_uq unique (program_id, position) deferrable initially deferred;
  end if;
end $$;
alter table public.curriculum_books drop constraint if exists curriculum_books_position_uq;

-- older clients insert books without program_id: default them to the owner's General English program
create or replace function public.books_default_program() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.program_id is null then
    select id into new.program_id from public.curriculum_programs where owner_id = new.owner_id and key = 'general';
  end if;
  return new;
end $$;
drop trigger if exists books_default_program on public.curriculum_books;
create trigger books_default_program before insert on public.curriculum_books
  for each row execute function public.books_default_program();

-- a book that has history can never move to another program (history stays consistent)
create or replace function public.books_program_guard() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.program_id is distinct from old.program_id
     and exists (select 1 from public.student_book_history where book_id = old.id) then
    raise exception 'book is used in student history; program cannot change';
  end if;
  return new;
end $$;
drop trigger if exists books_program_guard on public.curriculum_books;
create trigger books_program_guard before update of program_id on public.curriculum_books
  for each row execute function public.books_program_guard();

-- ---------------------------------------------------------------- history: program per stint
alter table public.student_book_history add column if not exists program_id uuid references public.curriculum_programs (id) on delete restrict;
update public.student_book_history h
   set program_id = b.program_id
  from public.curriculum_books b
 where b.id = h.book_id and h.program_id is null;
alter table public.student_book_history alter column program_id set not null;
create index if not exists book_history_program_idx on public.student_book_history (program_id);

-- program_id always follows the book (never trusted from the client)
create or replace function public.history_set_program() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  select program_id into new.program_id from public.curriculum_books where id = new.book_id;
  return new;
end $$;
drop trigger if exists history_set_program on public.student_book_history;
create trigger history_set_program before insert or update of book_id on public.student_book_history
  for each row execute function public.history_set_program();

-- one active book per student PER PROGRAM (a student may study a second track in parallel)
drop index if exists public.student_book_history_one_active;
create unique index if not exists student_book_history_one_active_per_program
  on public.student_book_history (student_id, program_id) where finished_on is null;

-- ---------------------------------------------------------------- student program tracks
create table if not exists public.student_programs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  program_id uuid not null references public.curriculum_programs (id) on delete restrict,
  track      text not null check (track in ('primary', 'additional')),
  created_at timestamptz not null default now(),
  constraint student_programs_student_program_uq unique (student_id, program_id)
);
create unique index if not exists student_programs_one_primary on public.student_programs (student_id) where track = 'primary';
create unique index if not exists student_programs_one_additional on public.student_programs (student_id) where track = 'additional';
create index if not exists student_programs_owner_idx on public.student_programs (owner_id);
create index if not exists student_programs_program_idx on public.student_programs (program_id);

-- students that ALREADY have real book history keep that program as their primary one (nobody else is assigned)
insert into public.student_programs (owner_id, student_id, program_id, track)
select distinct on (h.student_id) h.owner_id, h.student_id, h.program_id, 'primary'
from public.student_book_history h
order by h.student_id, h.started_on, h.created_at
on conflict (student_id, program_id) do nothing;

-- ---------------------------------------------------------------- Saturday plans
create table if not exists public.saturday_plans (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope      text not null check (scope in ('default', 'program', 'group', 'student')),
  program_id uuid references public.curriculum_programs (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  on_date    date,                       -- null = every Saturday; a date = that Saturday only
  mode       text not null check (mode in ('lesson', 'mock', 'mini_test', 'none')),
  note       text check (note is null or char_length(btrim(note)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saturday_plans_target_ck check (
    (scope = 'default' and program_id is null and group_id is null and student_id is null) or
    (scope = 'program' and program_id is not null and group_id is null and student_id is null) or
    (scope = 'group' and group_id is not null and program_id is null and student_id is null) or
    (scope = 'student' and student_id is not null and program_id is null and group_id is null)
  ),
  constraint saturday_plans_date_ck check (on_date is null or extract(dow from on_date) = 6)
);
create unique index if not exists saturday_plans_uq on public.saturday_plans
  (owner_id, scope, coalesce(program_id, group_id, student_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(on_date, date '1900-01-01'));
create index if not exists saturday_plans_owner_idx on public.saturday_plans (owner_id);
create index if not exists saturday_plans_program_idx on public.saturday_plans (program_id);
create index if not exists saturday_plans_group_idx on public.saturday_plans (group_id);
create index if not exists saturday_plans_student_idx on public.saturday_plans (student_id);

-- ---------------------------------------------------------------- certificates
create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('ielts', 'cefr')),
  status        text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  private_path  text,      -- original upload, private bucket (admin only)
  redacted_path text,      -- flattened image with private fields covered, private bucket (admin preview)
  public_path   text,      -- copy of the redacted image in the public bucket (only while published)
  consent_at    timestamptz,
  consent_note  text check (consent_note is null or char_length(btrim(consent_note)) between 1 and 200),
  sort_order    integer not null default 0,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint certificates_publish_ck check (
    status <> 'published' or (consent_at is not null and redacted_path is not null and public_path is not null)
  ),
  constraint certificates_public_only_published_ck check (status = 'published' or public_path is null)
);
create index if not exists certificates_owner_idx on public.certificates (owner_id);
create index if not exists certificates_status_idx on public.certificates (status, sort_order);

-- ---------------------------------------------------------------- RLS (owner-only, nothing for anon)
do $$
declare t text;
begin
  foreach t in array array['curriculum_programs', 'student_programs', 'saturday_plans', 'certificates'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_all') then
      execute format(
        'create policy "%1$s_owner_all" on public.%1$I
           for all to authenticated
           using (owner_id = (select auth.uid()))
           with check (owner_id = (select auth.uid()))',
        t
      );
    end if;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RPCs
-- set_students_stage gets an optional track argument: drop the old signature so no ambiguous overload remains
drop function if exists public.set_students_stage(uuid[], uuid, text, date, jsonb);

create or replace function public.set_students_stage(
  p_students   uuid[],
  p_book       uuid,
  p_level      text,
  p_started_on date,
  p_dates      jsonb default '{}'::jsonb,
  p_track      text default 'primary'
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sid uuid;
  grp uuid;
  d date;
  hid uuid;
  tr text;
  prog uuid;
  arch timestamptz;
  cnt integer := 0;
begin
  if p_book is null or p_level is null or p_started_on is null then
    raise exception 'book, level and start date are required';
  end if;
  if p_track not in ('primary', 'additional') then
    raise exception 'invalid track';
  end if;
  select program_id, archived_at into prog, arch from public.curriculum_books where id = p_book;
  if not found then raise exception 'book not found'; end if;
  if arch is not null then raise exception 'book is archived'; end if;

  foreach sid in array p_students loop
    select group_id into grp from public.students where id = sid;
    if not found then raise exception 'student % not found', sid; end if;
    d := coalesce((p_dates ->> sid::text)::date, p_started_on);

    select track into tr from public.student_programs where student_id = sid and program_id = prog;
    if tr is null then
      if p_track = 'primary' then
        if exists (select 1 from public.student_programs where student_id = sid and track = 'primary') then
          raise exception 'student % already has another primary program', sid;
        end if;
      else
        if not exists (select 1 from public.student_programs where student_id = sid and track = 'primary') then
          raise exception 'additional track needs a primary program first';
        end if;
        if exists (select 1 from public.student_programs where student_id = sid and track = 'additional') then
          raise exception 'student % already has an additional track', sid;
        end if;
      end if;
      insert into public.student_programs (student_id, program_id, track) values (sid, prog, p_track);
      tr := p_track;
    elsif tr <> p_track then
      raise exception 'student is already in this program as %', tr;
    end if;

    select id into hid from public.student_book_history
     where student_id = sid and program_id = prog and finished_on is null;
    if hid is null then
      if exists (select 1 from public.student_book_history where student_id = sid and program_id = prog) then
        raise exception 'student % already has a finished program; cannot place again', sid;
      end if;
      insert into public.student_book_history (student_id, book_id, group_id, level, started_on)
      values (sid, p_book, grp, p_level, d);
    else
      -- correction: only the active period changes, finished history is never touched
      update public.student_book_history
         set book_id = p_book, level = p_level, started_on = d
       where id = hid;
    end if;

    -- the student's overall level is written by the PRIMARY track only
    if tr = 'primary' then
      insert into public.student_learning_progress (student_id, level)
      values (sid, p_level)
      on conflict (student_id) do update set level = excluded.level, updated_at = now();
    end if;
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

create or replace function public.finish_student_book(
  p_history         uuid,
  p_finished_on     date,
  p_outcome         text,
  p_next_book       uuid default null,
  p_next_level      text default null,
  p_next_started_on date default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h public.student_book_history%rowtype;
  nb uuid;
  nprog uuid;
  narch timestamptz;
  tr text;
  grp uuid;
  new_id uuid;
begin
  select * into h from public.student_book_history where id = p_history for update;
  if not found then raise exception 'history record not found'; end if;
  if h.finished_on is not null then raise exception 'book already finished'; end if;
  if p_outcome not in ('next', 'repeat', 'program_done') then raise exception 'invalid outcome'; end if;
  if p_finished_on is null or p_finished_on < h.started_on then raise exception 'finish date is before start date'; end if;
  if p_finished_on > current_date + 1 then raise exception 'finish date is in the future'; end if;

  update public.student_book_history set finished_on = p_finished_on, outcome = p_outcome where id = h.id;

  if p_outcome = 'program_done' then
    return null;
  end if;

  nb := case when p_outcome = 'repeat' then h.book_id else p_next_book end;
  if nb is null then raise exception 'next book is required'; end if;
  select program_id, archived_at into nprog, narch from public.curriculum_books where id = nb;
  if not found then raise exception 'next book is required'; end if;
  if nprog <> h.program_id then raise exception 'next book must belong to the same program'; end if;
  if narch is not null then raise exception 'next book is archived'; end if;
  if p_next_started_on is null or p_next_started_on < p_finished_on then
    raise exception 'next book start date is invalid';
  end if;

  select group_id into grp from public.students where id = h.student_id;
  insert into public.student_book_history (student_id, book_id, group_id, level, started_on)
  values (h.student_id, nb, grp, coalesce(p_next_level, h.level), p_next_started_on)
  returning id into new_id;

  select track into tr from public.student_programs where student_id = h.student_id and program_id = h.program_id;
  if p_next_level is not null and tr = 'primary' then
    insert into public.student_learning_progress (student_id, level)
    values (h.student_id, p_next_level)
    on conflict (student_id) do update set level = excluded.level, updated_at = now();
  end if;
  return new_id;
end $$;

-- take a student off a program track (history stays). Only when no book is active in that program.
create or replace function public.remove_student_program(p_student uuid, p_program uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare tr text;
begin
  select track into tr from public.student_programs where student_id = p_student and program_id = p_program for update;
  if not found then raise exception 'student is not in this program'; end if;
  if exists (select 1 from public.student_book_history where student_id = p_student and program_id = p_program and finished_on is null) then
    raise exception 'finish the active book first';
  end if;
  if tr = 'primary' and exists (select 1 from public.student_programs where student_id = p_student and track = 'additional') then
    raise exception 'remove the additional track first';
  end if;
  delete from public.student_programs where student_id = p_student and program_id = p_program;
end $$;

-- public gallery: ONLY published, consented certificates, ONLY the public image path (no owner, no private data)
create or replace function public.public_certificates()
returns table (id uuid, kind text, public_path text)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id, c.kind, c.public_path
    from public.certificates c
   where c.status = 'published' and c.consent_at is not null and c.public_path is not null
   order by c.sort_order, c.published_at desc nulls last, c.created_at desc
$$;

revoke all on function public.set_students_stage(uuid[], uuid, text, date, jsonb, text) from public, anon;
revoke all on function public.finish_student_book(uuid, date, text, uuid, text, date) from public, anon;
revoke all on function public.remove_student_program(uuid, uuid) from public, anon;
revoke all on function public.public_certificates() from public;
revoke all on function public.books_default_program() from public, anon, authenticated;
revoke all on function public.books_program_guard() from public, anon, authenticated;
revoke all on function public.history_set_program() from public, anon, authenticated;
grant execute on function public.set_students_stage(uuid[], uuid, text, date, jsonb, text) to authenticated;
grant execute on function public.finish_student_book(uuid, date, text, uuid, text, date) to authenticated;
grant execute on function public.remove_student_program(uuid, uuid) to authenticated;
grant execute on function public.public_certificates() to anon, authenticated;

-- ---------------------------------------------------------------- Storage
-- private: originals + redacted copies (owner folder only). public: only published, redacted images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('certificates-private', 'certificates-private', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('certificates-public', 'certificates-public', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

do $$
declare b text; op text; pol text;
begin
  foreach b in array array['certificates-private', 'certificates-public'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      pol := b || '_owner_' || op;
      if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = pol) then
        if op = 'insert' then
          execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', pol, b);
        elsif op = 'update' then
          execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', pol, b, b);
        else
          execute format('create policy %I on storage.objects for %s to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', pol, op, b);
        end if;
      end if;
    end loop;
  end loop;
end $$;

commit;
