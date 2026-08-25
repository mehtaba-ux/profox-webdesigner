-- Custom-price offers receive an Admin-approved milestone schedule on the
-- quotation. They intentionally do not carry a standard catalog schedule.
create or replace function public.enforce_sales_product_commercial_readiness()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total numeric;
  v_first_type text;
begin
  if new.product_type in ('package', 'discovery', 'custom')
     and new.price_mode <> 'custom'
     and new.active
     and (
       new.payment_schedule is null
       or jsonb_typeof(new.payment_schedule) <> 'array'
       or jsonb_array_length(new.payment_schedule) = 0
     ) then
    raise exception 'Active primary offers require an approved payment schedule before Sales can use them.';
  end if;

  if new.product_type in ('package', 'discovery', 'custom')
     and new.price_mode <> 'custom'
     and new.active then
    if exists (
      select 1
      from jsonb_array_elements(new.payment_schedule) milestone
      where nullif(btrim(milestone->>'label'), '') is null
         or nullif(btrim(milestone->>'paymentType'), '') is null
         or coalesce((milestone->>'percentage')::numeric, 0) <= 0
    ) then
      raise exception 'Every payment milestone requires a label, payment type, and positive percentage.';
    end if;

    select coalesce(sum((milestone->>'percentage')::numeric), 0)
    into v_total
    from jsonb_array_elements(new.payment_schedule) milestone;

    if round(v_total, 4) <> 100 then
      raise exception 'The payment schedule must total 100 percent.';
    end if;

    select milestone->>'paymentType'
    into v_first_type
    from jsonb_array_elements(new.payment_schedule) milestone
    order by coalesce((milestone->>'milestoneNumber')::integer, 2147483647)
    limit 1;

    if v_first_type not in ('Advance', 'Full Payment') then
      raise exception 'The first payment milestone must be Advance or Full Payment.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_sales_product_commercial_readiness() from public, anon, authenticated;

drop trigger if exists trg_sales_product_commercial_readiness on public.sales_products;
create trigger trg_sales_product_commercial_readiness
before insert or update of active, product_type, price_mode, payment_schedule
on public.sales_products
for each row execute function public.enforce_sales_product_commercial_readiness();

-- The custom plan is a core public offer. Keep its existing approved scope and
-- presentation data intact while restoring the two flags used by the public RPC.
update public.sales_products
set active = true,
    public_visible = true,
    updated_at = timezone('utc', now())
where code = 'PF-CUSTOM'
  and price_mode = 'custom';

do $$
begin
  if not exists (
    select 1
    from public.sales_products
    where code = 'PF-CUSTOM'
      and active is true
      and public_visible is true
      and price_mode = 'custom'
  ) then
    raise exception 'PF-CUSTOM must exist and remain publicly visible';
  end if;
end
$$;
