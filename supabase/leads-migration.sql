-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  description text,
  budget_range text,
  inspiration_photos text[] DEFAULT '{}',
  status text DEFAULT 'new',
  source text DEFAULT 'web',
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Allow public insert (for the lead capture form)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on leads"
  ON leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated read/update/delete on leads"
  ON leads FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Storage bucket for lead inspiration photos
-- Run this in the Supabase dashboard > Storage, or via the API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('leads', 'leads', true);
--
-- Then add a storage policy:
-- CREATE POLICY "Public upload to leads bucket"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'leads');
--
-- CREATE POLICY "Public read from leads bucket"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'leads');
