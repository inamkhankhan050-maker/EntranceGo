-- Make an existing EntranceGo user an administrator.
-- 1. Create the user first: Supabase Dashboard → Authentication → Users → Add user
--    (or sign up once on the site's /login page and confirm the email).
-- 2. Replace the email below, paste this into Dashboard → SQL Editor, and Run.
-- The SQL editor runs with full privileges; no browser user can ever do this step.

insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do nothing;

-- Check it worked (should return one row):
select a.user_id, u.email, a.created_at
from public.admins a join auth.users u on u.id = a.user_id;

-- To remove an admin later:
-- delete from public.admins where user_id = (select id from auth.users where email = 'someone@example.com');
