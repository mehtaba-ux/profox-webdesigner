-- Part 10B.6 forward-only current-state reconciliation: Sales Catalog.
-- NEW migration. The unresolved historical catalog SQL remains untouched, unexecuted,
-- and must never be inserted into profox_migrations.applied_migrations.
-- Expected canonical production business-data DML: ZERO.
-- This migration contains no sales_products/quotation_items business-row UPDATE/INSERT/DELETE.
-- Unknown catalog drift fails closed before the first schema/function mutation.
-- Production execution is not authorized by this repository implementation.
--
-- Stable postcondition IDs:
-- P10B6_CATALOG_SCHEMA_CURRENT
-- P10B6_CATALOG_SELLER_GUIDANCE_TRIGGER_CURRENT
-- P10B6_CATALOG_ACL_CURRENT
-- P10B6_CATALOG_ACTIVE_45_UNIQUE
-- P10B6_CATALOG_ADDONS_37_PRIVATE
-- P10B6_CATALOG_DEFINITIONS_COMPLETE
-- P10B6_CATALOG_PF_CUSTOM_CURRENT
-- P10B6_CATALOG_LAUNCH_CURRENT
-- P10B6_CATALOG_GROWTH_CURRENT
-- P10B6_CATALOG_SCALE_CURRENT
-- P10B6_CATALOG_PROTECTED_FIELDS_UNCHANGED
-- P10B6_CATALOG_QUOTATION_HISTORY_UNCHANGED
-- P10B6_SEND_GATE_FALSE

do $p10b6_pre$
declare
  r record;
  v_active integer;
  v_unique integer;
  v_addons integer;
  v_public_addons integer;
  v_hash text;
