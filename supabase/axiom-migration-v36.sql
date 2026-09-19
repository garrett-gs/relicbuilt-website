-- v36: Build-window dates on estimates, so pipeline (unapproved) work can be
-- placed on the Build Calendar as "tentative" before it becomes a project.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS due_date date;
