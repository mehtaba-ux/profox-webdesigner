-- Public seller cards use real resolved-chat ratings; an unrated seller is
-- shown as Verified instead of receiving a fabricated five-star score.

create or replace function public.get_public_sales_reps()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,
    'name',coalesce(nullif(btrim(u.full_name),''),'Sales representative'),
    'avatar',coalesce(u.avatar_url,''),
    'title',coalesce(nullif(btrim(cp.job_title),''),'Sales Consultant'),
    'specialties',coalesce(to_jsonb(cp.specialties),'["Packages & Quotations","Website Consulting"]'::jsonb),
    'rating',coalesce((select round(avg(c.rating_given)::numeric,1) from public.sales_chat_conversations c where c.original_sales_id=u.id and c.rating_given is not null),0),
    'reviewCount',(select count(*) from public.sales_chat_conversations c where c.original_sales_id=u.id and c.rating_given is not null),
    'isOnline',coalesce(cp.availability_status,'Available')='Available',
    'bio',''
  ) order by (coalesce(cp.availability_status,'Available')='Available') desc,u.full_name),'[]'::jsonb)
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  where u.status='active'
    and u.onboarding_status='completed'
    and u.role in ('sales','sales_rep','sales_team')
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
$$;

revoke all on function public.get_public_sales_reps() from public;
grant execute on function public.get_public_sales_reps() to anon,authenticated;
