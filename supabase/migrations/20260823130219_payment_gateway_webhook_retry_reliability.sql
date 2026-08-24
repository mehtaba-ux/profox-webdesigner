create or replace function public.service_register_payment_gateway_event(p_provider text,p_event_id text,p_event_type text,p_provider_order_id text default '',p_provider_payment_id text default '',p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event uuid;
  v_existing public.payment_gateway_events%rowtype;
  v_a public.payment_gateway_attempts%rowtype;
begin
  if v_provider not in ('razorpay','paypal') or trim(coalesce(p_event_id,''))='' then raise exception 'Valid gateway event identity required.'; end if;
  select * into v_a from public.payment_gateway_attempts where provider=v_provider and ((nullif(trim(p_provider_order_id),'') is not null and provider_order_id=trim(p_provider_order_id)) or (nullif(trim(p_provider_payment_id),'') is not null and provider_payment_id=trim(p_provider_payment_id))) order by created_at desc limit 1;
  insert into public.payment_gateway_events(provider,provider_event_id,event_type,payment_id,attempt_id,verified,processed,safe_metadata)
  values(v_provider,left(trim(p_event_id),255),left(trim(coalesce(p_event_type,'')),255),v_a.payment_id,v_a.id,true,false,coalesce(p_metadata,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing returning id into v_event;
  if v_event is null then
    select * into v_existing from public.payment_gateway_events where provider=v_provider and provider_event_id=left(trim(p_event_id),255);
    return jsonb_build_object('isNew',not coalesce(v_existing.processed,false),'eventId',v_existing.id,'attemptId',coalesce(v_existing.attempt_id,v_a.id),'paymentId',coalesce(v_existing.payment_id,v_a.payment_id),'retry',not coalesce(v_existing.processed,false));
  end if;
  return jsonb_build_object('isNew',true,'eventId',v_event,'attemptId',v_a.id,'paymentId',v_a.payment_id,'retry',false);
end; $$;

revoke all on function public.service_register_payment_gateway_event(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.service_register_payment_gateway_event(text,text,text,text,text,jsonb) to service_role;
