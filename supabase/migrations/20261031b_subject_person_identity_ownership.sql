-- Follow-up to 20261031_subjects.sql. Two fixes, both additive / loosening, no row is deleted or rewritten
-- except filling the NEW column person_id.
--
-- 1) Stable student identity.
--    subject_students has one row per group membership. The UI used to guess "same person" from the name,
--    so two different learners called "Ali Valiyev" were merged into one profile. person_id is the permanent
--    identity shared by all memberships of one person within one subject (and owner).
--    Backfill keeps today's grouping for existing rows (same English link, else same normalised name);
--    new rows get a fresh random person_id unless the app passes an existing one.
--    The old unique index (group_id, name) is replaced by (group_id, person_id): the same PERSON cannot be
--    active twice in one group, but two different people may share a name.
--
-- 2) Ownership validation.
--    Foreign-key checks bypass RLS, so a signed-in user who knew a group/lesson/student/English-student UUID of
--    ANOTHER owner could attach their own row to it. BEFORE triggers now require every referenced parent to
--    belong to the row's owner. They are SECURITY INVOKER (RLS applies too) and also compare owner_id explicitly,
--    so they hold for service-role/SQL access as well.
--
-- Rollback: 20261031b_subject_person_identity_ownership_rollback.sql

-- ---------------------------------------------------------------------------
-- 1) person_id
-- ---------------------------------------------------------------------------
alter table public.subject_students add column if not exists person_id uuid;

update public.subject_students s
set person_id = k.pid
from (
  select id,
         first_value(id) over (
           partition by owner_id, subject, coalesce(english_student_id::text, lower(btrim(name)))
           order by created_at, id
         ) as pid
  from public.subject_students
) k
where s.id = k.id and s.person_id is null;

alter table public.subject_students alter column person_id set default gen_random_uuid();
alter table public.subject_students alter column person_id set not null;

create index if not exists subject_students_person_idx on public.subject_students (person_id);
create unique index if not exists subject_students_group_person_uq
  on public.subject_students (group_id, person_id)
  where archived_at is null;
drop index if exists public.subject_students_group_name_uq;

-- ---------------------------------------------------------------------------
-- 2) Ownership triggers
-- ---------------------------------------------------------------------------
create or replace function public.subject_students_check_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.subject_groups g where g.id = new.group_id and g.owner_id = new.owner_id) then
    raise exception 'Guruh topilmadi yoki sizga tegishli emas' using errcode = '42501';
  end if;
  if new.english_student_id is not null
     and not exists (select 1 from public.students e where e.id = new.english_student_id and e.owner_id = new.owner_id) then
    raise exception 'Ingliz tili o''quvchisi topilmadi yoki sizga tegishli emas' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.subject_lessons_check_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.subject_groups g where g.id = new.group_id and g.owner_id = new.owner_id) then
    raise exception 'Guruh topilmadi yoki sizga tegishli emas' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.subject_records_check_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.subject_lessons l where l.id = new.lesson_id and l.owner_id = new.owner_id) then
    raise exception 'Dars topilmadi yoki sizga tegishli emas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.subject_students s where s.id = new.student_id and s.owner_id = new.owner_id) then
    raise exception 'O''quvchi topilmadi yoki sizga tegishli emas' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists subject_students_owner_ck on public.subject_students;
create trigger subject_students_owner_ck
  before insert or update of owner_id, group_id, english_student_id on public.subject_students
  for each row execute function public.subject_students_check_owner();

drop trigger if exists subject_lessons_owner_ck on public.subject_lessons;
create trigger subject_lessons_owner_ck
  before insert or update of owner_id, group_id on public.subject_lessons
  for each row execute function public.subject_lessons_check_owner();

drop trigger if exists subject_records_owner_ck on public.subject_records;
create trigger subject_records_owner_ck
  before insert or update of owner_id, lesson_id, student_id on public.subject_records
  for each row execute function public.subject_records_check_owner();
