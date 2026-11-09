-- Ark Progress: ONE-TIME data correction for coins of earlier-given tasks (needs separate approval for production).
--
-- Moves ONLY the date (rewarded_on) of existing To'liq grades from the given day to the checking day:
--   status = 'full', not a late completion, task.due_date > task.lesson_date, rewarded_on = task.lesson_date.
-- No coin is added or removed (coins is generated from status, which is not touched), no status, graded_at,
-- assignment or event changes, nothing is re-graded. Totals stay identical; the coin moves to the checking lesson.
-- Every changed row is saved first in public.coin_date_fix_20261109 so it can be undone exactly.
--
-- Undo:
--   update public.student_task_assessments a set rewarded_on = b.old_rewarded_on
--   from public.coin_date_fix_20261109 b where a.task_id = b.task_id and a.student_id = b.student_id
--     and a.rewarded_on = b.new_rewarded_on and a.status = 'full';
begin;

create table public.coin_date_fix_20261109 as
select a.task_id, a.student_id, a.rewarded_on as old_rewarded_on, t.due_date as new_rewarded_on, now() as fixed_at
from public.student_task_assessments a
join public.homework_tasks t on t.id = a.task_id
where a.status = 'full' and not a.completed_late
  and t.due_date is not null and t.due_date > t.lesson_date
  and a.rewarded_on = t.lesson_date;
alter table public.coin_date_fix_20261109 enable row level security; -- backup only, not exposed to the app

update public.student_task_assessments a
set rewarded_on = b.new_rewarded_on
from public.coin_date_fix_20261109 b
where a.task_id = b.task_id and a.student_id = b.student_id and a.rewarded_on = b.old_rewarded_on and a.status = 'full';

-- safety: totals must not change
do $$ begin
  if (select count(*) from public.student_task_assessments a join public.coin_date_fix_20261109 b using (task_id, student_id)
      where a.rewarded_on <> b.new_rewarded_on) > 0 then raise exception 'backfill mismatch'; end if;
end $$;

commit;
