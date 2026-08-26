-- Secure reusable recruitment practical-task workflow.
-- Lead Research Test is the first live task. Candidate submissions stay separate
-- from evaluator-side recruitment assessments.

create table if not exists public.recruitment_task_templates (
  id uuid primary key default gen_random_uuid(),
  task_key text not null,
  system_role text not null,
  stage text not null,
  title text not null,
  description text not null default '',
  target_market text not null default '',
  target_niche text not null default '',
  required_items integer not null default 5 check (required_items between 1 and 20),
  deadline_hours integer not null default 72 check (deadline_hours between 1 and 720),
  estimated_minutes integer not null default 90 check (estimated_minutes between 5 and 480),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  instructions jsonb not null default '[]'::jsonb check (jsonb_typeof(instructions)='array'),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recruitment_task_templates_active_key_uq
  on public.recruitment_task_templates(task_key,system_role,stage)
  where active;

create table if not exists public.recruitment_task_instances (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  template_id uuid not null references public.recruitment_task_templates(id) on delete restrict,
  stage text not null,
  attempt_no integer not null check (attempt_no > 0),
  status text not null default 'Issued' check (status in ('Issued','Viewed','In Progress','Submitted','Under Review','Passed','Retry Required','Failed','Revoked')),
  token_hash text not null unique check (char_length(token_hash)=64),
  template_snapshot jsonb not null,
  retry_feedback text not null default '',
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  viewed_at timestamptz,
  first_saved_at timestamptz,
  last_saved_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(applicant_id,stage,attempt_no)
);

create index if not exists recruitment_task_instances_applicant_idx
  on public.recruitment_task_instances(applicant_id,stage,attempt_no desc);
create index if not exists recruitment_task_instances_status_due_idx
  on public.recruitment_task_instances(status,due_at);

create table if not exists public.recruitment_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid not null unique references public.recruitment_task_instances(id) on delete cascade,
  draft_data jsonb not null default '{"leads":[]}'::jsonb,
  final_data jsonb,
  save_count integer not null default 0,
  last_saved_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(draft_data)='object'),
  check (final_data is null or jsonb_typeof(final_data)='object')
);

alter table public.recruitment_task_templates enable row level security;
alter table public.recruitment_task_instances enable row level security;
alter table public.recruitment_task_submissions enable row level security;

revoke all on public.recruitment_task_templates from anon, authenticated;
revoke all on public.recruitment_task_instances from anon, authenticated;
revoke all on public.recruitment_task_submissions from anon, authenticated;

insert into public.recruitment_task_templates(
  task_key,system_role,stage,title,description,target_market,target_niche,
  required_items,deadline_hours,estimated_minutes,max_attempts,instructions,version,active
)
values (
  'lead_research_test','sales','Lead Research Test','ProFox Lead Research Test',
  'Research five real businesses and explain why each is or is not a strong ProFox prospect.',
  'United States','Roofing Contractors',5,72,90,3,
  jsonb_build_array(
    'Research exactly five real businesses using publicly available information only.',
    'Accuracy and evidence matter more than finding perfect prospects.',
    'Identify the likely decision-maker only from a public professional or company source.',
    'Explain the digital problem or growth opportunity you observed and cite evidence URLs.',
    'Choose the most relevant ProFox service and explain your fit judgment.',
    'Do not submit private personal information, scraped credentials, or confidential data.'
  ),1,true
)
on conflict (task_key,system_role,stage) where active do update set
  title=excluded.title,
  description=excluded.description,
  required_items=excluded.required_items,
  deadline_hours=excluded.deadline_hours,
  estimated_minutes=excluded.estimated_minutes,
  max_attempts=excluded.max_attempts,
  instructions=excluded.instructions,
  updated_at=now();

