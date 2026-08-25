create or replace function public.enqueue_in_app_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_dedupe_key text
) returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_id uuid;
begin
  if p_recipient_user_id is null or trim(coalesce(p_dedupe_key,''))='' then return null; end if;
  insert into public.in_app_notifications(
    recipient_user_id,notification_type,title,message,action_url,dedupe_key,category,module,priority,metadata
  ) values(
    p_recipient_user_id,
    left(coalesce(nullif(trim(p_type),''),'Info'),80),
    left(trim(coalesce(p_title,'')),240),
    left(coalesce(p_message,''),2000),
    left(coalesce(p_action_url,''),1000),
    left(trim(p_dedupe_key),500),
    public.notification_center_category(p_type,p_title),
    public.notification_center_module(p_type,p_action_url),
    public.notification_center_priority(p_type,p_title),
    '{}'::jsonb
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$function$;

update public.in_app_notifications
set category=public.notification_center_category(notification_type,title),
    module=public.notification_center_module(notification_type,action_url),
    priority=public.notification_center_priority(notification_type,title)
where category='Update' and module='System' and priority='Normal';

create or replace function public.track_quotation_approval_state()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
begin
  if new.status='Ready for Approval' and new.approval_required is true
     and (old.status is distinct from new.status or old.approval_checked_at is distinct from new.approval_checked_at) then
    new.approval_requested_at:=clock_timestamp();
    new.approval_requested_by:=coalesce(auth.uid(),new.salesperson_id,new.created_by);
    new.approval_reasons_snapshot:=to_jsonb(public.quotation_cpq_approval_reasons(new.id));
    new.approval_decision:='pending';
    new.approval_decision_note:=null;
    new.approval_decided_at:=null;
    new.approval_decided_by:=null;
  elsif new.status='Approved' and old.status='Ready for Approval' then
    new.approval_decision:='approved';
    new.approval_decided_at:=clock_timestamp();
    new.approval_decided_by:=coalesce(new.approved_by,auth.uid());
  end if;
  return new;
end;
$function$;

create or replace function public.audit_quotation_approval_center()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_lead uuid; v_key text;
begin
  select o.lead_id into v_lead from public.crm_opportunities o where o.id=new.opportunity_id;
  if v_lead is null then return new; end if;
  if new.approval_requested_at is distinct from old.approval_requested_at and new.approval_requested_at is not null then
    v_key:='quotation-approval-requested:'||new.id::text||':'||new.revision_number::text||':'||to_char(new.approval_requested_at at time zone 'UTC','YYYYMMDDHH24MISSUS');
    perform public.crm_write_lead_event(
      v_lead,'quotation_approval_requested','Quotation approval requested',
      'Quotation '||new.quotation_number||' was submitted for management approval.',
      jsonb_build_object('quotationId',new.id,'quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'approvalReasons',new.approval_reasons_snapshot,'status',new.status),
      new.approval_requested_by,null,null,new.approval_requested_at,v_key
    );
  end if;
  if new.approval_decided_at is distinct from old.approval_decided_at and new.approval_decided_at is not null then
    v_key:='quotation-approval-decision:'||new.id::text||':'||new.revision_number::text||':'||coalesce(new.approval_decision,'unknown')||':'||to_char(new.approval_decided_at at time zone 'UTC','YYYYMMDDHH24MISSUS');
    perform public.crm_write_lead_event(
      v_lead,'quotation_approval_'||coalesce(new.approval_decision,'decision'),
      'Quotation approval '||replace(coalesce(new.approval_decision,'decision'),'_',' '),
      'Management recorded an approval decision for quotation '||new.quotation_number||'.',
      jsonb_build_object('quotationId',new.id,'quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'decision',new.approval_decision,'comment',new.approval_decision_note,'status',new.status),
      new.approval_decided_by,null,null,new.approval_decided_at,v_key
    );
  end if;
  return new;
end;
$function$;

create or replace function public.review_quotation_approval(p_quotation_id uuid,p_decision text,p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
  v_reviewer text;
  v_payload jsonb;
  v_template text;
  v_event_at timestamptz:=clock_timestamp();
begin
  if not public.quotation_approval_reviewer_authorized(p_quotation_id,auth.uid()) then
    raise exception 'You are not authorized to review this quotation approval.';
  end if;
  if v_decision not in ('approve','request_changes','reject') then
    raise exception 'Choose Approve, Request Changes, or Reject.';
  end if;
  if v_decision in ('request_changes','reject') and v_comment is null then
    raise exception 'A reason is required for this decision.';
  end if;
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.status<>'Ready for Approval' or v_q.approval_required is not true then
    raise exception 'This quotation is not waiting for approval.';
  end if;
  if v_q.superseded_by_id is not null then
    raise exception 'A superseded quotation revision cannot be reviewed.';
  end if;
  select coalesce(nullif(full_name,''),email,'Reviewer') into v_reviewer from public.user_profiles where id=auth.uid();
  perform set_config('profox.quotation_atomic_rpc','1',true);
  if v_decision='approve' then
    update public.quotations
    set status='Approved',approval_required=false,approval_route='manager_approved',
        approval_reason=coalesce(v_comment,'Reviewed and approved by Management.'),
        approval_checked_at=v_event_at,approved_by=auth.uid(),approved_at=v_event_at,
        approval_decision='approved',approval_decision_note=v_comment,approval_decided_at=v_event_at,
        approval_decided_by=auth.uid(),updated_at=v_event_at
    where id=p_quotation_id returning * into v_q;
  elsif v_decision='request_changes' then
    update public.quotations
    set status='Draft',approval_required=false,approval_route='changes_requested',
        approval_decision='changes_requested',approval_decision_note=v_comment,
        approval_decided_at=v_event_at,approval_decided_by=auth.uid(),
        approved_by=null,approved_at=null,updated_at=v_event_at
    where id=p_quotation_id returning * into v_q;
  else
    update public.quotations
    set status='Draft',approval_required=false,approval_route='manager_rejected',
        approval_decision='rejected',approval_decision_note=v_comment,
        approval_decided_at=v_event_at,approval_decided_by=auth.uid(),
        approved_by=null,approved_at=null,updated_at=v_event_at
    where id=p_quotation_id returning * into v_q;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);

  v_payload:=jsonb_build_object(
    'quotationNumber',v_q.quotation_number,'customerName',v_q.customer_name,'currency',v_q.currency,'total',v_q.total,
    'decision',v_decision,'decisionNote',coalesce(v_comment,''),'reviewerName',coalesce(v_reviewer,'Reviewer'),
    'revisionNumber',v_q.revision_number,'notificationCategory','Approval / Review','notificationModule','Quotation',
    'notificationPriority',case when v_decision='approve' then 'Normal' else 'High' end
  );
  if v_decision<>'approve' and v_q.salesperson_id is not null then
    v_template:=case when v_decision='request_changes' then 'quotation_changes_requested_internal' else 'quotation_not_approved_internal' end;
    perform public.service_queue_staff_operational_notification(
      v_q.salesperson_id,
      'quotation-approval-decision:'||v_q.id::text||':'||v_q.revision_number::text||':'||v_decision||':'||to_char(v_q.approval_decided_at at time zone 'UTC','YYYYMMDDHH24MISSUS'),
      v_template,'Quotation',
      case when v_decision='request_changes' then 'Changes requested — '||v_q.quotation_number else 'Quotation was not approved — '||v_q.quotation_number end,
      coalesce(v_reviewer,'Management')||': '||v_comment,
      '/admin/quotations/'||v_q.id::text,v_payload,clock_timestamp()
    );
  end if;
  return public.get_quotation_cpq_summary(p_quotation_id)||jsonb_build_object(
    'approvalDecision',v_q.approval_decision,'approvalDecisionNote',v_q.approval_decision_note,
    'approvalDecidedAt',v_q.approval_decided_at,'approvalDecidedByName',v_reviewer
  );
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$function$;

create or replace function public.notify_quotation_operational_event()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_payload jsonb; v_request boolean:=false; v_approved boolean:=false; v_total_text text; v_seller_name text;
  v_project_timeline text; v_valid_until text; v_approval_reasons text[]; v_approval_reason text;
  v_website_url text; v_approval_url text; v_logo_url text; v_request_token text; v_decision_token text;
begin
  if tg_op='INSERT' then
    v_request:=new.status='Ready for Approval' and new.approval_required is true;
  else
    v_request:=new.status='Ready for Approval' and new.approval_required is true
      and (old.status is distinct from new.status or old.approval_required is distinct from new.approval_required or old.approval_checked_at is distinct from new.approval_checked_at);
    v_approved:=new.status='Approved' and old.status='Ready for Approval';
  end if;

  select coalesce(nullif(btrim(up.full_name),''),'Sales Representative') into v_seller_name
  from public.user_profiles up where up.id=new.salesperson_id;
  v_seller_name:=coalesce(v_seller_name,'Sales Representative');
  v_total_text:=trim(to_char(coalesce(new.total,0),'FM999999999999990.00'));
  v_project_timeline:=nullif(btrim(coalesce(new.duration_snapshot_text,'')),'');
  if v_project_timeline is null then
    if new.estimated_duration_min is not null and new.estimated_duration_max is not null then
      if new.estimated_duration_min=new.estimated_duration_max then
        v_project_timeline:=new.estimated_duration_min::text||' business days';
      else
        v_project_timeline:=new.estimated_duration_min::text||'–'||new.estimated_duration_max::text||' business days';
      end if;
    else
      v_project_timeline:='Requires confirmation';
    end if;
  end if;
  v_valid_until:=case when new.valid_until is null then 'Not specified' else to_char(new.valid_until,'FMMonth DD, YYYY') end;
  if v_request then
    v_approval_reasons:=public.quotation_cpq_approval_reasons(new.id);
    if coalesce(array_length(v_approval_reasons,1),0)>0 then
      v_approval_reason:='• '||array_to_string(v_approval_reasons,E'\n• ');
    else
      v_approval_reason:='Management review is required under the current quotation approval policy.';
    end if;
  else
    v_approval_reason:=coalesce(nullif(btrim(new.approval_reason),''),'Management review is required under the current quotation approval policy.');
  end if;
  select nullif(btrim(sc.config_value->>'websiteUrl'),'') into v_website_url
  from public.system_configuration sc where sc.config_key='quotation_cpq_settings' limit 1;
  v_website_url:=coalesce(v_website_url,'https://www.profoxwebdesigner.com/');
  v_approval_url:=rtrim(v_website_url,'/')||'/admin/quotation-approvals/'||new.id::text;
  select nullif(btrim(c.data->>'logoUrl'),'') into v_logo_url from public.content c where c.id='theme' limit 1;
  v_logo_url:=coalesce(v_logo_url,'https://iili.io/fc5Rg8G.png');
  v_payload:=jsonb_build_object(
    'quotationNumber',new.quotation_number,'customerName',new.customer_name,'currency',new.currency,'total',new.total,
    'approvalReason',coalesce(new.approval_reason,''),'quotation_number',new.quotation_number,
    'customer_name',coalesce(nullif(new.customer_name,''),'Customer'),'salesperson_name',v_seller_name,
    'quotation_total',v_total_text,'project_timeline',v_project_timeline,'valid_until',v_valid_until,
    'approval_reason',v_approval_reason,'quotation_approval_url',v_approval_url,'logo_url',v_logo_url,
    'quotationId',new.id,'revisionNumber',new.revision_number,'notificationCategory','Approval / Review',
    'notificationModule','Quotation','notificationPriority','High'
  );

  if v_request then
    v_request_token:=to_char(coalesce(new.approval_requested_at,new.approval_checked_at,new.updated_at,new.created_at,clock_timestamp()) at time zone 'UTC','YYYYMMDDHH24MISSUS');
    perform public.service_queue_quotation_approval_reviewers(
      new.id,'quotation-approval-required:'||new.id::text||':'||new.revision_number::text||':'||v_request_token,
      'quotation_approval_required','Approval','Quotation Approval Required — '||new.quotation_number,
      'Quotation '||new.quotation_number||' for '||coalesce(nullif(new.customer_name,''),'Customer')||' is waiting for your review.',
      '/admin/quotation-approvals/'||new.id::text,v_payload,clock_timestamp()
    );
  end if;
  if v_approved and new.salesperson_id is not null then
    v_decision_token:=to_char(coalesce(new.approval_decided_at,new.approved_at,new.updated_at,clock_timestamp()) at time zone 'UTC','YYYYMMDDHH24MISSUS');
    perform public.service_queue_staff_operational_notification(
      new.salesperson_id,'quotation-approved:'||new.id::text||':'||new.revision_number::text||':'||v_decision_token,
      'quotation_approved_internal','Quotation','Quotation approved — '||new.quotation_number,
      'Management approved this quotation. You can continue to Send Quotation.',
      '/admin/quotations/'||new.id::text,v_payload||jsonb_build_object('notificationPriority','Normal'),clock_timestamp()
    );
  end if;
  return new;
end;
$function$;

do $block$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='queue_due_operational_notifications'
  order by p.oid limit 1;
  if v_def is null then raise exception 'queue_due_operational_notifications() was not found.'; end if;

  v_old := $$PERFORM public.service_queue_active_admins_operational_notification('quotation-approval-reminder:'||v_row.id||':'||v_milestone,'quotation_approval_required','Approval','Quotation approval still waiting — '||v_row.quotation_number,'This manager-routed quotation has waited '||v_age||' hour(s) for review.','/admin/app/sales?tab=quotations',v_payload,now());$$;
  v_new := $$PERFORM public.service_queue_quotation_approval_reviewers(v_row.id,'quotation-approval-reminder:'||v_row.id||':'||v_milestone,'quotation_approval_required','Approval','Quotation approval still waiting — '||v_row.quotation_number,'This manager-routed quotation has waited '||v_age||' hour(s) for review.','/admin/quotation-approvals/'||v_row.id::text,v_payload||jsonb_build_object('quotationId',v_row.id,'revisionNumber',v_row.revision_number),now());$$;

  if position(v_old in v_def)=0 then
    raise exception 'Expected quotation approval reminder route was not found; scheduler left unchanged.';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$block$;

revoke all on function public.get_my_notification_center(integer,integer,text,boolean) from public,anon;
revoke all on function public.mark_all_in_app_notifications_read() from public,anon;
revoke all on function public.mark_in_app_notification_read(uuid) from public,anon;
revoke all on function public.can_access_quotation_approvals() from public,anon;
revoke all on function public.quotation_approval_reviewer_authorized(uuid,uuid) from public,anon;
revoke all on function public.get_quotation_approval_requests(text,text,integer,integer) from public,anon;
revoke all on function public.get_quotation_approval_detail(uuid) from public,anon;
revoke all on function public.review_quotation_approval(uuid,text,text) from public,anon;
revoke all on function public.admin_approve_quotation_cpq(uuid,text) from public,anon;

grant execute on function public.get_my_notification_center(integer,integer,text,boolean) to authenticated,service_role;
grant execute on function public.mark_all_in_app_notifications_read() to authenticated,service_role;
grant execute on function public.mark_in_app_notification_read(uuid) to authenticated,service_role;
grant execute on function public.can_access_quotation_approvals() to authenticated,service_role;
grant execute on function public.quotation_approval_reviewer_authorized(uuid,uuid) to authenticated,service_role;
grant execute on function public.get_quotation_approval_requests(text,text,integer,integer) to authenticated,service_role;
grant execute on function public.get_quotation_approval_detail(uuid) to authenticated,service_role;
grant execute on function public.review_quotation_approval(uuid,text,text) to authenticated,service_role;
grant execute on function public.admin_approve_quotation_cpq(uuid,text) to authenticated,service_role;

revoke all on function public.enqueue_in_app_notification(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.track_quotation_approval_state() from public,anon,authenticated;
revoke all on function public.audit_quotation_approval_center() from public,anon,authenticated;
revoke all on function public.notify_quotation_operational_event() from public,anon,authenticated;

grant execute on function public.enqueue_in_app_notification(uuid,text,text,text,text,text) to service_role;
grant execute on function public.track_quotation_approval_state() to service_role;
grant execute on function public.audit_quotation_approval_center() to service_role;
grant execute on function public.notify_quotation_operational_event() to service_role;
