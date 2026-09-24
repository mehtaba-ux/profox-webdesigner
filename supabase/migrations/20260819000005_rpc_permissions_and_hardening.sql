-- Deprecated legacy RPC override.
-- A previous version redefined verify_payment_atomic with weaker business checks.
-- Canonical critical RPC definitions are maintained by the hardened forward migrations.
-- Do not redefine critical payment/project/activation functions here.

REVOKE ALL ON FUNCTION public.activate_salesperson(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_project_from_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_salesperson(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_from_sale(uuid) TO authenticated;