create or replace function public.recruitment_task_token_hash(p_token text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select encode(digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256'),'hex');
$$;
revoke all on function public.recruitment_task_token_hash(text) from public, anon, authenticated;

create or replace function public.assert_recruitment_task_answers(
  p_answers jsonb,
  p_required_items integer,
  p_final boolean default false
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_leads jsonb;
  v_lead jsonb;
  v_urls jsonb;
  v_url jsonb;
  v_count integer;
  v_text text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Task answers must be a JSON object.';
  end if;
  if octet_length(p_answers::text) > 120000 then
    raise exception 'Task draft is too large.';
  end if;
  v_leads := coalesce(p_answers->'leads','[]'::jsonb);
  if jsonb_typeof(v_leads) <> 'array' then raise exception 'Leads must be an array.'; end if;
  v_count := jsonb_array_length(v_leads);
  if v_count > p_required_items then raise exception 'This task accepts exactly % leads.',p_required_items; end if;
  if p_final and v_count <> p_required_items then raise exception 'Complete all % leads before final submission.',p_required_items; end if;

  for v_lead in select value from jsonb_array_elements(v_leads)
  loop
    if jsonb_typeof(v_lead) <> 'object' then raise exception 'Each lead must be an object.'; end if;
    if char_length(coalesce(v_lead->>'businessName','')) > 160 then raise exception 'Business name is too long.'; end if;
    if char_length(coalesce(v_lead->>'website','')) > 500 then raise exception 'Website URL is too long.'; end if;
    if char_length(coalesce(v_lead->>'location','')) > 160 then raise exception 'Location is too long.'; end if;
    if char_length(coalesce(v_lead->>'niche','')) > 160 then raise exception 'Niche is too long.'; end if;
    if char_length(coalesce(v_lead->>'fitReason','')) > 2500 then raise exception 'Fit reasoning is too long.'; end if;
    if char_length(coalesce(v_lead->>'qualificationSignals','')) > 2500 then raise exception 'Qualification evidence is too long.'; end if;
    if char_length(coalesce(v_lead->>'decisionMakerName','')) > 160 then raise exception 'Decision-maker name is too long.'; end if;
    if char_length(coalesce(v_lead->>'decisionMakerRole','')) > 160 then raise exception 'Decision-maker role is too long.'; end if;
    if char_length(coalesce(v_lead->>'decisionMakerSourceUrl','')) > 500 then raise exception 'Decision-maker source URL is too long.'; end if;
    if char_length(coalesce(v_lead->>'digitalProblem','')) > 3000 then raise exception 'Digital opportunity explanation is too long.'; end if;
    if char_length(coalesce(v_lead->>'serviceFit','')) > 200 then raise exception 'Service fit is too long.'; end if;
    if char_length(coalesce(v_lead->>'serviceFitReason','')) > 2500 then raise exception 'Service-fit reasoning is too long.'; end if;

    v_text := btrim(coalesce(v_lead->>'website',''));
    if v_text <> '' and v_text !~* '^https?://[^[:space:]]+$' then raise exception 'Business website must be a valid http(s) URL.'; end if;
    v_text := btrim(coalesce(v_lead->>'decisionMakerSourceUrl',''));
    if v_text <> '' and v_text !~* '^https?://[^[:space:]]+$' then raise exception 'Decision-maker source must be a valid http(s) URL.'; end if;

    v_urls := coalesce(v_lead->'evidenceUrls','[]'::jsonb);
    if jsonb_typeof(v_urls) <> 'array' or jsonb_array_length(v_urls) > 8 then raise exception 'Evidence URLs must be an array with at most 8 links.'; end if;
    for v_url in select value from jsonb_array_elements(v_urls)
    loop
      if jsonb_typeof(v_url) <> 'string' or trim(v_url #>> '{}') !~* '^https?://[^[:space:]]+$' then
        raise exception 'Every evidence source must be a valid http(s) URL.';
      end if;
    end loop;

    if p_final then
      if btrim(coalesce(v_lead->>'businessName',''))='' then raise exception 'Business name is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'website',''))='' then raise exception 'Business website is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'location',''))='' then raise exception 'Business location is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'niche',''))='' then raise exception 'Business niche is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'fitReason',''))='' then raise exception 'Qualification reasoning is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'qualificationSignals',''))='' then raise exception 'Qualification evidence is required for every lead.'; end if;
      if jsonb_array_length(v_urls)=0 then raise exception 'At least one evidence URL is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'decisionMakerName',''))='' or btrim(coalesce(v_lead->>'decisionMakerRole',''))='' then raise exception 'Decision-maker name and role are required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'decisionMakerSourceUrl',''))='' then raise exception 'Decision-maker source URL is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'digitalProblem',''))='' then raise exception 'Digital problem or opportunity is required for every lead.'; end if;
      if btrim(coalesce(v_lead->>'serviceFit',''))='' or btrim(coalesce(v_lead->>'serviceFitReason',''))='' then raise exception 'ProFox service fit and reasoning are required for every lead.'; end if;
      if lower(btrim(coalesce(v_lead->>'priority',''))) not in ('high','medium','low') then raise exception 'Priority must be High, Medium, or Low.'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.assert_recruitment_task_answers(jsonb,integer,boolean) from public, anon, authenticated;

