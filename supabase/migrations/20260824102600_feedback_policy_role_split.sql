drop policy if exists content_public_read on public.content;
drop policy if exists content_anon_read on public.content;
drop policy if exists content_authenticated_read on public.content;

create policy content_anon_read
on public.content
for select
to anon
using (id <> 'feedback_submissions');

create policy content_authenticated_read
on public.content
for select
to authenticated
using (
  id <> 'feedback_submissions'
  or public.has_active_role(array['admin','site_manager','editor']::text[])
);
