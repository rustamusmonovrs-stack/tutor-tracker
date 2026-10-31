-- Rollback for 20261031_subjects.sql.
-- Drops ONLY the objects that migration created. No existing (English) table is touched.
-- WARNING: this deletes all Matematika / Tarix data entered after the migration. If any has been
-- entered, export it first (the app's Hisobotlar page, or a SQL dump of the four subject_* tables).
-- A Git revert of the app code does NOT undo the database; run this file for that.

drop table if exists public.subject_records;
drop table if exists public.subject_lessons;
drop table if exists public.subject_students;
drop table if exists public.subject_groups;
drop function if exists public.subject_records_check_score();
drop function if exists public.subject_lessons_check_max();
