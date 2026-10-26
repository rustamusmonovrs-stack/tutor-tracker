-- Ark Progress: Smart Homework + Nazorat ro'yxati (additive).
-- Only NEW tables / functions. No existing table is altered, dropped or truncated.
-- Legacy lessons.homework and lesson_plans.homework are untouched and keep scoring as before.
-- Coins: still derived (nothing stored as a balance). Each assessment exposes coins (1 when 'full') and
-- rewarded_on; the app adds them to the existing ranking next to lesson coins.
-- Rollback: 20261028_smart_homework_rollback.sql
begin;

-- helper: today's calendar day in Tashkent
create or replace function public.today_tk() returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Tashkent')::date $$;

create table public.homework_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  lesson_date date not null,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  due_date    date,
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  check (due_date is null or due_date >= lesson_date)
);
create index homework_tasks_owner_idx on public.homework_tasks (owner_id);
create index homework_tasks_group_date_idx on public.homework_tasks (group_id, lesson_date);

create table public.student_task_assignments (
  task_id     uuid not null references public.homework_tasks (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, student_id)
);
create index sta_student_idx on public.student_task_assignments (student_id);
create index sta_owner_idx on public.student_task_assignments (owner_id);

create table public.student_task_assessments (
  task_id          uuid not null,
  student_id       uuid not null,
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status           text not null check (status in ('full', 'partial', 'not_done')),
  coins            smallint generated always as (case when status = 'full' then 1 else 0 end) stored,
  graded_at        timestamptz not null default now(),
  rewarded_on      date,
  completed_late   boolean not null default false,
  original_status  text check (original_status in ('partial', 'not_done')),
  original_graded_at timestamptz,
  primary key (task_id, student_id),
  foreign key (task_id, student_id) references public.student_task_assignments (task_id, student_id) on delete cascade,
  check ((status = 'full') = (rewarded_on is not null))
);
create index stas_student_idx on public.student_task_assessments (student_id);
create index stas_owner_idx on public.student_task_assessments (owner_id);

create table public.homework_task_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id     uuid not null references public.homework_tasks (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  kind        text not null,
  from_status text,
  to_status   text,
  at          timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb
);
create index hte_student_idx on public.homework_task_events (student_id, at desc);
create index hte_owner_idx on public.homework_task_events (owner_id);

create table public.homework_watch_cases (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.groups (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'resolved')),
  task_ids         uuid[] not null default '{}',
  opened_at        timestamptz not null default now(),
  last_activity_on date not null default public.today_tk(),
  resolved_at      timestamptz,
  resolve_reason   text check (resolve_reason in ('completed', 'corrected')),
  check ((status = 'resolved') = (resolved_at is not null))
);
create unique index homework_watch_one_active on public.homework_watch_cases (student_id) where status = 'active';
create index hwc_owner_idx on public.homework_watch_cases (owner_id);

create table public.homework_watch_case_events (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  case_id  uuid not null references public.homework_watch_cases (id) on delete cascade,
  kind     text not null,
  at       timestamptz not null default now(),
  meta     jsonb not null default '{}'::jsonb
);
create index hwce_case_idx on public.homework_watch_case_events (case_id, at);
create index hwce_owner_idx on public.homework_watch_case_events (owner_id);

create table public.homework_watch_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  author_id  uuid not null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index hwn_student_idx on public.homework_watch_notes (student_id, created_at desc);
create index hwn_owner_idx on public.homework_watch_notes (owner_id);

-- Graded tasks can never be deleted directly (archive instead).
create function public.homework_tasks_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.student_task_assessments where task_id = old.id) then
    raise exception 'graded task cannot be deleted; archive it instead';
  end if;
  return old;
end $$;
create trigger homework_tasks_no_delete_graded before delete on public.homework_tasks
  for each row execute function public.homework_tasks_guard();

