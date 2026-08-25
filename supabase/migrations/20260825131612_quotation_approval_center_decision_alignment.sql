insert into public.notification_templates(template_key,name,subject_template,body_template,description,active)
values
('quotation_changes_requested_internal','Quotation changes requested','Changes requested for {{quotationNumber}}','Changes were requested for quotation {{quotationNumber}}.\n\nCustomer: {{customerName}}\nReviewer: {{reviewerName}}\nReason: {{decisionNote}}\n\nOpen the quotation in ProFox to review the requested changes.','Internal seller notification when Management requests quotation changes.',true),
('quotation_not_approved_internal','Quotation not approved','Quotation {{quotationNumber}} was not approved','Quotation {{quotationNumber}} was not approved.\n\nCustomer: {{customerName}}\nReviewer: {{reviewerName}}\nReason: {{decisionNote}}\n\nOpen the quotation in ProFox to review the decision and revise if appropriate.','Internal seller notification when Management rejects a quotation approval request.',true)
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  description=excluded.description,active=true,updated_at=now();

create or replace function public.get_quotation_cpq_summary(p_quotation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare
  v_q public.quotations%rowtype; v_presentation jsonb; v_payment jsonb; v_reasons text[]; v_missing text[]:='{}'::text[];
  v_timeline_missing text[]:='{}'::text[]; v_name text; v_has_scope boolean; v_email_ok boolean; v_expiry_ok boolean;
  v_payment_ok boolean; v_timeline_ok boolean; v_ready boolean; v_reviewer_name text;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin()
     and v_q.salesperson_id is distinct from auth.uid()
     and not public.has_active_role(array['project_manager','site_manager'])
     and not public.quotation_approval_reviewer_authorized(p_quotation_id,auth.uid()) then
    raise exception 'Unauthorized.';
  end if;
  v_presentation:=public.quotation_presentation_payload(p_quotation_id);
  v_payment:=v_presentation->'paymentPlan';
  v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id);
  v_timeline_missing:=public.quotation_timeline_missing_items(p_quotation_id);
  select exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false) into v_has_scope;
  v_email_ok:=coalesce(v_q.email,'')~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  v_expiry_ok:=v_q.valid_until is not null and v_q.valid_until>=current_date;
  v_payment_ok:=coalesce(v_payment->>'error','')='' and jsonb_typeof(v_payment->'schedule')='array' and jsonb_array_length(v_payment->'schedule')>0;
  v_timeline_ok:=cardinality(v_timeline_missing)=0 and nullif(btrim(coalesce(v_q.duration_snapshot_text,'')),'') is not null;
  if v_q.opportunity_id is null then v_missing:=array_append(v_missing,'CRM Opportunity linked'); end if;
  if not v_email_ok then v_missing:=array_append(v_missing,'Customer email available'); end if;
  if not v_has_scope then v_missing:=array_append(v_missing,'At least one committed product/service'); end if;
  if coalesce(v_q.total,0)<=0 then v_missing:=array_append(v_missing,'Pricing valid'); end if;
  foreach v_name in array v_timeline_missing loop v_missing:=array_append(v_missing,'Timeline missing for "'||v_name||'"'); end loop;
  if not v_payment_ok then v_missing:=array_append(v_missing,'Payment schedule valid'); end if;
  if v_q.status<>'Approved' then v_missing:=array_append(v_missing,'Required approval completed'); end if;
  if not v_expiry_ok then v_missing:=array_append(v_missing,'Expiration date valid'); end if;
  if v_q.superseded_by_id is not null then v_missing:=array_append(v_missing,'Current revision'); end if;
  v_ready:=cardinality(v_missing)=0;
  select coalesce(nullif(full_name,''),email,'') into v_reviewer_name from public.user_profiles where id=v_q.approval_decided_by;
  return jsonb_build_object(
    'presentation',v_presentation,
    'approval',jsonb_build_object(
      'required',cardinality(v_reasons)>0,'reasons',to_jsonb(v_reasons),'requestedReasons',v_q.approval_reasons_snapshot,
      'status',v_q.status,'route',v_q.approval_route,'reason',v_q.approval_reason,
      'requestedAt',v_q.approval_requested_at,'decision',v_q.approval_decision,'decisionNote',v_q.approval_decision_note,
      'decidedAt',v_q.approval_decided_at,'reviewerName',coalesce(v_reviewer_name,'')
    ),
    'readiness',jsonb_build_object('readyToSend',v_ready,'missing',to_jsonb(v_missing),'timelineIssues',to_jsonb(v_timeline_missing),'opportunityLinked',v_q.opportunity_id is not null,'emailAvailable',v_email_ok,'hasProductOrService',v_has_scope,'pricingValid',coalesce(v_q.total,0)>0,'timelineConfirmed',v_timeline_ok,'paymentScheduleValid',v_payment_ok,'approvalCompleted',v_q.status='Approved','expirationValid',v_expiry_ok,'currentRevision',v_q.superseded_by_id is null),
    'views',jsonb_build_object('firstViewedAt',v_q.first_viewed_at,'lastViewedAt',v_q.last_viewed_at,'viewCount',v_q.view_count)
  );
