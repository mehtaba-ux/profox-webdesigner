-- Final single-source cleanup for current ProFox commercial data.
-- Sales Catalog (public.sales_products) remains authoritative; historical quotations/audit snapshots are intentionally untouched.

create or replace function public._catalog_strip_pricing_template(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v jsonb := coalesce(p_data, '{}'::jsonb);
  v_categories jsonb;
begin
  v := jsonb_set(v, '{plans}', '[]'::jsonb, true);

  if jsonb_typeof(v->'hero') = 'object' then
    v := jsonb_set(
      v,
      '{hero,highlight}',
      to_jsonb('Current package pricing is loaded from the live Sales Catalog.'::text),
      true
    );
  end if;

  if jsonb_typeof(v->'carePlans') = 'object' then
    v := jsonb_set(v, '{carePlans,plans}', '[]'::jsonb, true);
  end if;

  if jsonb_typeof(v->'scopeAndPayment') = 'object' then
    v := jsonb_set(v, '{scopeAndPayment,paymentPlans}', '[]'::jsonb, true);
  end if;

  if jsonb_typeof(v#>'{comparison,categories}') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_set(
          c_item,
          '{rows}',
          coalesce(
            (
              select jsonb_agg((r_item - 'values') order by r_ord)
              from jsonb_array_elements(coalesce(c_item->'rows', '[]'::jsonb)) with ordinality as r(r_item, r_ord)
            ),
            '[]'::jsonb
          ),
          true
        )
        order by c_ord
      ),
      '[]'::jsonb
    )
    into v_categories
    from jsonb_array_elements(v#>'{comparison,categories}') with ordinality as c(c_item, c_ord);

    v := jsonb_set(v, '{comparison,categories}', v_categories, true);
  end if;

  return v;
end;
$$;

update public.content c
set data = (
  select coalesce(jsonb_agg(
    case
      when item->>'id' = 'plans-pricing' or item->>'slug' = 'pricing' or item->>'template' = 'plans-pricing' then
        jsonb_set(
          item,
          '{serviceDetailData}',
          public._catalog_strip_pricing_template(coalesce(item->'serviceDetailData', '{}'::jsonb)),
          true
        )
      when item->>'id' = 'website-design-and-development' or item->>'slug' = 'services/website-design-and-development' then
        jsonb_set(
          item,
          '{serviceDetailData}',
          coalesce(item->'serviceDetailData', '{}'::jsonb) - 'pricing',
          true
        )
      when item->>'id' = 'careers' or item->>'slug' = 'careers' then
        jsonb_set(
          item,
          '{careersData}',
          coalesce(item->'careersData', '{}'::jsonb) - 'compensation',
          true
        )
      else item
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(c.data) with ordinality as x(item, ord)
),
updated_at = now()
where c.id = 'customPages'
  and jsonb_typeof(c.data) = 'array';

update public.content c
set data = (
  select coalesce(jsonb_agg(
    case
      when item->>'id' = 'plans-pricing' or item->>'type' = 'pricing' then
        jsonb_set(
          item,
          '{defaultData}',
          public._catalog_strip_pricing_template(coalesce(item->'defaultData', '{}'::jsonb)),
          true
        )
      when coalesce(item->'defaultData', '{}'::jsonb) ? 'pricing' then
        jsonb_set(
          item,
          '{defaultData}',
          coalesce(item->'defaultData', '{}'::jsonb) - 'pricing',
          true
        )
      else item
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(c.data) with ordinality as x(item, ord)
),
updated_at = now()
where c.id = 'template_blueprints'
  and jsonb_typeof(c.data) = 'array';

delete from public.system_configuration
where config_key in ('payment_schedules', 'care_plans');

create or replace function public.prevent_legacy_commercial_configuration()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.config_key in ('payment_schedules', 'care_plans') then
    raise exception 'Commercial pricing, Care Plans and payment schedules are managed only in Sales Catalog.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_legacy_commercial_configuration on public.system_configuration;
create trigger trg_prevent_legacy_commercial_configuration
before insert or update of config_key, config_value on public.system_configuration
for each row
execute function public.prevent_legacy_commercial_configuration();

revoke all on function public.prevent_legacy_commercial_configuration() from public, anon, authenticated;
grant execute on function public.prevent_legacy_commercial_configuration() to postgres, service_role;

update public.training_lessons
set content = replace(
  content,
  'Do not pressure someone toward the **$599 Website Package, $2,379 Business Package, $5,799+ Premium Package, or a custom application** before understanding the business need.',
  'Do not pressure someone toward an approved ProFox package or custom application before understanding the business need. Current pricing and inclusions must always be read from the live Sales Catalog.'
), updated_at = now()
where id = '67840186-1038-455a-a4ef-2770eb0575a2'::uuid;

update public.training_lessons
set content = E'\n# “How much does it cost?”\n\nDo not hide approved pricing and do not manipulate a prospect into a meeting just to reveal basic commercial information.\n\nThe **live Sales Catalog is the only current source** for ProFox package names, starting prices, inclusions, payment terms, and approved commercial rules. Admin may update those details, so never quote a memorized price list.\n\nA good response is transparent while preserving discovery:\n\n> “I can share our current approved package pricing directly from the ProFox catalog. Which option makes sense depends on what you are trying to achieve. If you tell me a little about the project, I can point you toward the right starting scope, or we can cover it properly in a short discovery call.”\n\nBefore sending a number, open the live Sales Catalog and verify the package. Never invent discounts, hide known pricing solely to force a call, quote unapproved custom work, or promise features outside the approved catalog scope.\n', updated_at = now()
where id = 'f0b7d00d-90a0-4063-9a57-f29b1b4b2b5d'::uuid;

update public.training_lessons
set content = E'\n# Budget is business context, not a trap\n\nMoney belongs in a business conversation. The goal is not to discover the highest possible amount a buyer can spend. The goal is to understand what investment is realistic relative to the problem and desired outcome.\n\nUse the **live Sales Catalog** whenever current ProFox pricing, package scope, inclusions, or payment terms are relevant. Do not rely on a memorized commercial reference because Admin may update the catalog.\n\nA natural transition:\n\n> “We have talked about the impact and what you are hoping to improve. It would also be useful to understand investment expectations so I do not recommend something unrealistic. Have you already established a range?”\n\nIf they have not:\n\n> “Would it help if I open our current approved catalog and explain the relevant starting options?”\n\nNever invent a discount, promise an unapproved payment arrangement, pressure for a maximum budget, quote custom work before scoping, imply guaranteed results, or hide approved pricing solely to force another meeting.\n\nA limited budget may mean smaller scope, phased work, a different approved package, later timing, or no current fit.\n\n## Rule\n\n**Use current catalog truth to create clarity, not pressure.**\n', updated_at = now()
where id = 'dc9277c7-79d2-4f5b-bd8d-fd98799e5f57'::uuid;

update public.training_lessons
set content = replace(
  content,
  'Weak:\n> Website Development — $2,379',
  'Weak:\n> Website Development — a price with no defined scope'
), updated_at = now()
where id = 'cb085427-a9ec-4379-b07f-c0339abbed32'::uuid;

update public.training_lessons
set content = replace(
  content,
  'Buyer: “Can you bring this from $2,379 to $2,000?”',
  'Buyer: “Can you reduce the current catalog price without changing the scope?”'
), updated_at = now()
where id = 'f760d91d-b6e8-49ce-b3ac-09a2776930dd'::uuid;

update public.training_assessment_questions q
set options = (
  select jsonb_agg(
    case
      when value = to_jsonb('Say every website costs $5,799'::text)
        then to_jsonb('Invent one fixed price for every website'::text)
      else value
    end
    order by ord
  )
  from jsonb_array_elements(q.options) with ordinality as x(value, ord)
),
updated_at = now()
where q.id = '2a3041a1-9232-4a2a-9fb4-4932ec895298'::uuid;

with target as (
  select id,
         position('<h2 id="profox-pricing"' in content) as start_pos,
         position('<h2>Website Cost vs. Website Value: The Bottom Line</h2>' in content) as end_pos
  from public.posts
  where slug = 'how-much-does-a-website-cost'
), replacement as (
  select id, start_pos, end_pos,
         E'<h2 id="profox-pricing" class="scroll-mt-24">What Does ProFox Charge for a Website in 2026?</h2>\n<p>ProFox publishes current package pricing, inclusions, Care Plans, and approved commercial details on the live Pricing page. Those values come directly from the Sales Catalog so they stay current when Admin changes a package.</p>\n<p><a href="/pricing" class="text-indigo-600 font-bold hover:underline">View current ProFox website packages and pricing</a></p>\n<p><em>Final project pricing depends on requirements, functionality, and approved scope.</em></p>\n\n'::text as new_section
  from target
  where start_pos > 0 and end_pos > start_pos
)
update public.posts p
set content = substring(p.content from 1 for r.start_pos - 1)
              || r.new_section
              || substring(p.content from r.end_pos),
    updated_at = now()
from replacement r
where p.id = r.id;

update public.posts
set content = replace(
                replace(
                  replace(
                    replace(content,
                      'ProFox offers professional website design starting at $599.',
                      'For current ProFox package pricing, use the live Pricing page backed by the Sales Catalog.'
                    ),
                    'ProFox currently provides professional Website Design & Development starting from $599.',
                    'Current ProFox Website Design & Development pricing is published on the live Pricing page backed by the Sales Catalog.'
                  ),
                  'ProFox offers small business website design starting at $599.',
                  'Current ProFox small-business website pricing is published on the live Pricing page backed by the Sales Catalog.'
                ),
                'ProFox Care starts at $99 per month.',
                'Current ProFox Care pricing is published on the live Pricing page backed by the Sales Catalog.'
              ),
    updated_at = now()
where slug = 'how-much-does-a-website-cost';

drop function public._catalog_strip_pricing_template(jsonb);
