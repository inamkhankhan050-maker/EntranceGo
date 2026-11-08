-- 006: Previous Year Question papers (PYQs).
-- A paper is described by Exam (JMI, AMU, CUET...) > Level (School, Diploma, UG, PG...) > Course > Year.
-- Its questions are a practice set (fixed order, practice or timed test mode); a PDF link is optional.
-- Safe to run more than once.

create table if not exists public.pyq_papers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title       text not null check (length(trim(title)) > 0),
  exam_name   text not null check (length(trim(exam_name)) > 0),
  level       text not null check (length(trim(level)) > 0),
  course      text not null check (length(trim(course)) > 0),
  year        int  not null check (year between 1950 and 2100),
  description text,
  set_id      uuid references public.practice_sets(id) on delete set null,
  pdf_url     text check (pdf_url is null or pdf_url ~* '^https?://'),
  status      text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create index if not exists pyq_papers_filter_idx on public.pyq_papers (status, exam_name, level, course, year desc);

drop trigger if exists pyq_papers_ts on public.pyq_papers;
create trigger pyq_papers_ts before insert or update on public.pyq_papers
  for each row execute function public.tg_set_timestamps();

alter table public.pyq_papers enable row level security;

drop policy if exists pyq_read on public.pyq_papers;
create policy pyq_read on public.pyq_papers for select using (status = 'published' or public.is_admin());
drop policy if exists pyq_admin on public.pyq_papers;
create policy pyq_admin on public.pyq_papers for all using (public.is_admin()) with check (public.is_admin());

grant select on public.pyq_papers to anon, authenticated;
grant insert, update, delete on public.pyq_papers to authenticated;
