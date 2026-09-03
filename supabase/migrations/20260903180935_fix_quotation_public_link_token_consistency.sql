create or replace function public.quotation_customer_communication_context(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_service text;
  v_total text;
  v_valid text;
  v_terms text;
  v_scope text;
  v_subject text;
  v_message text;
  v_quote_url text;
  v_conversation_url text;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return '{}'::jsonb; end if;

  select product_name_snapshot into v_service
  from public.quotation_items
  where quotation_id=v_q.id and line_type in ('product','custom') and optional_for_client=false
  order by (item_type='package') desc,sort_order,id limit 1;

  v_service:=coalesce(nullif(trim(v_service),''),'your project');
  v_total:=trim(to_char(coalesce(v_q.total,0),'FM999999999990.00'));
  v_valid:=case when v_q.valid_until is null then 'the date agreed with your ProFox contact' else to_char(v_q.valid_until,'FMMonth DD, YYYY') end;
  v_terms:=coalesce(nullif(trim(v_q.payment_terms),''),'As agreed in the quotation');
  v_scope:=coalesce(nullif(trim(v_q.scope_summary),''),'The agreed project scope is included in the quotation.');
  v_subject:=coalesce(nullif(trim(v_q.send_subject),''),'Your ProFox proposal is ready: '||v_q.quotation_number);
  v_message:=coalesce(nullif(trim(v_q.send_message),''),'Thank you for the opportunity to prepare this proposal. Please review the scope, investment, timeline and payment plan using the secure link below.');

  -- Read an already-issued canonical quotation URL only. This helper must never
  -- rotate customer tokens while the initial send notification is being built.
  select o.payload->>'quotationUrl'
  into v_quote_url
  from public.notification_outbox o
  where o.template_key='customer_quotation_sent'
    and (o.dedupe_key='customer-quotation-sent:'||v_q.id::text
      or o.dedupe_key like 'customer-quotation-resent:'||v_q.id::text||':%')
    and nullif(btrim(coalesce(o.payload->>'quotationUrl','')),'') is not null
    and v_q.customer_view_token_hash is not null
    and encode(
      extensions.digest(
        substring(o.payload->>'quotationUrl' from '/quotation/review/([A-Za-z0-9_-]+)'),
        'sha256'
      ),
      'hex'
    ) = v_q.customer_view_token_hash
  order by o.created_at desc
  limit 1;

  v_conversation_url:=case
    when nullif(btrim(coalesce(v_quote_url,'')),'') is not null then v_quote_url||'#conversation'
    else ''
  end;

  return jsonb_build_object(
    'quotationNumber',v_q.quotation_number,'revisionNumber',v_q.revision_number,'serviceLabel',v_service,
    'currency',coalesce(nullif(trim(v_q.currency),''),'USD'),'totalFormatted',v_total,
    'validUntil',coalesce(v_q.valid_until::text,''),'validUntilHuman',v_valid,'paymentTerms',v_terms,
    'scopeSummary',v_scope,'emailSubject',v_subject,'personalMessage',v_message,
    'conversationUrl',v_conversation_url
  );
end;
$function$;

create or replace function public.notify_quotation_customer_event()
returns trigger
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare v_context jsonb; v_key text; v_template text; v_token text; v_base_url text; v_quote_url text; v_cc text;
begin
  if tg_op<>'UPDATE' or new.status is not distinct from old.status then return new; end if;
  if lower(trim(coalesce(new.email,'')))='' then return new; end if;
  if new.status='Sent' then
    v_key:='customer-quotation-sent:'||new.id::text;
    v_template:='customer_quotation_sent';
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    select nullif(btrim(config_value->>'url'),'') into v_base_url
    from public.system_configuration where config_key='public_app_base_url';
    v_base_url:=rtrim(coalesce(v_base_url,'https://www.profoxwebdesigner.com'),'/');
    v_quote_url:=v_base_url||'/quotation/review/'||v_token;

    perform set_config('profox.quotation_view_tracking_rpc','1',true);
    update public.quotations
    set customer_view_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
        customer_view_token_issued_at=now(),
        first_viewed_at=null,
        last_viewed_at=null,
        view_count=0,
        updated_at=now()
    where id=new.id;
    perform set_config('profox.quotation_view_tracking_rpc','',true);
  elsif new.status='Accepted' then
    v_key:='customer-quotation-accepted:'||new.id::text;
    v_template:='customer_quotation_accepted';
  elsif new.status='Rejected' then
    v_key:='customer-quotation-closed:'||new.id::text;
    v_template:='customer_quotation_closed';
  else
    return new;
  end if;

  v_context:=public.quotation_customer_communication_context(new.id);
  if v_quote_url is not null then
    v_context:=v_context||jsonb_build_object(
      'quotationUrl',v_quote_url,
      'conversationUrl',v_quote_url||'#conversation'
    );
  end if;

  perform public.service_queue_customer_communication(
    v_key,v_template,new.email,new.salesperson_id,new.contact_name,new.customer_name,v_context,now()
  );

  if new.status='Sent' and array_length(new.send_cc,1) is not null then
    foreach v_cc in array new.send_cc loop
      if lower(btrim(coalesce(v_cc,'')))<>'' and lower(btrim(v_cc))<>lower(btrim(new.email)) then
        perform public.service_queue_customer_communication(
          'customer-quotation-sent-cc:'||new.id::text||':'||lower(btrim(v_cc)),
          v_template,v_cc,new.salesperson_id,new.contact_name,new.customer_name,v_context,now()
        );
      end if;
    end loop;
  end if;
  return new;
exception when others then
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  raise;
end;
$function$;

create or replace function public.resend_quotation_professional(
  p_quotation_id uuid,
  p_recipient text,
  p_cc text[] default '{}'::text[],
  p_subject text default null::text,
  p_message text default null::text
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
      'conversationUrl',v_url||'#conversation',
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

-- Repair quotations affected by the historical double-token send bug.
select set_config('profox.quotation_view_tracking_rpc','1',true);

with broken as (
  select q.id,
         no.id as outbox_id,
         no.payload->>'quotationUrl' as quotation_url,
         substring(no.payload->>'quotationUrl' from '/quotation/review/([A-Za-z0-9_-]+)') as quotation_token,
         substring(no.payload->>'conversationUrl' from '/quotation/review/([A-Za-z0-9_-]+)') as conversation_token
  from public.quotations q
  join public.notification_outbox no
    on no.dedupe_key='customer-quotation-sent:'||q.id::text
   and no.template_key='customer_quotation_sent'
  where q.status='Sent'
    and q.customer_view_token_hash is not null
    and nullif(btrim(coalesce(no.payload->>'quotationUrl','')),'') is not null
    and nullif(btrim(coalesce(no.payload->>'conversationUrl','')),'') is not null
), affected as (
  select b.*
  from broken b
  join public.quotations q on q.id=b.id
  where b.quotation_token is not null
    and b.conversation_token is not null
    and encode(extensions.digest(b.quotation_token,'sha256'),'hex') is distinct from q.customer_view_token_hash
    and encode(extensions.digest(b.conversation_token,'sha256'),'hex') = q.customer_view_token_hash
), repaired_quotes as (
  update public.quotations q
  set customer_view_token_hash=encode(extensions.digest(a.quotation_token,'sha256'),'hex'),
      updated_at=now()
  from affected a
  where q.id=a.id
  returning q.id
)
update public.notification_outbox no
set payload=jsonb_set(
      no.payload,
      '{conversationUrl}',
      to_jsonb(a.quotation_url||'#conversation'),
      true
    ),
    updated_at=now()
from affected a
where no.id=a.outbox_id;

select set_config('profox.quotation_view_tracking_rpc','',true);