-- RLS: owner only (same model as every other table)
do $$
declare t text;
begin
  foreach t in array array['homework_tasks','student_task_assignments','student_task_assessments','homework_task_events',
                           'homework_watch_cases','homework_watch_case_events','homework_watch_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "%1$s_owner_all" on public.%1$I for all to authenticated
                    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Watch-case recomputation (derived from real task records; the case table only stores status/history).
-- A lesson (task.lesson_date for the student's current group) is "missed" when every counted task is graded
-- and every one is 'not_done'. 'ok' = fully graded with at least one full/partial. Everything else
-- (ungraded work, student absent, mock day, no tasks) is neutral and skipped. Two or more missed lessons
-- in a row at the end of the sequence open a case. A case closes when all its causing tasks are 'full'.
create function public.recompute_watch(p_student uuid) returns void language plpgsql set search_path = '' as $$
declare
  stu record; today date := public.today_tk();
  r record; run_len int := 0; run_tasks uuid[] := '{}';
  c record; ids uuid[]; present_n int; full_n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_student::text));
  select id, group_id into stu from public.students where id = p_student;
  if not found then return; end if;

  for r in
    with counted as (
      select t.id, t.lesson_date, a.status
      from public.student_task_assignments sa
      join public.homework_tasks t on t.id = sa.task_id and t.group_id = stu.group_id
      left join public.student_task_assessments a on a.task_id = t.id and a.student_id = sa.student_id
      where sa.student_id = p_student
        and (a.status is not null or (t.archived_at is null and (t.due_date is null or t.due_date <= today)))
        and (t.archived_at is null or a.status is not null)
    )
    select cn.lesson_date,
           count(*) n, count(status) graded,
           count(*) filter (where status = 'not_done') nd,
           array_agg(id) filter (where status = 'not_done') nd_ids
    from counted cn
    where not exists (select 1 from public.lessons l where l.student_id = p_student and l.lesson_date = cn.lesson_date and l.attendance = 'absent')
      and not exists (select 1 from public.mocks m where m.group_id = stu.group_id and m.mock_date = cn.lesson_date)
    group by cn.lesson_date
    order by cn.lesson_date desc
  loop
    if r.graded < r.n then continue; end if;           -- ungraded: neutral
    if r.nd = r.n then run_len := run_len + 1; run_tasks := run_tasks || r.nd_ids;
    else exit; end if;                                 -- any full/partial lesson ends the run
  end loop;

  select * into c from public.homework_watch_cases where student_id = p_student and status = 'active';
  if not found then
    if run_len >= 2 then
      insert into public.homework_watch_cases (student_id, group_id, task_ids) values (p_student, stu.group_id, run_tasks)
      returning * into c;
      insert into public.homework_watch_case_events (case_id, kind, meta) values (c.id, 'opened', jsonb_build_object('lessons', run_len, 'tasks', cardinality(run_tasks)));
    end if;
    return;
  end if;

  ids := array(select distinct x from unnest(c.task_ids || run_tasks) x);
  select count(*), count(*) filter (where a.status = 'full') into present_n, full_n
  from public.student_task_assessments a where a.student_id = p_student and a.task_id = any(ids);
  if present_n = 0 or full_n = present_n then
    update public.homework_watch_cases set status = 'resolved', resolved_at = now(), task_ids = ids,
      resolve_reason = case when present_n = 0 then 'corrected' else 'completed' end, last_activity_on = today
    where id = c.id;
    insert into public.homework_watch_case_events (case_id, kind, meta)
    values (c.id, 'resolved', jsonb_build_object('reason', case when present_n = 0 then 'corrected' else 'completed' end));
  elsif ids is distinct from c.task_ids then
    update public.homework_watch_cases set task_ids = ids, last_activity_on = today where id = c.id;
    insert into public.homework_watch_case_events (case_id, kind, meta) values (c.id, 'updated', jsonb_build_object('tasks', cardinality(ids)));
  end if;
end $$;

