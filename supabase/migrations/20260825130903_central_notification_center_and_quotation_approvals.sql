alter table public.in_app_notifications
  add column if not exists category text not null default 'Update',
  add column if not exists module text not null default 'System',
  add column if not exists priority text not null default 'Normal',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_in_app_notifications_recipient_created
  on public.in_app_notifications(recipient_user_id, created_at desc);

alter table public.quotations
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_requested_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists approval_reasons_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists approval_decision text,
  add column if not exists approval_decision_note text,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid references public.user_profiles(id) on delete set null;

create index if not exists idx_quotations_approval_center
  on public.quotations(approval_requested_at desc, status, approval_decision)
  where approval_requested_at is not null;

create or replace function public.notification_center_category(p_type text, p_title text default '')
returns text language sql immutable set search_path='public','pg_temp' as $function$
  select case
    when lower(coalesce(p_type,'')) similar to '%(approval|review|certification)%' or lower(coalesce(p_title,'')) like '%approval%' or lower(coalesce(p_title,'')) like '%review%' then 'Approval / Review'
    when lower(coalesce(p_type,'')) similar to '%(overdue|failed|warning|risk|blocked|needs owner)%' then 'Warning'
    when lower(coalesce(p_type,'')) similar to '%(due|reminder|follow-up)%' then 'Reminder'
    when lower(coalesce(p_type,'')) similar to '%(assigned|required|pending|action)%' then 'Action Required'
    when lower(coalesce(p_type,'')) similar to '%(critical|security)%' then 'Critical'
    else 'Update' end;
$function$;

create or replace function public.notification_center_priority(p_type text, p_title text default '')
returns text language sql immutable set search_path='public','pg_temp' as $function$
  select case
    when lower(coalesce(p_type,'')) similar to '%(critical|security)%' then 'Critical'
    when lower(coalesce(p_type,'')) similar to '%(approval|review|required|overdue|failed|blocked|risk)%' or lower(coalesce(p_title,'')) like '%approval%' then 'High'
    when lower(coalesce(p_type,'')) similar to '%(reminder|due)%' then 'Normal'
    else 'Normal' end;
$function$;

create or replace function public.notification_center_module(p_type text, p_action_url text default '')
returns text language sql immutable set search_path='public','pg_temp' as $function$
  select case
    when lower(coalesce(p_action_url,'')) like '%quotation%' or lower(coalesce(p_type,'')) like '%quotation%' then 'Quotation'
    when lower(coalesce(p_action_url,'')) like '%payment%' or lower(coalesce(p_type,'')) like '%payment%' then 'Payment'
    when lower(coalesce(p_action_url,'')) like '%recruit%' or lower(coalesce(p_type,'')) like '%recruit%' then 'Recruitment'
    when lower(coalesce(p_action_url,'')) like '%design%' or lower(coalesce(p_type,'')) like '%design%' then 'Design'
    when lower(coalesce(p_action_url,'')) like '%content%' or lower(coalesce(p_type,'')) like '%content%' then 'Content'
    when lower(coalesce(p_action_url,'')) like '%development%' or lower(coalesce(p_type,'')) like '%development%' then 'Development'
    when lower(coalesce(p_action_url,'')) like '%qa%' or lower(coalesce(p_type,'')) like '%qa%' then 'QA'
    when lower(coalesce(p_action_url,'')) like '%project%' or lower(coalesce(p_type,'')) like '%project%' or lower(coalesce(p_type,'')) like '%task%' then 'Project'
    when lower(coalesce(p_action_url,'')) like '%meeting%' or lower(coalesce(p_action_url,'')) like '%calendar%' or lower(coalesce(p_type,'')) like '%booking%' then 'Meetings'
    when lower(coalesce(p_action_url,'')) like '%academy%' or lower(coalesce(p_type,'')) like '%training%' then 'Training'
    when lower(coalesce(p_action_url,'')) like '%crm%' or lower(coalesce(p_action_url,'')) like '%lead%' or lower(coalesce(p_type,'')) like '%lead%' then 'CRM'
    else 'System' end;
