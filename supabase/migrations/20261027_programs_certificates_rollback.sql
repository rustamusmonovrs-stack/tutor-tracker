-- Rollback for 20261027_programs_certificates.sql.
-- WARNING: deletes program tracks, Saturday plans and certificate rows; storage objects must be removed separately.
-- Existing journal / Mock / Bosqichlar data from before this migration is restored from schema backup_20261027 if needed.
begin;
drop function if exists public.public_certificates();
drop function if exists public.remove_student_program(uuid, uuid);
drop function if exists public.set_students_stage(uuid[], uuid, text, date, jsonb, text);
create or replace function public.set_students_stage(p_students uuid[], p_book uuid, p_level text, p_started_on date, p_dates jsonb default '{}'::jsonb)
returns integer language plpgsql security invoker set search_path = '' as $f$
declare sid uuid; grp uuid; d date; hid uuid; cnt integer := 0;
begin
  if p_book is null or p_level is null or p_started_on is null then raise exception 'book, level and start date are required'; end if;
  if not exists (select 1 from public.curriculum_books where id = p_book) then raise exception 'book not found'; end if;
  foreach sid in array p_students loop
    select group_id into grp from public.students where id = sid;
    if not found then raise exception 'student % not found', sid; end if;
    d := coalesce((p_dates ->> sid::text)::date, p_started_on);
    select id into hid from public.student_book_history where student_id = sid and finished_on is null;
    if hid is null then
      if exists (select 1 from public.student_book_history where student_id = sid) then raise exception 'student % already has a finished program; cannot place again', sid; end if;
      insert into public.student_book_history (student_id, book_id, group_id, level, started_on) values (sid, p_book, grp, p_level, d);
    else
      update public.student_book_history set book_id = p_book, level = p_level, started_on = d where id = hid;
    end if;
    insert into public.student_learning_progress (student_id, level) values (sid, p_level)
    on conflict (student_id) do update set level = excluded.level, updated_at = now();
    cnt := cnt + 1;
  end loop;
  return cnt;
end $f$;
grant execute on function public.set_students_stage(uuid[], uuid, text, date, jsonb) to authenticated;
-- finish_student_book: re-apply the body from 20261026_stages.sql if the old behaviour is required.

drop table if exists public.certificates;
drop table if exists public.saturday_plans;
drop table if exists public.student_programs;
drop index if exists public.student_book_history_one_active_per_program;
drop trigger if exists history_set_program on public.student_book_history;
drop trigger if exists books_program_guard on public.curriculum_books;
drop trigger if exists books_default_program on public.curriculum_books;
drop function if exists public.history_set_program();
drop function if exists public.books_program_guard();
drop function if exists public.books_default_program();
create unique index if not exists student_book_history_one_active on public.student_book_history (student_id) where finished_on is null;
alter table public.student_book_history drop column if exists program_id;
alter table public.curriculum_books drop constraint if exists curriculum_books_program_position_uq;
alter table public.curriculum_books drop constraint if exists curriculum_books_position_ck;
alter table public.curriculum_books add constraint curriculum_books_position_check check (position between 1 and 9);
alter table public.curriculum_books add constraint curriculum_books_position_uq unique (owner_id, position) deferrable initially deferred;
alter table public.curriculum_books drop column if exists archived_at;
alter table public.curriculum_books drop column if exists program_id;
drop table if exists public.curriculum_programs;
-- storage buckets certificates-private / certificates-public: delete them in the Supabase dashboard (SQL deletes on storage tables are blocked).
commit;
