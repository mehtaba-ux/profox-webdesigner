-- Harden Seller-facing client onboarding handoff against resend abuse and keep verification lookup efficient.

create index if not exists notification_outbox_portal_verification_onboarding_idx
  on public.notification_outbox ((payload->>'onboardingId'), created_at desc)
  where template_key='customer_client_portal_email_verification';

create or replace function public.crm_resend_lead_onboarding(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_project_id uuid;
  v_onboarding_id uuid;
  v_invite_count integer;
  v_last_sent timestamptz;
  v_result jsonb;
begin
  if not public.crm_can_access_lead(p_lead_id) then
    raise exception 'Lead access denied.';
  end if;

  select p.id,o.id
  into v_project_id,v_onboarding_id
  from public.crm_opportunities op
  join public.projects p on p.source_opportunity_id=op.id
  join public.client_onboardings o on o.project_id=p.id
  where op.lead_id=p_lead_id
    and o.status<>'Completed'
  order by o.created_at desc
  limit 1;

  if v_project_id is null or v_onboarding_id is null then
    raise exception 'No incomplete client onboarding is available for this lead.';
  end if;

  select onboarding_invite_count,onboarding_invite_last_sent_at
  into v_invite_count,v_last_sent
  from public.client_onboardings
  where id=v_onboarding_id
  for update;

  if v_last_sent is not null and v_last_sent>now()-interval '120 seconds' then
    raise exception 'An onboarding invitation was sent recently. Please wait before resending.';
  end if;

  if coalesce(v_invite_count,0)>=50 then
    raise exception 'Client onboarding invitation limit reached. Review the customer relationship before trying again.';
  end if;

  perform public.ensure_client_onboarding_for_project(v_project_id,true);
  v_result:=public.crm_get_lead_onboarding_handoff(p_lead_id);
  return v_result;
end;
$function$;

revoke all on function public.crm_resend_lead_onboarding(uuid) from public, anon;
grant execute on function public.crm_resend_lead_onboarding(uuid) to authenticated, service_role;
