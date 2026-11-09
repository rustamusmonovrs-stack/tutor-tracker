-- Ark Progress: Smart Homework coin date = the day the teacher checks and saves the grade (Asia/Tashkent, server clock).
--
-- Bug: _apply_grade stored rewarded_on = homework_tasks.lesson_date (the day the task was given/entered). A task given
-- on 08.11 and checked on 09.11 earned its +1 on 08.11, so the checking lesson (Bugun, daily report, weekly views)
-- showed 0.
--
-- Rule (one for every English group and task): a NEW To'liq grade is dated public.today_tk(), the server's Tashkent
-- date at the moment the grade is saved. It does not depend on the task's lesson_date, due_date, the Bugun date opened
-- in the browser, or "Oldin berilgan vazifa". The browser clock is never used.
-- Unchanged: +1 per To'liq (coins column is generated from status); same status again is a no-op, so an existing
-- reward keeps its date; Chala/Qilmadi -> no coin; clearing a grade removes the row (and its coin); undo of a bulk
-- action (restore_assessments) restores the stored previous date via p_rewarded; late completion was already today.
-- Every writer goes through this function (grade_task, grade_tasks_bulk, restore_assessments). No table, grant, RLS
-- policy or security setting changes (security invoker, as before).
-- Existing rows are not touched here (see 20261109_task_coin_checking_date_backfill.sql).
-- Rollback: 20261109_task_coin_checking_date_rollback.sql
begin;

create or replace function public._apply_grade(p_task uuid, p_student uuid, p_status text, p_late boolean, p_kind text, p_rewarded date default null)
returns jsonb language plpgsql set search_path = '' as $$
declare t record; prev record; today date := public.today_tk(); rew date; had boolean;
begin
  if p_status is not null and p_status not in ('full', 'partial', 'not_done') then raise exception 'invalid status'; end if;
  select * into t from public.homework_tasks where id = p_task;
  if not found then raise exception 'task not found'; end if;
  if not exists (select 1 from public.student_task_assignments where task_id = p_task and student_id = p_student) then
    raise exception 'student is not assigned to this task';
  end if;
  select * into prev from public.student_task_assessments where task_id = p_task and student_id = p_student for update;
  had := found;

  if p_status is null then
    if had then
      delete from public.student_task_assessments where task_id = p_task and student_id = p_student;
      insert into public.homework_task_events (task_id, student_id, kind, from_status, to_status) values (p_task, p_student, p_kind, prev.status, null);
    end if;
  elsif had and prev.status = p_status then
    null;
  else
    rew := case when p_status <> 'full' then null
                when p_rewarded is not null then p_rewarded -- undo: restore the stored date
                else today end;                            -- checking date = day the grade is saved
    insert into public.student_task_assessments (task_id, student_id, status, rewarded_on, completed_late, original_status, original_graded_at)
    values (p_task, p_student, p_status, rew, p_late and p_status = 'full', null, null)
    on conflict (task_id, student_id) do update set
      status = excluded.status, graded_at = now(), rewarded_on = excluded.rewarded_on,
      completed_late = (excluded.completed_late or (p_status = 'full' and public.student_task_assessments.completed_late and public.student_task_assessments.status = 'full')),
      original_status = coalesce(public.student_task_assessments.original_status,
                                 case when public.student_task_assessments.status <> 'full' then public.student_task_assessments.status end),
      original_graded_at = coalesce(public.student_task_assessments.original_graded_at,
                                    case when public.student_task_assessments.status <> 'full' then public.student_task_assessments.graded_at end);
    insert into public.homework_task_events (task_id, student_id, kind, from_status, to_status, meta)
    values (p_task, p_student, p_kind, case when had then prev.status end, p_status, jsonb_build_object('late', p_late));
  end if;
  perform public.recompute_watch(p_student);
  return jsonb_build_object('task', p_task, 'student', p_student, 'status', p_status, 'coins', case when p_status = 'full' then 1 else 0 end);
end $$;

commit;
