-- Tutor Tracker — database schema
-- Run once in Supabase → SQL Editor → New query → paste → Run.
--
-- Security model: every row has an owner_id (default: the signed-in user).
-- Row Level Security lets a user read/write ONLY rows they own. Even if someone
-- else signs up, they see nothing. Still, turn off public sign-ups after you
-- create your own account (Authentication → Sign In / Providers → "Allow new users to sign up" off).

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  position    integer not null check (position > 0),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  created_at  timestamptz not null default now()
);

create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  topic_id    uuid references public.topics (id) on delete set null,
  topic_title text not null check (char_length(btrim(topic_title)) between 1 and 200),
  lesson_date date not null,
  attendance  text check (attendance in ('present', 'absent')),          -- null = not marked
  homework    text check (homework in ('full', 'partial', 'not_done')),  -- null = not graded
  result      text,                                                       -- legacy single status, unused
  created_at  timestamptz not null default now(),
  constraint lessons_has_mark check (attendance is not null or homework is not null),
  -- one record per student per day: marking again replaces (upsert), never duplicates
  unique (student_id, lesson_date)
);

create table if not exists public.lesson_plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  lesson_date date not null,
  homework    text not null check (char_length(btrim(homework)) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  unique (group_id, lesson_date)
);

-- Indexes for foreign keys, RLS owner checks and date-range queries
create index if not exists groups_owner_idx   on public.groups   (owner_id);
create index if not exists students_owner_idx on public.students (owner_id);
create index if not exists students_group_idx on public.students (group_id);
create index if not exists topics_owner_idx   on public.topics   (owner_id);
create index if not exists topics_student_idx on public.topics   (student_id, position);
create index if not exists lessons_owner_idx  on public.lessons  (owner_id);
create index if not exists lessons_topic_idx  on public.lessons  (topic_id);
create index if not exists lessons_date_idx   on public.lessons  (lesson_date);
create index if not exists lesson_plans_owner_idx on public.lesson_plans (owner_id);
create index if not exists lesson_plans_date_idx  on public.lesson_plans (group_id, lesson_date desc);

-- Row Level Security
alter table public.groups   enable row level security;
alter table public.students enable row level security;
alter table public.topics   enable row level security;
alter table public.lessons  enable row level security;
alter table public.lesson_plans enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['groups', 'students', 'topics', 'lessons', 'lesson_plans'] loop
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

-- Nothing is readable without signing in
revoke all on public.groups, public.students, public.topics, public.lessons, public.lesson_plans from anon;
