-- Keep every CRM-linked customer conversation bound to the canonical identity
-- of its CRM lead. This prevents an older conversation that happens to contain
-- the same email address from pulling professional email into the wrong lead.

create or replace function public.crm_align_sales_chat_conversation_lead_identity()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead public.crm_leads%rowtype;
  v_email text;
begin
  if new.crm_lead_id is null then
    return new;
  end if;

  select * into v_lead
  from public.crm_leads
  where id=new.crm_lead_id;

  if v_lead.id is null then
    return new;
  end if;

  v_email:=lower(btrim(coalesce(v_lead.email,'')));
  if v_email<>'' then
    new.customer_email:=v_email;
  end if;

  if v_lead.customer_identity_id is not null then
    new.customer_identity_id:=v_lead.customer_identity_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.crm_align_sales_chat_conversation_lead_identity() from public,anon,authenticated;

drop trigger if exists trigger_crm_align_sales_chat_conversation_lead_identity on public.sales_chat_conversations;
create trigger trigger_crm_align_sales_chat_conversation_lead_identity
before insert or update of crm_lead_id,customer_email,customer_identity_id
on public.sales_chat_conversations
for each row execute function public.crm_align_sales_chat_conversation_lead_identity();

-- Repair legacy CRM-linked conversations in place. Conversation IDs, chat
-- messages, public tokens, quotation relationships and timestamps are retained;
-- only the customer identity fields are reconciled to their canonical CRM lead.
update public.sales_chat_conversations c
set customer_email=case
      when nullif(btrim(coalesce(l.email,'')),'') is not null then lower(btrim(l.email))
      else c.customer_email
    end,
    customer_identity_id=coalesce(l.customer_identity_id,c.customer_identity_id),
    updated_at=case
      when nullif(btrim(coalesce(l.email,'')),'') is not null
       and lower(btrim(coalesce(c.customer_email,''))) is distinct from lower(btrim(l.email))
        then now()
      when l.customer_identity_id is not null
       and c.customer_identity_id is distinct from l.customer_identity_id
        then now()
      else c.updated_at
    end
from public.crm_leads l
where c.crm_lead_id=l.id
  and (
    (nullif(btrim(coalesce(l.email,'')),'') is not null
      and lower(btrim(coalesce(c.customer_email,''))) is distinct from lower(btrim(l.email)))
    or (l.customer_identity_id is not null and c.customer_identity_id is distinct from l.customer_identity_id)
  );

comment on function public.crm_align_sales_chat_conversation_lead_identity() is
'Keeps CRM-linked sales/customer conversations aligned to the canonical CRM lead email and customer identity so unified chat/email/WhatsApp resolution cannot drift across lead boundaries.';