begin
  if to_regclass('public.sales_products') is null
     or to_regclass('public.quotation_items') is null then
    raise exception '[P10B6_CATALOG_PRECONDITION] canonical catalog/quotation tables are missing.';
  end if;

  for r in select * from (values
    ('delivery_duration_min','integer',false,''),
      ('delivery_duration_max','integer',false,''),
      ('delivery_duration_unit','text',true,'''business_days''::text'),
      ('timeline_impact','text',true,'''assessment_required''::text'),
      ('delivery_duration_note','text',false,''),
      ('seller_guidance','jsonb',true,'''{}''::jsonb'),
      ('catalog_version','integer',true,'1'),
      ('effective_from','timestamp with time zone',true,'now()')
  ) as expected(name,data_type,not_null,default_expr)
  loop
    if exists (
      select 1 from pg_attribute a
      left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
      where a.attrelid='public.sales_products'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
        and (
          format_type(a.atttypid,a.atttypmod)<>r.data_type
          or a.attnotnull<>r.not_null
          or coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')<>r.default_expr
        )
    ) then
      raise exception '[P10B6_CATALOG_PRECONDITION] incompatible sales_products column: %',r.name;
    end if;

    if not exists (
      select 1 from pg_attribute a
      where a.attrelid='public.sales_products'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
    )
    and exists (select 1 from public.sales_products limit 1) then
      raise exception '[P10B6_CATALOG_PRECONDITION] missing catalog column % cannot be added safely to a nonempty catalog without explicit reviewed backfill.',r.name;
    end if;
  end loop;

  for r in select * from (values
    ('catalog_snapshot','jsonb',true,'''{}''::jsonb'),
      ('catalog_version_snapshot','integer',false,'')
  ) as expected(name,data_type,not_null,default_expr)
  loop
    if exists (
      select 1 from pg_attribute a
      left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
      where a.attrelid='public.quotation_items'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
        and (
          format_type(a.atttypid,a.atttypmod)<>r.data_type
          or a.attnotnull<>r.not_null
          or coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')<>r.default_expr
        )
    ) then
      raise exception '[P10B6_CATALOG_PRECONDITION] incompatible quotation_items column: %',r.name;
    end if;

    if not exists (
      select 1 from pg_attribute a
      where a.attrelid='public.quotation_items'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
    )
    and exists (select 1 from public.quotation_items limit 1) then
      raise exception '[P10B6_CATALOG_PRECONDITION] missing quotation snapshot column % cannot be added to nonempty quotation history without explicit reviewed backfill.',r.name;
    end if;
  end loop;

  select count(*),count(distinct code)
  into v_active,v_unique
  from public.sales_products
  where active=true;
  select count(*) into v_addons
  from public.sales_products
  where active=true and product_type='addon';
  select count(*) into v_public_addons
  from public.sales_products
  where active=true and product_type='addon' and public_visible=true;

  if v_active<>45 or v_unique<>45 then
    raise exception '[P10B6_CATALOG_PRECONDITION] expected 45 active unique product codes; active %, unique %.',v_active,v_unique;
  end if;
  if v_addons<>37 or v_public_addons<>0 then
    raise exception '[P10B6_CATALOG_PRECONDITION] expected 37 active private add-ons; add-ons %, public %.',v_addons,v_public_addons;
  end if;
  if (select count(*) from public.sales_products
      where code in ('PF-CUSTOM','PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE'))<>4 then
    raise exception '[P10B6_CATALOG_PRECONDITION] canonical target product codes are missing or duplicated.';
  end if;

  -- No legacy business-value correction is auto-approved here. Canonical values are accepted;
  -- every other value is unknown drift and aborts before schema/function mutation.
  if not exists (
    select 1 from public.sales_products
    where code='PF-CUSTOM'
      and price_mode='custom'
      and base_price=0
      and payment_schedule is null
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] unknown PF-CUSTOM commercial drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-LAUNCH'
      and public_details#>>'{comparison,Post-launch support}'='20 days'
      and public_details#>>'{comparison,Copywriting}'='Content refinement'
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] unknown PF-WEB-LAUNCH clarity drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-GROWTH'
      and technology='WordPress, Next.js / React'
      and public_details#>>'{comparison,Typical technology}'='WordPress / Next.js / React'
      and public_details->'technologies'=$p10b6_growth_tech$[{"name":"WordPress","logoUrl":"https://cdn.simpleicons.org/wordpress/21759B"},{"name":"Next.js","logoUrl":"https://cdn.simpleicons.org/nextdotjs/000000"},{"name":"React","logoUrl":"https://cdn.simpleicons.org/react/087EA4"}]$p10b6_growth_tech$::jsonb
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] unknown PF-WEB-GROWTH clarity drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-SCALE'
      and public_details#>>'{comparison,E-commerce}'='Optional add-on / separate scope'
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] unknown PF-WEB-SCALE clarity drift.';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='preserve_sales_product_seller_guidance'
      and pg_get_function_identity_arguments(p.oid)<>''
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] unexpected seller-guidance trigger function overload.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid='public.sales_products'::regclass and not tgisinternal
      and tgname='trg_preserve_sales_product_seller_guidance'
      and pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_preserve_sales_product_seller_guidance BEFORE UPDATE OF seller_guidance ON sales_products FOR EACH ROW EXECUTE FUNCTION preserve_sales_product_seller_guidance()'
  ) then
    raise exception '[P10B6_CATALOG_PRECONDITION] seller-guidance trigger drift.';
  end if;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] final quotation Send gate must remain false.';
  end if;

  select md5(coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'code',code,
    'base_price',base_price,
    'price_mode',price_mode,
    'public_visible',public_visible,
    'payment_schedule',payment_schedule,
    'active',active
  ) order by id)::text,'[]'))
  into v_hash
  from public.sales_products;

  perform set_config('profox.part10b6.catalog_protected_hash',v_hash,true);
  perform set_config('profox.part10b6.quotation_item_count',(select count(*)::text from public.quotation_items),true);
  perform set_config('profox.part10b6.sales_relacl','{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}',true);
  perform set_config('profox.part10b6.quote_relacl','{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=rDxtm/postgres,service_role=arwdDxtm/postgres}',true);
end
$p10b6_pre$;

