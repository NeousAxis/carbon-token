-- Drop the existing view if present (safe if you want a writable table)
DROP VIEW IF EXISTS public.carbon_overview CASCADE;

-- Create a real table to store overview counters (raw units)
CREATE TABLE IF NOT EXISTS public.carbon_overview (
  mint_address text PRIMARY KEY,
  current_supply bigint NOT NULL DEFAULT 0,
  total_events bigint NOT NULL DEFAULT 0,
  total_mints bigint NOT NULL DEFAULT 0,
  total_burns bigint NOT NULL DEFAULT 0,
  total_minted bigint NOT NULL DEFAULT 0,
  total_burned bigint NOT NULL DEFAULT 0,
  last_update timestamptz NOT NULL DEFAULT now()
);

-- Optional: enable RLS and allow public reads (updates should use service_role)
ALTER TABLE public.carbon_overview ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'carbon_overview' AND policyname = 'carbon_overview_select_anon'
  ) THEN
    CREATE POLICY carbon_overview_select_anon ON public.carbon_overview
      FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

-- Tip: you can also pre-create the row for your mint to avoid INSERT policies
-- INSERT INTO public.carbon_overview (mint_address) VALUES ('5bRPS8YnNMYZm6Mw86jkJMJpj9ZpCmq7Wj78gNAFnjHC') ON CONFLICT DO NOTHING;