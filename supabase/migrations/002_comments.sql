-- EntranceGo: per-question discussion (comments).
-- Only signed-in users can read or post comments. Users can delete their own comments; admins can delete any.
-- Comments are visible only on questions the reader can see (RLS on questions applies inside the check).
create table if not exists public.question_comments (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists question_comments_q_idx on public.question_comments (question_id, created_at desc);

alter table public.question_comments enable row level security;

drop policy if exists comments_read on public.question_comments;
create policy comments_read on public.question_comments for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id));

drop policy if exists comments_insert on public.question_comments;
create policy comments_insert on public.question_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.questions q where q.id = question_id));

drop policy if exists comments_delete on public.question_comments;
create policy comments_delete on public.question_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.question_comments from anon;
grant select, insert, delete on public.question_comments to authenticated;
