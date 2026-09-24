-- Deprecated legacy commission schema.
-- The previous implementation used text identifiers, stale PROFOX-* package codes and
-- client-side-oriented ledger fields that no longer match the production model.
-- The canonical UUID-based commission ledger, rules, RLS and Admin RPCs are created by
-- the following production commission migration.

DO $$
BEGIN
  RAISE NOTICE 'Legacy commission migration intentionally retired; canonical ledger follows.';
END
$$;