alter table public.sales_products add column if not exists delivery_duration_min integer;
alter table public.sales_products add column if not exists delivery_duration_max integer;
alter table public.sales_products add column if not exists delivery_duration_unit text default 'business_days'::text not null;
alter table public.sales_products add column if not exists timeline_impact text default 'assessment_required'::text not null;
alter table public.sales_products add column if not exists delivery_duration_note text;
alter table public.sales_products add column if not exists seller_guidance jsonb default '{}'::jsonb not null;
alter table public.sales_products add column if not exists catalog_version integer default 1 not null;
alter table public.sales_products add column if not exists effective_from timestamp with time zone default now() not null;
alter table public.quotation_items add column if not exists catalog_snapshot jsonb default '{}'::jsonb not null;
alter table public.quotation_items add column if not exists catalog_version_snapshot integer;

CREATE OR REPLACE FUNCTION public.preserve_sales_product_seller_guidance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(new.seller_guidance, '{}'::jsonb) = '{}'::jsonb
     and coalesce(old.seller_guidance, '{}'::jsonb) <> '{}'::jsonb then
    new.seller_guidance := old.seller_guidance;
  end if;
  return new;
end;
$function$;

revoke all on function public.preserve_sales_product_seller_guidance()
  from public, anon, authenticated, service_role;
grant execute on function public.preserve_sales_product_seller_guidance()
  to service_role;

drop trigger if exists trg_preserve_sales_product_seller_guidance on public.sales_products;
CREATE TRIGGER trg_preserve_sales_product_seller_guidance BEFORE UPDATE OF seller_guidance ON sales_products FOR EACH ROW EXECUTE FUNCTION preserve_sales_product_seller_guidance();

do $p10b6_post$
declare
  r record;
  v_active integer;
  v_unique integer;
  v_addons integer;
  v_public_addons integer;
  v_incomplete integer;
  v_hash text;
