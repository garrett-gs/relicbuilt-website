-- Storage policies for receipts bucket (run separately if policies don't exist)
create policy "receipts_insert" on storage.objects for insert with check (bucket_id = 'receipts');
create policy "receipts_select" on storage.objects for select using (bucket_id = 'receipts');
