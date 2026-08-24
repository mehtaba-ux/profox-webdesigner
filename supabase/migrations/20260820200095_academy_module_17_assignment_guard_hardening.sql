-- Module 17 — harden assessment/mission evidence against direct learner inserts.
-- All Module 17 assignment history must originate from the secure CRM Training RPCs.

create or replace function public.protect_crm_training_assignment_write()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_slug text;
  v_rpc text:=coalesce(current_setting('profox.training_crm_rpc',true),'');
begin
  if public.is_admin() then return new; end if;
  select slug into v_slug from public.training_modules where id=new.module_id;
  if v_slug='crm-training' and v_rpc<>'1' then
    raise exception 'Module 17 mission and assessment history is controlled by the secure CRM Training workflow.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_crm_training_assignment_write() from public,anon,authenticated;
