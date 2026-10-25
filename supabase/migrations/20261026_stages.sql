-- Bosqichlar (Education progression): faqat yangi jadvallar va funksiyalar (additive).
-- Mavjud jadvallarga (groups, students, lessons, ...) tegilmaydi. DROP/TRUNCATE yo'q.
--
-- STATUS: PREPARED, NOT EXECUTED. Run only after a verified backup.
-- Rollback: supabase/migrations/20261026_stages_rollback.sql
--
-- Dizayn (bitta haqiqat manbai, takrorlanuvchi ma'lumot yo'q):
--   curriculum_books               — o'quv dasturi (9 ta kitob), nomlar admin tomonidan tahrirlanadi
--   student_learning_progress      — o'quvchining joriy leveli va sozlamalari (qator yo'q = "belgilanmagan")
--   student_book_history           — har bir kitobda o'qish davri (started_on / finished_on). Joriy kitob =
--                                    finished_on IS NULL bo'lgan yagona qator. Boshlang'ich joylashuv = eng birinchi qator
--   student_group_transfer_history — guruh o'zgarishlari tarixi (kitob tarixidan mustaqil)
-- Atomik amallar: set_students_stage, finish_student_book, transfer_student (security invoker => RLS amal qiladi).

begin;

create table public.curriculum_books (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position        integer not null check (position between 1 and 9),
  title           text not null check (char_length(btrim(title)) between 1 and 80),
  level           text check (level in ('Starter','Beginner','Elementary','Pre-Intermediate','Intermediate','Upper-Intermediate','Advanced')),
  avg_weeks       integer check (avg_weeks between 1 and 156),
  planned_lessons integer check (planned_lessons between 1 and 1000),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- deferred so two books can swap positions inside one statement
  constraint curriculum_books_position_uq unique (owner_id, position) deferrable initially deferred
);

