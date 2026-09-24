revoke insert, update, delete, truncate, references, trigger on table public.career_jobs from anon;
revoke truncate, references, trigger on table public.career_jobs from authenticated;
grant select on table public.career_jobs to anon, authenticated;
grant insert, update, delete on table public.career_jobs to authenticated;
