-- Development Delivery manager queue: surfaces only submitted final handover packages requiring a decision.
create or replace function public.development_manager_get_handover_queue()
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_role text; v_items jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role not in('admin','project_manager','site_manager') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'packageId',h.id,'version',h.version,'submittedAt',h.submitted_at,'submissionNote',h.submission_note,'clientPackage',h.client_package,
    'projectId',p.id,'projectNumber',p.project_number,'projectName',p.project_name,'projectStage',p.stage,
    'clientName',c.company_name,'preparedBy',h.prepared_by,'developerName',u.full_name,'projectManagerId',p.project_manager_id,
    'ageHours',round(extract(epoch from(now()-h.submitted_at))/3600.0,1)
  ) order by h.submitted_at),'[]'::jsonb) into v_items
  from public.development_handover_packages h
  join public.projects p on p.id=h.project_id
  left join public.clients c on c.id=p.client_id
  left join public.user_profiles u on u.id=h.prepared_by
  where h.status='Submitted' and p.stage='Handover'
    and (v_role='admin' or p.project_manager_id=v_uid);
  return v_items;
end;
$$;
grant execute on function public.development_manager_get_handover_queue() to authenticated;
