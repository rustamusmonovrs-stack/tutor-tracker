-- Jurnal 2.0 migration: split the single lesson status into attendance + homework,
-- and store the group homework text in the database.
--
-- STATUS: PREPARED, NOT EXECUTED. Run only after the owner approves.
-- Safe by design: additive columns, no rows deleted, student/group ids untouched, RLS kept.
-- Rollback: supabase/migrations/20261023_attendance_homework_rollback.sql
--
-- BEFORE RUNNING: look at the verification queries at the bottom and note the numbers.

begin;

-- 0. Guard: "not_understood" has no agreed mapping. Abort instead of guessing.
do $$
begin
  if exists (select 1 from public.lessons where result = 'not_understood') then
    raise exception 'lessons.result = not_understood rows exist; decide their mapping first';
  end if;
end $$;

-- 1. Snapshot of the existing lessons (restorable copy inside the same database).
create table public.lessons_backup_20261023 as table public.lessons;
alter table public.lessons_backup_20261023 enable row level security;  -- no policy = invisible to the API
revoke all on public.lessons_backup_20261023 from anon, authenticated;

-- 2. New independent columns (null = not marked).
alter table public.lessons
  add column attendance text check (attendance in ('present', 'absent')),
  add column homework   text check (homework in ('full', 'partial', 'not_done'));

-- 3. Backfill from the legacy status.
update public.lessons set attendance = 'present', homework = 'full'     where result = 'full';
update public.lessons set attendance = 'present', homework = 'partial'  where result = 'partial';
update public.lessons set attendance = 'present', homework = 'not_done' where result = 'not_done';
update public.lessons set attendance = 'absent',  homework = null       where result = 'absent';

-- 4. Legacy column stays (for rollback) but is no longer required.
alter table public.lessons alter column result drop not null;
alter table public.lessons add constraint lessons_has_mark check (attendance is not null or homework is not null);

-- 5. Group homework text, one row per group per day.
create table public.lesson_plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  lesson_date date not null,
  homework    text not null check (char_length(btrim(homework)) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  unique (group_id, lesson_date)
);
create index lesson_plans_owner_idx on public.lesson_plans (owner_id);
create index lesson_plans_date_idx  on public.lesson_plans (group_id, lesson_date desc);

alter table public.lesson_plans enable row level security;
create policy "lesson_plans_owner_all" on public.lesson_plans
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.lesson_plans from anon;

-- 6. Verification: every legacy row must have been converted, and counts must match the snapshot.
do $$
declare a bigint; b bigint; bad bigint;
begin
  select count(*) into a from public.lessons;
  select count(*) into b from public.lessons_backup_20261023;
  if a <> b then raise exception 'row count changed: % vs snapshot %', a, b; end if;
  select count(*) into bad from public.lessons where result is not null and attendance is null;
  if bad > 0 then raise exception '% legacy rows were not converted', bad; end if;
end $$;

commit;

-- Verification queries (run after COMMIT and compare with the numbers you noted before):
--   select count(*) from public.lessons;
--   select result, attendance, homework, count(*) from public.lessons group by 1,2,3 order by 1;
--   select count(*) from public.students; select count(*) from public.groups;
