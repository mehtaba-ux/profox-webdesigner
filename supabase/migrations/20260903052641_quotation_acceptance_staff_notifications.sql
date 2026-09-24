insert into public.notification_templates(
  template_key,name,subject_template,body_template,html_template,active,description,updated_at
) values (
  'quotation_accepted_internal',
  'Quotation Accepted - Staff',
  'Quotation accepted: {{quotationNumber}} - {{customerName}}',
  'A customer has accepted a ProFox quotation.\n\nQuotation: {{quotationNumber}}\nCustomer: {{customerName}}\nSeller: {{sellerName}}\nAccepted value: {{currency}} {{total}}\nAccepted at: {{acceptedAt}}\n\nOpen the accepted quotation and continue the approved payment / sales-handover workflow.\n\nOpen quotation: {{actionUrl}}\n\nProFox Sales Operations\nFrom site to system.\nhttps://www.profoxwebdesigner.com/',
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A customer accepted a ProFox quotation.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="height:4px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7;"><div style="font-size:19px;line-height:26px;font-weight:700;color:#000080;">ProFox</div><div style="margin-top:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b;">SALES - QUOTATION ACCEPTED</div></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">Quotation accepted: {{quotationNumber}}</h1><div style="font-size:15px;line-height:24px;color:#334155;">A customer has accepted a ProFox quotation.<br><br><strong>Customer:</strong> {{customerName}}<br><strong>Seller:</strong> {{sellerName}}<br><strong>Accepted value:</strong> {{currency}} {{total}}<br><strong>Accepted at:</strong> {{acceptedAt}}<br><br>Open the accepted quotation and continue the approved payment / sales-handover workflow.<br><br><a href="{{actionUrl}}" style="display:inline-block;background:#000080;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px;">Open accepted quotation</a><br><br>ProFox Sales Operations<br><span style="color:#64748b;">From site to system.</span><br><a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none;font-weight:700;">www.profoxwebdesigner.com</a></div></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:19px;color:#64748b;">ProFox - From site to system.</td></tr></table></td></tr></table></body></html>',
  true,
  'Internal in-app and email notification sent to the seller and responsible management when a customer first accepts a quotation.',
  now()
)
on conflict(template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  html_template=excluded.html_template,
  active=true,
  description=excluded.description,
  updated_at=now();

create or replace function public.notify_quotation_accepted_staff()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_payload jsonb;
  v_action_url text;
  v_seller_name text:='Assigned seller';
  v_secondary record;
  v_manager record;
  v_has_secondary boolean:=false;
  v_settings jsonb:='{}'::jsonb;
  v_key_prefix text;
begin
  if tg_op<>'UPDATE' then return new; end if;
  if new.status<>'Accepted' then return new; end if;
  if old.status='Accepted' and old.accepted_at is not distinct from new.accepted_at then return new; end if;
  if new.accepted_at is null then return new; end if;

  if new.salesperson_id is not null then
    select coalesce(nullif(btrim(u.full_name),''),nullif(btrim(u.email),''),'Assigned seller')
    into v_seller_name
    from public.user_profiles u
    where u.id=new.salesperson_id;
  end if;

  v_action_url:='/admin/focus/quotation/'||new.id::text;
  v_key_prefix:='quotation-accepted-internal:'||new.id::text;
  v_payload:=jsonb_build_object(
    'quotationId',new.id,
    'quotationNumber',coalesce(new.quotation_number,new.id::text),
    'customerName',coalesce(nullif(btrim(new.customer_name),''),'Customer'),
    'sellerName',coalesce(v_seller_name,'Assigned seller'),
    'currency',coalesce(nullif(btrim(new.currency),''),'USD'),
    'total',coalesce(new.total,0),
    'acceptedAt',new.accepted_at,
    'opportunityId',new.opportunity_id,
    'revisionNumber',new.revision_number,
    'notificationCategory','Action Required',
    'notificationModule','Sales',
    'notificationPriority','High'
  );

  if new.salesperson_id is not null then
    perform public.service_queue_staff_operational_notification(
      new.salesperson_id,
      v_key_prefix||':seller:'||new.salesperson_id::text,
      'quotation_accepted_internal',
      'Quotation',
      'Quotation accepted - '||coalesce(new.quotation_number,new.id::text),
      coalesce(nullif(btrim(new.customer_name),''),'Customer')||' accepted the quotation. Continue the payment and sales-handover workflow.',
      v_action_url,
      v_payload||jsonb_build_object('recipientRole','Seller'),
      now()
    );
  end if;

  for v_secondary in
    select distinct u.id
    from public.user_profiles u
    where u.id=any(array[new.approved_by,new.approval_decided_by]::uuid[])
      and u.id is not null
      and u.id is distinct from new.salesperson_id
      and u.status='active'
      and u.role not in ('customer','pending')
  loop
    v_has_secondary:=true;
    perform public.service_queue_staff_operational_notification(
      v_secondary.id,
      v_key_prefix||':reviewer:'||v_secondary.id::text,
      'quotation_accepted_internal',
      'Quotation',
      'Quotation accepted - '||coalesce(new.quotation_number,new.id::text),
      coalesce(nullif(btrim(new.customer_name),''),'Customer')||' accepted a quotation you reviewed. The commercial workflow can now continue.',
      v_action_url,
      v_payload||jsonb_build_object('recipientRole','Quotation Reviewer / Manager'),
      now()
    );
  end loop;

  begin
    v_settings:=coalesce(public.crm_quote_response_settings(),'{}'::jsonb);
  exception when others then
    v_settings:='{}'::jsonb;
  end;

  for v_manager in
    select distinct u.id
    from jsonb_array_elements_text(coalesce(v_settings->'managerUserIds','[]'::jsonb)) manager_id(value)
    join public.user_profiles u on u.id::text=manager_id.value
    where u.status='active'
      and u.role in ('sales','sales_rep','sales_team')
      and u.id is distinct from new.salesperson_id
      and u.id is distinct from new.approved_by
      and u.id is distinct from new.approval_decided_by
  loop
    v_has_secondary:=true;
    perform public.service_queue_staff_operational_notification(
      v_manager.id,
      v_key_prefix||':manager:'||v_manager.id::text,
      'quotation_accepted_internal',
      'Quotation',
      'Quotation accepted - '||coalesce(new.quotation_number,new.id::text),
      coalesce(nullif(btrim(new.customer_name),''),'Customer')||' accepted the quotation. Management visibility is recorded for the next commercial step.',
      v_action_url,
      v_payload||jsonb_build_object('recipientRole','Sales Manager'),
      now()
    );
  end loop;

  if not v_has_secondary then
    perform public.service_queue_active_admins_operational_notification(
      v_key_prefix||':management',
      'quotation_accepted_internal',
      'Quotation',
      'Quotation accepted - '||coalesce(new.quotation_number,new.id::text),
      coalesce(nullif(btrim(new.customer_name),''),'Customer')||' accepted the quotation. Management visibility is required for payment and handoff continuity.',
      v_action_url,
      v_payload||jsonb_build_object('recipientRole','Management'),
      now()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_quotation_accepted_staff() from public,anon,authenticated;
grant execute on function public.notify_quotation_accepted_staff() to service_role;

drop trigger if exists trg_notify_quotation_accepted_staff on public.quotations;
create trigger trg_notify_quotation_accepted_staff
after update of status,accepted_at on public.quotations
for each row
when (new.status='Accepted' and new.accepted_at is not null)
execute function public.notify_quotation_accepted_staff();