$function$;

update public.in_app_notifications
set category=public.notification_center_category(notification_type,title),
    module=public.notification_center_module(notification_type,action_url),
    priority=public.notification_center_priority(notification_type,title)
where category='Update' and module='System' and priority='Normal';

create or replace function public.service_queue_staff_operational_notification(
  p_user_id uuid, p_dedupe_key text, p_template_key text, p_type text, p_title text,
  p_message text, p_action_url text, p_payload jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now()
) returns void language plpgsql security definer set search_path='public','pg_temp' as $function$
begin
  if p_user_id is null or trim(coalesce(p_dedupe_key,''))='' then return; end if;
  if not exists(select 1 from public.user_profiles u where u.id=p_user_id and u.status='active' and u.role not in ('customer','pending')) then return; end if;
  perform public.enqueue_in_app_notification(p_user_id,p_type,p_title,p_message,p_action_url,p_dedupe_key);
  update public.in_app_notifications
  set category=coalesce(nullif(p_payload->>'notificationCategory',''),public.notification_center_category(p_type,p_title)),
      module=coalesce(nullif(p_payload->>'notificationModule',''),public.notification_center_module(p_type,p_action_url)),
      priority=coalesce(nullif(p_payload->>'notificationPriority',''),public.notification_center_priority(p_type,p_title)),
      metadata=case when jsonb_typeof(coalesce(p_payload,'{}'::jsonb))='object' then coalesce(p_payload,'{}'::jsonb) else '{}'::jsonb end
  where dedupe_key=p_dedupe_key;
  perform public.enqueue_notification(p_dedupe_key,p_template_key,'',p_user_id,coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('actionUrl',p_action_url),coalesce(p_scheduled_for,now()));
end;
$function$;

