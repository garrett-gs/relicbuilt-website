-- File storage: only signed-in Axiom users (and the server) can list or upload.
--
-- portal-images and receipts allowed anyone with the public key to list every
-- file and upload new ones. The buckets stay public, so every existing image
-- and receipt link keeps working; the client portal and receipts app upload
-- through the server (service key), and signed-in Axiom pages upload as
-- themselves. Run in the Axiom Supabase SQL editor. Safe to re-run.

begin;

drop policy if exists portal_images_insert on storage.objects;
drop policy if exists portal_images_select on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_select on storage.objects;

create policy portal_images_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'portal-images');
create policy portal_images_select on storage.objects
  for select to authenticated using (bucket_id = 'portal-images');
create policy receipts_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');
create policy receipts_select on storage.objects
  for select to authenticated using (bucket_id = 'receipts');

commit;

-- Check: four rules, all for {authenticated}.
select policyname, cmd, roles::text from pg_policies where schemaname = 'storage' order by 1;
