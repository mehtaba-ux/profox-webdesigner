create table if not exists public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null default '',
  phone text not null default '',
  linked_user_id uuid unique references public.user_profiles(id) on delete set null,
  relationship_status text not null default 'prospect' check (relationship_status in ('prospect','client','inactive')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_identities_email_normalized check (email = lower(btrim(email)) and email <> '')
);
comment on table public.customer_identities is 'Canonical customer/prospect identity that preserves one relationship history across leads, opportunities, quotations, conversations, payments, clients and portal access.';
comment on column public.customer_identities.email is 'Normalized matching key only. Email ownership must be verified before portal history is authorized.';
alter table public.customer_identities enable row level security;
revoke all on table public.customer_identities from anon,authenticated;
grant select,insert,update,delete on table public.customer_identities to service_role;

alter table public.crm_leads add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
alter table public.crm_opportunities add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
alter table public.quotations add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
alter table public.clients add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
alter table public.sales_chat_conversations add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
alter table public.payments add column if not exists customer_identity_id uuid references public.customer_identities(id) on delete set null;
create index if not exists crm_leads_customer_identity_idx on public.crm_leads(customer_identity_id);
create index if not exists crm_opportunities_customer_identity_idx on public.crm_opportunities(customer_identity_id);
create index if not exists quotations_customer_identity_idx on public.quotations(customer_identity_id);
create index if not exists clients_customer_identity_idx on public.clients(customer_identity_id);
create index if not exists sales_chat_conversations_customer_identity_idx on public.sales_chat_conversations(customer_identity_id);
create index if not exists payments_customer_identity_idx on public.payments(customer_identity_id);

create or replace function public.customer_identity_resolve(p_email text,p_name text default '',p_phone text default '') returns uuid
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_email text:=lower(btrim(coalesce(p_email,''))); v_name text:=left(btrim(coalesce(p_name,'')),240); v_phone text:=left(btrim(coalesce(p_phone,'')),80); v_id uuid;
begin
 if v_email='' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then return null; end if;
 insert into public.customer_identities(email,display_name,phone,first_seen_at,last_seen_at,updated_at)
 values(v_email,v_name,v_phone,now(),now(),now())
 on conflict(email) do update set display_name=case when excluded.display_name<>'' then excluded.display_name else public.customer_identities.display_name end,phone=case when excluded.phone<>'' then excluded.phone else public.customer_identities.phone end,last_seen_at=greatest(public.customer_identities.last_seen_at,now()),updated_at=now()
 returning id into v_id;
 return v_id;
end;$function$;
revoke all on function public.customer_identity_resolve(text,text,text) from public,anon,authenticated;
grant execute on function public.customer_identity_resolve(text,text,text) to service_role,postgres;

create or replace function public.sync_customer_identity_reference() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_row jsonb:=to_jsonb(new); v_email text; v_name text; v_phone text; v_id uuid;
begin
 v_email:=coalesce(v_row->>'email',v_row->>'customer_email','');
 v_name:=coalesce(v_row->>'contact_name',v_row->>'primary_contact_name',v_row->>'customer_name',v_row->>'company_name','');
 v_phone:=coalesce(v_row->>'phone',v_row->>'customer_phone','');
 if btrim(coalesce(v_email,''))='' then return new; end if;
 v_id:=public.customer_identity_resolve(v_email,v_name,v_phone);
 if v_id is not null then new.customer_identity_id:=v_id; end if;
 return new;
end;$function$;
revoke all on function public.sync_customer_identity_reference() from public,anon,authenticated;
grant execute on function public.sync_customer_identity_reference() to service_role,postgres;
do $do$ declare v_table text; begin foreach v_table in array array['crm_leads','crm_opportunities','quotations','clients','sales_chat_conversations','payments'] loop execute format('drop trigger if exists sync_customer_identity_reference on public.%I',v_table); execute format('create trigger sync_customer_identity_reference before insert or update on public.%I for each row execute function public.sync_customer_identity_reference()',v_table); end loop; end;$do$;

create or replace function public.sync_client_identity_portal_link() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_user uuid; begin if new.customer_identity_id is not null and new.linked_user_id is null then select linked_user_id into v_user from public.customer_identities where id=new.customer_identity_id; if v_user is not null then new.linked_user_id:=v_user; end if; end if; return new; end;$function$;
create or replace function public.mark_customer_identity_as_client() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin if new.customer_identity_id is not null and new.status='Active' then update public.customer_identities set relationship_status='client',last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=new.customer_identity_id; end if; return new; end;$function$;
revoke all on function public.sync_client_identity_portal_link() from public,anon,authenticated;
revoke all on function public.mark_customer_identity_as_client() from public,anon,authenticated;
grant execute on function public.sync_client_identity_portal_link() to service_role,postgres;
grant execute on function public.mark_customer_identity_as_client() to service_role,postgres;
drop trigger if exists sync_client_identity_portal_link on public.clients;
create trigger sync_client_identity_portal_link before insert or update of customer_identity_id,linked_user_id on public.clients for each row execute function public.sync_client_identity_portal_link();
drop trigger if exists mark_customer_identity_as_client on public.clients;
create trigger mark_customer_identity_as_client after insert or update of customer_identity_id,status on public.clients for each row execute function public.mark_customer_identity_as_client();

create or replace function public.customer_portal_claim_identity() returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_email text; v_confirmed timestamptz; v_role text; v_identity public.customer_identities%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required.'; end if;
 select lower(btrim(u.email)),u.email_confirmed_at,p.role into v_email,v_confirmed,v_role from auth.users u join public.user_profiles p on p.id=u.id where u.id=v_uid;
 if not found then raise exception 'Portal profile is not available.'; end if;
 if v_confirmed is null then raise exception 'Verify your email address before linking relationship history.'; end if;
 if v_role not in ('pending','customer') then raise exception 'Staff accounts cannot be linked to customer relationship history.'; end if;
 select * into v_identity from public.customer_identities where email=v_email for update;
 if not found then raise exception 'No ProFox relationship history is registered for this verified email yet.'; end if;
 if v_identity.linked_user_id is not null and v_identity.linked_user_id<>v_uid then raise exception 'This customer history is already linked to another verified portal account.'; end if;
 update public.customer_identities set linked_user_id=v_uid,last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_identity.id;
 update public.user_profiles set role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=v_uid and role in ('pending','customer');
 update public.clients set linked_user_id=v_uid,updated_at=now() where customer_identity_id=v_identity.id and (linked_user_id is null or linked_user_id=v_uid);
 return jsonb_build_object('identityId',v_identity.id,'email',v_email,'relationshipStatus',v_identity.relationship_status,'linked',true);
end;$function$;
revoke all on function public.customer_portal_claim_identity() from public,anon;
grant execute on function public.customer_portal_claim_identity() to authenticated,service_role,postgres;
