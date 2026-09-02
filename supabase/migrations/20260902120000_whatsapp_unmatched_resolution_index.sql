create index if not exists whatsapp_unmatched_resolved_conversation_idx
  on public.whatsapp_unmatched_inbound_messages (resolved_conversation_id)
  where resolved_conversation_id is not null;
