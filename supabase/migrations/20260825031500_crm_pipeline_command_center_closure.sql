-- Close remaining CRM command-center integrity gaps without replacing canonical systems.

create index if not exists idx_crm_leads_archived_by
  on public.crm_leads(archived_by) where archived_by is not null;
create index if not exists idx_crm_opportunities_archived_by
  on public.crm_opportunities(archived_by) where archived_by is not null;

create or replace function public.crm_audit_quotation_timeline()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead_id uuid;
begin
  select o.lead_id into v_lead_id
  from public.crm_opportunities o
  where o.id=coalesce(new.opportunity_id,old.opportunity_id);
  if v_lead_id is null then return new; end if;

  if tg_op='INSERT' then
    perform public.crm_write_lead_event(v_lead_id,'quotation_created','Quotation created','Quotation '||coalesce(new.quotation_number,new.id::text)||' was created.',jsonb_build_object('quotationId',new.id,'quotationNumber',new.quotation_number,'status',new.status,'total',new.total,'currency',new.currency,'opportunityId',new.opportunity_id),new.created_by,null,null,coalesce(new.created_at,now()),'quotation-created:'||new.id::text);
    return new;
  end if;
  if new.approved_at is distinct from old.approved_at and new.approved_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'quotation_approved','Quotation approved','Quotation '||coalesce(new.quotation_number,new.id::text)||' was approved.',jsonb_build_object('quotationId',new.id,'status',new.status,'approvedAt',new.approved_at,'opportunityId',new.opportunity_id),new.approved_by,null,null,new.approved_at,'quotation-approved:'||new.id::text);
  end if;
  if new.sent_at is distinct from old.sent_at and new.sent_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'quotation_sent','Quotation sent','Quotation '||coalesce(new.quotation_number,new.id::text)||' was sent to the customer.',jsonb_build_object('quotationId',new.id,'status',new.status,'sentAt',new.sent_at,'total',new.total,'currency',new.currency,'opportunityId',new.opportunity_id),coalesce(new.approved_by,new.salesperson_id),null,null,new.sent_at,'quotation-sent:'||new.id::text);
  end if;
  if new.first_viewed_at is distinct from old.first_viewed_at and new.first_viewed_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'quotation_viewed','Quotation viewed','The customer viewed quotation '||coalesce(new.quotation_number,new.id::text)||'.',jsonb_build_object('quotationId',new.id,'firstViewedAt',new.first_viewed_at,'viewCount',new.view_count,'opportunityId',new.opportunity_id),null,'Customer','customer',new.first_viewed_at,'quotation-first-viewed:'||new.id::text);
  end if;
  if new.accepted_at is distinct from old.accepted_at and new.accepted_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'quotation_accepted','Quotation accepted','The customer accepted quotation '||coalesce(new.quotation_number,new.id::text)||'.',jsonb_build_object('quotationId',new.id,'status',new.status,'acceptedAt',new.accepted_at,'total',new.total,'currency',new.currency,'opportunityId',new.opportunity_id),null,'Customer','customer',new.accepted_at,'quotation-accepted:'||new.id::text);
  end if;
  if new.rejected_at is distinct from old.rejected_at and new.rejected_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'quotation_rejected','Quotation rejected','The customer rejected quotation '||coalesce(new.quotation_number,new.id::text)||'.',jsonb_build_object('quotationId',new.id,'status',new.status,'rejectedAt',new.rejected_at,'opportunityId',new.opportunity_id),null,'Customer','customer',new.rejected_at,'quotation-rejected:'||new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_quotation_timeline on public.quotations;
create trigger trigger_crm_audit_quotation_timeline
after insert or update on public.quotations
for each row execute function public.crm_audit_quotation_timeline();

create or replace function public.crm_audit_payment_timeline()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead_id uuid;
begin
  select o.lead_id into v_lead_id
  from public.crm_opportunities o
  where o.id=coalesce(new.opportunity_id,old.opportunity_id);
  if v_lead_id is null then return new; end if;

  if tg_op='INSERT' then
    perform public.crm_write_lead_event(v_lead_id,'payment_requested','Payment requested',coalesce(new.payment_type,'Payment')||' payment request was created.',jsonb_build_object('paymentId',new.id,'quotationId',new.quotation_id,'opportunityId',new.opportunity_id,'paymentType',new.payment_type,'milestoneNumber',new.milestone_number,'milestoneLabel',new.milestone_label,'amountDue',new.amount_due,'currency',new.currency,'status',new.status),new.created_by,null,null,coalesce(new.created_at,now()),'payment-requested:'||new.id::text);
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.crm_write_lead_event(v_lead_id,'payment_status_changed','Payment status changed','Payment status changed from '||coalesce(old.status,'Unknown')||' to '||coalesce(new.status,'Unknown')||'.',jsonb_build_object('paymentId',new.id,'quotationId',new.quotation_id,'opportunityId',new.opportunity_id,'previousValue',old.status,'newValue',new.status,'amountDue',new.amount_due,'amountPaid',new.amount_paid,'currency',new.currency,'paymentType',new.payment_type),coalesce(new.verified_by,new.created_by),null,null,coalesce(new.updated_at,now()),'payment-status:'||new.id::text||':'||coalesce(new.status,'unknown'));
  end if;
  if new.verified_at is distinct from old.verified_at and new.verified_at is not null then
    perform public.crm_write_lead_event(v_lead_id,'payment_verified','Payment verified',coalesce(new.payment_type,'Payment')||' payment was verified.',jsonb_build_object('paymentId',new.id,'quotationId',new.quotation_id,'opportunityId',new.opportunity_id,'paymentType',new.payment_type,'amountPaid',new.amount_paid,'currency',new.currency,'verifiedAt',new.verified_at,'status',new.status),new.verified_by,null,null,new.verified_at,'payment-verified:'||new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_payment_timeline on public.payments;
create trigger trigger_crm_audit_payment_timeline
after insert or update on public.payments
for each row execute function public.crm_audit_payment_timeline();