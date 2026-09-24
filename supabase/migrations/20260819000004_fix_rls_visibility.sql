-- Deprecated permissive RLS migration.
-- The previous version allowed every authenticated account to read all user profiles and
-- all catalog products. Canonical least-privilege policies are defined by the hardened
-- security migrations, so this migration intentionally makes no access grants.

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users can view active products" ON public.sales_products;