create or replace function public.issue_recruitment_task_internal(
  p_applicant_id uuid,
  p_stage text,
  p_retry_feedback text default '',
  p_send_email boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_template public.recruitment_task_templates%rowtype;
  v_existing public.recruitment_task_instances%rowtype;
  v_instance public.recruitment_task_instances%rowtype;
  v_attempt integer;
  v_token text;
  v_url text;
  v_snapshot jsonb;
  v_payload jsonb;
  v_due timestamptz;
  v_template_key text;
begin
  select * into v_app from public.applicants where id=p_applicant_id;
  if not found or v_app.closed_at is not null then return null; end if;

  select * into v_template
  from public.recruitment_task_templates
  where active=true
    and system_role=public.career_job_system_role(v_app.career_job_id)
    and stage=p_stage
  order by version desc
  limit 1;
  if not found then return null; end if;

  select * into v_existing
  from public.recruitment_task_instances
  where applicant_id=p_applicant_id and stage=p_stage
  order by attempt_no desc
  limit 1;

  if found and v_existing.status in ('Issued','Viewed','In Progress','Submitted','Under Review') then
    return jsonb_build_object('instanceId',v_existing.id,'attemptNo',v_existing.attempt_no,'status',v_existing.status,'alreadyExists',true);
  end if;

  v_attempt := coalesce(v_existing.attempt_no,0)+1;
  if v_attempt > v_template.max_attempts then raise exception 'Maximum recruitment task attempts reached.'; end if;

  v_token := encode(gen_random_bytes(32),'hex');
  v_url := 'https://www.profoxwebdesigner.com/recruitment/task/'||v_token;
  v_due := now()+make_interval(hours=>v_template.deadline_hours);
  v_snapshot := jsonb_build_object(
    'taskKey',v_template.task_key,
    'title',v_template.title,
    'description',v_template.description,
    'targetMarket',v_template.target_market,
    'targetNiche',v_template.target_niche,
    'requiredItems',v_template.required_items,
    'deadlineHours',v_template.deadline_hours,
    'estimatedMinutes',v_template.estimated_minutes,
    'maxAttempts',v_template.max_attempts,
    'instructions',v_template.instructions,
    'version',v_template.version
  );

  insert into public.recruitment_task_instances(
    applicant_id,template_id,stage,attempt_no,status,token_hash,template_snapshot,retry_feedback,due_at
  ) values (
    p_applicant_id,v_template.id,p_stage,v_attempt,'Issued',public.recruitment_task_token_hash(v_token),v_snapshot,coalesce(p_retry_feedback,''),v_due
  ) returning * into v_instance;

  insert into public.recruitment_task_submissions(task_instance_id) values (v_instance.id);

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values (
    p_applicant_id,'Recruitment','Task Issued',v_template.title,
    'Secure practical task attempt '||v_attempt||' issued with a deadline.',
    case when auth.uid() is null then 'System' else 'Admin' end,
    auth.uid(),'recruitment_task_instances',v_instance.id,
    jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'dueAt',v_due,'templateVersion',v_template.version)
  );

  v_payload := public.recruitment_notification_payload(v_app) || jsonb_build_object(
    'stage',p_stage,
    'taskTitle',v_template.title,
    'taskUrl',v_url,
    'taskDueDate',to_char(v_due at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'taskEstimatedTime',v_template.estimated_minutes||' minutes',
    'taskRequiredItems',v_template.required_items,
    'taskTargetMarket',v_template.target_market,
    'taskTargetNiche',v_template.target_niche,
    'taskAttempt',v_attempt,
    'taskFeedback',coalesce(p_retry_feedback,'')
  );

  if p_send_email then
    v_template_key := case when v_attempt>1 then 'recruitment_lead_research_retry' else 'recruitment_lead_research' end;
    perform public.enqueue_notification(
      'recruitment-task:'||v_instance.id::text||':issued',v_template_key,v_app.email,null,v_payload,now()
    );
  end if;

  return jsonb_build_object(
    'instanceId',v_instance.id,'attemptNo',v_attempt,'status',v_instance.status,
    'taskUrl',v_url,'dueAt',v_due,'estimatedMinutes',v_template.estimated_minutes,
    'requiredItems',v_template.required_items,'targetMarket',v_template.target_market,
    'targetNiche',v_template.target_niche,'retryFeedback',coalesce(p_retry_feedback,'')
  );
end;
$$;
revoke all on function public.issue_recruitment_task_internal(uuid,text,text,boolean) from public, anon, authenticated;

create or replace function public.queue_recruitment_email(
  p_applicant public.applicants,
  p_template_key text,
  p_suffix text,
  p_scheduled_for timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payload jsonb;
  v_context_text text;
  v_result uuid;
begin
  if coalesce(trim(p_applicant.email),'')='' then return null; end if;
  v_payload := public.recruitment_notification_payload(p_applicant);
  v_context_text := coalesce(current_setting('profox.recruitment_task_email_context',true),'');
  if v_context_text<>'' then
    begin v_payload := v_payload || v_context_text::jsonb; exception when others then null; end;
  end if;
  v_result := public.enqueue_notification(
    'recruitment:'||p_applicant.id::text||':'||trim(p_suffix),
    p_template_key,p_applicant.email,null,v_payload,p_scheduled_for
  );
  if v_context_text<>'' then perform set_config('profox.recruitment_task_email_context','',true); end if;
  return v_result;
end;
$$;

create or replace function public.prepare_recruitment_task_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_issue jsonb;
begin
  if new.stage is distinct from old.stage then
    v_issue := public.issue_recruitment_task_internal(new.id,new.stage,'',false);
    if v_issue is not null and coalesce((v_issue->>'alreadyExists')::boolean,false)=false then
      perform set_config('profox.recruitment_task_email_context',jsonb_build_object(
        'taskUrl',v_issue->>'taskUrl',
        'taskDueDate',to_char((v_issue->>'dueAt')::timestamptz at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
        'taskEstimatedTime',(v_issue->>'estimatedMinutes')||' minutes',
        'taskRequiredItems',v_issue->>'requiredItems',
        'taskTargetMarket',v_issue->>'targetMarket',
        'taskTargetNiche',v_issue->>'targetNiche',
        'taskAttempt',v_issue->>'attemptNo',
        'taskFeedback',coalesce(v_issue->>'retryFeedback','')
      )::text,true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_recruitment_task_on_stage_change on public.applicants;
create trigger trg_prepare_recruitment_task_on_stage_change
before update of stage on public.applicants
for each row execute function public.prepare_recruitment_task_on_stage_change();

create or replace function public.public_open_recruitment_task(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_submission public.recruitment_task_submissions%rowtype;
  v_now timestamptz:=now();
  v_can_edit boolean;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.'; end if;
  select * into v_task from public.recruitment_task_instances where token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  select * into v_submission from public.recruitment_task_submissions where task_instance_id=v_task.id;

  if v_task.status='Revoked' then raise exception 'This task link has been revoked. Contact the ProFox Recruitment Team.'; end if;
  if v_task.viewed_at is null then
    update public.recruitment_task_instances set viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now where id=v_task.id returning * into v_task;
    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(v_task.applicant_id,'Recruitment','Task Viewed','Practical task opened','Candidate opened secure practical task attempt '||v_task.attempt_no||'.','Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no));
  end if;

  v_can_edit := v_task.status in ('Issued','Viewed','In Progress') and v_task.due_at>=v_now and v_app.closed_at is null and v_app.stage=v_task.stage;
  return jsonb_build_object(
    'title',v_task.template_snapshot->>'title',
    'description',v_task.template_snapshot->>'description',
    'targetMarket',v_task.template_snapshot->>'targetMarket',
    'targetNiche',v_task.template_snapshot->>'targetNiche',
    'requiredItems',(v_task.template_snapshot->>'requiredItems')::integer,
    'estimatedMinutes',(v_task.template_snapshot->>'estimatedMinutes')::integer,
    'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),
    'attemptNo',v_task.attempt_no,
    'maxAttempts',(v_task.template_snapshot->>'maxAttempts')::integer,
    'candidateName',v_app.full_name,
    'applicationReference',v_app.application_reference,
    'status',v_task.status,
    'issuedAt',v_task.issued_at,
    'dueAt',v_task.due_at,
    'submittedAt',v_task.submitted_at,
    'retryFeedback',v_task.retry_feedback,
    'expired',v_task.due_at<v_now,
    'canEdit',v_can_edit,
    'answers',case when v_task.submitted_at is null then coalesce(v_submission.draft_data,'{"leads":[]}'::jsonb) else coalesce(v_submission.final_data,v_submission.draft_data) end
  );
end;
$$;

create or replace function public.public_save_recruitment_task_draft(p_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_required integer;
  v_first_save boolean;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.'; end if;
  select * into v_task from public.recruitment_task_instances where token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  if v_task.status not in ('Issued','Viewed','In Progress') then raise exception 'This task is no longer editable.'; end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.'; end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.'; end if;
  v_required := (v_task.template_snapshot->>'requiredItems')::integer;
  perform public.assert_recruitment_task_answers(p_answers,v_required,false);
  v_first_save := v_task.first_saved_at is null;

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,save_count,last_saved_at,updated_at)
  values(v_task.id,p_answers,1,now(),now())
  on conflict(task_instance_id) do update set
    draft_data=excluded.draft_data,
    save_count=public.recruitment_task_submissions.save_count+1,
    last_saved_at=now(),updated_at=now();

  update public.recruitment_task_instances set
    status='In Progress',first_saved_at=coalesce(first_saved_at,now()),last_saved_at=now(),updated_at=now()
  where id=v_task.id;

  if v_first_save then
    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(v_task.applicant_id,'Recruitment','Task Started','Practical task started','Candidate saved the first draft for attempt '||v_task.attempt_no||'.','Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no));
  end if;
  return jsonb_build_object('success',true,'savedAt',now(),'status','In Progress');
end;
$$;

create or replace function public.public_submit_recruitment_task(p_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_required integer;
  v_admin record;
  v_payload jsonb;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.'; end if;
  select * into v_task from public.recruitment_task_instances where token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.'; end if;
  if v_task.status in ('Submitted','Under Review','Passed','Retry Required','Failed') then return jsonb_build_object('success',true,'alreadySubmitted',true,'submittedAt',v_task.submitted_at); end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  if v_task.status='Revoked' then raise exception 'This task link has been revoked.'; end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.'; end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.'; end if;
  v_required := (v_task.template_snapshot->>'requiredItems')::integer;
  perform public.assert_recruitment_task_answers(p_answers,v_required,true);

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,final_data,save_count,last_saved_at,submitted_at,updated_at)
  values(v_task.id,p_answers,p_answers,1,now(),now(),now())
  on conflict(task_instance_id) do update set
    draft_data=excluded.draft_data,final_data=excluded.final_data,
    save_count=public.recruitment_task_submissions.save_count+1,
    last_saved_at=now(),submitted_at=now(),updated_at=now();

  update public.recruitment_task_instances set status='Submitted',submitted_at=now(),last_saved_at=now(),updated_at=now() where id=v_task.id returning * into v_task;

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Submitted','Lead Research Test submitted','Candidate submitted practical task attempt '||v_task.attempt_no||' for review.','Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'submittedAt',v_task.submitted_at));

  v_payload := public.recruitment_notification_payload(v_app)||jsonb_build_object(
    'taskTitle',v_task.template_snapshot->>'title','taskAttempt',v_task.attempt_no,
    'taskSubmittedAt',to_char(v_task.submitted_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"')
  );
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':submitted','recruitment_task_submission_received',v_app.email,null,v_payload,now());

  for v_admin in select id from public.user_profiles where role='admin' and status='active'
  loop
    perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Lead Research Test ready for review',v_app.full_name||' submitted Lead Research Test attempt '||v_task.attempt_no||'.','/admin/app/recruitment?tab=recruitment','recruitment-task-review:'||v_task.id::text||':'||v_admin.id::text);
  end loop;

  return jsonb_build_object('success',true,'submittedAt',v_task.submitted_at,'status','Submitted');
end;
$$;

revoke all on function public.public_open_recruitment_task(text) from public;
revoke all on function public.public_save_recruitment_task_draft(text,jsonb) from public;
revoke all on function public.public_submit_recruitment_task(text,jsonb) from public;
grant execute on function public.public_open_recruitment_task(text) to anon,authenticated;
grant execute on function public.public_save_recruitment_task_draft(text,jsonb) to anon,authenticated;
grant execute on function public.public_submit_recruitment_task(text,jsonb) to anon,authenticated;

create or replace function public.admin_get_recruitment_tasks(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_admin() and not public.can_manage_content_applicant(p_applicant_id) then raise exception 'Recruitment management access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'stage',t.stage,'attemptNo',t.attempt_no,'status',t.status,
    'title',t.template_snapshot->>'title','targetMarket',t.template_snapshot->>'targetMarket',
    'targetNiche',t.template_snapshot->>'targetNiche','requiredItems',(t.template_snapshot->>'requiredItems')::integer,
    'estimatedMinutes',(t.template_snapshot->>'estimatedMinutes')::integer,'maxAttempts',(t.template_snapshot->>'maxAttempts')::integer,
    'instructions',t.template_snapshot->'instructions','templateVersion',t.template_snapshot->>'version',
    'retryFeedback',t.retry_feedback,'issuedAt',t.issued_at,'dueAt',t.due_at,'viewedAt',t.viewed_at,
    'firstSavedAt',t.first_saved_at,'lastSavedAt',t.last_saved_at,'submittedAt',t.submitted_at,
    'reviewedAt',t.reviewed_at,'finalData',s.final_data,'draftData',s.draft_data
  ) order by t.attempt_no desc),'[]'::jsonb)
  into v_result
  from public.recruitment_task_instances t
  left join public.recruitment_task_submissions s on s.task_instance_id=t.id
  where t.applicant_id=p_applicant_id;
  return v_result;
end;
$$;

create or replace function public.admin_mark_recruitment_task_under_review(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status='Submitted' then update public.recruitment_task_instances set status='Under Review',updated_at=now() where id=v_task.id returning * into v_task; end if;
  return jsonb_build_object('success',true,'status',v_task.status);
end;
$$;

create or replace function public.admin_resend_recruitment_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_token text;
  v_url text;
  v_payload jsonb;
  v_template_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in ('Issued','Viewed','In Progress') then raise exception 'Only an active editable task link can be resent.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_token:=encode(gen_random_bytes(32),'hex');v_url:='https://www.profoxwebdesigner.com/recruitment/task/'||v_token;
  update public.recruitment_task_instances set token_hash=public.recruitment_task_token_hash(v_token),updated_at=now() where id=v_task.id;
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object(
    'taskTitle',v_task.template_snapshot->>'title','taskUrl',v_url,
    'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'taskEstimatedTime',(v_task.template_snapshot->>'estimatedMinutes')||' minutes',
    'taskRequiredItems',v_task.template_snapshot->>'requiredItems','taskTargetMarket',v_task.template_snapshot->>'targetMarket',
    'taskTargetNiche',v_task.template_snapshot->>'targetNiche','taskAttempt',v_task.attempt_no,'taskFeedback',v_task.retry_feedback
  );
  v_template_key:=case when v_task.attempt_no>1 then 'recruitment_lead_research_retry' else 'recruitment_lead_research' end;
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':resend:'||extract(epoch from clock_timestamp())::bigint,v_template_key,v_app.email,null,v_payload,now());
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Link Resent','Practical task link resent','Admin rotated and resent the secure task link.','Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no));
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.admin_extend_recruitment_task_deadline(p_task_id uuid,p_hours integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_token text;v_url text;v_payload jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_hours is null or p_hours<1 or p_hours>336 then raise exception 'Extension must be between 1 and 336 hours.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in ('Issued','Viewed','In Progress') then raise exception 'Only an active editable task can be extended.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_token:=encode(gen_random_bytes(32),'hex');v_url:='https://www.profoxwebdesigner.com/recruitment/task/'||v_token;
  update public.recruitment_task_instances set due_at=greatest(due_at,now())+make_interval(hours=>p_hours),token_hash=public.recruitment_task_token_hash(v_token),updated_at=now() where id=v_task.id returning * into v_task;
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object(
    'taskTitle',v_task.template_snapshot->>'title','taskUrl',v_url,
    'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),'taskExtensionHours',p_hours,'taskAttempt',v_task.attempt_no
  );
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':extension:'||extract(epoch from clock_timestamp())::bigint,'recruitment_task_deadline_extended',v_app.email,null,v_payload,now());
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Deadline Extended','Practical task deadline extended','Admin extended the deadline by '||p_hours||' hours.','Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no,'dueAt',v_task.due_at,'extensionHours',p_hours));
  return jsonb_build_object('success',true,'dueAt',v_task.due_at);
