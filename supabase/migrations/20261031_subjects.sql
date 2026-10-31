-- Multi-subject extension: Matematika ('math') and Tarix ('history').
--
-- PURELY ADDITIVE. Creates 4 new tables + 2 trigger functions. It does NOT alter, drop,
-- backfill or read any existing table (groups, students, lessons, homework_*, mock_*, ...).
-- English data is untouched by construction: English groups/students stay in public.groups /
-- public.students and are never classified, moved or duplicated.
--
-- Why separate tables instead of a `subject` column on public.groups:
-- the English app loads ALL rows of groups/students without a subject filter, so a Math group in
-- public.groups would leak into the English journal, ranking and curriculum.
--
-- Rollback: 20261031_subjects_rollback.sql (drops only the objects created here).

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table if not exists public.subject_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject     text not null check (subject in ('math', 'history')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  -- target of composite foreign keys below: a child row can never point at a group of another subject
  unique (id, subject)
);

-- No two active groups of the same subject with the same name (case-insensitive).
create unique index if not exists subject_groups_active_name_uq
  on public.subject_groups (owner_id, subject, lower(btrim(name)))
  where archived_at is null;
create index if not exists subject_groups_owner_idx on public.subject_groups (owner_id, subject);

-- ---------------------------------------------------------------------------
-- Students (membership of one subject group)
-- english_student_id is an OPTIONAL reference to an existing English student so one person can be
-- recognised across subjects. It is never written to public.students and deleting the English
-- student only clears the link.
-- ---------------------------------------------------------------------------
create table if not exists public.subject_students (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject            text not null,
  group_id           uuid not null,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  english_student_id uuid references public.students (id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (group_id, subject) references public.subject_groups (id, subject) on delete restrict,
  unique (id, group_id, subject)
);

create index if not exists subject_students_owner_idx on public.subject_students (owner_id);
create index if not exists subject_students_group_idx on public.subject_students (group_id);
create index if not exists subject_students_english_idx on public.subject_students (english_student_id)
  where english_student_id is not null;
-- the same person is not added twice to one group
create unique index if not exists subject_students_group_name_uq
  on public.subject_students (group_id, lower(btrim(name)))
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Lessons: one per group per day. The optional test of that day lives on the lesson row, so the
-- (group, date) uniqueness guarantees a test is never duplicated by refresh or repeated saves.
-- test_title / test_max are kept when has_test is switched off, so stored scores are never lost.
-- ---------------------------------------------------------------------------
create table if not exists public.subject_lessons (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject     text not null,
  group_id    uuid not null,
  lesson_date date not null,
  topic       text check (topic is null or char_length(btrim(topic)) between 1 and 300),
  homework    text check (homework is null or char_length(btrim(homework)) between 1 and 1000),
  has_test    boolean not null default false,
  test_title  text check (test_title is null or char_length(btrim(test_title)) between 1 and 120),
  test_max    integer check (test_max is null or test_max between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (group_id, subject) references public.subject_groups (id, subject) on delete restrict,
  unique (group_id, lesson_date),
  unique (id, group_id, subject),
  constraint subject_lessons_test_needs_max check (not has_test or test_max is not null)
);

create index if not exists subject_lessons_owner_idx on public.subject_lessons (owner_id);
create index if not exists subject_lessons_date_idx on public.subject_lessons (group_id, lesson_date desc);

-- ---------------------------------------------------------------------------
-- Per-student record for a lesson. NULL = not marked / not entered (never the same as absent,
-- not submitted or a score of 0).
-- ---------------------------------------------------------------------------
create table if not exists public.subject_records (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject    text not null,
  group_id   uuid not null,
  lesson_id  uuid not null,
  student_id uuid not null,
  attendance text check (attendance in ('present', 'absent')),
  homework   text check (homework in ('submitted', 'not_submitted', 'unchecked')),
  score      integer check (score is null or score >= 0),
  updated_at timestamptz not null default now(),
  -- lesson, student and record must agree on group AND subject (blocks cross-group / cross-subject rows)
  foreign key (lesson_id, group_id, subject)  references public.subject_lessons  (id, group_id, subject) on delete cascade,
  foreign key (student_id, group_id, subject) references public.subject_students (id, group_id, subject) on delete cascade,
  unique (lesson_id, student_id)
);

create index if not exists subject_records_owner_idx   on public.subject_records (owner_id);
create index if not exists subject_records_student_idx on public.subject_records (student_id);
create index if not exists subject_records_group_idx   on public.subject_records (group_id, lesson_id);

-- ---------------------------------------------------------------------------
-- Score <= maximum (cross-table rule, so it needs triggers)
-- ---------------------------------------------------------------------------
create or replace function public.subject_records_check_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  max_score integer;
begin
  if new.score is null then
    return new;
  end if;
  select test_max into max_score from public.subject_lessons where id = new.lesson_id;
  if max_score is null then
    raise exception 'Bu dars uchun maksimal ball belgilanmagan' using errcode = '23514';
  end if;
  if new.score > max_score then
    raise exception 'Ball (%) maksimal balldan (%) oshmasligi kerak', new.score, max_score using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists subject_records_score_ck on public.subject_records;
create trigger subject_records_score_ck
  before insert or update of score, lesson_id on public.subject_records
  for each row execute function public.subject_records_check_score();

create or replace function public.subject_lessons_check_max()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.test_max is distinct from old.test_max and exists (
    select 1 from public.subject_records
    where lesson_id = new.id and score is not null and (new.test_max is null or score > new.test_max)
  ) then
    raise exception 'Maksimal ball kiritilgan ballardan kichik bo''lishi mumkin emas' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subject_lessons_max_ck on public.subject_lessons;
create trigger subject_lessons_max_ck
  before update on public.subject_lessons
  for each row execute function public.subject_lessons_check_max();

-- ---------------------------------------------------------------------------
-- Row Level Security: same owner-only model as every existing table
-- ---------------------------------------------------------------------------
alter table public.subject_groups   enable row level security;
alter table public.subject_students enable row level security;
alter table public.subject_lessons  enable row level security;
alter table public.subject_records  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['subject_groups', 'subject_students', 'subject_lessons', 'subject_records'] loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$I', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$I
         for all to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

revoke all on public.subject_groups, public.subject_students, public.subject_lessons, public.subject_records from anon;
