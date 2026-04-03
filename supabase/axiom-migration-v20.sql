-- v20: Add folder_url to custom_work for Dropbox / file folder linking
alter table custom_work add column if not exists folder_url text;