-- Re-evaluate every student that has tasks (idempotent; the app calls it on load and after attendance edits).
create function public.refresh_watch_cases() returns integer language plpgsql set search_path = '' as $$
declare s uuid; n int := 0;
begin
  for s in select distinct student_id from public.student_task_assignments
           union select student_id from public.homework_watch_cases where status = 'active' loop
    perform public.recompute_watch(s); n := n + 1;
  end loop;
  return n;
end $$;

-- Core grading step. p_status null clears the grade. Idempotent: same status again changes nothing.
create function public._apply_grade(p_task uuid, p_student uuid, p_status text, p_late boolean, p_kind text, p_rewarded date default null)
returns jsonb language plpgsql set search_path = '' as $$
declare t record; prev record; today date := public.today_tk(); rew date; had boolean;
begin
  if p_status is not null and p_status not in ('full', 'partial', 'not_done') then raise exception 'invalid status'; end if;
  select * into t from public.homework_tasks where id = p_task;
  if not found then raise exception 'task not found'; end if;
  if not exists (select 1 from public.student_task_assignments where task_id = p_task and student_id = p_student) then
    raise exception 'student is not assigned to this task';
  end if;
  select * into prev from public.student_task_assessments where task_id = p_task and student_id = p_student for update;
  had := found;

  if p_status is null then
    if had then
      delete from public.student_task_assessments where task_id = p_task and student_id = p_student;
      insert into public.homework_task_events (task_id, student_id, kind, from_status, to_status) values (p_task, p_student, p_kind, prev.status, null);
    end if;
  elsif had and prev.status = p_status then
    null;
  else
    rew := case when p_status <> 'full' then null
                when p_rewarded is not null then p_rewarded
                when p_late then today
                else t.lesson_date end;
    insert into public.student_task_assessments (task_id, student_id, status, rewarded_on, completed_late, original_status, original_graded_at)
    values (p_task, p_student, p_status, rew, p_late and p_status = 'full', null, null)
    on conflict (task_id, student_id) do update set
      status = excluded.status, graded_at = now(), rewarded_on = excluded.rewarded_on,
      completed_late = (excluded.completed_late or (p_status = 'full' and public.student_task_assessments.completed_late and public.student_task_assessments.status = 'full')),
      original_status = coalesce(public.student_task_assessments.original_status,
                                 case when public.student_task_assessments.status <> 'full' then public.student_task_assessments.status end),
      original_graded_at = coalesce(public.student_task_assessments.original_graded_at,
                                    case when public.student_task_assessments.status <> 'full' then public.student_task_assessments.graded_at end);
    insert into public.homework_task_events (task_id, student_id, kind, from_status, to_status, meta)
    values (p_task, p_student, p_kind, case when had then prev.status end, p_status, jsonb_build_object('late', p_late));
  end if;
  perform public.recompute_watch(p_student);
  return jsonb_build_object('task', p_task, 'student', p_student, 'status', p_status, 'coins', case when p_status = 'full' then 1 else 0 end);
end $$;

create function public.grade_task(p_task uuid, p_student uuid, p_status text, p_late boolean default false)
returns jsonb language sql set search_path = '' as $$
  select public._apply_grade(p_task, p_student, p_status, coalesce(p_late, false), case when coalesce(p_late, false) then 'late_completed' else 'graded' end)
$$;

create function public.assign_task(p_task uuid, p_students uuid[] default null)
returns integer language plpgsql set search_path = '' as $$
declare t record; n int := 0; s uuid; ins int;
begin
  select * into t from public.homework_tasks where id = p_task;
  if not found then raise exception 'task not found'; end if;
  if t.archived_at is not null then raise exception 'task is archived'; end if;
  for s in select st.id from public.students st
           where st.group_id = t.group_id and st.archived_at is null
             and (p_students is null or st.id = any(p_students)) loop
    insert into public.student_task_assignments (task_id, student_id) values (p_task, s) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then
      insert into public.homework_task_events (task_id, student_id, kind) values (p_task, s, 'assigned');
      n := n + 1;
      perform public.recompute_watch(s);
    end if;
  end loop;
  return n;
