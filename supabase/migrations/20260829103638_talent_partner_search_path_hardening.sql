-- Pin the remaining SQL helper to trusted schemas.
alter function public.talent_partner_default_reward_model(public.career_jobs)
  set search_path=public,pg_temp;