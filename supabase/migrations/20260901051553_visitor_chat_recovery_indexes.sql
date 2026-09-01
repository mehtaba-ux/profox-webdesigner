-- Cover recovery challenge foreign keys used by relationship/device recovery.

create index if not exists sales_chat_recovery_conversation_idx
  on public.sales_chat_recovery_challenges(conversation_id)
  where conversation_id is not null;

create index if not exists sales_chat_recovery_identity_idx
  on public.sales_chat_recovery_challenges(customer_identity_id)
  where customer_identity_id is not null;