end;
$function$;

create or replace function public.review_quotation_approval(p_quotation_id uuid,p_decision text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  v_q public.quotations%rowtype; v_decision text:=lower(trim(coalesce(p_decision,''))); v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
  v_reviewer text; v_payload jsonb; v_template text;
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
    update public.quotations set status='Approved',approval_required=false,approval_route='manager_approved',approval_reason=coalesce(v_comment,'Reviewed and approved by Management.'),approval_checked_at=now(),approved_by=auth.uid(),approved_at=now(),approval_decision='approved',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),updated_at=now() where id=p_quotation_id returning * into v_q;
  elsif v_decision='request_changes' then
    update public.quotations set status='Draft',approval_required=false,approval_route='changes_requested',approval_decision='changes_requested',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id returning * into v_q;
  else
    update public.quotations set status='Draft',approval_required=false,approval_route='manager_rejected',approval_decision='rejected',approval_decision_note=v_comment,approval_decided_at=now(),approval_decided_by=auth.uid(),approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id returning * into v_q;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
  v_payload:=jsonb_build_object('quotationNumber',v_q.quotation_number,'customerName',v_q.customer_name,'currency',v_q.currency,'total',v_q.total,'decision',v_decision,'decisionNote',coalesce(v_comment,''),'reviewerName',coalesce(v_reviewer,'Reviewer'),'revisionNumber',v_q.revision_number,'notificationCategory','Approval / Review','notificationModule','Quotation','notificationPriority',case when v_decision='approve' then 'Normal' else 'High' end);
  if v_decision<>'approve' and v_q.salesperson_id is not null then
    v_template:=case when v_decision='request_changes' then 'quotation_changes_requested_internal' else 'quotation_not_approved_internal' end;
    perform public.service_queue_staff_operational_notification(v_q.salesperson_id,'quotation-approval-decision:'||v_q.id::text||':'||v_q.revision_number::text||':'||v_decision||':'||extract(epoch from coalesce(v_q.approval_decided_at,now()))::bigint,v_template,'Quotation',case when v_decision='request_changes' then 'Changes requested — '||v_q.quotation_number else 'Quotation was not approved — '||v_q.quotation_number end,coalesce(v_reviewer,'Management')||': '||v_comment,'/admin/quotations/'||v_q.id::text,v_payload,now());
  end if;
  return public.get_quotation_cpq_summary(p_quotation_id)||jsonb_build_object('approvalDecision',v_q.approval_decision,'approvalDecisionNote',v_q.approval_decision_note,'approvalDecidedAt',v_q.approval_decided_at,'approvalDecidedByName',v_reviewer);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$function$;
