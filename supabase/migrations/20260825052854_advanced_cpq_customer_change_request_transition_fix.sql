-- Allow the approved public response RPC to record a non-commercial customer change request
-- without weakening the existing locked-quotation transition guard.
create or replace function public.respond_public_quotation(p_token text,p_response text,p_note text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_hash text; v_quote public.quotations%rowtype; v_response text:=lower(btrim(coalesce(p_response,''))); v_note text:=left(btrim(coalesce(p_note,'')),2000); v_payment jsonb:='{}'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  if v_response not in ('accept','reject','request_changes') then raise exception 'Choose Accept, Request Changes, or Decline.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  if v_quote.superseded_by_id is not null then raise exception 'This quotation has been superseded by a newer revision. Please review the latest proposal from ProFox.'; end if;
  if v_quote.status='Accepted' and v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Accepted','acceptedAt',v_quote.accepted_at,'payment',v_payment); end if;
  if v_quote.status='Rejected' and v_response='reject' then return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Rejected','rejectedAt',v_quote.rejected_at); end if;
  if v_quote.status<>'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until<current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
  if v_response='request_changes' then
    if v_note='' then raise exception 'Please describe your question or requested change.'; end if;
    perform set_config('profox.quotation_atomic_rpc','1',true);
    update public.quotations set change_requested_at=now(),change_request_note=v_note,updated_at=now() where id=v_quote.id returning * into v_quote;
    perform set_config('profox.quotation_atomic_rpc','',true);
    if v_quote.salesperson_id is not null then perform public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-change-requested:'||v_quote.id::text||':'||extract(epoch from v_quote.change_requested_at)::bigint,'quotation_change_requested','Quotation','Customer requested changes — '||v_quote.quotation_number,coalesce(nullif(v_quote.customer_name,''),'Customer')||' asked a question or requested a quotation change.','/admin/app/sales?tab=quotations',jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'note',v_note),now()); end if;
    return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'changeRequestedAt',v_quote.change_requested_at,'message','Your request has been sent to ProFox.');
  end if;
  if v_response='accept' and v_quote.payment_schedule_snapshot is null then perform public.snapshot_quotation_payment_schedule(v_quote.id); end if;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  if v_response='accept' then
    update public.quotations set status='Accepted',accepted_at=coalesce(accepted_at,now()),rejected_at=null,customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote;
  else
    update public.quotations set status='Rejected',rejected_at=coalesce(rejected_at,now()),customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
  if v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); end if;
  return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'acceptedAt',v_quote.accepted_at,'rejectedAt',v_quote.rejected_at,'payment',v_payment);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;
revoke all on function public.respond_public_quotation(text,text,text) from public;
grant execute on function public.respond_public_quotation(text,text,text) to anon, authenticated, service_role, postgres;