begin
  for r in select * from (values
    ('delivery_duration_min','integer',false,''),
      ('delivery_duration_max','integer',false,''),
      ('delivery_duration_unit','text',true,'''business_days''::text'),
      ('timeline_impact','text',true,'''assessment_required''::text'),
      ('delivery_duration_note','text',false,''),
      ('seller_guidance','jsonb',true,'''{}''::jsonb'),
      ('catalog_version','integer',true,'1'),
      ('effective_from','timestamp with time zone',true,'now()')
  ) as expected(name,data_type,not_null,default_expr)
  loop
    if not exists (
      select 1 from pg_attribute a
      left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
      where a.attrelid='public.sales_products'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod)=r.data_type
        and a.attnotnull=r.not_null
        and coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')=r.default_expr
    ) then
      raise exception '[P10B6_CATALOG_SCHEMA_CURRENT] sales_products column drift: %',r.name;
    end if;
  end loop;

  for r in select * from (values
    ('catalog_snapshot','jsonb',true,'''{}''::jsonb'),
      ('catalog_version_snapshot','integer',false,'')
  ) as expected(name,data_type,not_null,default_expr)
  loop
    if not exists (
      select 1 from pg_attribute a
      left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
      where a.attrelid='public.quotation_items'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod)=r.data_type
        and a.attnotnull=r.not_null
        and coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')=r.default_expr
    ) then
      raise exception '[P10B6_CATALOG_SCHEMA_CURRENT] quotation_items column drift: %',r.name;
    end if;
  end loop;

  if md5(pg_get_functiondef(to_regprocedure('public.preserve_sales_product_seller_guidance()')))<>'2269678e3b6940c631e998da7f0f68e0'
     or has_function_privilege('anon',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE') then
    raise exception '[P10B6_CATALOG_ACL_CURRENT] seller-guidance function definition/ACL drift.';
  end if;

  if coalesce((select relacl::text from pg_class where oid='public.sales_products'::regclass),'')
       <>current_setting('profox.part10b6.sales_relacl')
     or coalesce((select relacl::text from pg_class where oid='public.quotation_items'::regclass),'')
       <>current_setting('profox.part10b6.quote_relacl') then
    raise exception '[P10B6_CATALOG_ACL_CURRENT] catalog/quotation table ACLs changed.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.sales_products'::regclass
      and tgname='trg_preserve_sales_product_seller_guidance'
      and not tgisinternal and tgenabled<>'D'
      and pg_get_triggerdef(oid,true)='CREATE TRIGGER trg_preserve_sales_product_seller_guidance BEFORE UPDATE OF seller_guidance ON sales_products FOR EACH ROW EXECUTE FUNCTION preserve_sales_product_seller_guidance()'
  ) then
    raise exception '[P10B6_CATALOG_SELLER_GUIDANCE_TRIGGER_CURRENT] trigger drift.';
  end if;

  select count(*),count(distinct code)
  into v_active,v_unique
  from public.sales_products where active=true;
  if v_active<>45 or v_unique<>45 then
    raise exception '[P10B6_CATALOG_ACTIVE_45_UNIQUE] active/unique counts %, %.',v_active,v_unique;
  end if;

  select count(*) into v_addons
  from public.sales_products
  where active=true and product_type='addon';
  select count(*) into v_public_addons
  from public.sales_products
  where active=true and product_type='addon' and public_visible=true;
  if v_addons<>37 or v_public_addons<>0 then
    raise exception '[P10B6_CATALOG_ADDONS_37_PRIVATE] add-ons/public %, %.',v_addons,v_public_addons;
  end if;

  select count(*) into v_incomplete
  from public.sales_products
  where active=true
    and (
      nullif(btrim(coalesce(short_description,'')),'') is null
      or nullif(btrim(coalesce(full_description,'')),'') is null
      or jsonb_array_length(coalesce(scope,'[]'::jsonb))=0
      or coalesce(seller_guidance,'{}'::jsonb)='{}'::jsonb
      or nullif(btrim(coalesce(delivery_duration_note,'')),'') is null
    );
  if v_incomplete<>0 then
    raise exception '[P10B6_CATALOG_DEFINITIONS_COMPLETE] incomplete active products: %',v_incomplete;
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-CUSTOM' and price_mode='custom' and base_price=0 and payment_schedule is null
  ) then
    raise exception '[P10B6_CATALOG_PF_CUSTOM_CURRENT] PF-CUSTOM contract drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-LAUNCH'
      and public_details#>>'{comparison,Post-launch support}'='20 days'
      and public_details#>>'{comparison,Copywriting}'='Content refinement'
  ) then
    raise exception '[P10B6_CATALOG_LAUNCH_CURRENT] Launch contract drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-GROWTH'
      and technology='WordPress, Next.js / React'
      and public_details#>>'{comparison,Typical technology}'='WordPress / Next.js / React'
      and public_details->'technologies'=$p10b6_growth_tech$[{"name":"WordPress","logoUrl":"https://cdn.simpleicons.org/wordpress/21759B"},{"name":"Next.js","logoUrl":"https://cdn.simpleicons.org/nextdotjs/000000"},{"name":"React","logoUrl":"https://cdn.simpleicons.org/react/087EA4"}]$p10b6_growth_tech$::jsonb
  ) then
    raise exception '[P10B6_CATALOG_GROWTH_CURRENT] Growth contract drift.';
  end if;

  if not exists (
    select 1 from public.sales_products
    where code='PF-WEB-SCALE'
      and public_details#>>'{comparison,E-commerce}'='Optional add-on / separate scope'
  ) then
    raise exception '[P10B6_CATALOG_SCALE_CURRENT] Scale contract drift.';
  end if;

  select md5(coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'code',code,
    'base_price',base_price,
    'price_mode',price_mode,
    'public_visible',public_visible,
    'payment_schedule',payment_schedule,
    'active',active
  ) order by id)::text,'[]'))
  into v_hash
  from public.sales_products;

  if v_hash<>current_setting('profox.part10b6.catalog_protected_hash') then
    raise exception '[P10B6_CATALOG_PROTECTED_FIELDS_UNCHANGED] protected IDs/commercial fields changed.';
  end if;

  if (select count(*) from public.quotation_items)
       <>current_setting('profox.part10b6.quotation_item_count')::bigint then
    raise exception '[P10B6_CATALOG_QUOTATION_HISTORY_UNCHANGED] quotation item history changed.';
  end if;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] Send gate changed from false.';
  end if;
end
$p10b6_post$;
