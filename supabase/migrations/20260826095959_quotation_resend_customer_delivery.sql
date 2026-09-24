alter table public.quotations
  add column if not exists resend_count integer not null default 0,
  add column if not exists last_resent_at timestamptz,
  add column if not exists last_resent_by uuid;

comment on column public.quotations.resend_count is 'Number of deliberate customer quotation resend actions after the initial Sent delivery.';
comment on column public.quotations.last_resent_at is 'Timestamp of the most recent deliberate resend of the already-sent quotation.';
comment on column public.quotations.last_resent_by is 'Authenticated staff user who most recently resent the quotation.';

create or replace function public.resend_quotation_professional(
  p_quotation_id uuid,
  p_recipient text,
  p_cc text[] default '{}'::text[],
  p_subject text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_email text:=lower(btrim(coalesce(p_recipient,'')));
  v_cc text[]:=coalesce(p_cc,'{}'::text[]);
  v_cc_email text;
  v_url text;
  v_token text;
  v_base_url text;
  v_context jsonb;
  v_subject text;
  v_message text;
  v_resend_count integer;
  v_outbox_id uuid;
begin
  select * into v_q
  from public.quotations
  where id=p_quotation_id
  for update;

  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then
    raise exception 'Unauthorized.';
  end if;
  if v_q.status<>'Sent' then
    raise exception 'Only a quotation that has already been sent can be resent.';
  end if;
  if v_q.superseded_by_id is not null then
    raise exception 'A superseded quotation cannot be resent. Send the current revision instead.';
  end if;
  if v_email='' or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid customer email is required.';
  end if;

  foreach v_cc_email in array v_cc loop
    if btrim(coalesce(v_cc_email,''))<>'' and lower(btrim(v_cc_email))!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Invalid CC email address: %',v_cc_email;
    end if;
  end loop;

  select no.payload->>'quotationUrl'
  into v_url
  from public.notification_outbox no
  where no.dedupe_key='customer-quotation-sent:'||p_quotation_id::text
    and no.template_key='customer_quotation_sent'
  limit 1;

  if nullif(btrim(coalesce(v_url,'')),'') is not null then
    v_token:=substring(v_url from '/quotation/review/([A-Za-z0-9_-]+)');
    if v_token is null
      or v_q.customer_view_token_hash is null
      or encode(extensions.digest(v_token,'sha256'),'hex') is distinct from v_q.customer_view_token_hash then
      v_url:=null;
    end if;
  end if;

  -- Normally the original secure URL is retained in the first delivery outbox payload.
  -- If historical retention ever removes it, issue a fresh secure link without resetting
  -- customer view history, commercial snapshots, approval, or payment state.
  if nullif(btrim(coalesce(v_url,'')),'') is null then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    select nullif(btrim(config_value->>'url'),'')
      into v_base_url
    from public.system_configuration
    where config_key='public_app_base_url';
    v_base_url:=rtrim(coalesce(v_base_url,'https://www.profoxwebdesigner.com'),'/');
    v_url:=v_base_url||'/quotation/review/'||v_token;

    perform set_config('profox.quotation_view_tracking_rpc','1',true);
    update public.quotations
    set customer_view_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
        customer_view_token_issued_at=now(),
        updated_at=now()
    where id=p_quotation_id;
    perform set_config('profox.quotation_view_tracking_rpc','',true);
  end if;

  v_subject:=coalesce(nullif(btrim(coalesce(p_subject,'')),''),
    coalesce(nullif(btrim(coalesce(v_q.send_subject,'')),''),'Your ProFox proposal is ready: '||v_q.quotation_number));
  v_message:=coalesce(nullif(btrim(coalesce(p_message,'')),''),
    coalesce(nullif(btrim(coalesce(v_q.send_message,'')),''),'As requested, I am resending your ProFox proposal. Please use the secure link below to review it.'));

  v_resend_count:=coalesce(v_q.resend_count,0)+1;
  v_context:=public.quotation_customer_communication_context(p_quotation_id)
    || jsonb_build_object(
      'quotationUrl',v_url,
      'emailSubject',v_subject,
      'personalMessage',v_message,
      'resend',true,
      'resendCount',v_resend_count
    );

  v_outbox_id:=public.service_queue_customer_communication(
    'customer-quotation-resent:'||p_quotation_id::text||':'||v_resend_count::text,
    'customer_quotation_sent',
    v_email,
    v_q.salesperson_id,
    v_q.contact_name,
    v_q.customer_name,
    v_context,
    now()
  );
  if v_outbox_id is null then
    raise exception 'Customer email delivery is currently disabled or unavailable.';
  end if;

  foreach v_cc_email in array v_cc loop
    v_cc_email:=lower(btrim(coalesce(v_cc_email,'')));
    if v_cc_email<>'' and v_cc_email<>v_email then
      perform public.service_queue_customer_communication(
        'customer-quotation-resent-cc:'||p_quotation_id::text||':'||v_resend_count::text||':'||v_cc_email,
        'customer_quotation_sent',
        v_cc_email,
        v_q.salesperson_id,
        v_q.contact_name,
        v_q.customer_name,
        v_context,
        now()
      );
    end if;
  end loop;

  perform set_config('profox.quotation_atomic_rpc','1',true);
  update public.quotations
  set resend_count=v_resend_count,
      last_resent_at=now(),
      last_resent_by=auth.uid(),
      updated_at=now()
  where id=p_quotation_id;
  perform set_config('profox.quotation_atomic_rpc','',true);

  return jsonb_build_object(
    'quotationId',p_quotation_id,
    'quotationNumber',v_q.quotation_number,
    'status','Sent',
    'recipient',v_email,
    'cc',v_cc,
    'resendCount',v_resend_count,
    'lastResentAt',now(),
    'queued',true
  );
exception when others then
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$function$;

revoke all on function public.resend_quotation_professional(uuid,text,text[],text,text) from public,anon;
grant execute on function public.resend_quotation_professional(uuid,text,text[],text,text) to authenticated,service_role,postgres;

comment on function public.resend_quotation_professional(uuid,text,text[],text,text) is
'Resends an already-Sent, current quotation through the existing customer notification pipeline without changing status, approval, commercial/payment snapshots, or customer view history. Reuses the original secure link when available.';
