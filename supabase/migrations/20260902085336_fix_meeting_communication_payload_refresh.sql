create or replace function public.service_refresh_meeting_pending_communication_payloads(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_customer jsonb; v_seller jsonb;
begin
  v_customer:=public.build_sales_meeting_customer_payload(p_meeting_id);
  v_seller:=public.build_sales_meeting_notification_payload(p_meeting_id);
  if v_seller='{}'::jsonb then return; end if;
  update public.notification_outbox o
  set payload=case
      when o.template_key like 'seller_%' or o.template_key='meeting_customer_email_failed' then o.payload||v_seller
      else o.payload||v_customer
    end,
    updated_at=now()
  where o.status in ('Pending','Retry') and o.payload->>'meetingId'=p_meeting_id::text;
end;
$function$;
revoke all on function public.service_refresh_meeting_pending_communication_payloads(uuid) from public,anon,authenticated;