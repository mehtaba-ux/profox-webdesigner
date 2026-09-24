create or replace function public.get_client_onboarding_operations_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_is_admin boolean:=false;
  v_is_pm boolean:=false;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select exists(select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role='admin'),
         exists(select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role='project_manager')
  into v_is_admin,v_is_pm;
  if not v_is_admin and not v_is_pm then raise exception 'Admin or active Project Manager access required.'; end if;

  select coalesce(jsonb_agg(row_data order by sort_time desc),'[]'::jsonb)
  into v_result
  from (
    select
      coalesce(o.updated_at,p.updated_at,p.created_at) as sort_time,
      jsonb_build_object(
        'projectId',p.id,
        'projectNumber',p.project_number,
        'projectName',p.project_name,
        'projectStage',p.stage,
        'projectStatus',p.status,
        'projectManagerId',p.project_manager_id,
        'clientId',c.id,
        'clientName',c.primary_contact_name,
        'companyName',c.company_name,
        'email',ci.email,
        'portalLinked',ci.linked_user_id is not null and exists(select 1 from public.user_profiles up where up.id=ci.linked_user_id and up.role='customer' and up.status='active'),
        'onboarding',case when o.id is null then jsonb_build_object('exists',false,'status','Not Created') else jsonb_build_object(
          'exists',true,
          'id',o.id,
          'status',o.status,
          'inviteCount',o.onboarding_invite_count,
          'inviteLastSentAt',o.onboarding_invite_last_sent_at,
          'submittedAt',o.submitted_at,
          'completedAt',o.completed_at,
          'portalInviteCount',o.portal_invite_count,
          'portalInviteLastSentAt',o.portal_invite_last_sent_at,
          'portalActivationClaimedAt',o.portal_activation_claimed_at
        ) end,
        'verifiedFirstPayment',exists(select 1 from public.payments pay where pay.quotation_id=p.quotation_id and pay.payment_type in ('Advance','Full Payment') and pay.status='Verified')
      ) as row_data
    from public.projects p
    join public.clients c on c.id=p.client_id
    join public.customer_identities ci on ci.id=c.customer_identity_id
    left join public.client_onboardings o on o.project_id=p.id
    where (v_is_admin or p.project_manager_id=v_uid)
      and exists(select 1 from public.payments pay where pay.quotation_id=p.quotation_id and pay.payment_type in ('Advance','Full Payment') and pay.status='Verified')
  ) rows;

  return v_result;
end;$function$;

revoke all on function public.get_client_onboarding_operations_queue() from public,anon;
grant execute on function public.get_client_onboarding_operations_queue() to authenticated,service_role,postgres;
