alter function public.crm_get_sales_work_queue(text,text,integer) rename to crm_get_sales_work_queue_base;

revoke execute on function public.crm_get_sales_work_queue_base(text,text,integer) from public, anon, authenticated;

create or replace function public.crm_get_sales_work_queue(p_scope text default 'mine',p_channel text default 'all',p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare
  v_base jsonb;
  v_cfg jsonb;
  v_items jsonb;
  v_counts jsonb;
  v_high numeric:=5000;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  v_base:=public.crm_get_sales_work_queue_base(p_scope,p_channel,p_limit);
  v_cfg:=coalesce(v_base->'config','{}'::jsonb);
  v_high:=coalesce((v_cfg#>>'{priority,highValueThreshold}')::numeric,5000);

  select coalesce(jsonb_agg(item order by (item->>'priorityScore')::int desc,nullif(item->>'dueAt','')::timestamptz nulls first),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_base->'items','[]'::jsonb)) item
  where not (
    item->>'queueKind'='missing_next_action'
    and (
      exists(
        select 1 from jsonb_array_elements_text(coalesce(v_cfg#>'{discipline,validWaitingStates}','[]'::jsonb)) waiting(value)
        where lower(btrim(waiting.value))=lower(btrim(coalesce(item->>'stage','')))
      )
      or exists(
        select 1 from public.crm_activity_plan_enrollments pe
        where pe.status='Paused'
          and (
            (nullif(item->>'opportunityId','') is not null and pe.opportunity_id=nullif(item->>'opportunityId','')::uuid)
            or (nullif(item->>'opportunityId','') is null and nullif(item->>'leadId','') is not null and pe.lead_id=nullif(item->>'leadId','')::uuid)
          )
      )
    )
  );

  select jsonb_build_object(
    'total',jsonb_array_length(v_items),
    'actNow',(select count(*) from jsonb_array_elements(v_items) x where x->>'priorityLevel'='Act Now'),
    'overdue',(select count(*) from jsonb_array_elements(v_items) x where nullif(x->>'dueAt','') is not null and (x->>'dueAt')::timestamptz<now()),
    'noNextAction',(select count(*) from jsonb_array_elements(v_items) x where x->>'queueKind'='missing_next_action'),
    'highValue',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x->>'value')::numeric,0)>=v_high),
    'rescheduledRepeatedly',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x->>'rescheduleCount')::int,0)>=2)
  ) into v_counts;

  return jsonb_set(jsonb_set(v_base,'{items}',v_items,true),'{counts}',v_counts,true);
end $$;

revoke execute on function public.crm_get_sales_work_queue(text,text,integer) from public, anon;
grant execute on function public.crm_get_sales_work_queue(text,text,integer) to authenticated;
