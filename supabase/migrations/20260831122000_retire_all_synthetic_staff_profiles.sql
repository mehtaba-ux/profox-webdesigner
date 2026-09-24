-- Synthetic launch/test identities remain as immutable audit history, but may
-- not retain a status that can authenticate into any production workspace.

select set_config('profox.sales_candidate_invite_rpc','1',true);
update public.user_profiles
set status='inactive', updated_at=now()
where lower(coalesce(email,'')) like '%.test'
  and status not in ('inactive','deactivated');
select set_config('profox.sales_candidate_invite_rpc','',true);
