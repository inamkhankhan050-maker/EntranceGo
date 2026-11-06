-- 005: site visit statistics (privacy friendly: a random browser id, no IP, no personal data).
create table if not exists public.site_visits (
  id         bigint generated always as identity primary key,
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  path       text not null check (char_length(path) <= 300),
  visit_day  date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at timestamptz not null default now()
);
create index if not exists site_visits_day_idx on public.site_visits (visit_day);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor_id, visit_day);
alter table public.site_visits enable row level security;
-- No direct reads or writes for anyone; only the functions below touch it.
revoke all on public.site_visits from anon, authenticated;

-- Anyone (guest or signed in) logs one page view.
create or replace function public.track_visit(p_visitor text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 64 then return; end if;
  if p_path is null or p_path like '/admin%' then return; end if;
  insert into public.site_visits (visitor_id, path) values (p_visitor, left(p_path, 300));
end $$;
revoke all on function public.track_visit(text, text) from public;
grant execute on function public.track_visit(text, text) to anon, authenticated;

-- Admin only: totals per day, month and year (dates in India time).
create or replace function public.visit_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select jsonb_build_object(
    'today',      (select jsonb_build_object('visitors', count(distinct visitor_id), 'views', count(*)) from site_visits where visit_day = today),
    'yesterday',  (select jsonb_build_object('visitors', count(distinct visitor_id), 'views', count(*)) from site_visits where visit_day = today - 1),
    'month',      (select jsonb_build_object('visitors', count(distinct visitor_id), 'views', count(*)) from site_visits where visit_day >= date_trunc('month', today)::date),
    'year',       (select jsonb_build_object('visitors', count(distinct visitor_id), 'views', count(*)) from site_visits where visit_day >= date_trunc('year', today)::date),
    'all',        (select jsonb_build_object('visitors', count(distinct visitor_id), 'views', count(*)) from site_visits),
    'daily',      (select coalesce(jsonb_agg(x order by x->>'day'), '[]') from (select jsonb_build_object('day', d::date, 'visitors', count(distinct v.visitor_id), 'views', count(v.id)) x
                     from generate_series(today - 29, today, interval '1 day') d left join site_visits v on v.visit_day = d::date group by d) s),
    'monthly',    (select coalesce(jsonb_agg(x order by x->>'month' desc), '[]') from (select jsonb_build_object('month', to_char(visit_day, 'YYYY-MM'), 'visitors', count(distinct visitor_id), 'views', count(*)) x
                     from site_visits group by to_char(visit_day, 'YYYY-MM')) s),
    'yearly',     (select coalesce(jsonb_agg(x order by x->>'year' desc), '[]') from (select jsonb_build_object('year', extract(year from visit_day)::int, 'visitors', count(distinct visitor_id), 'views', count(*)) x
                     from site_visits group by extract(year from visit_day)) s),
    'top_pages',  (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('path', path, 'views', count(*)) x
                     from site_visits where visit_day >= today - 29 group by path order by count(*) desc limit 10) s)
  ) into r;
  return r;
end $$;
revoke all on function public.visit_stats() from public;
grant execute on function public.visit_stats() to authenticated;
