create or replace function public.protect_quotation_transition()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_atomic text:=coalesce(current_setting('profox.quotation_atomic_rpc',true),'');
  v_view_tracking text:=coalesce(current_setting('profox.quotation_view_tracking_rpc',true),'');
  v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
begin
  if v_view_tracking='1' or v_gateway='1' then return new; end if;
  if public.is_admin() then return new; end if;
  if v_atomic='1' then return new; end if;
  if old.status in ('Approved','Sent','Accepted','Rejected','Expired','Cancelled') and row(new.*) is distinct from row(old.*) then raise exception 'Locked quotation may only be changed through the approved quotation workflow.'; end if;
  if new.status not in ('Draft','Ready for Approval') then raise exception 'Sales may only change quotation status through the approved quotation workflow.'; end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or new.accepted_at is distinct from old.accepted_at or new.approval_required is distinct from old.approval_required or new.approval_route is distinct from old.approval_route or new.approval_reason is distinct from old.approval_reason or new.approval_checked_at is distinct from old.approval_checked_at then raise exception 'Quotation approval and acceptance fields are privileged.'; end if;
  if pg_trigger_depth()=1 and (new.subtotal is distinct from old.subtotal or new.total is distinct from old.total) then raise exception 'Quotation totals are calculated from line items and cannot be edited directly.'; end if;
  return new;
end; $$;