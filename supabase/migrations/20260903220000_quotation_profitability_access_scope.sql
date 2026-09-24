-- Scope quotation profitability to the authenticated viewer without changing
-- any Revenue Distribution Engine formulas, rates, margin thresholds or payout logic.
-- Admin keeps the complete distribution and edit controls. A quotation seller
-- receives only their own seller allocation. Other non-admin viewers receive no
-- profitability distribution.

alter function public.get_quotation_cpq_summary(uuid)
  rename to get_quotation_cpq_summary_sensitive_internal;

revoke all on function public.get_quotation_cpq_summary_sensitive_internal(uuid)
  from public, anon, authenticated;

create or replace function public.get_quotation_cpq_summary(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_distribution jsonb;
  v_salesperson_id uuid;
  v_currency text;
  v_mine jsonb := jsonb_build_object('available', false, 'scope', 'none');
begin
  -- The established function retains all existing quotation authorization,
  -- readiness, payment, timeline and profitability calculations.
  v_payload := public.get_quotation_cpq_summary_sensitive_internal(p_quotation_id);

  if public.is_admin() then
    return v_payload || jsonb_build_object(
      'myRevenueAllocation', jsonb_build_object('available', false, 'scope', 'admin_full')
    );
  end if;

  select q.salesperson_id, q.currency
    into v_salesperson_id, v_currency
  from public.quotations q
  where q.id = p_quotation_id;

  v_distribution := v_payload -> 'revenueDistribution';

  if v_salesperson_id = auth.uid()
     and coalesce((v_distribution ->> 'success')::boolean, false) then
    v_mine := jsonb_build_object(
      'available', true,
      'scope', 'seller_self',
      'label', 'Your Seller Margin',
      'currency', coalesce(v_distribution ->> 'currency', v_currency, 'USD'),
      'amount', coalesce((v_distribution #>> '{seller,totalReservedAmount}')::numeric, 0),
      'ratePercent', coalesce((v_distribution #>> '{seller,totalRatePercent}')::numeric, 0)
    );
  end if;

  -- Never send global/company margin, Talent Partner reserves, delivery pools,
  -- role budgets, profile weights or another user's allocation to non-admins.
  return (v_payload - 'revenueDistribution') || jsonb_build_object(
    'revenueDistribution', null,
    'myRevenueAllocation', v_mine
  );
end
$$;

revoke all on function public.get_quotation_cpq_summary(uuid)
  from public, anon;
grant execute on function public.get_quotation_cpq_summary(uuid)
  to authenticated, service_role;

-- Preserve the established override implementation as an internal helper, then
-- expose the original RPC name through an Admin-only authorization boundary.
alter function public.set_quotation_revenue_distribution_override(uuid, jsonb, text)
  rename to set_quotation_revenue_distribution_override_internal;

revoke all on function public.set_quotation_revenue_distribution_override_internal(uuid, jsonb, text)
  from public, anon, authenticated;

create or replace function public.set_quotation_revenue_distribution_override(
  p_quotation_id uuid,
  p_roles jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required to edit profitability distribution.';
  end if;

  return public.set_quotation_revenue_distribution_override_internal(
    p_quotation_id,
    p_roles,
    p_reason
  );
end
$$;

revoke all on function public.set_quotation_revenue_distribution_override(uuid, jsonb, text)
  from public, anon;
grant execute on function public.set_quotation_revenue_distribution_override(uuid, jsonb, text)
  to authenticated, service_role;

comment on function public.get_quotation_cpq_summary(uuid) is
  'Role-scoped quotation summary: Admin receives full profitability; quotation seller receives self-only margin; other non-admin viewers receive no profitability distribution.';

comment on function public.set_quotation_revenue_distribution_override(uuid, jsonb, text) is
  'Admin-only wrapper around the established quotation revenue distribution override implementation.';
