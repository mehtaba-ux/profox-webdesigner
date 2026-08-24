-- Cover new Sales Partner Agreement foreign keys flagged by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS idx_sales_agreement_events_actor_user_id ON public.sales_agreement_events(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_agreement_templates_created_by ON public.sales_agreement_templates(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_agreement_templates_updated_by ON public.sales_agreement_templates(updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_agreement_templates_published_by ON public.sales_agreement_templates(published_by) WHERE published_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_partner_agreements_template_id ON public.sales_partner_agreements(template_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_agreements_company_signer_user_id ON public.sales_partner_agreements(company_signer_user_id) WHERE company_signer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_partner_agreements_verified_by ON public.sales_partner_agreements(verified_by) WHERE verified_by IS NOT NULL;