end $$;

create function public.unassign_task(p_task uuid, p_student uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.student_task_assessments where task_id = p_task and student_id = p_student) then
    raise exception 'graded assignment cannot be removed; clear the grade first';
  end if;
  delete from public.student_task_assignments where task_id = p_task and student_id = p_student;
  insert into public.homework_task_events (task_id, student_id, kind) values (p_task, p_student, 'unassigned');
  perform public.recompute_watch(p_student);
end $$;

-- "Barchasi bajardi": mark assigned students 'full' for one task, or every task of a group's lesson day.
-- Never assigns. Existing individual grades are kept unless p_overwrite. p_dry only counts.
create function public.grade_tasks_bulk(p_group uuid, p_date date, p_task uuid default null, p_overwrite boolean default false, p_dry boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare r record; set_n int := 0; ow_n int := 0; keep_n int := 0; prevs jsonb := '[]'::jsonb;
begin
  for r in
    select sa.task_id, sa.student_id, a.status as prev, a.rewarded_on as prev_rew, a.completed_late as prev_late
    from public.homework_tasks t
    join public.student_task_assignments sa on sa.task_id = t.id
    join public.students st on st.id = sa.student_id and st.archived_at is null
    left join public.student_task_assessments a on a.task_id = sa.task_id and a.student_id = sa.student_id
    where t.group_id = p_group and t.lesson_date = p_date and t.archived_at is null and (p_task is null or t.id = p_task)
    order by sa.task_id, sa.student_id
  loop
    if r.prev = 'full' then keep_n := keep_n + 1; continue; end if;
    if r.prev is not null and not p_overwrite then keep_n := keep_n + 1; continue; end if;
    if r.prev is null then set_n := set_n + 1; else ow_n := ow_n + 1; end if;
    if not p_dry then
      prevs := prevs || jsonb_build_object('t', r.task_id, 's', r.student_id, 'p', r.prev, 'r', r.prev_rew, 'l', r.prev_late);
      perform public._apply_grade(r.task_id, r.student_id, 'full', false, 'bulk_full');
    end if;
  end loop;
  return jsonb_build_object('set', set_n, 'overwritten', ow_n, 'kept', keep_n, 'previous', prevs, 'dry', p_dry);
end $$;

-- Undo for the bulk action (items = 'previous' array from grade_tasks_bulk).
create function public.restore_assessments(p_items jsonb)
returns integer language plpgsql set search_path = '' as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    perform public._apply_grade((it ->> 't')::uuid, (it ->> 's')::uuid, it ->> 'p', false, 'undo', nullif(it ->> 'r', '')::date);
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.today_tk() to authenticated;
grant execute on function public.refresh_watch_cases() to authenticated;
grant execute on function public.grade_task(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.assign_task(uuid, uuid[]) to authenticated;
grant execute on function public.unassign_task(uuid, uuid) to authenticated;
grant execute on function public.grade_tasks_bulk(uuid, date, uuid, boolean, boolean) to authenticated;
grant execute on function public.restore_assessments(jsonb) to authenticated;
revoke execute on function public.recompute_watch(uuid) from public, anon;
revoke execute on function public._apply_grade(uuid, uuid, text, boolean, text, date) from public, anon;
revoke execute on function public.refresh_watch_cases() from public, anon;
revoke execute on function public.grade_task(uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.assign_task(uuid, uuid[]) from public, anon;
revoke execute on function public.unassign_task(uuid, uuid) from public, anon;
revoke execute on function public.grade_tasks_bulk(uuid, date, uuid, boolean, boolean) from public, anon;
revoke execute on function public.restore_assessments(jsonb) from public, anon;
grant execute on function public.recompute_watch(uuid) to authenticated;
grant execute on function public._apply_grade(uuid, uuid, text, boolean, text, date) to authenticated;

commit;
