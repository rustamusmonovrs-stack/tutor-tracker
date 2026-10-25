-- Rollback for 20261026_stages.sql. Drops ONLY the objects that migration created.
-- WARNING: this deletes Bosqichlar data (books, progress, book/group history). Journal tables are untouched.
begin;
drop function if exists public.set_students_stage(uuid[], uuid, text, date, jsonb);
drop function if exists public.finish_student_book(uuid, date, text, uuid, text, date);
drop function if exists public.transfer_student(uuid, uuid, text);
drop table if exists public.student_group_transfer_history;
drop table if exists public.student_book_history;
drop table if exists public.student_learning_progress;
drop table if exists public.curriculum_books;
commit;