end;
$$;

create or replace function public.admin_revoke_recruitment_task(p_task_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<5 then raise exception 'A clear revocation reason is required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status in ('Submitted','Under Review','Passed','Retry Required','Failed') then raise exception 'Submitted or reviewed attempts cannot be revoked.'; end if;
  update public.recruitment_task_instances set status='Revoked',revoked_at=now(),revoked_by=auth.uid(),updated_at=now() where id=v_task.id;
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Revoked','Practical task revoked',btrim(p_reason),'Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no));
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.admin_get_recruitment_task_template(p_system_role text default 'sales',p_stage text default 'Lead Research Test')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_t public.recruitment_task_templates%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_t from public.recruitment_task_templates where active=true and system_role=p_system_role and stage=p_stage order by version desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',v_t.id,'taskKey',v_t.task_key,'systemRole',v_t.system_role,'stage',v_t.stage,'title',v_t.title,'description',v_t.description,'targetMarket',v_t.target_market,'targetNiche',v_t.target_niche,'requiredItems',v_t.required_items,'deadlineHours',v_t.deadline_hours,'estimatedMinutes',v_t.estimated_minutes,'maxAttempts',v_t.max_attempts,'instructions',v_t.instructions,'version',v_t.version,'updatedAt',v_t.updated_at);
end;
$$;

