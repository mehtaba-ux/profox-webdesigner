-- Remove the last current-price literals from live training/editorial content.
update public.training_lessons
set content = replace(
  content,
  'Website Development — $2,379',
  'Website Development — a price with no defined scope'
),
updated_at = now()
where id = 'cb085427-a9ec-4379-b07f-c0339abbed32'::uuid;

update public.posts
set content = replace(
  content,
  'ProFox currently provides professional Website Design &amp; Development starting from $599.',
  'Current ProFox Website Design &amp; Development pricing is published on the live Pricing page backed by the Sales Catalog.'
),
updated_at = now()
where slug = 'how-much-does-a-website-cost';
