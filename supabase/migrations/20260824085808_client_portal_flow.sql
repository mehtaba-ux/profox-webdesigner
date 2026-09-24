-- Client onboarding, least-data portal projection, and payment-aware approval gates.

alter table public.clients
  add column if not exists portal_invite_count integer not null default 0,
  add column if not exists portal_invite_last_sent_at timestamptz;

alter table public.clients
  drop constraint if exists clients_portal_invite_count_check;
alter table public.clients
  add constraint clients_portal_invite_count_check
  check (portal_invite_count between 0 and 50);

create or replace function public.service_link_client_portal_invite(
  p_client_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client public.clients%rowtype;
  v_profile public.user_profiles%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  select * into v_client from public.clients where id=p_client_id for update;
  if not found then raise exception 'Client record not found.'; end if;
  if v_client.status <> 'Active' then raise exception 'Only an active client can receive portal access.'; end if;

  select * into v_profile from public.user_profiles where id=p_target_user_id for update;
  if not found then raise exception 'User profile not found.'; end if;
  if lower(btrim(coalesce(v_profile.email,''))) <> lower(btrim(coalesce(v_client.email,''))) then
    raise exception 'Client contact email must exactly match the invited account email.';
  end if;
  if v_profile.role not in ('pending','customer') then
    raise exception 'A staff or Admin account cannot be linked as a client portal account.';
  end if;

  update public.clients
  set linked_user_id=p_target_user_id,
      portal_invite_count=least(portal_invite_count+1,50),
      portal_invite_last_sent_at=now(),
      updated_at=now()
  where id=p_client_id;

  update public.user_profiles
  set role='customer',
      status='active',
      department='General',
      onboarding_status='completed',
      onboarding_progress=100,
      full_name=coalesce(nullif(btrim(v_client.primary_contact_name),''),full_name),
      updated_at=now()
  where id=p_target_user_id;

  return jsonb_build_object(
    'clientId',p_client_id,
    'linkedUserId',p_target_user_id,
    'inviteCount',v_client.portal_invite_count+1,
    'email',lower(btrim(v_client.email))
  );
end;
$function$;

revoke all on function public.service_link_client_portal_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_link_client_portal_invite(uuid,uuid) to service_role;

create or replace function public.service_record_client_portal_resend(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_client public.clients%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required.';
  end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if not found then raise exception 'Client record not found.'; end if;
  update public.clients
  set portal_invite_count=least(portal_invite_count+1,50),portal_invite_last_sent_at=now(),updated_at=now()
  where id=p_client_id;
  return jsonb_build_object('clientId',p_client_id,'inviteCount',v_client.portal_invite_count+1);
end;
$function$;

revoke all on function public.service_record_client_portal_resend(uuid) from public,anon,authenticated;
grant execute on function public.service_record_client_portal_resend(uuid) to service_role;

create or replace function public.client_get_portal_projects()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.user_profiles profile
    where profile.id=auth.uid() and profile.role='customer' and profile.status='active'
  ) then
    raise exception 'Active client portal access required.';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      project.created_at,
      jsonb_build_object(
        'id',project.id,
        'projectNumber',project.project_number,
        'projectName',project.project_name,
        'packageSnapshot',project.package_snapshot,
        'projectValue',project.project_value,
        'currency',project.currency,
        'stage',project.stage,
        'priority',project.priority,
        'status',project.status,
        'startDate',project.start_date,
        'targetDate',project.target_date,
        'completedAt',project.completed_at,
        'createdAt',project.created_at,
        'updatedAt',project.updated_at,
        'client',jsonb_build_object(
          'companyName',client.company_name,
          'primaryContactName',client.primary_contact_name
        ),
        'tasks',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',task.id,
            'title',task.title,
            'description',task.description,
            'department',task.department,
            'priority',task.priority,
            'status',task.status,
            'dueDate',task.due_date,
            'completedAt',task.completed_at
          ) order by task.created_at)
          from public.project_tasks task
          where task.project_id=project.id
        ),'[]'::jsonb),
        'payments',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',payment.id,
            'paymentReference',payment.payment_reference,
            'paymentType',payment.payment_type,
            'milestoneNumber',payment.milestone_number,
            'milestoneLabel',payment.milestone_label,
            'amountDue',payment.amount_due,
            'amountPaid',payment.amount_paid,
            'currency',payment.currency,
            'paymentLink',payment.payment_link,
            'status',payment.status,
            'dueDate',payment.due_date,
            'paidAt',payment.paid_at,
            'verifiedAt',payment.verified_at
          ) order by payment.milestone_number,payment.created_at)
          from public.payments payment
          where payment.quotation_id=project.quotation_id
             or (project.quotation_id is null and payment.opportunity_id=project.source_opportunity_id)
        ),'[]'::jsonb)
      ) as row_data
    from public.projects project
    join public.clients client on client.id=project.client_id
    where client.linked_user_id=auth.uid()
      and client.status='Active'
  ) portal_rows;

  return v_result;
end;
$function$;

revoke all on function public.client_get_portal_projects() from public,anon;
grant execute on function public.client_get_portal_projects() to authenticated;

create or replace function public.protect_client_approval_payment_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_quotation_id uuid;
  v_payment_type text;
begin
  if new.action <> 'Approved' then return new; end if;
  v_payment_type := case new.from_stage
    when 'Client Design Approval' then 'Design Milestone'
    when 'Client Review' then 'Staging Milestone'
    else null
  end;
  if v_payment_type is null then return new; end if;

  select project.quotation_id into v_quotation_id
  from public.projects project
  where project.id=new.project_id;

  if exists (
    select 1 from public.payments payment
    where payment.quotation_id=v_quotation_id
      and payment.payment_type=v_payment_type
      and payment.status <> 'Verified'
  ) then
    raise exception 'Complete and verify the required % payment before approving this stage.',v_payment_type;
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_client_approval_payment_gate() from public,anon,authenticated;

drop trigger if exists trg_protect_client_approval_payment_gate on public.project_client_approvals;
create trigger trg_protect_client_approval_payment_gate
before insert on public.project_client_approvals
for each row execute function public.protect_client_approval_payment_gate();
