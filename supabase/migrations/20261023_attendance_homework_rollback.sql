-- Rollback for 20261023_attendance_homework.sql
-- Restores the single-status model. Rows created after the migration that only have
-- "attendance = present" and no homework grade have no legacy equivalent; they become 'not_done'
-- (review them first: select * from public.lessons where result is null and homework is null).

begin;

update public.lessons set result = case
    when attendance = 'absent' then 'absent'
    when homework = 'full'     then 'full'
    when homework = 'partial'  then 'partial'
    else 'not_done'
  end
where result is null;

alter table public.lessons drop constraint if exists lessons_has_mark;
alter table public.lessons alter column result set not null;
alter table public.lessons drop column attendance, drop column homework;
drop table if exists public.lesson_plans;
-- The snapshot table public.lessons_backup_20261023 is kept; drop it manually when no longer needed.

commit;
