-- Rolls back 20261023b_lesson_topic.sql. Rows that only have a topic are dropped
-- (they cannot satisfy the old NOT NULL homework); the backup table is kept.
begin;
delete from public.lesson_plans where homework is null;
alter table public.lesson_plans drop constraint if exists lesson_plans_has_content;
alter table public.lesson_plans drop constraint if exists lesson_plans_topic_len;
alter table public.lesson_plans drop constraint if exists lesson_plans_homework_len;
alter table public.lesson_plans drop column if exists topic;
alter table public.lesson_plans alter column homework set not null;
alter table public.lesson_plans add constraint lesson_plans_homework_check check (char_length(btrim(homework)) between 1 and 1000);
commit;
