-- v15: Image support for comments and approvals + portal-images storage bucket

-- Add image_url to build_comments
alter table build_comments add column if not exists image_url text;

-- Add images arrays to approval_requests
alter table approval_requests add column if not exists images jsonb default '[]';
alter table approval_requests add column if not exists response_images jsonb default '[]';

-- Create public storage bucket for portal image uploads
insert into storage.buckets (id, name, public)
  values ('portal-images', 'portal-images', true)
  on conflict (id) do nothing;

-- Allow anyone to upload images to this bucket
create policy if not exists "portal_images_insert"
  on storage.objects for insert
  with check (bucket_id = 'portal-images');

-- Allow anyone to read images from this bucket
create policy if not exists "portal_images_select"
  on storage.objects for select
  using (bucket_id = 'portal-images');
