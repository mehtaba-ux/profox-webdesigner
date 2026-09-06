-- Part 1 hardening: protect attribution/identity and make meeting RLS references explicit.

create or replace function public.crm_sales_discovery_stamp_insert_actor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated CRM access is required.';
  end if;

  if tg_table_name = 'crm_meeting_discovery_questions' then
    new.added_by := auth.uid();
  else
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function public.crm_sales_discovery_stamp_insert_actor() from public, anon, authenticated;

create trigger crm_requirements_stamp_insert_actor
before insert on public.crm_requirements
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create trigger crm_discovery_questions_stamp_insert_actor
before insert on public.crm_discovery_questions
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create trigger crm_discovery_responses_stamp_insert_actor
before insert on public.crm_discovery_responses
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create trigger crm_client_voice_stamp_insert_actor
before insert on public.crm_client_voice
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create trigger crm_meeting_preparations_stamp_insert_actor
before insert on public.crm_meeting_preparations
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create trigger crm_meeting_discovery_questions_stamp_insert_actor
before insert on public.crm_meeting_discovery_questions
for each row execute function public.crm_sales_discovery_stamp_insert_actor();

create or replace function public.crm_sales_discovery_protect_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'crm_requirements' then
    if new.lead_id is distinct from old.lead_id or new.requirement_key is distinct from old.requirement_key then
      raise exception 'Requirement identity cannot be changed.';
    end if;
  elsif tg_table_name = 'crm_discovery_questions' then
    if new.lead_id is distinct from old.lead_id
      or new.question_key is distinct from old.question_key
      or new.is_custom is distinct from old.is_custom then
      raise exception 'Discovery question identity cannot be changed.';
    end if;
  elsif tg_table_name = 'crm_discovery_responses' then
    if new.lead_id is distinct from old.lead_id or new.question_id is distinct from old.question_id then
      raise exception 'Discovery response identity cannot be changed.';
    end if;
  elsif tg_table_name = 'crm_client_voice' then
    if new.lead_id is distinct from old.lead_id then
      raise exception 'Client Voice lead cannot be changed.';
    end if;
  elsif tg_table_name = 'crm_meeting_preparations' then
    if new.meeting_id is distinct from old.meeting_id then
      raise exception 'Meeting Prep cannot be moved to another meeting.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.crm_sales_discovery_protect_identity() from public, anon, authenticated;

create trigger crm_requirements_protect_identity
before update on public.crm_requirements
for each row execute function public.crm_sales_discovery_protect_identity();

create trigger crm_discovery_questions_protect_identity
before update on public.crm_discovery_questions
for each row execute function public.crm_sales_discovery_protect_identity();

create trigger crm_discovery_responses_protect_identity
before update on public.crm_discovery_responses
for each row execute function public.crm_sales_discovery_protect_identity();

create trigger crm_client_voice_protect_identity
before update on public.crm_client_voice
for each row execute function public.crm_sales_discovery_protect_identity();

create trigger crm_meeting_preparations_protect_identity
before update on public.crm_meeting_preparations
for each row execute function public.crm_sales_discovery_protect_identity();

create or replace function public.crm_meeting_preparation_stamp_ready()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.preparation_state = 'READY' then
    if tg_op = 'INSERT' or old.preparation_state is distinct from 'READY' or new.prepared_by is null or new.prepared_at is null then
      new.prepared_by := auth.uid();
      new.prepared_at := now();
    else
      new.prepared_by := old.prepared_by;
      new.prepared_at := old.prepared_at;
    end if;
  else
    new.prepared_by := null;
    new.prepared_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.crm_meeting_preparation_stamp_ready() from public, anon, authenticated;

create trigger crm_meeting_preparations_stamp_ready
before insert or update on public.crm_meeting_preparations
for each row execute function public.crm_meeting_preparation_stamp_ready();

drop policy crm_meeting_preparations_access on public.crm_meeting_preparations;
create policy crm_meeting_preparations_access
on public.crm_meeting_preparations
for all
to authenticated
using (
  exists (
    select 1 from public.sales_meetings m
    where m.id = public.crm_meeting_preparations.meeting_id
      and m.lead_id is not null
      and public.crm_can_access_lead(m.lead_id)
  )
)
with check (
  exists (
    select 1 from public.sales_meetings m
    where m.id = public.crm_meeting_preparations.meeting_id
      and m.lead_id is not null
      and public.crm_can_access_lead(m.lead_id)
  )
);

drop policy crm_meeting_discovery_questions_access on public.crm_meeting_discovery_questions;
create policy crm_meeting_discovery_questions_access
on public.crm_meeting_discovery_questions
for all
to authenticated
using (
  exists (
    select 1 from public.sales_meetings m
    where m.id = public.crm_meeting_discovery_questions.meeting_id
      and m.lead_id is not null
      and public.crm_can_access_lead(m.lead_id)
  )
)
with check (
  exists (
    select 1 from public.sales_meetings m
    where m.id = public.crm_meeting_discovery_questions.meeting_id
      and m.lead_id is not null
      and public.crm_can_access_lead(m.lead_id)
  )
);
