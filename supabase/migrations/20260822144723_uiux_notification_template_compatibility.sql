-- Temporary migration compatibility for the UI/UX feature branch.
-- Production notification_templates is canonical as:
-- template_key, name, subject_template, body_template, active, description, timestamps.
-- Two later UI/UX migrations were authored with alternate template field names.
-- Accept/map those fields only while the branch migration chain executes; a later cleanup migration removes them.

alter table public.notification_templates
  add column if not exists channel text,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists variables text[];

create or replace function public.uiux_notification_template_compatibility_map()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if coalesce(trim(new.name),'')='' then
    new.name:=initcap(replace(new.template_key,'_',' '));
  end if;
  if new.subject is not null then
    new.subject_template:=new.subject;
  end if;
  if coalesce(new.body_html,'')<>'' then
    new.body_template:=new.body_html;
  elsif new.body_text is not null then
    new.body_template:=new.body_text;
  end if;
  if coalesce(trim(new.description),'')='' then
    new.description:='Role-aware ProFox recruitment notification.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_uiux_notification_template_compatibility_map on public.notification_templates;
create trigger trg_uiux_notification_template_compatibility_map
before insert or update on public.notification_templates
for each row execute function public.uiux_notification_template_compatibility_map();

revoke all on function public.uiux_notification_template_compatibility_map() from public,anon,authenticated;
