-- =====================================================================
-- EntranceGo database schema (Supabase / PostgreSQL 15+)
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Then run supabase/seed.sql to load the catalog and sample questions.
-- =====================================================================

-- gen_random_uuid() is built in (PostgreSQL 13+)

-- ---------------------------------------------------------------------
-- Admins. Rows can ONLY be added from the SQL editor (service role / postgres).
-- No RLS insert/update/delete policy exists, so no browser client can
-- make itself an administrator.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------
create or replace function public.tg_set_timestamps()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    if new.created_by is null then new.created_by := auth.uid(); end if;
  else
    new.created_at := old.created_at;      -- never rewritten
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  description text,
  icon        text not null default 'BookOpen',
  status      text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

-- one subject can sit in several categories (no duplicate subject rows)
create table if not exists public.subject_categories (
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (subject_id, category_id)
);

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  description text,
  status      text not null default 'draft' check (status in ('draft','published')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  unique (subject_id, slug),
  unique (id, subject_id)
);

create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  group_name  text,                      -- e.g. 'SSC Exams', 'Railway Exams'
  description text,
  status      text not null default 'draft' check (status in ('draft','published')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

-- ---------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references public.subjects(id) on delete restrict,
  topic_id       uuid,
  exam_id        uuid references public.exams(id) on delete set null,
  question       text not null check (length(trim(question)) >= 5),
  option_a       text not null check (length(trim(option_a)) > 0),
  option_b       text not null check (length(trim(option_b)) > 0),
  option_c       text not null check (length(trim(option_c)) > 0),
  option_d       text not null check (length(trim(option_d)) > 0),
  correct_option char(1) not null check (correct_option in ('A','B','C','D')),
  explanation    text,
  image_url      text check (image_url is null or image_url ~ '^https?://'),
  tags           text[] not null default '{}',
  source         text,
  difficulty     text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  status         text not null default 'draft' check (status in ('draft','published')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  -- topic must belong to the same subject
  foreign key (topic_id, subject_id) references public.topics(id, subject_id) on delete restrict,
  -- the four options must be different from each other
  check (
    lower(trim(option_a)) <> lower(trim(option_b)) and lower(trim(option_a)) <> lower(trim(option_c)) and
    lower(trim(option_a)) <> lower(trim(option_d)) and lower(trim(option_b)) <> lower(trim(option_c)) and
    lower(trim(option_b)) <> lower(trim(option_d)) and lower(trim(option_c)) <> lower(trim(option_d))
  )
);

-- duplicate protection: same question text twice in one subject is rejected
create unique index if not exists questions_unique_text
  on public.questions (subject_id, md5(lower(regexp_replace(trim(question), '\s+', ' ', 'g'))));
create index if not exists questions_subject_idx on public.questions (subject_id, status);
create index if not exists questions_topic_idx   on public.questions (topic_id);
create index if not exists questions_exam_idx    on public.questions (exam_id);
create index if not exists questions_created_idx on public.questions (created_at desc);

-- ---------------------------------------------------------------------
-- Practice sets (questions are referenced, never copied)
-- ---------------------------------------------------------------------
create table if not exists public.practice_sets (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null check (length(trim(title)) > 0),
  description        text,
  subject_id         uuid references public.subjects(id) on delete set null,
  exam_id            uuid references public.exams(id) on delete set null,
  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  status             text not null default 'draft' check (status in ('draft','published','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid
);

create table if not exists public.practice_set_questions (
  set_id      uuid not null references public.practice_sets(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position    int  not null default 0,
  primary key (set_id, question_id)
);

-- ---------------------------------------------------------------------
-- Student data (owner-only)
-- ---------------------------------------------------------------------
create table if not exists public.attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_type      text not null check (source_type in ('set','topic','subject','exam','retry')),
  source_slug      text not null,
  title            text not null,
  mode             text not null check (mode in ('practice','test')),
  total            int  not null check (total >= 0),
  correct          int  not null check (correct >= 0),
  incorrect        int  not null check (incorrect >= 0),
  unanswered       int  not null check (unanswered >= 0),
  duration_seconds int  not null default 0,
  answers          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  check (correct + incorrect + unanswered = total)
);
create index if not exists attempts_user_idx on public.attempts (user_id, created_at desc);

create table if not exists public.bookmarks (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ---------------------------------------------------------------------
-- Timestamps / creator triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['subjects','topics','exams','questions','practice_sets'] loop
    execute format('drop trigger if exists %I_ts on public.%I', t, t);
    execute format('create trigger %I_ts before insert or update on public.%I
                    for each row execute function public.tg_set_timestamps()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Public helpers: visibility rules in one place
-- ---------------------------------------------------------------------
create or replace function public.subject_is_public(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subjects s where s.id = sid and s.status = 'published');
$$;

create or replace function public.topic_is_public(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select tid is null or exists (
    select 1 from public.topics t join public.subjects s on s.id = t.subject_id
    where t.id = tid and t.status = 'published' and s.status = 'published');
$$;

grant execute on function public.subject_is_public(uuid), public.topic_is_public(uuid) to anon, authenticated;

-- Public counts: published content only (used by the public site, even when an admin is signed in)
create or replace view public.subject_stats with (security_invoker = true) as
  select s.id as subject_id,
         (select count(*) from public.topics t where t.subject_id = s.id and t.status = 'published') as topic_count,
         (select count(*) from public.questions q where q.subject_id = s.id and q.status = 'published'
                                                  and public.topic_is_public(q.topic_id)) as question_count
  from public.subjects s;

create or replace view public.topic_stats with (security_invoker = true) as
  select t.id as topic_id,
         (select count(*) from public.questions q where q.topic_id = t.id and q.status = 'published') as question_count
  from public.topics t;

create or replace view public.exam_stats with (security_invoker = true) as
  select e.id as exam_id,
         (select count(*) from public.questions q where q.exam_id = e.id and q.status = 'published'
                                                  and public.subject_is_public(q.subject_id)
                                                  and public.topic_is_public(q.topic_id)) as question_count
  from public.exams e;

-- Admin counts: every row the caller may see (drafts included for admins, nothing extra for others)
create or replace view public.admin_subject_stats with (security_invoker = true) as
  select s.id as subject_id,
         (select count(*) from public.topics t where t.subject_id = s.id)    as topic_count,
         (select count(*) from public.questions q where q.subject_id = s.id) as question_count
  from public.subjects s;

create or replace view public.admin_topic_stats with (security_invoker = true) as
  select t.id as topic_id,
         (select count(*) from public.questions q where q.topic_id = t.id) as question_count
  from public.topics t;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admins                 enable row level security;
alter table public.categories             enable row level security;
alter table public.subjects               enable row level security;
alter table public.subject_categories     enable row level security;
alter table public.topics                 enable row level security;
alter table public.exams                  enable row level security;
alter table public.questions              enable row level security;
alter table public.practice_sets          enable row level security;
alter table public.practice_set_questions enable row level security;
alter table public.attempts               enable row level security;
alter table public.bookmarks              enable row level security;

-- admins: you may see your own row (so the app knows you are an admin). No writes.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select using (user_id = auth.uid() or public.is_admin());

-- categories
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- subjects
drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects for select using (status = 'published' or public.is_admin());
drop policy if exists subjects_admin on public.subjects;
create policy subjects_admin on public.subjects for all using (public.is_admin()) with check (public.is_admin());

-- subject_categories
drop policy if exists subject_categories_read on public.subject_categories;
create policy subject_categories_read on public.subject_categories for select using (public.subject_is_public(subject_id) or public.is_admin());
drop policy if exists subject_categories_admin on public.subject_categories;
create policy subject_categories_admin on public.subject_categories for all using (public.is_admin()) with check (public.is_admin());

-- topics
drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select
  using ((status = 'published' and public.subject_is_public(subject_id)) or public.is_admin());
drop policy if exists topics_admin on public.topics;
create policy topics_admin on public.topics for all using (public.is_admin()) with check (public.is_admin());

-- exams
drop policy if exists exams_read on public.exams;
create policy exams_read on public.exams for select using (status = 'published' or public.is_admin());
drop policy if exists exams_admin on public.exams;
create policy exams_admin on public.exams for all using (public.is_admin()) with check (public.is_admin());

-- questions: public sees only published questions of published subjects/topics
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select
  using ((status = 'published' and public.subject_is_public(subject_id) and public.topic_is_public(topic_id))
         or public.is_admin());
drop policy if exists questions_admin on public.questions;
create policy questions_admin on public.questions for all using (public.is_admin()) with check (public.is_admin());

-- practice sets
drop policy if exists sets_read on public.practice_sets;
create policy sets_read on public.practice_sets for select using (status = 'published' or public.is_admin());
drop policy if exists sets_admin on public.practice_sets;
create policy sets_admin on public.practice_sets for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists set_questions_read on public.practice_set_questions;
create policy set_questions_read on public.practice_set_questions for select
  using (exists (select 1 from public.practice_sets p where p.id = set_id and p.status = 'published') or public.is_admin());
drop policy if exists set_questions_admin on public.practice_set_questions;
create policy set_questions_admin on public.practice_set_questions for all using (public.is_admin()) with check (public.is_admin());

-- attempts: owner only, insert + read + delete (no edits to results)
drop policy if exists attempts_owner_read on public.attempts;
create policy attempts_owner_read on public.attempts for select using (user_id = auth.uid());
drop policy if exists attempts_owner_insert on public.attempts;
create policy attempts_owner_insert on public.attempts for insert with check (user_id = auth.uid());
drop policy if exists attempts_owner_delete on public.attempts;
create policy attempts_owner_delete on public.attempts for delete using (user_id = auth.uid());

-- bookmarks: owner only
drop policy if exists bookmarks_owner on public.bookmarks;
create policy bookmarks_owner on public.bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Grants (Supabase normally adds these; explicit for clarity)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.subjects, public.subject_categories, public.topics, public.exams,
                public.questions, public.practice_sets, public.practice_set_questions,
                public.subject_stats, public.topic_stats, public.exam_stats,
                public.admin_subject_stats, public.admin_topic_stats to anon, authenticated;
grant insert, update, delete on public.categories, public.subjects, public.subject_categories, public.topics,
                public.exams, public.questions, public.practice_sets, public.practice_set_questions to authenticated;
grant select on public.admins to authenticated;
grant select, insert, delete on public.attempts to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
