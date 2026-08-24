-- Harden Sales Partner Agreement RPC ACLs.
-- Admin functions are callable only by authenticated users and still enforce public.is_admin() internally.

REVOKE ALL ON FUNCTION public.admin_get_sales_agreement_template() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_sales_partner_agreement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_issue_sales_partner_agreement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_sales_partner_agreements() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_preview_sales_agreement_dynamic_data(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_publish_sales_agreement_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resend_sales_partner_agreement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_sales_agreement_template(text,text,text,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verify_sales_partner_agreement(uuid,text,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_sales_agreement_template() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_issue_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sales_partner_agreements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_sales_agreement_dynamic_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_publish_sales_agreement_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_sales_agreement_template(text,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_sales_partner_agreement(uuid,text,text,text) TO authenticated;

-- Public agreement review is intentionally token-based and available to guest signers.
GRANT EXECUTE ON FUNCTION public.public_get_sales_partner_agreement(uuid) TO anon, authenticated;

-- Internal signing mutations stay service-role only.
REVOKE ALL ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_decline_sales_partner_agreement(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_decline_sales_partner_agreement(uuid,text) TO service_role;
