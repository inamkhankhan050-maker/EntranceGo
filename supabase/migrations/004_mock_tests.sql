-- 004: Full mock tests (courses, admin-configured mocks, secure attempts, per-student question history).
--
-- Security model
--   * Guests may read published courses, mocks and their section layout (descriptions, counts, duration).
--   * Students never write the mock tables directly: every write goes through the SECURITY DEFINER
--     functions below, which check auth.uid() and ownership. Table grants for students are SELECT only,
--     and RLS limits that SELECT to the student's own rows.
--   * Scores are computed in the database at submit time, never trusted from the browser.
--   * Admins (public.is_admin()) can read every attempt and configure courses and mocks.

-- ---------------------------------------------------------------- courses
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  description text,
  status      text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

-- Strict course-specific question bank: a question is eligible for a course's mocks only when linked here.
create table if not exists public.course_questions (
  course_id   uuid not null references public.courses(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, question_id)
);
create index if not exists course_questions_q_idx on public.course_questions (question_id);

-- ---------------------------------------------------------------- mock configuration
create table if not exists public.mock_tests (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete restrict,
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null check (length(trim(title)) > 0),
  description        text,
  instructions       text,
  total_questions    int  not null default 0 check (total_questions between 0 and 1000),
  duration_minutes   int  not null default 60 check (duration_minutes between 1 and 600),
  marks_per_question numeric(6,2) not null default 1 check (marks_per_question > 0),
  negative_marks     numeric(6,2) not null default 0 check (negative_marks >= 0),
  -- Difficulty distribution in percent; all three null = no preference.
  pct_easy           int check (pct_easy between 0 and 100),
  pct_medium         int check (pct_medium between 0 and 100),
  pct_hard           int check (pct_hard between 0 and 100),
  available_from     timestamptz,
  available_until    timestamptz,
  max_attempts       int check (max_attempts is null or max_attempts between 1 and 1000),
  -- Default policy: prefer unattempted questions, reuse only when the eligible pool is exhausted.
  prefer_unattempted boolean not null default true,
  status             text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  check ((pct_easy is null and pct_medium is null and pct_hard is null)
      or (pct_easy is not null and pct_medium is not null and pct_hard is not null and pct_easy + pct_medium + pct_hard = 100)),
  check (available_from is null or available_until is null or available_from < available_until)
);
create index if not exists mock_tests_course_idx on public.mock_tests (course_id, status);

