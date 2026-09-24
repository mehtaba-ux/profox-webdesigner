create index if not exists idx_worker_rate_card_sales_product on public.worker_compensation_rate_cards(sales_product_id) where sales_product_id is not null;
create index if not exists idx_worker_rate_card_created_by on public.worker_compensation_rate_cards(created_by) where created_by is not null;
create index if not exists idx_worker_rate_card_updated_by on public.worker_compensation_rate_cards(updated_by) where updated_by is not null;
create index if not exists idx_worker_tier_created_by on public.worker_performance_tiers(created_by) where created_by is not null;
create index if not exists idx_worker_tier_updated_by on public.worker_performance_tiers(updated_by) where updated_by is not null;
create index if not exists idx_worker_assignment_accepted_by on public.worker_work_assignments(accepted_by) where accepted_by is not null;
create index if not exists idx_worker_assignment_cancelled_by on public.worker_work_assignments(cancelled_by) where cancelled_by is not null;
create index if not exists idx_worker_assignment_created_by on public.worker_work_assignments(created_by);
create index if not exists idx_worker_assignment_updated_by on public.worker_work_assignments(updated_by) where updated_by is not null;
create index if not exists idx_worker_assignment_item_rate_card on public.worker_assignment_items(rate_card_id) where rate_card_id is not null;
create index if not exists idx_worker_scope_change_requested_by on public.worker_assignment_scope_changes(requested_by);
create index if not exists idx_worker_scope_change_approved_by on public.worker_assignment_scope_changes(approved_by) where approved_by is not null;
create index if not exists idx_worker_earning_reversed_by on public.worker_earnings(reversed_by) where reversed_by is not null;
create index if not exists idx_worker_batch_created_by on public.worker_payout_batches(created_by);
create index if not exists idx_worker_payout_writer on public.worker_payouts(writer_user_id,status);
create index if not exists idx_worker_payout_paid_by on public.worker_payouts(paid_by) where paid_by is not null;
create index if not exists idx_worker_comp_event_earning on public.worker_compensation_events(earning_id) where earning_id is not null;
create index if not exists idx_worker_comp_event_payout on public.worker_compensation_events(payout_id) where payout_id is not null;
create index if not exists idx_worker_comp_event_actor on public.worker_compensation_events(actor_id) where actor_id is not null;

-- These helpers are internal to protected RPCs and do not need direct Data API exposure.
revoke execute on function public.worker_compensation_config() from authenticated;
revoke execute on function public.worker_assignment_external_block_interval(uuid) from authenticated;
