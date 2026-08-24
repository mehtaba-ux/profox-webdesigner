drop policy if exists content_public_read on public.content;

create policy content_public_read
on public.content
for select
to anon, authenticated
using (
  id <> 'feedback_submissions'
  or case
    when (select auth.uid()) is not null
      then public.has_active_role(array['admin','site_manager','editor']::text[])
    else false
  end
);
