-- Jurnal: add "Bugun o'tilgan mavzu" to the existing lesson_plans table.
-- Backward compatible: existing rows keep their homework text, topic starts empty.
-- Requires 20261023_attendance_homework.sql. Safe to re-run.
begin;

-- Snapshot of the table before changing it.
create table if not exists public.lesson_plans_backup_20261023b as table public.lesson_plans;
alter table public.lesson_plans_backup_20261023b enable row level security;
revoke all on public.lesson_plans_backup_20261023b from anon, authenticated;

alter table public.lesson_plans add column if not exists topic text;

-- homework becomes optional (a day can have a topic but no homework yet)
alter table public.lesson_plans alter column homework drop not null;
alter table public.lesson_plans drop constraint if exists lesson_plans_homework_check;
alter table public.lesson_plans drop constraint if exists lesson_plans_homework_len;
alter table public.lesson_plans drop constraint if exists lesson_plans_topic_len;
alter table public.lesson_plans drop constraint if exists lesson_plans_has_content;
alter table public.lesson_plans
  add constraint lesson_plans_homework_len check (homework is null or char_length(btrim(homework)) between 1 and 1000),
  add constraint lesson_plans_topic_len    check (topic    is null or char_length(btrim(topic))    between 1 and 300),
  add constraint lesson_plans_has_content  check (homework is not null or topic is not null);

do $$
declare a bigint; b bigint;
begin
  select count(*) into a from public.lesson_plans;
  select count(*) into b from public.lesson_plans_backup_20261023b;
  if a <> b then raise exception 'lesson_plans row count changed: % vs %', a, b; end if;
end $$;

commit;
