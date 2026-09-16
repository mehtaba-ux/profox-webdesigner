-- Part 10B hardening: callers may never author Sales-scope snapshot fields.
-- The BEFORE UPDATE trigger may populate them itself only after the incoming row
-- has passed this check and the active final-Send invariant succeeds.

create or replace function public.protect_quotation_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_atomic text:=coalesce(current_setting('profox.quotation_atomic_rpc',true),'');
  v_view_tracking text:=coalesce(current_setting('profox.quotation_view_tracking_rpc',true),'');
  v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
  v_gate_active boolean:=false;
  v_snapshot jsonb;
  v_snapshot_changed boolean:=false;
begin
  v_snapshot_changed:=new.sales_scope_snapshot is distinct from old.sales_scope_snapshot
    or new.sales_scope_snapshot_at is distinct from old.sales_scope_snapshot_at
    or new.sales_scope_snapshot_schema_version is distinct from old.sales_scope_snapshot_schema_version;

  -- No browser/Admin/ordinary RPC caller may submit, clear or rewrite snapshot authority,
  -- including in the same UPDATE that transitions a quotation to Sent. If the gate is
  -- active, this trigger itself fills NEW.* only after this incoming-row check passes.
  if v_snapshot_changed then
    raise exception 'Quotation Sales scope snapshot is server-controlled and immutable. Create a quotation revision for corrections.';
  end if;

  if old.status<>'Sent' and new.status='Sent' then
    select coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)
      into v_gate_active
    from public.system_configuration
    where config_key='crm_quotation_sales_reconciliation_policy_v1';

    if v_gate_active then
      -- Final Send may change only expected send metadata. Material quotation content must
      -- already be saved/reconciled/approved before the Sent transition.
      if (to_jsonb(new)-array[
          'status','email','send_cc','send_subject','send_message','sent_at','updated_at',
          'customer_identity_id','sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version'
        ]::text[])
         is distinct from
         (to_jsonb(old)-array[
          'status','email','send_cc','send_subject','send_message','sent_at','updated_at',
          'customer_identity_id','sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version'
        ]::text[]) then
        raise exception 'Material quotation content cannot be changed in the same statement that sends the quotation. Save, reconcile and approve first.';
      end if;

      v_snapshot:=public.crm_capture_quotation_sales_scope_snapshot(new.id);
      if v_snapshot is null then raise exception 'Final Sales send gate is active but no immutable snapshot was produced.'; end if;
      new.sales_scope_snapshot:=v_snapshot;
      new.sales_scope_snapshot_at:=statement_timestamp();
      new.sales_scope_snapshot_schema_version:=2;
    end if;
  end if;

  -- Established maintenance paths remain intact, but only after the universal Sent
  -- invariant and the incoming snapshot-forge protection above have executed.
  if v_view_tracking='1' or v_gateway='1' then return new; end if;
  if public.is_admin() then return new; end if;
  if v_atomic='1' then return new; end if;

  if old.status in ('Approved','Sent','Accepted','Rejected','Expired','Cancelled')
     and row(new.*) is distinct from row(old.*) then
    raise exception 'Locked quotation may only be changed through the approved quotation workflow.';
  end if;
  if new.status not in ('Draft','Ready for Approval') then
    raise exception 'Sales may only change quotation status through the approved quotation workflow.';
  end if;
  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.accepted_at is distinct from old.accepted_at
     or new.approval_required is distinct from old.approval_required
     or new.approval_route is distinct from old.approval_route
     or new.approval_reason is distinct from old.approval_reason
     or new.approval_checked_at is distinct from old.approval_checked_at
     or new.approval_requested_at is distinct from old.approval_requested_at
     or new.approval_requested_by is distinct from old.approval_requested_by
     or new.approval_reasons_snapshot is distinct from old.approval_reasons_snapshot
     or new.approval_decision is distinct from old.approval_decision
     or new.approval_decision_note is distinct from old.approval_decision_note
     or new.approval_decided_at is distinct from old.approval_decided_at
     or new.approval_decided_by is distinct from old.approval_decided_by then
    raise exception 'Quotation approval and acceptance fields are privileged.';
  end if;
  if pg_trigger_depth()=1
     and (new.subtotal is distinct from old.subtotal or new.total is distinct from old.total) then
    raise exception 'Quotation totals are calculated from line items and cannot be edited directly.';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_quotation_transition() from public, anon, authenticated;
grant execute on function public.protect_quotation_transition() to service_role;
