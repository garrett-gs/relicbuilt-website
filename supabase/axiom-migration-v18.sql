-- Migration v18: Catch-up — ensure checklist column + portal-images storage are present
-- Safe to run even if v15 and v17 were already applied (all statements are idempotent)

-- 1. Checklist column on custom_work (was added in v17 — ensure it exists)
alter table custom_work
  add column if not exists checklist jsonb default '{}';

-- 2. portal-images storage bucket (was added in v15 — ensure it exists)
insert into storage.buckets (id, name, public)
  values ('portal-images', 'portal-images', true)
  on conflict (id) do nothing;

-- 3. Storage policies for portal-images (idempotent with IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'portal_images_insert'
  ) then
    execute 'create policy "portal_images_insert"
      on storage.objects for insert
      with check (bucket_id = ''portal-images'')';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'portal_images_select'
  ) then
    execute 'create policy "portal_images_select"
      on storage.objects for select
      using (bucket_id = ''portal-images'')';
  end if;
end
$$;
