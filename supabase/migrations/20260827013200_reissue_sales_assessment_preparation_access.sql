do $block$
declare
  a public.applicants%rowtype;
  v_task_id uuid;
begin
  for a in
    select applicants.*
    from public.applicants
    where applicants.closed_at is null
      and applicants.stage in ('Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access','Activated')
      and exists (
        select 1
        from public.recruitment_task_instances t
        where t.applicant_id=applicants.id
          and coalesce(t.template_snapshot->>'taskKey','')='sales_assessment_hub'
          and t.status='Revoked'
          and t.token_hash is null
          and t.due_at>now()
      )
  loop
    select t.id into v_task_id
    from public.recruitment_task_instances t
    where t.applicant_id=a.id
      and coalesce(t.template_snapshot->>'taskKey','')='sales_assessment_hub'
      and t.status='Revoked'
      and t.token_hash is null
      and t.due_at>now()
    order by t.created_at desc
    limit 1
    for update;

    if v_task_id is not null then
      update public.recruitment_task_instances
      set status='Issued',revoked_at=null,revoked_by=null,updated_at=now()
      where id=v_task_id;

      perform public.enqueue_notification(
        'recruitment:'||a.id::text||':assessment-preparation-center-v2',
        'recruitment_assessment_guide_access',
        lower(btrim(a.email)),
        null,
        public.recruitment_notification_payload(a)||jsonb_build_object('taskInstanceId',v_task_id),
        now()
      );
    end if;
  end loop;
end;
$block$;
