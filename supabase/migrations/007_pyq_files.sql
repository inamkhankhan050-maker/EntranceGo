-- 007: file storage for PYQ papers (PDF / photos), uploaded from the admin panel.
-- Public bucket: anyone can open a file by its link; only admins can upload, replace or delete.
-- Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pyq-files', 'pyq-files', true, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pyq files admin insert" on storage.objects;
create policy "pyq files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'pyq-files' and public.is_admin());
drop policy if exists "pyq files admin update" on storage.objects;
create policy "pyq files admin update" on storage.objects for update to authenticated
  using (bucket_id = 'pyq-files' and public.is_admin());
drop policy if exists "pyq files admin delete" on storage.objects;
create policy "pyq files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pyq-files' and public.is_admin());
