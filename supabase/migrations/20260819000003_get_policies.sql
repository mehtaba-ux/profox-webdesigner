-- Deprecated diagnostic migration.
-- A prior version exposed a SECURITY DEFINER helper that returned database policy metadata.
-- Runtime applications do not need this capability, so no RPC is created here.

DROP FUNCTION IF EXISTS public.get_table_policies(text);
