-- Defense in depth: quotations must never be created directly as Sent before item/timeline snapshots exist.
-- Normal creation remains Draft/Approved first, then the existing protected update-to-Sent workflow validates delivery timing and payment schedule.

create or replace function public.reject_direct_sent_quotation_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.status='Sent' then
    raise exception 'Create the quotation first, confirm its delivery timeline, then send it through the approved quotation workflow.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_reject_direct_sent_quotation_insert on public.quotations;
create trigger trg_reject_direct_sent_quotation_insert
before insert on public.quotations
for each row execute function public.reject_direct_sent_quotation_insert();

revoke all on function public.reject_direct_sent_quotation_insert() from public,anon,authenticated;
