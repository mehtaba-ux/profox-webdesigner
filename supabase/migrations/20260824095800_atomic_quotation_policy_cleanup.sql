-- Quotation writes are intentionally RPC-only. Removing unreachable DML policies
-- prevents future privilege drift and eliminates per-row auth evaluation overhead.
drop policy if exists quotations_insert on public.quotations;
drop policy if exists quotations_update on public.quotations;
drop policy if exists quotations_delete on public.quotations;
drop policy if exists quotation_items_insert on public.quotation_items;
drop policy if exists quotation_items_update on public.quotation_items;
drop policy if exists quotation_items_delete on public.quotation_items;