create or replace function public.get_my_notification_center(
  p_limit integer default 30,
  p_offset integer default 0,
  p_filter text default 'all',
  p_unread_only boolean default false
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  v_uid uuid:=auth.uid();
  v_limit int:=least(greatest(coalesce(p_limit,30),1),100);
  v_offset int:=greatest(coalesce(p_offset,0),0);
  v_filter text:=lower(trim(coalesce(p_filter,'all')));
  v_items jsonb;
  v_unread int;
  v_filtered int;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select count(*)::int into v_unread from public.in_app_notifications where recipient_user_id=v_uid and read_at is null;
  with scoped as (
    select n.* from public.in_app_notifications n
    where n.recipient_user_id=v_uid
      and (not coalesce(p_unread_only,false) or n.read_at is null)
      and (
        v_filter in ('','all')
        or (v_filter='action' and n.category in ('Action Required','Reminder'))
        or (v_filter='approvals' and n.category='Approval / Review')
        or (v_filter='updates' and n.category='Update')
        or (v_filter='warnings' and n.category in ('Warning','Critical'))
      )
  ), counted as (select count(*)::int c from scoped), paged as (
    select * from scoped order by created_at desc limit v_limit offset v_offset
  )
  select coalesce((select c from counted),0), coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'type',p.notification_type,'category',p.category,'module',p.module,'priority',p.priority,
    'title',p.title,'message',p.message,'actionUrl',p.action_url,'metadata',p.metadata,
    'readAt',p.read_at,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_filtered,v_items from paged p;
  return jsonb_build_object('items',v_items,'unreadCount',v_unread,'filteredCount',v_filtered,'offset',v_offset,'limit',v_limit,'hasMore',v_offset+v_limit<v_filtered);
end;
$function$;

create or replace function public.mark_in_app_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path='public','pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.in_app_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_user_id=auth.uid();
end;
$function$;

create or replace function public.mark_all_in_app_notifications_read()
returns integer language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.in_app_notifications set read_at=now() where recipient_user_id=auth.uid() and read_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

create or replace function public.quotation_approval_reviewer_authorized(p_quotation_id uuid, p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare v_reviewer public.user_profiles%rowtype; v_manager text; v_seller uuid;
begin
  if p_user_id is null then return false; end if;
  select * into v_reviewer from public.user_profiles where id=p_user_id and status='active';
  if not found or v_reviewer.role in ('customer','pending') then return false; end if;
  if v_reviewer.role='admin' then return true; end if;
  select q.salesperson_id,sp.manager into v_seller,v_manager
  from public.quotations q left join public.user_profiles sp on sp.id=q.salesperson_id where q.id=p_quotation_id;
  if v_seller is null or nullif(trim(coalesce(v_manager,'')),'') is null then return false; end if;
  return lower(trim(v_manager)) in (lower(p_user_id::text),lower(trim(v_reviewer.email)),lower(trim(v_reviewer.full_name)));
end;
$function$;

create or replace function public.can_access_quotation_approvals()
returns boolean language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare v_me public.user_profiles%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into v_me from public.user_profiles where id=auth.uid() and status='active';
  if not found then return false; end if;
  if v_me.role='admin' then return true; end if;
  return exists(select 1 from public.user_profiles s where s.status='active' and nullif(trim(coalesce(s.manager,'')),'') is not null and lower(trim(s.manager)) in (lower(v_me.id::text),lower(trim(v_me.email)),lower(trim(v_me.full_name))));
end;
$function$;

create or replace function public.service_queue_quotation_approval_reviewers(
  p_quotation_id uuid,p_dedupe_prefix text,p_template_key text,p_type text,p_title text,p_message text,p_action_url text,p_payload jsonb default '{}'::jsonb,p_scheduled_for timestamptz default now()
) returns integer language plpgsql security definer set search_path='public','pg_temp' as $function$
declare r record; v_count int:=0;
begin
  for r in
    select distinct u.id
    from public.user_profiles u
    where u.status='active' and u.role not in ('customer','pending')
      and public.quotation_approval_reviewer_authorized(p_quotation_id,u.id)
  loop
    perform public.service_queue_staff_operational_notification(r.id,p_dedupe_prefix||':'||r.id::text,p_template_key,p_type,p_title,p_message,p_action_url,
      coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('notificationCategory','Approval / Review','notificationModule','Quotation','notificationPriority','High'),p_scheduled_for);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.track_quotation_approval_state()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $function$
begin
  if new.status='Ready for Approval' and new.approval_required is true
     and (old.status is distinct from new.status or old.approval_checked_at is distinct from new.approval_checked_at) then
    new.approval_requested_at:=coalesce(new.approval_checked_at,now());
    new.approval_requested_by:=coalesce(auth.uid(),new.salesperson_id,new.created_by);
    new.approval_reasons_snapshot:=to_jsonb(public.quotation_cpq_approval_reasons(new.id));
    new.approval_decision:='pending';
    new.approval_decision_note:=null;
    new.approval_decided_at:=null;
    new.approval_decided_by:=null;
  elsif new.status='Approved' and old.status='Ready for Approval' then
    new.approval_decision:='approved';
    new.approval_decided_at:=coalesce(new.approved_at,now());
    new.approval_decided_by:=coalesce(new.approved_by,auth.uid());
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_track_quotation_approval_state on public.quotations;
create trigger trg_track_quotation_approval_state
before update of status,approval_required,approval_checked_at,approved_at on public.quotations
for each row execute function public.track_quotation_approval_state();

create or replace function public.review_quotation_approval(p_quotation_id uuid,p_decision text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  v_q public.quotations%rowtype; v_decision text:=lower(trim(coalesce(p_decision,''))); v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
  v_reviewer text; v_payload jsonb; v_lead uuid;
begin
  if not public.quotation_approval_reviewer_authorized(p_quotation_id,auth.uid()) then raise exception 'You are not authorized to review this quotation approval.'; end if;
  if v_decision not in ('approve','request_changes','reject') then raise exception 'Choose Approve, Request Changes, or Reject.'; end if;
  if v_decision in ('request_changes','reject') and v_comment is null then raise exception 'A reason is required for this decision.'; end if;
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.status<>'Ready for Approval' or v_q.approval_required is not true then raise exception 'This quotation is not waiting for approval.'; end if;
  if v_q.superseded_by_id is not null then raise exception 'A superseded quotation revision cannot be reviewed.'; end if;
  select coalesce(nullif(full_name,''),email,'Reviewer') into v_reviewer from public.user_profiles where id=auth.uid();
  perform set_config('profox.quotation_atomic_rpc','1',true);
  if v_decision='approve' then
    update public.quotations set status='Approved',approval_required=false,approval_route='manager_approved',
      approval_reason=coalesce(v_comment,'Reviewed and approved by Management.'),approval_checked_at=now(),approved_by=auth.uid(),approved_at=now(),
      approval_decision='approved',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),updated_at=now()
    where id=p_quotation_id returning * into v_q;
  elsif v_decision='request_changes' then
    update public.quotations set status='Draft',approval_required=false,approval_route='changes_requested',
      approval_decision='changes_requested',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),
      approved_by=null,approved_at=null,updated_at=now()
    where id=p_quotation_id returning * into v_q;
  else
    update public.quotations set status='Draft',approval_required=false,approval_route='manager_rejected',
      approval_decision='rejected',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),
      approved_by=null,approved_at=null,updated_at=now()
    where id=p_quotation_id returning * into v_q;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
  v_payload:=jsonb_build_object('quotationNumber',v_q.quotation_number,'customerName',v_q.customer_name,'currency',v_q.currency,'total',v_q.total,
    'decision',v_decision,'decisionNote',coalesce(v_comment,''),'reviewerName',coalesce(v_reviewer,'Reviewer'),'revisionNumber',v_q.revision_number,
    'notificationCategory','Approval / Review','notificationModule','Quotation','notificationPriority',case when v_decision='approve' then 'Normal' else 'High' end);
  if v_q.salesperson_id is not null then
    perform public.service_queue_staff_operational_notification(v_q.salesperson_id,
      'quotation-approval-decision:'||v_q.id::text||':'||v_q.revision_number::text||':'||v_decision||':'||extract(epoch from coalesce(v_q.approval_decided_at,now()))::bigint,
      case when v_decision='approve' then 'quotation_approved_internal' else 'quotation_approval_required' end,
      'Quotation',case when v_decision='approve' then 'Quotation approved — '||v_q.quotation_number when v_decision='request_changes' then 'Changes requested — '||v_q.quotation_number else 'Quotation was not approved — '||v_q.quotation_number end,
      case when v_decision='approve' then coalesce(v_reviewer,'Management')||' approved this quotation.' else coalesce(v_reviewer,'Management')||': '||v_comment end,
      '/admin/quotations/'||v_q.id::text,v_payload,now());
  end if;
  return public.get_quotation_cpq_summary(p_quotation_id)||jsonb_build_object('approvalDecision',v_q.approval_decision,'approvalDecisionNote',v_q.approval_decision_note,'approvalDecidedAt',v_q.approval_decided_at,'approvalDecidedByName',v_reviewer);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$function$;

