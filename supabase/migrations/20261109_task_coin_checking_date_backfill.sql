-- Ark Progress: ONE-TIME correction of the reward date of 35 To'liq grades (approved separately, 09.11.2026).
--
-- Affected rows were written by the old _apply_grade, which dated the coin on the task's lesson_date (07.11 / 08.11)
-- although the teacher checked and saved them on 09.11 (graded_at, Asia/Tashkent, 19:57-20:06).
-- Selection (all must hold): status = 'full', not a late completion, the task has due_date > lesson_date,
-- rewarded_on = lesson_date (never corrected), and the saved grade (graded_at, Tashkent) is on 09.11.2026 = due_date.
-- Change: rewarded_on := the Tashkent date of graded_at (09.11.2026). Nothing else: no row is added or removed, the
-- status / coins / graded_at / original_* / events are not touched, nothing is re-graded.
--
-- Safety: one transaction. Aborts unless exactly :expected rows qualify, the backup holds them, every one is updated,
-- and the total number of rows and coins is unchanged. A second run fails on the existing backup table and changes
-- nothing (idempotent). Backup: public.task_coin_date_fix_20261109 (RLS on, no grants to app roles).
--
-- Undo (exact):
--   update public.student_task_assessments a set rewarded_on = b.old_rewarded_on
--   from public.task_coin_date_fix_20261109 b
--   where a.task_id = b.task_id and a.student_id = b.student_id and a.status = 'full' and a.rewarded_on = b.new_rewarded_on;
begin;

create temp table _totals_before on commit drop as
  select count(*) as n, coalesce(sum(coins), 0) as coins from public.student_task_assessments;

create table public.task_coin_date_fix_20261109 (
  task_id         uuid not null,
  student_id      uuid not null,
  old_rewarded_on date not null,
  new_rewarded_on date not null,
  graded_at       timestamptz not null,
  fixed_at        timestamptz not null default now(),
  primary key (task_id, student_id)
);
alter table public.task_coin_date_fix_20261109 enable row level security;
revoke all on public.task_coin_date_fix_20261109 from anon, authenticated;

insert into public.task_coin_date_fix_20261109 (task_id, student_id, old_rewarded_on, new_rewarded_on, graded_at)
select a.task_id, a.student_id, a.rewarded_on, (a.graded_at at time zone 'Asia/Tashkent')::date, a.graded_at
from public.student_task_assessments a
join public.homework_tasks t on t.id = a.task_id
where a.status = 'full'
  and not a.completed_late
  and t.due_date is not null and t.due_date > t.lesson_date
  and a.rewarded_on = t.lesson_date
  and (a.graded_at at time zone 'Asia/Tashkent')::date = date '2026-11-09'
  and t.due_date = date '2026-11-09'
for update of a;

do $$
declare expected int := 35; n int; upd int; tb record; ta record;
begin
  select count(*) into n from public.task_coin_date_fix_20261109;
  if n <> expected then raise exception 'expected % rows, found % - nothing changed', expected, n; end if;

  update public.student_task_assessments a
  set rewarded_on = b.new_rewarded_on
  from public.task_coin_date_fix_20261109 b
  where a.task_id = b.task_id and a.student_id = b.student_id
    and a.status = 'full' and a.rewarded_on = b.old_rewarded_on;
  get diagnostics upd = row_count;
  if upd <> expected then raise exception 'updated % rows, expected % - rolled back', upd, expected; end if;

  select * into tb from _totals_before;
  select count(*) as n, coalesce(sum(coins), 0) as coins into ta from public.student_task_assessments;
  if tb.n <> ta.n or tb.coins <> ta.coins then
    raise exception 'totals changed (rows % -> %, coins % -> %) - rolled back', tb.n, ta.n, tb.coins, ta.coins;
  end if;
end $$;

commit;
