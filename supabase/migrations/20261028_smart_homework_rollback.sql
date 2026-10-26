-- Rollback for 20261028_smart_homework.sql (drops ONLY objects created by it; legacy lessons/lesson_plans untouched).
-- WARNING: deletes structured homework tasks, grades, watch cases and notes. Restore from schema backup_20261026_hw is not needed for legacy data.
begin;
drop function if exists public.restore_assessments(jsonb);
drop function if exists public.grade_tasks_bulk(uuid, date, uuid, boolean, boolean);
drop function if exists public.unassign_task(uuid, uuid);
drop function if exists public.assign_task(uuid, uuid[]);
drop function if exists public.grade_task(uuid, uuid, text, boolean);
drop function if exists public._apply_grade(uuid, uuid, text, boolean, text, date);
drop function if exists public.refresh_watch_cases();
drop function if exists public.recompute_watch(uuid);
drop table if exists public.homework_watch_notes;
drop table if exists public.homework_watch_case_events;
drop table if exists public.homework_watch_cases;
drop table if exists public.homework_task_events;
drop table if exists public.student_task_assessments;
drop table if exists public.student_task_assignments;
drop table if exists public.homework_tasks;
drop function if exists public.homework_tasks_guard();
drop function if exists public.today_tk();
commit;