create or replace function public.admin_approve_quotation_cpq(p_quotation_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
begin
  return public.review_quotation_approval(p_quotation_id,'approve',p_note);
end;
$function$;

create or replace function public.get_quotation_approval_requests(p_filter text default 'pending',p_search text default '',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare v_filter text:=lower(trim(coalesce(p_filter,'pending'))); v_search text:=lower(trim(coalesce(p_search,''))); v_limit int:=least(greatest(coalesce(p_limit,50),1),100); v_offset int:=greatest(coalesce(p_offset,0),0); v_rows jsonb; v_count int;
begin
  if auth.uid() is null or not public.can_access_quotation_approvals() then raise exception 'Quotation approval access is not available for this user.'; end if;
  with scoped as (
    select q.*,coalesce(nullif(s.full_name,''),s.email,'Seller') seller_name,o.name opportunity_name,o.company_name opportunity_company,
      coalesce(nullif(r.full_name,''),r.email,'') reviewer_name
    from public.quotations q
    left join public.user_profiles s on s.id=q.salesperson_id
    left join public.user_profiles r on r.id=q.approval_decided_by
    left join public.crm_opportunities o on o.id=q.opportunity_id
    where q.approval_requested_at is not null
      and public.quotation_approval_reviewer_authorized(q.id,auth.uid())
      and (v_search='' or lower(coalesce(q.quotation_number,'')||' '||coalesce(q.customer_name,'')||' '||coalesce(s.full_name,'')||' '||coalesce(o.name,'')) like '%'||v_search||'%')
      and (v_filter in ('','all') or (v_filter='pending' and q.status='Ready for Approval' and q.approval_decision='pending') or (v_filter='approved' and q.approval_decision='approved') or (v_filter='changes_requested' and q.approval_decision='changes_requested') or (v_filter='rejected' and q.approval_decision='rejected'))
  ), counted as (select count(*)::int c from scoped), paged as (select * from scoped order by case when status='Ready for Approval' then 0 else 1 end,approval_requested_at desc limit v_limit offset v_offset)
  select coalesce((select c from counted),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'quotationNumber',p.quotation_number,'sellerId',p.salesperson_id,'sellerName',p.seller_name,'customerName',p.customer_name,
    'opportunityId',p.opportunity_id,'opportunityName',p.opportunity_name,'opportunityCompany',p.opportunity_company,'total',p.total,'currency',p.currency,
    'requestedAt',p.approval_requested_at,'requestedBy',p.approval_requested_by,'approvalReasons',p.approval_reasons_snapshot,'status',p.status,
    'decision',p.approval_decision,'decisionNote',p.approval_decision_note,'decidedAt',p.approval_decided_at,'reviewerName',p.reviewer_name,
    'revisionNumber',p.revision_number,'priority','High','durationSnapshotText',p.duration_snapshot_text
  ) order by case when p.status='Ready for Approval' then 0 else 1 end,p.approval_requested_at desc),'[]'::jsonb)
  into v_count,v_rows from paged p;
  return jsonb_build_object('items',v_rows,'count',v_count,'offset',v_offset,'limit',v_limit,'hasMore',v_offset+v_limit<v_count);