create table if not exists public.mock_test_sections (
  id             uuid primary key default gen_random_uuid(),
  mock_id        uuid not null references public.mock_tests(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete restrict,
  question_count int  not null check (question_count between 1 and 500),
  position       int  not null default 0,
  unique (mock_id, subject_id)
);

-- ---------------------------------------------------------------- attempts
create table if not exists public.mock_attempts (
  id                 uuid primary key default gen_random_uuid(),   -- random, not guessable
  user_id            uuid not null references auth.users(id) on delete cascade,
  mock_id            uuid not null references public.mock_tests(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  attempt_no         int  not null,
  status             text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  submitted_at       timestamptz,
  total_questions    int  not null,
  marks_per_question numeric(6,2) not null,
  negative_marks     numeric(6,2) not null,
  reused_count       int  not null default 0,
  correct            int,
  incorrect          int,
  unanswered         int,
  score              numeric(8,2),
  max_score          numeric(8,2),
  duration_seconds   int
);
create index if not exists mock_attempts_user_idx on public.mock_attempts (user_id, started_at desc);
create index if not exists mock_attempts_mock_idx on public.mock_attempts (mock_id, started_at desc);
create unique index if not exists mock_attempts_one_active on public.mock_attempts (user_id, mock_id) where status = 'in_progress';

-- The exact questions chosen for an attempt, frozen for the whole attempt.
create table if not exists public.mock_attempt_questions (
  attempt_id    uuid not null references public.mock_attempts(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete restrict,
  subject_id    uuid not null,
  topic_id      uuid,
  difficulty    text not null,
  position      int  not null,
  was_reused    boolean not null default false,
  chosen_option char(1) check (chosen_option in ('A','B','C','D')),
  answered_at   timestamptz,
  is_correct    boolean,
  primary key (attempt_id, question_id),     -- no duplicate question inside one attempt
  unique (attempt_id, position)
);

-- A question counts as attempted only after the student SUBMITTED an answer to it. Per student, per course.
create table if not exists public.student_question_history (
  user_id           uuid not null references auth.users(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  question_id       uuid not null references public.questions(id) on delete cascade,
  first_answered_at timestamptz not null default now(),
  last_answered_at  timestamptz not null default now(),
  times_answered    int not null default 1,
  primary key (user_id, course_id, question_id)
);

-- ---------------------------------------------------------------- timestamps
do $$
declare t text;
begin
  foreach t in array array['courses','mock_tests'] loop
    execute format('drop trigger if exists %I_ts on public.%I', t, t);
    execute format('create trigger %I_ts before insert or update on public.%I
                    for each row execute function public.tg_set_timestamps()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.courses                  enable row level security;
alter table public.course_questions         enable row level security;
alter table public.mock_tests               enable row level security;
alter table public.mock_test_sections       enable row level security;
alter table public.mock_attempts            enable row level security;
alter table public.mock_attempt_questions   enable row level security;
alter table public.student_question_history enable row level security;

create or replace function public.course_is_public(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = cid and c.status = 'published');
$$;
create or replace function public.mock_is_public(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mock_tests m join public.courses c on c.id = m.course_id
                 where m.id = mid and m.status = 'published' and c.status = 'published');
$$;
grant execute on function public.course_is_public(uuid), public.mock_is_public(uuid) to anon, authenticated;

drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select using (status = 'published' or public.is_admin());
drop policy if exists courses_admin on public.courses;
create policy courses_admin on public.courses for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists course_questions_read on public.course_questions;
create policy course_questions_read on public.course_questions for select using (public.is_admin());
drop policy if exists course_questions_admin on public.course_questions;
create policy course_questions_admin on public.course_questions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists mock_tests_read on public.mock_tests;
create policy mock_tests_read on public.mock_tests for select
  using ((status = 'published' and public.course_is_public(course_id)) or public.is_admin());
drop policy if exists mock_tests_admin on public.mock_tests;
create policy mock_tests_admin on public.mock_tests for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists mock_sections_read on public.mock_test_sections;
create policy mock_sections_read on public.mock_test_sections for select using (public.mock_is_public(mock_id) or public.is_admin());
drop policy if exists mock_sections_admin on public.mock_test_sections;
create policy mock_sections_admin on public.mock_test_sections for all using (public.is_admin()) with check (public.is_admin());

-- Students: read own attempts only. No insert/update/delete policies -> only the functions below write.
drop policy if exists mock_attempts_read on public.mock_attempts;
create policy mock_attempts_read on public.mock_attempts for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists mock_attempt_questions_read on public.mock_attempt_questions;
create policy mock_attempt_questions_read on public.mock_attempt_questions for select
  using (public.is_admin() or exists (select 1 from public.mock_attempts a where a.id = attempt_id and a.user_id = auth.uid()));

drop policy if exists sqh_read on public.student_question_history;
create policy sqh_read on public.student_question_history for select using (user_id = auth.uid() or public.is_admin());

grant select on public.courses, public.mock_tests, public.mock_test_sections to anon, authenticated;
grant select, insert, update, delete on public.courses, public.course_questions, public.mock_tests, public.mock_test_sections to authenticated;
grant select on public.course_questions, public.mock_attempts, public.mock_attempt_questions, public.student_question_history to authenticated;
revoke insert, update, delete on public.mock_attempts, public.mock_attempt_questions, public.student_question_history from anon, authenticated;

-- Public count of eligible (published, course-linked) questions per subject, so guests see real sizes
-- and admins see whether a section can be filled. Returns counts only, never questions.
create or replace function public.course_pool_counts(p_course uuid)
returns table (subject_id uuid, difficulty text, n bigint)
language sql stable security definer set search_path = public as $$
  select q.subject_id, q.difficulty, count(*)
  from public.course_questions cq
  join public.questions q on q.id = cq.question_id
  where cq.course_id = p_course
    and (public.course_is_public(p_course) or public.is_admin())
    and q.status = 'published' and public.subject_is_public(q.subject_id) and public.topic_is_public(q.topic_id)
  group by q.subject_id, q.difficulty;
$$;
grant execute on function public.course_pool_counts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- internal: finalize an attempt
create or replace function public._mock_finalize(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.mock_attempts;
begin
  select * into a from public.mock_attempts where id = p_attempt for update;
  if not found or a.status <> 'in_progress' then return; end if;

  update public.mock_attempt_questions maq
     set is_correct = case when maq.chosen_option is null then null else maq.chosen_option = q.correct_option end
    from public.questions q
   where maq.attempt_id = p_attempt and q.id = maq.question_id;

  update public.mock_attempts m set
    status = 'submitted',
    submitted_at = now(),
    correct    = s.c, incorrect = s.i, unanswered = s.u,
    score      = round(s.c * m.marks_per_question - s.i * m.negative_marks, 2),
    max_score  = round(m.total_questions * m.marks_per_question, 2),
    duration_seconds = greatest(0, extract(epoch from (least(now(), m.expires_at) - m.started_at))::int)
  from (select count(*) filter (where is_correct)          as c,
               count(*) filter (where is_correct = false)  as i,
               count(*) filter (where chosen_option is null) as u
          from public.mock_attempt_questions where attempt_id = p_attempt) s
  where m.id = p_attempt;

  -- Only questions the student actually answered become "attempted".
  insert into public.student_question_history as h (user_id, course_id, question_id)
  select a.user_id, a.course_id, maq.question_id
    from public.mock_attempt_questions maq
   where maq.attempt_id = p_attempt and maq.chosen_option is not null
  on conflict (user_id, course_id, question_id) do update
    set last_answered_at = now(), times_answered = h.times_answered + 1;
end $$;
revoke all on function public._mock_finalize(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- start (or resume) a mock
create or replace function public.start_mock(p_mock uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m public.mock_tests;
  a_id uuid;
  used int;
  sec record;
  sec_total int;
  pos int := 0;
  got int;
  avail int;
  t_easy int; t_med int; t_hard int;
begin
  if uid is null then
    raise exception 'Please sign in or register to start this mock test.' using errcode = '28000';
  end if;

  select * into m from public.mock_tests where id = p_mock;
  if not found or m.status <> 'published' or not public.course_is_public(m.course_id) then
    raise exception 'This mock test is not available.' using errcode = 'P0002';
  end if;
  if m.available_from is not null and now() < m.available_from then
    raise exception 'This mock test opens on %.', to_char(m.available_from at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') using errcode = 'P0001';
  end if;
  if m.available_until is not null and now() > m.available_until then
    raise exception 'This mock test closed on %.', to_char(m.available_until at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') using errcode = 'P0001';
  end if;

  -- One start at a time per student and mock.
  perform pg_advisory_xact_lock(hashtext('mock:' || uid::text || ':' || p_mock::text));

  -- Resume an unfinished attempt; an expired one is submitted with the answers already saved.
  select id into a_id from public.mock_attempts
   where user_id = uid and mock_id = p_mock and status = 'in_progress' limit 1;
  if a_id is not null then
    if (select expires_at from public.mock_attempts where id = a_id) > now() then return a_id; end if;
    perform public._mock_finalize(a_id);
  end if;

  select count(*) into used from public.mock_attempts where user_id = uid and mock_id = p_mock;
  if m.max_attempts is not null and used >= m.max_attempts then
    raise exception 'You have used all % attempt(s) allowed for this mock test.', m.max_attempts using errcode = 'P0001';
  end if;

  select coalesce(sum(question_count), 0) into sec_total from public.mock_test_sections where mock_id = p_mock;
  if sec_total = 0 or sec_total <> m.total_questions then
    raise exception 'This mock test is not configured correctly yet. Please try again later.' using errcode = 'P0001';
  end if;

  insert into public.mock_attempts (user_id, mock_id, course_id, attempt_no, expires_at, total_questions, marks_per_question, negative_marks)
  values (uid, p_mock, m.course_id, used + 1, now() + make_interval(mins => m.duration_minutes), m.total_questions, m.marks_per_question, m.negative_marks)
  returning id into a_id;

  for sec in select s.*, sub.name as subject_name from public.mock_test_sections s join public.subjects sub on sub.id = s.subject_id
             where s.mock_id = p_mock order by s.position, sub.name loop
    -- Difficulty targets for this section (soft preference, applied inside each repetition tier).
    if m.pct_easy is null then
      t_easy := sec.question_count; t_med := sec.question_count; t_hard := sec.question_count;
    else
      t_easy := round(sec.question_count * m.pct_easy / 100.0);
      t_hard := round(sec.question_count * m.pct_hard / 100.0);
      t_med  := greatest(0, sec.question_count - t_easy - t_hard);
    end if;

    with eligible as (
      select q.id, q.subject_id, q.topic_id, q.difficulty,
             case when m.prefer_unattempted and exists (
                    select 1 from public.student_question_history h
                     where h.user_id = uid and h.course_id = m.course_id and h.question_id = q.id)
                  then 1 else 0 end as tier
        from public.course_questions cq
        join public.questions q on q.id = cq.question_id
       where cq.course_id = m.course_id
         and q.subject_id = sec.subject_id                        -- this section's subject only
         and q.status = 'published'
         and public.subject_is_public(q.subject_id)
         and public.topic_is_public(q.topic_id)
    ), ranked as (
      select e.*, row_number() over (partition by e.tier, e.difficulty order by random()) as rn_d
        from eligible e
    ), picked as (
      select r.* from ranked r
       order by r.tier,                                             -- 1) unattempted first
                case when r.rn_d <= case r.difficulty when 'easy' then t_easy when 'hard' then t_hard else t_med end
                     then 0 else 1 end,                             -- 2) difficulty mix
                random()                                            -- 3) random among equals
       limit sec.question_count
    )
    insert into public.mock_attempt_questions (attempt_id, question_id, subject_id, topic_id, difficulty, position, was_reused)
    select a_id, p.id, p.subject_id, p.topic_id, p.difficulty, pos + row_number() over (order by random()), p.tier = 1
      from picked p;
    get diagnostics got = row_count;

    if got < sec.question_count then
      select count(*) into avail from public.course_questions cq join public.questions q on q.id = cq.question_id
       where cq.course_id = m.course_id and q.subject_id = sec.subject_id and q.status = 'published';
      raise exception 'Not enough questions in % for this mock (needs %, the question bank has %).', sec.subject_name, sec.question_count, avail
        using errcode = 'P0001';
    end if;
    pos := pos + got;
  end loop;

  update public.mock_attempts set reused_count = (select count(*) from public.mock_attempt_questions where attempt_id = a_id and was_reused)
   where id = a_id;
  return a_id;
end $$;
revoke all on function public.start_mock(uuid) from public, anon;
grant execute on function public.start_mock(uuid) to authenticated;

-- ---------------------------------------------------------------- read one attempt (owner or admin)
-- Correct answers and explanations are returned only after the attempt is submitted.
create or replace function public.get_mock_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a public.mock_attempts; adm boolean := public.is_admin(); done boolean; res jsonb;
begin
  if uid is null then raise exception 'Please sign in to view this result.' using errcode = '28000'; end if;
  select * into a from public.mock_attempts where id = p_attempt;
  if not found or (a.user_id <> uid and not adm) then
    raise exception 'Result not found.' using errcode = 'P0002';     -- same message whether it exists or not
  end if;
  if a.status = 'in_progress' and a.expires_at + interval '2 minutes' < now() and a.user_id = uid then
    perform public._mock_finalize(a.id);
    select * into a from public.mock_attempts where id = p_attempt;
  end if;
  done := a.status = 'submitted';

  select jsonb_build_object(
    'attempt', to_jsonb(a) || jsonb_build_object('server_now', now()),
    'mock', (select jsonb_build_object('id', m.id, 'slug', m.slug, 'title', m.title, 'instructions', m.instructions,
                                       'duration_minutes', m.duration_minutes, 'max_attempts', m.max_attempts)
               from public.mock_tests m where m.id = a.mock_id),
    'course', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) from public.courses c where c.id = a.course_id),
    'student', (select jsonb_build_object('name', coalesce(p.full_name, u.raw_user_meta_data->>'full_name'), 'email', u.email)
                  from auth.users u left join public.student_profiles p on p.user_id = u.id where u.id = a.user_id),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'position', maq.position, 'subject_id', maq.subject_id, 'subject', s.name,
               'topic_id', maq.topic_id, 'topic', t.name, 'difficulty', maq.difficulty,
               'question', q.question, 'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
               'image_url', q.image_url, 'chosen_option', maq.chosen_option, 'was_reused', maq.was_reused,
               'correct_option', case when done then q.correct_option end,
               'explanation',    case when done then q.explanation end,
               'is_correct',     case when done then maq.is_correct end)
             order by maq.position)
        from public.mock_attempt_questions maq
        join public.questions q on q.id = maq.question_id
        join public.subjects s on s.id = maq.subject_id
        left join public.topics t on t.id = maq.topic_id
       where maq.attempt_id = a.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.get_mock_attempt(uuid) from public, anon;
grant execute on function public.get_mock_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------- save one answer while the timer runs
create or replace function public.save_mock_answer(p_attempt uuid, p_question uuid, p_option text)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.mock_attempts;
begin
  select * into a from public.mock_attempts where id = p_attempt and user_id = auth.uid();
  if not found then raise exception 'Attempt not found.' using errcode = 'P0002'; end if;
  if a.status <> 'in_progress' then raise exception 'This attempt is already submitted.' using errcode = 'P0001'; end if;
  if now() > a.expires_at + interval '30 seconds' then raise exception 'Time is up for this attempt.' using errcode = 'P0001'; end if;
  if p_option is not null and p_option not in ('A','B','C','D') then raise exception 'Invalid option.' using errcode = '22023'; end if;
  update public.mock_attempt_questions set chosen_option = p_option, answered_at = case when p_option is null then null else now() end
   where attempt_id = p_attempt and question_id = p_question;
  if not found then raise exception 'That question is not part of this attempt.' using errcode = 'P0002'; end if;
  return true;
end $$;
revoke all on function public.save_mock_answer(uuid, uuid, text) from public, anon;
grant execute on function public.save_mock_answer(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- submit
-- p_answers: {"<question_id>": "A" | "B" | "C" | "D" | null}. Answers arriving after the time limit are ignored.
create or replace function public.submit_mock(p_attempt uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.mock_attempts;
begin
  select * into a from public.mock_attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'Attempt not found.' using errcode = 'P0002'; end if;
  if a.status = 'in_progress' then
    if now() <= a.expires_at + interval '30 seconds' and p_answers is not null and jsonb_typeof(p_answers) = 'object' then
      update public.mock_attempt_questions maq
         set chosen_option = nullif(p_answers->>maq.question_id::text, ''),
             answered_at   = case when nullif(p_answers->>maq.question_id::text, '') is null then null else coalesce(maq.answered_at, now()) end
       where maq.attempt_id = p_attempt
         and p_answers ? maq.question_id::text
         and (p_answers->>maq.question_id::text is null or p_answers->>maq.question_id::text in ('A','B','C','D',''));
    end if;
    perform public._mock_finalize(p_attempt);
  end if;
  select * into a from public.mock_attempts where id = p_attempt;
  return to_jsonb(a);
end $$;
revoke all on function public.submit_mock(uuid, jsonb) from public, anon;
grant execute on function public.submit_mock(uuid, jsonb) to authenticated;
