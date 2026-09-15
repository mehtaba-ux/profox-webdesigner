-- Reconciles the live 2026-09-11 Sales Catalog clarity rollout with repository migration history.
-- The rollout was applied through the Supabase migration API in bounded batches:
-- 20260911044326 sales_catalog_clarity_snapshot_flow
-- 20260911060305 sales_catalog_clarity_content_batch_03
-- 20260911060344 sales_catalog_clarity_content_batch_08
-- 20260911060453 sales_catalog_clarity_content_compact_03
-- 20260911060529 sales_catalog_clarity_content_compact_04
-- 20260911060644 sales_catalog_clarity_remaining_addons_1
-- 20260911060712 sales_catalog_clarity_remaining_addons_2
-- 20260911060740 sales_catalog_clarity_remaining_addons_3
-- 20260911060858 sales_catalog_clarity_remaining_addons_4
-- 20260911060945 sales_catalog_clarity_primary_launch_growth
-- 20260911061015 sales_catalog_clarity_primary_scale_custom
-- 20260911061104 sales_catalog_clarity_discovery_care
-- 20260911061143 sales_catalog_clarity_rollout_validation
--
-- This migration is intentionally idempotent. It does not recreate SKUs, IDs, prices,
-- public visibility, or quotation history. It hardens the final contract and fails closed
-- if the canonical 45-SKU catalog is incomplete or contradictory.

alter table public.sales_products
  add column if not exists seller_guidance jsonb not null default '{}'::jsonb,
  add column if not exists catalog_version integer not null default 1,
  add column if not exists effective_from timestamptz not null default now(),
  add column if not exists delivery_duration_min integer,
  add column if not exists delivery_duration_max integer,
  add column if not exists delivery_duration_unit text not null default 'business_days',
  add column if not exists timeline_impact text not null default 'assessment_required',
  add column if not exists delivery_duration_note text;

alter table public.quotation_items
  add column if not exists catalog_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists catalog_version_snapshot integer;

-- Older admin clients omitted seller_guidance from admin_upsert_sales_product, which
-- made the RPC's default '{}' capable of erasing a populated playbook. Preserve the
-- existing playbook only for that exact accidental-empty-object case. The current UI
-- always submits a complete guidance object, including when its individual lists are empty.
create or replace function public.preserve_sales_product_seller_guidance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.seller_guidance, '{}'::jsonb) = '{}'::jsonb
     and coalesce(old.seller_guidance, '{}'::jsonb) <> '{}'::jsonb then
    new.seller_guidance := old.seller_guidance;
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_sales_product_seller_guidance() from public, anon, authenticated;

drop trigger if exists trg_preserve_sales_product_seller_guidance on public.sales_products;
create trigger trg_preserve_sales_product_seller_guidance
before update of seller_guidance on public.sales_products
for each row execute function public.preserve_sales_product_seller_guidance();

-- Re-assert the business decisions made during the rollout without changing identity,
-- price, visibility, onboarding, or quote history.
update public.sales_products
set public_details = jsonb_set(
      jsonb_set(coalesce(public_details, '{}'::jsonb), '{comparison,Post-launch support}', to_jsonb('20 days'::text), true),
      '{comparison,Copywriting}', to_jsonb('Content refinement'::text), true
    )
where code = 'PF-WEB-LAUNCH'
  and (
    public_details #>> '{comparison,Post-launch support}' is distinct from '20 days'
    or public_details #>> '{comparison,Copywriting}' is distinct from 'Content refinement'
  );

update public.sales_products
set technology = 'WordPress, Next.js / React',
    public_details = jsonb_set(
      jsonb_set(coalesce(public_details, '{}'::jsonb), '{comparison,Typical technology}', to_jsonb('WordPress / Next.js / React'::text), true),
      '{technologies}', '[{"name":"WordPress","logoUrl":"https://cdn.simpleicons.org/wordpress/21759B"},{"name":"Next.js","logoUrl":"https://cdn.simpleicons.org/nextdotjs/000000"},{"name":"React","logoUrl":"https://cdn.simpleicons.org/react/087EA4"}]'::jsonb,
      true
    )
where code = 'PF-WEB-GROWTH'
  and (
    technology is distinct from 'WordPress, Next.js / React'
    or public_details #>> '{comparison,Typical technology}' is distinct from 'WordPress / Next.js / React'
  );

update public.sales_products
set public_details = jsonb_set(coalesce(public_details, '{}'::jsonb), '{comparison,E-commerce}', to_jsonb('Optional add-on / separate scope'::text), true)
where code = 'PF-WEB-SCALE'
  and public_details #>> '{comparison,E-commerce}' is distinct from 'Optional add-on / separate scope';

-- Final integrity checks. These are deliberately strict so catalog drift is caught before
-- a later deployment can present an incomplete product definition to Sales or customers.
do $$
declare
  v_active integer;
  v_unique integer;
  v_addons integer;
  v_public_addons integer;
  v_incomplete integer;
begin
  select count(*), count(distinct code)
    into v_active, v_unique
  from public.sales_products
  where active = true;

  select count(*) into v_addons
  from public.sales_products
  where active = true and product_type = 'addon';

  select count(*) into v_public_addons
  from public.sales_products
  where active = true and product_type = 'addon' and public_visible = true;

  select count(*) into v_incomplete
  from public.sales_products
  where active = true
    and (
      nullif(btrim(coalesce(short_description, '')), '') is null
      or nullif(btrim(coalesce(full_description, '')), '') is null
      or jsonb_array_length(coalesce(scope, '[]'::jsonb)) = 0
      or coalesce(seller_guidance, '{}'::jsonb) = '{}'::jsonb
      or nullif(btrim(coalesce(delivery_duration_note, '')), '') is null
    );

  if v_active <> 45 or v_unique <> 45 then
    raise exception 'Sales Catalog reconciliation failed: expected 45 active unique product codes, found active %, unique %.', v_active, v_unique;
  end if;
  if v_addons <> 37 then
    raise exception 'Sales Catalog reconciliation failed: expected 37 active add-ons, found %.', v_addons;
  end if;
  if v_public_addons <> 0 then
    raise exception 'Sales Catalog reconciliation failed: add-ons must remain private until separately approved; public add-ons=%', v_public_addons;
  end if;
  if v_incomplete <> 0 then
    raise exception 'Sales Catalog reconciliation failed: % active products are missing canonical description, scope, seller guidance, or timing notes.', v_incomplete;
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-CUSTOM' and price_mode='custom' and base_price=0 and payment_schedule is null
  ) then
    raise exception 'PF-CUSTOM must remain custom-priced with quotation-specific payment scheduling.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-LAUNCH'
      and public_details #>> '{comparison,Post-launch support}'='20 days'
      and public_details #>> '{comparison,Copywriting}'='Content refinement'
  ) then
    raise exception 'PF-WEB-LAUNCH canonical support/copy rules are inconsistent.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-SCALE'
      and public_details #>> '{comparison,E-commerce}'='Optional add-on / separate scope'
  ) then
    raise exception 'PF-WEB-SCALE ecommerce boundary is inconsistent.';
  end if;
end;
$$;