end;
$function$;

create or replace function public.get_quotation_approval_detail(p_quotation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare v_q public.quotations%rowtype; v_seller jsonb; v_opp jsonb; v_lines jsonb; v_history jsonb; v_lead uuid; v_reviewer text;
begin
  if auth.uid() is null or not public.quotation_approval_reviewer_authorized(p_quotation_id,auth.uid()) then raise exception 'You are not authorized to review this quotation.'; end if;
  select * into v_q from public.quotations where id=p_quotation_id; if not found then raise exception 'Quotation not found.'; end if;
  select jsonb_build_object('id',u.id,'name',coalesce(nullif(u.full_name,''),u.email),'email',u.email,'department',u.department) into v_seller from public.user_profiles u where u.id=v_q.salesperson_id;
  select o.lead_id,jsonb_build_object('id',o.id,'name',o.name,'companyName',o.company_name,'contactName',o.contact_name,'email',o.email,'stage',o.stage,'status',o.status,'expectedValue',o.expected_value,'currency',o.currency) into v_lead,v_opp from public.crm_opportunities o where o.id=v_q.opportunity_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',qi.id,'productName',qi.product_name_snapshot,'productCode',qi.product_code_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'lineTotal',qi.line_total,'discountType',qi.discount_type,'discountValue',qi.discount_value,'discountAmount',qi.discount_amount,'optional',qi.optional_for_client,'itemType',qi.item_type,'timelineText',public.format_quotation_line_timeline(qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,qi.duration_unit_snapshot,qi.timeline_impact_snapshot),'timelineSource',qi.configuration_snapshot->>'timelineSource','catalogTimeline',qi.configuration_snapshot->'catalogTimeline','durationMin',qi.duration_min_snapshot,'durationMax',qi.duration_max_snapshot,'timelineImpact',qi.timeline_impact_snapshot) order by qi.sort_order,qi.created_at),'[]'::jsonb) into v_lines from public.quotation_items qi where qi.quotation_id=p_quotation_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'title',e.title,'description',e.description,'actorName',e.actor_name_snapshot,'actorRole',e.actor_role_snapshot,'metadata',e.metadata,'occurredAt',e.occurred_at) order by e.occurred_at desc),'[]'::jsonb) into v_history from public.crm_lead_events e where e.lead_id=v_lead and e.metadata->>'quotationId'=p_quotation_id::text;
  select coalesce(nullif(full_name,''),email,'') into v_reviewer from public.user_profiles where id=v_q.approval_decided_by;
  return jsonb_build_object('id',v_q.id,'quotationNumber',v_q.quotation_number,'status',v_q.status,'revisionNumber',v_q.revision_number,'seller',coalesce(v_seller,'{}'::jsonb),'customerName',v_q.customer_name,'contactName',v_q.contact_name,'email',v_q.email,'country',v_q.country,'currency',v_q.currency,'total',v_q.total,'subtotal',v_q.subtotal,'lineDiscountTotal',v_q.line_discount_total,'quoteDiscountType',v_q.quote_discount_type,'quoteDiscountValue',v_q.quote_discount_value,'quoteDiscountTotal',v_q.quote_discount_total,'optionalTotal',v_q.optional_total,'taxRate',v_q.tax_rate,'taxTotal',v_q.tax_total,'opportunity',coalesce(v_opp,'{}'::jsonb),'approvalReasons',v_q.approval_reasons_snapshot,'approvalRequestedAt',v_q.approval_requested_at,'approvalDecision',v_q.approval_decision,'approvalDecisionNote',v_q.approval_decision_note,'approvalDecidedAt',v_q.approval_decided_at,'approvalDecidedByName',coalesce(v_reviewer,''),'durationSnapshotText',v_q.duration_snapshot_text,'durationOverrideMin',v_q.duration_override_min,'durationOverrideMax',v_q.duration_override_max,'durationOverrideNote',v_q.duration_override_note,'paymentPlan',public.quotation_payment_schedule_preview(v_q.id),'proposal',public.quotation_presentation_payload(v_q.id),'lines',v_lines,'history',v_history);
end;
$function$;

create or replace function public.audit_quotation_approval_center()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_lead uuid; v_key text;
begin
  select o.lead_id into v_lead from public.crm_opportunities o where o.id=new.opportunity_id;
  if v_lead is null then return new; end if;
  if new.approval_requested_at is distinct from old.approval_requested_at and new.approval_requested_at is not null then
    v_key:='quotation-approval-requested:'||new.id::text||':'||new.revision_number::text||':'||extract(epoch from new.approval_requested_at)::bigint;
    perform public.crm_write_lead_event(v_lead,'quotation_approval_requested','Quotation approval requested','Quotation '||new.quotation_number||' was submitted for management approval.',jsonb_build_object('quotationId',new.id,'quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'approvalReasons',new.approval_reasons_snapshot,'status',new.status),new.approval_requested_by,null,null,new.approval_requested_at,v_key);
  end if;
  if new.approval_decided_at is distinct from old.approval_decided_at and new.approval_decided_at is not null then
    v_key:='quotation-approval-decision:'||new.id::text||':'||new.revision_number::text||':'||coalesce(new.approval_decision,'unknown')||':'||extract(epoch from new.approval_decided_at)::bigint;
    perform public.crm_write_lead_event(v_lead,'quotation_approval_'||coalesce(new.approval_decision,'decision'),'Quotation approval '||replace(coalesce(new.approval_decision,'decision'),'_',' '),'Management recorded an approval decision for quotation '||new.quotation_number||'.',jsonb_build_object('quotationId',new.id,'quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'decision',new.approval_decision,'comment',new.approval_decision_note,'status',new.status),new.approval_decided_by,null,null,new.approval_decided_at,v_key);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_audit_quotation_approval_center on public.quotations;
create trigger trg_audit_quotation_approval_center after update of approval_requested_at,approval_decided_at on public.quotations for each row execute function public.audit_quotation_approval_center();

create or replace function public.protect_quotation_transition()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_atomic text:=coalesce(current_setting('profox.quotation_atomic_rpc',true),''); v_view_tracking text:=coalesce(current_setting('profox.quotation_view_tracking_rpc',true),''); v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
begin
  if v_view_tracking='1' or v_gateway='1' then return new; end if;
  if public.is_admin() then return new; end if;
  if v_atomic='1' then return new; end if;
  if old.status in ('Approved','Sent','Accepted','Rejected','Expired','Cancelled') and row(new.*) is distinct from row(old.*) then raise exception 'Locked quotation may only be changed through the approved quotation workflow.'; end if;
  if new.status not in ('Draft','Ready for Approval') then raise exception 'Sales may only change quotation status through the approved quotation workflow.'; end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or new.accepted_at is distinct from old.accepted_at or new.approval_required is distinct from old.approval_required or new.approval_route is distinct from old.approval_route or new.approval_reason is distinct from old.approval_reason or new.approval_checked_at is distinct from old.approval_checked_at or new.approval_requested_at is distinct from old.approval_requested_at or new.approval_requested_by is distinct from old.approval_requested_by or new.approval_reasons_snapshot is distinct from old.approval_reasons_snapshot or new.approval_decision is distinct from old.approval_decision or new.approval_decision_note is distinct from old.approval_decision_note or new.approval_decided_at is distinct from old.approval_decided_at or new.approval_decided_by is distinct from old.approval_decided_by then raise exception 'Quotation approval and acceptance fields are privileged.'; end if;
  if pg_trigger_depth()=1 and (new.subtotal is distinct from old.subtotal or new.total is distinct from old.total) then raise exception 'Quotation totals are calculated from line items and cannot be edited directly.'; end if;
  return new;
end;
$function$;

create or replace function public.notify_quotation_operational_event()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_payload jsonb; v_request boolean:=false; v_approved boolean:=false; v_total_text text; v_seller_name text; v_project_timeline text; v_valid_until text; v_approval_reasons text[]; v_approval_reason text; v_website_url text; v_approval_url text; v_logo_url text;
begin
  if tg_op='INSERT' then v_request:=new.status='Ready for Approval' and new.approval_required is true;
  else v_request:=new.status='Ready for Approval' and new.approval_required is true and (old.status is distinct from new.status or old.approval_required is distinct from new.approval_required or old.approval_checked_at is distinct from new.approval_checked_at); v_approved:=new.status='Approved' and old.status='Ready for Approval'; end if;
  select coalesce(nullif(btrim(up.full_name),''),'Sales Representative') into v_seller_name from public.user_profiles up where up.id=new.salesperson_id; v_seller_name:=coalesce(v_seller_name,'Sales Representative');
  v_total_text:=trim(to_char(coalesce(new.total,0),'FM999999999999990.00'));
  v_project_timeline:=nullif(btrim(coalesce(new.duration_snapshot_text,'')),''); if v_project_timeline is null then if new.estimated_duration_min is not null and new.estimated_duration_max is not null then if new.estimated_duration_min=new.estimated_duration_max then v_project_timeline:=new.estimated_duration_min::text||' business days'; else v_project_timeline:=new.estimated_duration_min::text||'–'||new.estimated_duration_max::text||' business days'; end if; else v_project_timeline:='Requires confirmation'; end if; end if;
  v_valid_until:=case when new.valid_until is null then 'Not specified' else to_char(new.valid_until,'FMMonth DD, YYYY') end;
  if v_request then v_approval_reasons:=public.quotation_cpq_approval_reasons(new.id); if coalesce(array_length(v_approval_reasons,1),0)>0 then v_approval_reason:='• '||array_to_string(v_approval_reasons,E'\n• '); else v_approval_reason:='Management review is required under the current quotation approval policy.'; end if; else v_approval_reason:=coalesce(nullif(btrim(new.approval_reason),''),'Management review is required under the current quotation approval policy.'); end if;
  select nullif(btrim(sc.config_value->>'websiteUrl'),'') into v_website_url from public.system_configuration sc where sc.config_key='quotation_cpq_settings' limit 1; v_website_url:=coalesce(v_website_url,'https://www.profoxwebdesigner.com/'); v_approval_url:=rtrim(v_website_url,'/')||'/admin/quotation-approvals/'||new.id::text;
  select nullif(btrim(c.data->>'logoUrl'),'') into v_logo_url from public.content c where c.id='theme' limit 1; v_logo_url:=coalesce(v_logo_url,'https://iili.io/fc5Rg8G.png');
  v_payload:=jsonb_build_object('quotationNumber',new.quotation_number,'customerName',new.customer_name,'currency',new.currency,'total',new.total,'approvalReason',coalesce(new.approval_reason,''),'quotation_number',new.quotation_number,'customer_name',coalesce(nullif(new.customer_name,''),'Customer'),'salesperson_name',v_seller_name,'quotation_total',v_total_text,'project_timeline',v_project_timeline,'valid_until',v_valid_until,'approval_reason',v_approval_reason,'quotation_approval_url',v_approval_url,'logo_url',v_logo_url,'quotationId',new.id,'revisionNumber',new.revision_number,'notificationCategory','Approval / Review','notificationModule','Quotation','notificationPriority','High');
  if v_request then perform public.service_queue_quotation_approval_reviewers(new.id,'quotation-approval-required:'||new.id::text||':'||new.revision_number::text||':'||coalesce(extract(epoch from new.approval_checked_at)::bigint::text,extract(epoch from new.updated_at)::bigint::text),'quotation_approval_required','Approval','Quotation Approval Required — '||new.quotation_number,'Quotation '||new.quotation_number||' for '||coalesce(nullif(new.customer_name,''),'Customer')||' is waiting for your review.','/admin/quotation-approvals/'||new.id::text,v_payload,now()); end if;
  if v_approved and new.salesperson_id is not null then perform public.service_queue_staff_operational_notification(new.salesperson_id,'quotation-approved:'||new.id||':'||new.revision_number::text||':'||extract(epoch from coalesce(new.approved_at,new.updated_at))::bigint,'quotation_approved_internal','Quotation','Quotation approved — '||new.quotation_number,'Management approved this quotation. You can continue to Send Quotation.','/admin/quotations/'||new.id::text,v_payload||jsonb_build_object('notificationPriority','Normal'),now()); end if;
  return new;
end;
$function$;

revoke all on function public.notification_center_category(text,text) from public,anon;
revoke all on function public.notification_center_priority(text,text) from public,anon;
revoke all on function public.notification_center_module(text,text) from public,anon;
revoke all on function public.service_queue_quotation_approval_reviewers(uuid,text,text,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.track_quotation_approval_state() from public,anon,authenticated;
revoke all on function public.audit_quotation_approval_center() from public,anon,authenticated;

grant execute on function public.get_my_notification_center(integer,integer,text,boolean) to authenticated;
grant execute on function public.mark_all_in_app_notifications_read() to authenticated;
grant execute on function public.mark_in_app_notification_read(uuid) to authenticated;
grant execute on function public.can_access_quotation_approvals() to authenticated;
grant execute on function public.quotation_approval_reviewer_authorized(uuid,uuid) to authenticated;
grant execute on function public.get_quotation_approval_requests(text,text,integer,integer) to authenticated;
grant execute on function public.get_quotation_approval_detail(uuid) to authenticated;
grant execute on function public.review_quotation_approval(uuid,text,text) to authenticated;
grant execute on function public.admin_approve_quotation_cpq(uuid,text) to authenticated;
