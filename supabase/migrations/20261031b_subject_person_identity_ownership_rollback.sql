-- Reverts 20261031b only. Existing rows and data are kept; person_id column is dropped.
-- Recreating the (group_id, name) unique index fails if two active people with one name now share a group:
-- in that case rename or archive one of them first. Run only on explicit instruction.
drop trigger if exists subject_records_owner_ck on public.subject_records;
drop trigger if exists subject_lessons_owner_ck on public.subject_lessons;
drop trigger if exists subject_students_owner_ck on public.subject_students;
drop function if exists public.subject_records_check_owner();
drop function if exists public.subject_lessons_check_owner();
drop function if exists public.subject_students_check_owner();
drop index if exists public.subject_students_group_person_uq;
drop index if exists public.subject_students_person_idx;
alter table public.subject_students drop column if exists person_id;
create unique index if not exists subject_students_group_name_uq
  on public.subject_students (group_id, lower(btrim(name)))
  where archived_at is null;