create table public.student_learning_progress (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id       uuid not null unique references public.students (id) on delete cascade,
  level            text check (level in ('Starter','Beginner','Elementary','Pre-Intermediate','Intermediate','Upper-Intermediate','Advanced')),
  lessons_per_week smallint check (lessons_per_week between 1 and 14),
  teacher_note     text check (teacher_note is null or char_length(btrim(teacher_note)) between 1 and 1000),
  next_goal        text check (next_goal is null or char_length(btrim(next_goal)) between 1 and 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.student_book_history (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  book_id     uuid not null references public.curriculum_books (id) on delete restrict,
  group_id    uuid references public.groups (id) on delete set null,   -- guruh o'sha paytdagi
  level       text check (level in ('Starter','Beginner','Elementary','Pre-Intermediate','Intermediate','Upper-Intermediate','Advanced')),
  started_on  date not null,
  finished_on date,
  outcome     text check (outcome in ('next', 'repeat', 'program_done')),
  created_at  timestamptz not null default now(),
  constraint book_history_finish_ck check ((finished_on is null) = (outcome is null)),
  constraint book_history_order_ck check (finished_on is null or finished_on >= started_on)
);
-- bitta o'quvchida bir vaqtda faqat bitta faol kitob (tasodifiy ikki marta yozishdan himoya)
create unique index student_book_history_one_active on public.student_book_history (student_id) where finished_on is null;

create table public.student_group_transfer_history (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  from_group_id  uuid references public.groups (id) on delete set null,
  to_group_id    uuid references public.groups (id) on delete set null,
  transferred_at timestamptz not null default now(),
  note           text check (note is null or char_length(btrim(note)) between 1 and 300)
);

create index curriculum_books_owner_idx on public.curriculum_books (owner_id);
create index learning_progress_owner_idx on public.student_learning_progress (owner_id);
create index book_history_owner_idx on public.student_book_history (owner_id);
create index book_history_student_idx on public.student_book_history (student_id, started_on);
create index book_history_book_idx on public.student_book_history (book_id);
create index book_history_group_idx on public.student_book_history (group_id);
create index group_transfer_owner_idx on public.student_group_transfer_history (owner_id);
create index group_transfer_student_idx on public.student_group_transfer_history (student_id, transferred_at desc);
create index group_transfer_from_idx on public.student_group_transfer_history (from_group_id);
create index group_transfer_to_idx on public.student_group_transfer_history (to_group_id);

-- Row Level Security: boshqa jadvallar bilan bir xil owner-only model
do $$
declare t text;
begin
  foreach t in array array['curriculum_books', 'student_learning_progress', 'student_book_history', 'student_group_transfer_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$I
         for all to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 1) Bosqichni belgilash (bir yoki bir nechta o'quvchi; har biriga alohida boshlanish sanasi mumkin)
create or replace function public.set_students_stage(
  p_students   uuid[],
  p_book       uuid,
  p_level      text,
  p_started_on date,
  p_dates      jsonb default '{}'::jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sid uuid;
  grp uuid;
  d date;
  hid uuid;
  cnt integer := 0;
begin
  if p_book is null or p_level is null or p_started_on is null then
    raise exception 'book, level and start date are required';
  end if;
  if not exists (select 1 from public.curriculum_books where id = p_book) then
    raise exception 'book not found';
  end if;
  foreach sid in array p_students loop
    select group_id into grp from public.students where id = sid;
    if not found then raise exception 'student % not found', sid; end if;
    d := coalesce((p_dates ->> sid::text)::date, p_started_on);

    select id into hid from public.student_book_history where student_id = sid and finished_on is null;
    if hid is null then
      if exists (select 1 from public.student_book_history where student_id = sid) then
        raise exception 'student % already has a finished program; cannot place again', sid;
      end if;
      insert into public.student_book_history (student_id, book_id, group_id, level, started_on)
      values (sid, p_book, grp, p_level, d);
    else
      -- tuzatish: faqat faol davr o'zgaradi, tugatilgan tarixga tegilmaydi
      update public.student_book_history
         set book_id = p_book, level = p_level, started_on = d
       where id = hid;
    end if;

    insert into public.student_learning_progress (student_id, level)
    values (sid, p_level)
    on conflict (student_id) do update set level = excluded.level, updated_at = now();
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- 2) Kitobni tugatish (atomik; ikki marta bosishdan himoyalangan)
create or replace function public.finish_student_book(
  p_history         uuid,
  p_finished_on     date,
  p_outcome         text,
  p_next_book       uuid default null,
  p_next_level      text default null,
  p_next_started_on date default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h public.student_book_history%rowtype;
  nb uuid;
  grp uuid;
  new_id uuid;
begin
  select * into h from public.student_book_history where id = p_history for update;
  if not found then raise exception 'history record not found'; end if;
  if h.finished_on is not null then raise exception 'book already finished'; end if;
  if p_outcome not in ('next', 'repeat', 'program_done') then raise exception 'invalid outcome'; end if;
  if p_finished_on is null or p_finished_on < h.started_on then raise exception 'finish date is before start date'; end if;
  if p_finished_on > current_date + 1 then raise exception 'finish date is in the future'; end if;

  update public.student_book_history set finished_on = p_finished_on, outcome = p_outcome where id = h.id;

  if p_outcome = 'program_done' then
    return null;
  end if;

  nb := case when p_outcome = 'repeat' then h.book_id else p_next_book end;
  if nb is null or not exists (select 1 from public.curriculum_books where id = nb) then
    raise exception 'next book is required';
  end if;
  if p_next_started_on is null or p_next_started_on < p_finished_on then
    raise exception 'next book start date is invalid';
  end if;

  select group_id into grp from public.students where id = h.student_id;
  insert into public.student_book_history (student_id, book_id, group_id, level, started_on)
  values (h.student_id, nb, grp, coalesce(p_next_level, h.level), p_next_started_on)
  returning id into new_id;

  if p_next_level is not null then
    insert into public.student_learning_progress (student_id, level)
    values (h.student_id, p_next_level)
    on conflict (student_id) do update set level = excluded.level, updated_at = now();
  end if;
  return new_id;
end $$;

-- 3) Guruhni o'zgartirish (kitob tugatishdan alohida amal; eski guruh tarixi saqlanadi)
create or replace function public.transfer_student(
  p_student uuid,
  p_group   uuid,
  p_note    text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur uuid;
  new_id uuid;
begin
  select group_id into cur from public.students where id = p_student for update;
  if not found then raise exception 'student not found'; end if;
  if cur = p_group then raise exception 'student is already in this group'; end if;
  if not exists (select 1 from public.groups where id = p_group and archived_at is null) then
    raise exception 'target group not found or archived';
  end if;
  insert into public.student_group_transfer_history (student_id, from_group_id, to_group_id, note)
  values (p_student, cur, p_group, nullif(btrim(p_note), ''))
  returning id into new_id;
  update public.students set group_id = p_group where id = p_student;
  return new_id;
end $$;

revoke all on function public.set_students_stage(uuid[], uuid, text, date, jsonb) from public, anon;
revoke all on function public.finish_student_book(uuid, date, text, uuid, text, date) from public, anon;
revoke all on function public.transfer_student(uuid, uuid, text) from public, anon;
grant execute on function public.set_students_stage(uuid[], uuid, text, date, jsonb) to authenticated;
grant execute on function public.finish_student_book(uuid, date, text, uuid, text, date) to authenticated;
grant execute on function public.transfer_student(uuid, uuid, text) to authenticated;

commit;
