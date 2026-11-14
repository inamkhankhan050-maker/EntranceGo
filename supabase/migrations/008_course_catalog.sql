-- 008: Courses inside categories, course subjects, automatic course question banks,
--      and removal of the "Computer & Programming" category.
-- Category (e.g. JMI ENTRANCE EXAM) > Course (e.g. BA Political Science) > Subjects (Hindi, Aptitude...).
-- Adding a subject to a course links all of that subject's questions to the course bank, and
-- every question added to that subject later is linked too, so mock tests can use them straight away.
-- Safe to run more than once.

-- ---------------------------------------------------------------- course -> category
alter table public.courses add column if not exists category_id uuid references public.categories(id) on delete set null;
create index if not exists courses_category_idx on public.courses (category_id, status);

-- ---------------------------------------------------------------- course -> subjects
create table if not exists public.course_subjects (
  course_id  uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  position   int  not null default 0,
  primary key (course_id, subject_id)
);
create index if not exists course_subjects_subject_idx on public.course_subjects (subject_id);

alter table public.course_subjects enable row level security;
drop policy if exists course_subjects_read on public.course_subjects;
create policy course_subjects_read on public.course_subjects for select using (public.course_is_public(course_id) or public.is_admin());
drop policy if exists course_subjects_admin on public.course_subjects;
create policy course_subjects_admin on public.course_subjects for all using (public.is_admin()) with check (public.is_admin());
grant select on public.course_subjects to anon, authenticated;
grant insert, update, delete on public.course_subjects to authenticated;

-- ---------------------------------------------------------------- automatic course question bank
create or replace function public.tg_course_subject_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.course_questions (course_id, question_id)
  select new.course_id, q.id from public.questions q where q.subject_id = new.subject_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists course_subjects_link on public.course_subjects;
create trigger course_subjects_link after insert on public.course_subjects
  for each row execute function public.tg_course_subject_link();

create or replace function public.tg_question_course_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.course_questions (course_id, question_id)
  select cs.course_id, new.id from public.course_subjects cs where cs.subject_id = new.subject_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists questions_course_link on public.questions;
create trigger questions_course_link after insert or update of subject_id on public.questions
  for each row execute function public.tg_question_course_link();
revoke all on function public.tg_course_subject_link(), public.tg_question_course_link() from public, anon, authenticated;

-- ---------------------------------------------------------------- remove "Computer & Programming"
-- Subjects that were only in that category are archived (hidden, not deleted; republish any time).
update public.subjects s set status = 'archived'
 where exists (select 1 from public.subject_categories sc join public.categories c on c.id = sc.category_id
               where sc.subject_id = s.id and c.slug = 'computer-programming')
   and not exists (select 1 from public.subject_categories sc join public.categories c on c.id = sc.category_id
                   where sc.subject_id = s.id and c.slug <> 'computer-programming');
delete from public.subject_categories where category_id in (select id from public.categories where slug = 'computer-programming');
update public.courses set category_id = null where category_id in (select id from public.categories where slug = 'computer-programming');
delete from public.categories where slug = 'computer-programming';
