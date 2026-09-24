create or replace function public.crm_get_seller_monthly_won_sales(
  p_month date default current_date,
  p_salesperson_id uuid default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_team boolean;
  v_effective_seller uuid;
  v_month_start date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_month_end date;
  v_timezone text;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  v_team := public.is_admin() or public.has_active_role(array['project_manager']::text[]);
  if not v_team and not public.has_active_role(array['sales','sales_rep','sales_team']::text[]) then
    raise exception 'CRM access required.';
  end if;

  v_effective_seller := case when v_team then p_salesperson_id else v_uid end;
  v_month_end := (v_month_start + interval '1 month')::date;

  select name
    into v_timezone
  from pg_catalog.pg_timezone_names
  where name = coalesce(nullif(trim(p_timezone), ''), 'UTC')
  limit 1;

  v_timezone := coalesce(v_timezone, 'UTC');
  v_start_at := v_month_start::timestamp at time zone v_timezone;
  v_end_at := v_month_end::timestamp at time zone v_timezone;

  return (
    with first_verified_payment as (
      select distinct on (p.opportunity_id)
        p.opportunity_id,
        p.id as payment_id,
        p.payment_reference,
        p.payment_type,
        p.amount_paid,
        p.currency as payment_currency,
        p.salesperson_id as payment_salesperson_id,
        coalesce(p.verified_at, p.paid_at, p.created_at) as won_at
      from public.payments p
      where p.opportunity_id is not null
        and p.status = 'Verified'
        and p.payment_type in ('Advance', 'Full Payment')
      order by
        p.opportunity_id,
        coalesce(p.verified_at, p.paid_at, p.created_at),
        p.created_at,
        p.id
    ),
    wins as (
      select
        o.id as opportunity_id,
        o.lead_id,
        o.name as opportunity_name,
        o.company_name,
        o.contact_name,
        coalesce(fp.payment_salesperson_id, o.salesperson_id) as salesperson_id,
        coalesce(up.full_name, 'Seller') as owner_name,
        aq.id as quotation_id,
        aq.quotation_number,
        fp.payment_id,
        fp.payment_reference,
        fp.payment_type,
        coalesce(fp.amount_paid, 0)::numeric as payment_amount,
        coalesce(nullif(fp.payment_currency, ''), 'USD') as payment_currency,
        coalesce(aq.total, o.expected_value, 0)::numeric as sale_value,
        coalesce(nullif(aq.currency, ''), nullif(o.currency, ''), nullif(fp.payment_currency, ''), 'USD') as sale_currency,
        fp.won_at
      from public.crm_opportunities o
      join first_verified_payment fp on fp.opportunity_id = o.id
      left join public.user_profiles up on up.id = coalesce(fp.payment_salesperson_id, o.salesperson_id)
      left join lateral (
        select q.id, q.quotation_number, q.total, q.currency
        from public.quotations q
        where q.opportunity_id = o.id
          and q.status = 'Accepted'
        order by coalesce(q.accepted_at, q.updated_at, q.created_at) desc, q.created_at desc
        limit 1
      ) aq on true
      where o.archived_at is null
        and fp.won_at >= v_start_at
        and fp.won_at < v_end_at
        and (v_effective_seller is null or coalesce(fp.payment_salesperson_id, o.salesperson_id) = v_effective_seller)
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'monthStart', v_month_start,
      'monthEndExclusive', v_month_end,
      'timezone', v_timezone,
      'scope', case when v_team then 'team' else 'individual' end,
      'sellerId', v_effective_seller,
      'sales', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'opportunityId', w.opportunity_id,
            'leadId', w.lead_id,
            'opportunityName', w.opportunity_name,
            'companyName', w.company_name,
            'contactName', w.contact_name,
            'salespersonId', w.salesperson_id,
            'ownerName', w.owner_name,
            'quotationId', w.quotation_id,
            'quotationNumber', w.quotation_number,
            'paymentId', w.payment_id,
            'paymentReference', w.payment_reference,
            'paymentType', w.payment_type,
            'paymentAmount', w.payment_amount,
            'paymentCurrency', w.payment_currency,
            'saleValue', w.sale_value,
            'currency', w.sale_currency,
            'wonAt', w.won_at,
            'actionUrl', case
              when w.lead_id is not null then '/admin/app/crm?tab=crm_leads&lead=' || w.lead_id::text
              else '/admin/app/crm?tab=pipeline'
            end
          )
          order by w.won_at desc, w.opportunity_id
        )
        from wins w
      ), '[]'::jsonb),
      'totals', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'currency', t.currency,
            'salesCount', t.sales_count,
            'salesValue', t.sales_value
          )
          order by t.currency
        )
        from (
          select
            w.sale_currency as currency,
            count(*)::integer as sales_count,
            coalesce(sum(w.sale_value), 0)::numeric as sales_value
          from wins w
          group by w.sale_currency
        ) t
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.crm_get_seller_monthly_won_sales(date, uuid, text) from public;
revoke all on function public.crm_get_seller_monthly_won_sales(date, uuid, text) from anon;
grant execute on function public.crm_get_seller_monthly_won_sales(date, uuid, text) to authenticated;
grant execute on function public.crm_get_seller_monthly_won_sales(date, uuid, text) to service_role;
