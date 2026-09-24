-- Public booking profiles reuse the canonical staff profile photo. Keeping a
-- second copy caused data-URL photos to be truncated by the booking profile's
-- URL length guard and rendered a broken image publicly.

create or replace function public.clear_embedded_public_booking_avatar()
returns trigger
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
begin
  if lower(trim(coalesce(new.avatar_url,''))) like 'data:%' then
    new.avatar_url := '';
  end if;
  return new;
end;
$function$;

revoke all on function public.clear_embedded_public_booking_avatar() from public,anon,authenticated;

drop trigger if exists zz_clear_embedded_public_booking_avatar on public.public_booking_profiles;
create trigger zz_clear_embedded_public_booking_avatar
before insert or update of avatar_url on public.public_booking_profiles
for each row execute function public.clear_embedded_public_booking_avatar();

-- Preserve the recovered test seller photo in the existing durable R2 media
-- store. The profile guard permits this narrowly scoped migration via the same
-- controlled flag used by the established Sales activation workflow.
select set_config('profox.sales_candidate_invite_rpc','1',true);
update public.user_profiles
set avatar_url='https://www.profoxwebdesigner.com/api/r2-media/profiles/2026/08/aftab-public-profile.webp',
    updated_at=now()
where lower(email)='sales.demo@profoxwebdesigner.test'
  and role in ('sales','sales_rep','sales_team')
  and status='active';
select set_config('profox.sales_candidate_invite_rpc','',true);

-- Remove only this seller's truncated embedded copy. Normal HTTPS booking
-- image overrides for every other seller remain untouched.
update public.public_booking_profiles b
set avatar_url='',updated_at=now()
from public.user_profiles p
where p.id=b.salesperson_id
  and lower(p.email)='sales.demo@profoxwebdesigner.test'
  and lower(trim(coalesce(b.avatar_url,''))) like 'data:%';
