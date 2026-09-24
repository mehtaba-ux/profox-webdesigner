create or replace function public.admin_record_and_process_recruitment_assessment(
  p_applicant_id uuid,
  p_stage text,
  p_status text,
  p_score integer,
  p_rubric_scores jsonb default '{}'::jsonb,
  p_critical_failures jsonb default '[]'::jsonb,
  p_evidence text default '',
  p_evidence_url text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_assessment jsonb;
  v_progression jsonb := null;
begin
  v_assessment := public.admin_record_recruitment_assessment(
    p_applicant_id,
    p_stage,
    p_status,
    p_score,
    p_rubric_scores,
    p_critical_failures,
    p_evidence,
    p_evidence_url,
    p_notes
  );

  if p_status = 'Passed' then
    v_progression := public.admin_advance_applicant_stage(p_applicant_id, null);
  end if;

  return jsonb_build_object(
    'success', true,
    'assessment', v_assessment,
    'progression', v_progression
  );
end;
$function$;

revoke all on function public.admin_record_and_process_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) from public;
grant execute on function public.admin_record_and_process_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) to authenticated;

comment on function public.admin_record_and_process_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text)
is 'Records a protected recruitment assessment and, only when Passed, advances the candidate through the existing protected stage RPC in the same transaction.';
