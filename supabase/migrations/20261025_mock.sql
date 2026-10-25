-- Mock imtihonlari moduli: faqat yangi jadvallar (additive). Mavjud jadvallarga tegilmaydi.
--
-- STATUS: PREPARED, NOT EXECUTED. Run only after the owner approves.
-- Rollback: supabase/migrations/20261025_mock_rollback.sql
--
-- Dizayn:
--   mocks                 — bitta imtihon (group_id orqali guruhga bog'langan)
--   mock_sections         — imtihon bo'limlari (nom + savollar soni)
--   mock_student_results  — o'quvchining shu mockdagi qatnashuvi va to'lovi (mock yaratilganda
--                           guruh tarkibi shu yerga "muzlatiladi": keyin o'quvchi boshqa guruhga
--                           o'tsa ham tarixiy natija joyida qoladi)
--   mock_section_scores   — bo'lim bo'yicha to'g'ri javoblar (qator yo'q = kiritilmagan, 0 = haqiqiy nol)
-- Kundalik davomat (lessons) bilan hech qanday bog'liqlik yo'q.

begin;

create table public.mocks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  mock_date    date not null,
  status       text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint mocks_completed_at_ck check ((status = 'completed') = (completed_at is not null))
);

create table public.mock_sections (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mock_id         uuid not null references public.mocks (id) on delete cascade,
  position        integer not null check (position > 0),
  name            text not null check (char_length(btrim(name)) between 1 and 40),
  total_questions integer not null check (total_questions between 1 and 1000),
  unique (mock_id, position)
);
create unique index mock_sections_name_uq on public.mock_sections (mock_id, lower(btrim(name)));

create table public.mock_student_results (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mock_id    uuid not null references public.mocks (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attendance text check (attendance in ('present', 'absent')),  -- null = belgilanmagan
  payment    text check (payment in ('paid', 'unpaid')),        -- null = belgilanmagan
  unique (mock_id, student_id)
);

create table public.mock_section_scores (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  result_id uuid not null references public.mock_student_results (id) on delete cascade,
  section_id uuid not null references public.mock_sections (id) on delete cascade,
  correct   integer not null check (correct >= 0),
  unique (result_id, section_id)
);

-- Cross-table integrity: the section must belong to the same mock as the result,
-- and the score may not exceed the section's question count.
create or replace function public.mock_score_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sec_mock uuid;
  sec_total integer;
  res_mock uuid;
begin
  select mock_id, total_questions into sec_mock, sec_total from public.mock_sections where id = new.section_id;
  select mock_id into res_mock from public.mock_student_results where id = new.result_id;
  if sec_mock is null or res_mock is null or sec_mock <> res_mock then
    raise exception 'section and result belong to different mocks';
  end if;
  if new.correct > sec_total then
    raise exception 'score % exceeds section total %', new.correct, sec_total;
  end if;
  return new;
end $$;

create trigger mock_section_scores_guard
  before insert or update on public.mock_section_scores
  for each row execute function public.mock_score_guard();

-- Indexes (FKs, RLS owner checks, history list)
create index mocks_owner_idx       on public.mocks (owner_id);
create index mocks_group_date_idx  on public.mocks (group_id, mock_date desc);
create index mock_sections_owner_idx on public.mock_sections (owner_id);
create index mock_results_owner_idx  on public.mock_student_results (owner_id);
create index mock_results_student_idx on public.mock_student_results (student_id);
create index mock_scores_owner_idx   on public.mock_section_scores (owner_id);
create index mock_scores_section_idx on public.mock_section_scores (section_id);

-- Row Level Security: same owner-only model as the rest of the app
do $$
declare t text;
begin
  foreach t in array array['mocks', 'mock_sections', 'mock_student_results', 'mock_section_scores'] loop
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

commit;

-- Verification (mavjud ma'lumotlar o'zgarmaganini tekshirish):
--   select count(*) from public.groups; select count(*) from public.students; select count(*) from public.lessons;