create or replace function public.admin_save_recruitment_task_template(
  p_system_role text,p_stage text,p_title text,p_description text,p_target_market text,p_target_niche text,
  p_required_items integer,p_deadline_hours integer,p_estimated_minutes integer,p_max_attempts integer,p_instructions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_t public.recruitment_task_templates%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if char_length(btrim(coalesce(p_title,'')))<3 then raise exception 'Task title is required.'; end if;
  if p_required_items not between 1 and 20 then raise exception 'Required items must be between 1 and 20.'; end if;
  if p_deadline_hours not between 1 and 720 then raise exception 'Deadline hours must be between 1 and 720.'; end if;
  if p_estimated_minutes not between 5 and 480 then raise exception 'Estimated minutes must be between 5 and 480.'; end if;
  if p_max_attempts not between 1 and 10 then raise exception 'Max attempts must be between 1 and 10.'; end if;
  if jsonb_typeof(coalesce(p_instructions,'[]'::jsonb))<>'array' then raise exception 'Instructions must be an array.'; end if;
  select * into v_t from public.recruitment_task_templates where active=true and system_role=p_system_role and stage=p_stage order by version desc limit 1 for update;
  if not found then raise exception 'Active recruitment task template not found.'; end if;
  update public.recruitment_task_templates set
    title=btrim(p_title),description=coalesce(p_description,''),target_market=coalesce(p_target_market,''),target_niche=coalesce(p_target_niche,''),
    required_items=p_required_items,deadline_hours=p_deadline_hours,estimated_minutes=p_estimated_minutes,max_attempts=p_max_attempts,
    instructions=coalesce(p_instructions,'[]'::jsonb),version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=v_t.id returning * into v_t;
  return public.admin_get_recruitment_task_template(p_system_role,p_stage);
end;
$$;

revoke all on function public.admin_get_recruitment_tasks(uuid) from public,anon;
revoke all on function public.admin_mark_recruitment_task_under_review(uuid) from public,anon;
revoke all on function public.admin_resend_recruitment_task(uuid) from public,anon;
revoke all on function public.admin_extend_recruitment_task_deadline(uuid,integer) from public,anon;
revoke all on function public.admin_revoke_recruitment_task(uuid,text) from public,anon;
revoke all on function public.admin_get_recruitment_task_template(text,text) from public,anon;
revoke all on function public.admin_save_recruitment_task_template(text,text,text,text,text,text,integer,integer,integer,integer,jsonb) from public,anon;
grant execute on function public.admin_get_recruitment_tasks(uuid) to authenticated;
grant execute on function public.admin_mark_recruitment_task_under_review(uuid) to authenticated;
grant execute on function public.admin_resend_recruitment_task(uuid) to authenticated;
grant execute on function public.admin_extend_recruitment_task_deadline(uuid,integer) to authenticated;
grant execute on function public.admin_revoke_recruitment_task(uuid,text) to authenticated;
grant execute on function public.admin_get_recruitment_task_template(text,text) to authenticated;
grant execute on function public.admin_save_recruitment_task_template(text,text,text,text,text,text,integer,integer,integer,integer,jsonb) to authenticated;

create or replace function public.guard_recruitment_assessment_task_submission()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text;
  v_task public.recruitment_task_instances%rowtype;
  v_max_attempts integer;
begin
  v_role:=public.career_job_system_role(new.job_id);
  if exists(select 1 from public.recruitment_task_templates where active=true and system_role=v_role and stage=new.stage) then
    select * into v_task from public.recruitment_task_instances where applicant_id=new.applicant_id and stage=new.stage order by attempt_no desc limit 1;
    if not found or v_task.status not in ('Submitted','Under Review') or v_task.submitted_at is null then
      raise exception 'Review the candidate practical task submission before recording this assessment.';
    end if;
    v_max_attempts:=coalesce((v_task.template_snapshot->>'maxAttempts')::integer,1);
    if new.status='Retry Required' and v_task.attempt_no>=v_max_attempts then
      raise exception 'Maximum practical-task attempts reached. Mark the assessment Passed or Failed.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_recruitment_assessment_task_submission on public.recruitment_assessments;
create trigger trg_guard_recruitment_assessment_task_submission
before insert or update of status,score,rubric_scores,critical_failures on public.recruitment_assessments
for each row execute function public.guard_recruitment_assessment_task_submission();

create or replace function public.sync_recruitment_task_from_assessment()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_feedback text;
begin
  if not exists(select 1 from public.recruitment_task_templates where active=true and system_role=public.career_job_system_role(new.job_id) and stage=new.stage) then return new; end if;
  select * into v_task from public.recruitment_task_instances where applicant_id=new.applicant_id and stage=new.stage order by attempt_no desc limit 1 for update;
  if not found then return new; end if;
  v_feedback:=btrim(coalesce(new.evaluator_notes,''));
  if new.status='Passed' then
    update public.recruitment_task_instances set status='Passed',reviewed_at=coalesce(new.evaluated_at,now()),updated_at=now() where id=v_task.id;
  elsif new.status='Failed' then
    update public.recruitment_task_instances set status='Failed',reviewed_at=coalesce(new.evaluated_at,now()),updated_at=now() where id=v_task.id;
  elsif new.status='Retry Required' then
    update public.recruitment_task_instances set status='Retry Required',reviewed_at=coalesce(new.evaluated_at,now()),updated_at=now() where id=v_task.id;
    if not exists(select 1 from public.recruitment_task_instances where applicant_id=new.applicant_id and stage=new.stage and attempt_no>v_task.attempt_no) then
      perform public.issue_recruitment_task_internal(new.applicant_id,new.stage,v_feedback,true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_recruitment_task_from_assessment on public.recruitment_assessments;
create trigger trg_sync_recruitment_task_from_assessment
after insert or update of status on public.recruitment_assessments
for each row execute function public.sync_recruitment_task_from_assessment();

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description)
values
(
  'recruitment_lead_research','Recruitment — lead research test','Action required: Complete your ProFox Lead Research Test',
  'Hi {{fullName}},\n\nYou have progressed to the ProFox Lead Research Test. This practical task evaluates how you identify, research and qualify businesses that could genuinely benefit from ProFox services.\n\nTask: {{taskTitle}}\nTarget market: {{taskTargetMarket}}\nTarget niche: {{taskTargetNiche}}\nBusinesses required: {{taskRequiredItems}}\nEstimated time: {{taskEstimatedTime}}\nDeadline: {{taskDueDate}}\n\nUse only publicly available business information. Accuracy, evidence and reasoning matter more than finding perfect prospects.\n\nStart your test here:\n{{taskUrl}}\n\nYour work saves as a draft and you can return using the same secure link until final submission.\n\nProFox Recruitment Team\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  '<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#000080">RECRUITMENT</div><h1 style="font-size:24px;margin:8px 0 14px">Lead Research Test</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">You have progressed to the ProFox Lead Research Test. This practical task evaluates how you identify, research and qualify businesses that could genuinely benefit from ProFox services.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Target market:</strong> {{taskTargetMarket}}<br><strong>Target niche:</strong> {{taskTargetNiche}}<br><strong>Businesses required:</strong> {{taskRequiredItems}}<br><strong>Estimated time:</strong> {{taskEstimatedTime}}<br><strong>Deadline:</strong> {{taskDueDate}}</div><p style="font-size:14px;line-height:1.7;color:#475569">Use only publicly available business information. Accuracy, evidence and reasoning matter more than finding perfect prospects.</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Start Lead Research Test</a></p><p style="font-size:13px;line-height:1.6;color:#64748b">Your work saves as a draft. You can return using the same secure link until final submission.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080">www.profoxwebdesigner.com</a></p></td></tr></table></td></tr></table></body></html>',true,
  'Secure candidate task invitation for Lead Research Test.'
),
(
  'recruitment_lead_research_retry','Recruitment — lead research retry','Action required: Lead Research Test retry',
  'Hi {{fullName}},\n\nYour Lead Research Test requires another attempt.\n\nEvaluator feedback:\n{{taskFeedback}}\n\nAttempt: {{taskAttempt}}\nDeadline: {{taskDueDate}}\n\nStart your new attempt here:\n{{taskUrl}}\n\nYour previous attempt remains on record. This link opens a new, separate attempt.\n\nProFox Recruitment Team\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  '<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#000080">RECRUITMENT</div><h1 style="font-size:24px;margin:8px 0 14px">Lead Research Test — Retry</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">Your Lead Research Test requires another attempt.</p><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;font-size:14px;line-height:1.7"><strong>Evaluator feedback</strong><br>{{taskFeedback}}</div><p style="font-size:14px"><strong>Attempt:</strong> {{taskAttempt}} &nbsp; <strong>Deadline:</strong> {{taskDueDate}}</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Start New Attempt</a></p><p style="font-size:13px;line-height:1.6;color:#64748b">Your previous attempt remains permanently on record. This secure link opens a separate new attempt.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080">www.profoxwebdesigner.com</a></p></td></tr></table></td></tr></table></body></html>',true,
  'Secure retry invitation for Lead Research Test.'
),
(
  'recruitment_task_submission_received','Recruitment — task submission received','Your ProFox Lead Research Test has been submitted',
  'Hi {{fullName}},\n\nYour Lead Research Test has been successfully submitted.\n\nApplication reference: {{applicationReference}}\nAttempt: {{taskAttempt}}\nSubmitted: {{taskSubmittedAt}}\n\nOur Recruitment Team will now review your work. No further action is required at this time.\n\nProFox Recruitment Team\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  '<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#000080">RECRUITMENT</div><h1 style="font-size:24px;margin:8px 0 14px">Submission received</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">Your Lead Research Test has been successfully submitted.</p><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Application reference:</strong> {{applicationReference}}<br><strong>Attempt:</strong> {{taskAttempt}}<br><strong>Submitted:</strong> {{taskSubmittedAt}}</div><p style="font-size:14px;line-height:1.7;color:#475569">Our Recruitment Team will now review your work. No further action is required at this time.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080">www.profoxwebdesigner.com</a></p></td></tr></table></td></tr></table></body></html>',true,
  'Candidate confirmation after final practical-task submission.'
),
(
  'recruitment_task_deadline_extended','Recruitment — task deadline extended','Your ProFox Lead Research Test deadline has been extended',
  'Hi {{fullName}},\n\nYour Lead Research Test deadline has been extended by {{taskExtensionHours}} hours.\n\nNew deadline: {{taskDueDate}}\n\nContinue your task here:\n{{taskUrl}}\n\nProFox Recruitment Team\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  '<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#000080">RECRUITMENT</div><h1 style="font-size:24px;margin:8px 0 14px">Deadline extended</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">Your Lead Research Test deadline has been extended by {{taskExtensionHours}} hours.</p><p style="font-size:14px"><strong>New deadline:</strong> {{taskDueDate}}</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Continue Lead Research Test</a></p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080">www.profoxwebdesigner.com</a></p></td></tr></table></td></tr></table></body></html>',true,
  'Candidate notification after Admin extends a practical-task deadline.'
)
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

-- Backfill any candidate already waiting in Lead Research Test. The helper is
-- idempotent for an active attempt and sends the secure task link only once.
do $$
declare v_app record;
begin
  for v_app in select id from public.applicants where stage='Lead Research Test' and closed_at is null
  loop
    perform public.issue_recruitment_task_internal(v_app.id,'Lead Research Test','',true);
  end loop;
end;
$$;
