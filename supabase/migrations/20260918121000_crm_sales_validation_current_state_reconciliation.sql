-- Part 10B.6 forward-only current-state reconciliation: Sales validation.
-- NEW migration. The unresolved historical Part 7 migration remains untouched, unexecuted,
-- and must never be inserted into profox_migrations.applied_migrations.
-- Establishes the later current Part 7 state, including My Work routing/advisor hardening.
-- Production execution is not authorized by this repository implementation.
--
-- Stable postcondition IDs:
-- P10B6_VALIDATION_SCHEMA_39_COLUMNS
-- P10B6_VALIDATION_CONSTRAINTS_CURRENT
-- P10B6_VALIDATION_INDEXES_13_CURRENT
-- P10B6_VALIDATION_TRIGGERS_3_ENABLED
-- P10B6_VALIDATION_RLS_POLICY_CURRENT
-- P10B6_VALIDATION_FUNCTIONS_CURRENT
-- P10B6_VALIDATION_ACLS_CURRENT
-- P10B6_VALIDATION_POLICY_V1
-- P10B6_VALIDATION_MY_WORK_ROUTING
-- P10B6_VALIDATION_ROWS_UNCHANGED
-- P10B6_SEND_GATE_FALSE

do $p10b6_pre$
declare
  r record;
  v_cfg jsonb;
  v_count integer;
begin
  if to_regclass('public.crm_leads') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_requirements') is null
     or to_regclass('public.sales_meetings') is null
     or to_regclass('public.sales_products') is null
     or to_regclass('public.user_profiles') is null then
    raise exception '[P10B6_VALIDATION_PRECONDITION] required canonical domain tables are missing.';
  end if;

  if to_regprocedure('public.crm_can_access_lead(uuid)') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.enqueue_in_app_notification(uuid,text,text,text,text,text)') is null
     or to_regprocedure('public.crm_write_lead_event(uuid,text,text,text,jsonb,uuid,text,text,timestamp with time zone,text)') is null then
    raise exception '[P10B6_VALIDATION_PRECONDITION] required access/audit/notification helpers are missing.';
  end if;

  select config_value into v_cfg
  from public.system_configuration
  where config_key='crm_sales_validation_policy_v1';
  if v_cfg is not null and v_cfg is distinct from $p10b6_validation_policy${"policyKey":"crm_sales_validation_policy_v1","policyVersion":1,"validationTypes":{"SCOPE":{"active":true,"teamKey":"SCOPE_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["PROJECT_SCOPE","CONTENT","BRAND","BUSINESS","PROBLEM","DESIRED_OUTCOME","AUDIENCE_CUSTOMER","DECISION_BUYING_PROCESS"]},"TIMELINE":{"active":true,"teamKey":"TIMELINE_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":[]},"TECHNICAL":{"active":true,"teamKey":"TECHNICAL_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["TECHNICAL","CUSTOM_APPLICATION","INTEGRATIONS","BOOKING","ECOMMERCE","ANALYTICS"]},"COMMERCIAL":{"active":true,"teamKey":"COMMERCIAL_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["COMMERCIAL"]},"COMPLIANCE_RISK":{"active":true,"teamKey":"COMPLIANCE_RISK_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"RED","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["RISKS_DEPENDENCIES"]}}}$p10b6_validation_policy$::jsonb then
    raise exception '[P10B6_VALIDATION_PRECONDITION] unknown or newer validation policy.';
  end if;

  if to_regclass('public.crm_sales_validations') is not null then
    if exists (
      select 1 from pg_attribute
      where attrelid='public.crm_sales_validations'::regclass and attnum>0 and not attisdropped
        and attname<>all(array['id','lead_id','opportunity_id','requirement_id','meeting_id','product_id','package_fit_policy_key','package_fit_policy_version','validation_type','severity','subject','request_context','source_type','source_key','source_snapshot','source_fingerprint','source_changed_at','source_acknowledged_at','source_acknowledged_by','status','reviewer_team','requested_by','requested_at','assigned_reviewer_id','started_at','information_requested','resubmission_note','decision_summary','approved_constraints','rejection_rework_reason','decided_by','decided_at','cancelled_by','cancelled_at','cancel_reason','supersedes_validation_id','dedupe_key','created_at','updated_at'])
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unknown crm_sales_validations column exists.';
    end if;

    for r in select * from (values
      ('id','uuid',true,'gen_random_uuid()'),
      ('lead_id','uuid',true,''),
      ('opportunity_id','uuid',false,''),
      ('requirement_id','uuid',false,''),
      ('meeting_id','uuid',false,''),
      ('product_id','uuid',false,''),
      ('package_fit_policy_key','text',false,''),
      ('package_fit_policy_version','integer',false,''),
      ('validation_type','text',true,''),
      ('severity','text',true,''),
      ('subject','text',true,''),
      ('request_context','text',true,'''''::text'),
      ('source_type','text',true,''),
      ('source_key','text',true,''),
      ('source_snapshot','jsonb',true,'''{}''::jsonb'),
      ('source_fingerprint','text',true,'''''::text'),
      ('source_changed_at','timestamp with time zone',false,''),
      ('source_acknowledged_at','timestamp with time zone',false,''),
      ('source_acknowledged_by','uuid',false,''),
      ('status','text',true,'''PENDING''::text'),
      ('reviewer_team','text',true,''),
      ('requested_by','uuid',true,''),
      ('requested_at','timestamp with time zone',true,'now()'),
      ('assigned_reviewer_id','uuid',false,''),
      ('started_at','timestamp with time zone',false,''),
      ('information_requested','text',false,''),
      ('resubmission_note','text',false,''),
      ('decision_summary','text',false,''),
      ('approved_constraints','text',false,''),
      ('rejection_rework_reason','text',false,''),
      ('decided_by','uuid',false,''),
      ('decided_at','timestamp with time zone',false,''),
      ('cancelled_by','uuid',false,''),
      ('cancelled_at','timestamp with time zone',false,''),
      ('cancel_reason','text',false,''),
      ('supersedes_validation_id','uuid',false,''),
      ('dedupe_key','text',true,''),
      ('created_at','timestamp with time zone',true,'now()'),
      ('updated_at','timestamp with time zone',true,'now()')
    ) as expected(name,data_type,not_null,default_expr)
    loop
      if exists (
        select 1 from pg_attribute a
        left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
        where a.attrelid='public.crm_sales_validations'::regclass
          and a.attname=r.name and a.attnum>0 and not a.attisdropped
          and (
            format_type(a.atttypid,a.atttypmod)<>r.data_type
            or a.attnotnull<>r.not_null
            or coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')<>r.default_expr
          )
      ) then
        raise exception '[P10B6_VALIDATION_PRECONDITION] incompatible existing validation column: %',r.name;
      end if;

      if not exists (
        select 1 from pg_attribute a
        where a.attrelid='public.crm_sales_validations'::regclass
          and a.attname=r.name and a.attnum>0 and not a.attisdropped
      )
      and r.not_null
      and r.default_expr=''
      and exists (select 1 from public.crm_sales_validations limit 1) then
        raise exception '[P10B6_VALIDATION_PRECONDITION] missing required NOT NULL column % cannot be added safely to a nonempty partial table.',r.name;
      end if;
    end loop;

    if exists (
      select 1 from pg_constraint
      where conrelid='public.crm_sales_validations'::regclass
        and conname<>all(array['crm_sales_validation_cancel_integrity','crm_sales_validation_decision_integrity','crm_sales_validations_approved_constraints_check','crm_sales_validations_assigned_reviewer_id_fkey','crm_sales_validations_cancel_reason_check','crm_sales_validations_cancelled_by_fkey','crm_sales_validations_decided_by_fkey','crm_sales_validations_decision_summary_check','crm_sales_validations_dedupe_key_check','crm_sales_validations_information_requested_check','crm_sales_validations_lead_id_fkey','crm_sales_validations_meeting_id_fkey','crm_sales_validations_opportunity_id_fkey','crm_sales_validations_pkey','crm_sales_validations_product_id_fkey','crm_sales_validations_rejection_rework_reason_check','crm_sales_validations_request_context_check','crm_sales_validations_requested_by_fkey','crm_sales_validations_requirement_id_fkey','crm_sales_validations_resubmission_note_check','crm_sales_validations_reviewer_team_check','crm_sales_validations_severity_check','crm_sales_validations_source_acknowledged_by_fkey','crm_sales_validations_source_key_check','crm_sales_validations_source_snapshot_check','crm_sales_validations_source_type_check','crm_sales_validations_status_check','crm_sales_validations_subject_check','crm_sales_validations_supersedes_validation_id_fkey','crm_sales_validations_validation_type_check'])
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unknown validation constraint exists.';
    end if;
    for r in select * from (values
      ('crm_sales_validation_cancel_integrity','CHECK (status <> ''CANCELLED''::text OR cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)'),
      ('crm_sales_validation_decision_integrity','CHECK ((status <> ALL (ARRAY[''APPROVED''::text, ''REJECTED''::text])) OR decided_by IS NOT NULL AND decided_at IS NOT NULL)'),
      ('crm_sales_validations_approved_constraints_check','CHECK (approved_constraints IS NULL OR char_length(approved_constraints) <= 4000)'),
      ('crm_sales_validations_assigned_reviewer_id_fkey','FOREIGN KEY (assigned_reviewer_id) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_cancel_reason_check','CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000)'),
      ('crm_sales_validations_cancelled_by_fkey','FOREIGN KEY (cancelled_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_decided_by_fkey','FOREIGN KEY (decided_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_decision_summary_check','CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 4000)'),
      ('crm_sales_validations_dedupe_key_check','CHECK (char_length(dedupe_key) <= 128)'),
      ('crm_sales_validations_information_requested_check','CHECK (information_requested IS NULL OR char_length(information_requested) <= 4000)'),
      ('crm_sales_validations_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_meeting_id_fkey','FOREIGN KEY (meeting_id) REFERENCES sales_meetings(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_opportunity_id_fkey','FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_pkey','PRIMARY KEY (id)'),
      ('crm_sales_validations_product_id_fkey','FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_rejection_rework_reason_check','CHECK (rejection_rework_reason IS NULL OR char_length(rejection_rework_reason) <= 4000)'),
      ('crm_sales_validations_request_context_check','CHECK (char_length(request_context) <= 4000)'),
      ('crm_sales_validations_requested_by_fkey','FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_requirement_id_fkey','FOREIGN KEY (requirement_id) REFERENCES crm_requirements(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_resubmission_note_check','CHECK (resubmission_note IS NULL OR char_length(resubmission_note) <= 2000)'),
      ('crm_sales_validations_reviewer_team_check','CHECK (char_length(btrim(reviewer_team)) >= 1 AND char_length(btrim(reviewer_team)) <= 120)'),
      ('crm_sales_validations_severity_check','CHECK (severity = ANY (ARRAY[''GREEN''::text, ''AMBER''::text, ''RED''::text]))'),
      ('crm_sales_validations_source_acknowledged_by_fkey','FOREIGN KEY (source_acknowledged_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_source_key_check','CHECK (char_length(btrim(source_key)) >= 1 AND char_length(btrim(source_key)) <= 240)'),
      ('crm_sales_validations_source_snapshot_check','CHECK (jsonb_typeof(source_snapshot) = ''object''::text)'),
      ('crm_sales_validations_source_type_check','CHECK (source_type = ANY (ARRAY[''REQUIREMENT''::text, ''PACKAGE_FIT''::text, ''MEETING''::text, ''MANUAL''::text]))'),
      ('crm_sales_validations_status_check','CHECK (status = ANY (ARRAY[''PENDING''::text, ''IN_REVIEW''::text, ''NEEDS_INFORMATION''::text, ''APPROVED''::text, ''REJECTED''::text, ''CANCELLED''::text, ''STALE''::text]))'),
      ('crm_sales_validations_subject_check','CHECK (char_length(btrim(subject)) >= 6 AND char_length(btrim(subject)) <= 240)'),
      ('crm_sales_validations_supersedes_validation_id_fkey','FOREIGN KEY (supersedes_validation_id) REFERENCES crm_sales_validations(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_validation_type_check','CHECK (validation_type = ANY (ARRAY[''TECHNICAL''::text, ''COMMERCIAL''::text, ''TIMELINE''::text, ''COMPLIANCE_RISK''::text, ''SCOPE''::text]))')
    ) as expected(name,definition)
    loop
      if exists (
        select 1 from pg_constraint
        where conrelid='public.crm_sales_validations'::regclass and conname=r.name
          and pg_get_constraintdef(oid,true)<>r.definition
      ) then
        raise exception '[P10B6_VALIDATION_PRECONDITION] incompatible validation constraint: %',r.name;
      end if;

      if not exists (
        select 1 from pg_constraint
        where conrelid='public.crm_sales_validations'::regclass and conname=r.name
      )
      and exists (select 1 from public.crm_sales_validations limit 1) then
        raise exception '[P10B6_VALIDATION_PRECONDITION] missing validation constraint % requires review on a nonempty partial table.',r.name;
      end if;
    end loop;

    if exists (
      select 1 from pg_indexes
      where schemaname='public' and tablename='crm_sales_validations'
        and indexname<>all(array['crm_sales_validations_active_dedupe_uidx','crm_sales_validations_cancelled_by_idx','crm_sales_validations_decided_by_idx','crm_sales_validations_lead_requested_idx','crm_sales_validations_meeting_idx','crm_sales_validations_opportunity_idx','crm_sales_validations_pkey','crm_sales_validations_product_idx','crm_sales_validations_queue_idx','crm_sales_validations_requested_by_idx','crm_sales_validations_requirement_idx','crm_sales_validations_reviewer_idx','crm_sales_validations_source_acknowledged_by_idx','crm_sales_validations_supersedes_idx'])
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unknown validation index exists.';
    end if;
    for r in select * from (values
      ('crm_sales_validations_active_dedupe_uidx','CREATE UNIQUE INDEX crm_sales_validations_active_dedupe_uidx ON public.crm_sales_validations USING btree (dedupe_key) WHERE (status = ANY (ARRAY[''PENDING''::text, ''IN_REVIEW''::text, ''NEEDS_INFORMATION''::text]))'),
      ('crm_sales_validations_cancelled_by_idx','CREATE INDEX crm_sales_validations_cancelled_by_idx ON public.crm_sales_validations USING btree (cancelled_by) WHERE (cancelled_by IS NOT NULL)'),
      ('crm_sales_validations_decided_by_idx','CREATE INDEX crm_sales_validations_decided_by_idx ON public.crm_sales_validations USING btree (decided_by) WHERE (decided_by IS NOT NULL)'),
      ('crm_sales_validations_lead_requested_idx','CREATE INDEX crm_sales_validations_lead_requested_idx ON public.crm_sales_validations USING btree (lead_id, requested_at DESC)'),
      ('crm_sales_validations_meeting_idx','CREATE INDEX crm_sales_validations_meeting_idx ON public.crm_sales_validations USING btree (meeting_id) WHERE (meeting_id IS NOT NULL)'),
      ('crm_sales_validations_opportunity_idx','CREATE INDEX crm_sales_validations_opportunity_idx ON public.crm_sales_validations USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL)'),
      ('crm_sales_validations_pkey','CREATE UNIQUE INDEX crm_sales_validations_pkey ON public.crm_sales_validations USING btree (id)'),
      ('crm_sales_validations_product_idx','CREATE INDEX crm_sales_validations_product_idx ON public.crm_sales_validations USING btree (product_id) WHERE (product_id IS NOT NULL)'),
      ('crm_sales_validations_queue_idx','CREATE INDEX crm_sales_validations_queue_idx ON public.crm_sales_validations USING btree (status, severity, reviewer_team, requested_at)'),
      ('crm_sales_validations_requested_by_idx','CREATE INDEX crm_sales_validations_requested_by_idx ON public.crm_sales_validations USING btree (requested_by)'),
      ('crm_sales_validations_requirement_idx','CREATE INDEX crm_sales_validations_requirement_idx ON public.crm_sales_validations USING btree (requirement_id, status) WHERE (requirement_id IS NOT NULL)'),
      ('crm_sales_validations_reviewer_idx','CREATE INDEX crm_sales_validations_reviewer_idx ON public.crm_sales_validations USING btree (assigned_reviewer_id, status, requested_at) WHERE (assigned_reviewer_id IS NOT NULL)'),
      ('crm_sales_validations_source_acknowledged_by_idx','CREATE INDEX crm_sales_validations_source_acknowledged_by_idx ON public.crm_sales_validations USING btree (source_acknowledged_by) WHERE (source_acknowledged_by IS NOT NULL)'),
      ('crm_sales_validations_supersedes_idx','CREATE INDEX crm_sales_validations_supersedes_idx ON public.crm_sales_validations USING btree (supersedes_validation_id) WHERE (supersedes_validation_id IS NOT NULL)')
    ) as expected(name,definition)
    loop
      if exists (
        select 1 from pg_indexes
        where schemaname='public' and tablename='crm_sales_validations' and indexname=r.name
          and indexdef<>r.definition
      ) then
        raise exception '[P10B6_VALIDATION_PRECONDITION] incompatible validation index: %',r.name;
      end if;
    end loop;

    if exists (
      select 1 from pg_trigger
      where tgrelid='public.crm_sales_validations'::regclass and not tgisinternal
        and tgname<>all(array['trg_crm_sales_validations_no_delete','trg_crm_sales_validations_touch_updated_at'])
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unknown validation trigger exists.';
    end if;

    if exists (
      select 1 from public.crm_sales_validations
      where status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION')
      group by dedupe_key having count(*)>1
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] duplicate active validation dedupe keys exist.';
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='crm_sales_validations'
        and policyname<>'crm_sales_validations_select_authorized'
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unknown validation RLS policy exists.';
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='crm_sales_validations'
        and policyname='crm_sales_validations_select_authorized'
        and (cmd<>'SELECT'
          or roles<>array['authenticated']::name[]
          or qual<>'(crm_can_access_lead(lead_id) OR is_admin() OR (assigned_reviewer_id = ( SELECT auth.uid() AS uid)) OR crm_sales_validation_reviewer_eligible(validation_type, reviewer_team, ( SELECT auth.uid() AS uid)))')
    ) then
      raise exception '[P10B6_VALIDATION_PRECONDITION] validation SELECT policy drifted.';
    end if;
  end if;

  for r in select * from (values
    ('crm_get_sales_validation_detail','public.crm_get_sales_validation_detail(uuid)'),
    ('crm_get_sales_validation_queue','public.crm_get_sales_validation_queue()'),
    ('crm_get_sales_validation_workspace','public.crm_get_sales_validation_workspace(uuid,uuid)'),
    ('crm_request_sales_validation','public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)'),
    ('crm_sales_validation_notify_reviewers','public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)'),
    ('crm_sales_validation_notify_seller','public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)'),
    ('crm_sales_validation_policy_entry','public.crm_sales_validation_policy_entry(text)'),
    ('crm_sales_validation_prevent_delete','public.crm_sales_validation_prevent_delete()'),
    ('crm_sales_validation_requirement_changed','public.crm_sales_validation_requirement_changed()'),
    ('crm_sales_validation_reviewer_eligible','public.crm_sales_validation_reviewer_eligible(text,text,uuid)'),
    ('crm_sales_validation_source_state','public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)'),
    ('crm_sales_validation_touch_updated_at','public.crm_sales_validation_touch_updated_at()'),
    ('crm_transition_sales_validation','public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)')
  ) as expected(function_name,signature)
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=r.function_name
      and p.oid<>coalesce(to_regprocedure(r.signature),0::oid);
    if v_count<>0 then
      raise exception '[P10B6_VALIDATION_PRECONDITION] unexpected overload for %.',r.function_name;
    end if;
  end loop;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] finalQuotationSendGateActive must remain false.';
  end if;

  perform set_config(
    'profox.part10b6.validation_count',
    case when to_regclass('public.crm_sales_validations') is null
      then '0' else (select count(*)::text from public.crm_sales_validations) end,
    true
  );
end
$p10b6_pre$;

insert into public.system_configuration(config_key,config_value,description)
values ('crm_sales_validation_policy_v1',$p10b6_validation_policy${"policyKey":"crm_sales_validation_policy_v1","policyVersion":1,"validationTypes":{"SCOPE":{"active":true,"teamKey":"SCOPE_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["PROJECT_SCOPE","CONTENT","BRAND","BUSINESS","PROBLEM","DESIRED_OUTCOME","AUDIENCE_CUSTOMER","DECISION_BUYING_PROCESS"]},"TIMELINE":{"active":true,"teamKey":"TIMELINE_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":[]},"TECHNICAL":{"active":true,"teamKey":"TECHNICAL_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["TECHNICAL","CUSTOM_APPLICATION","INTEGRATIONS","BOOKING","ECOMMERCE","ANALYTICS"]},"COMMERCIAL":{"active":true,"teamKey":"COMMERCIAL_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["COMMERCIAL"]},"COMPLIANCE_RISK":{"active":true,"teamKey":"COMPLIANCE_RISK_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"RED","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["RISKS_DEPENDENCIES"]}}}$p10b6_validation_policy$::jsonb,'Canonical Sales validation policy v1')
on conflict (config_key) do nothing;

create table if not exists public.crm_sales_validations (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  opportunity_id uuid,
  requirement_id uuid,
  meeting_id uuid,
  product_id uuid,
  package_fit_policy_key text,
  package_fit_policy_version integer,
  validation_type text not null,
  severity text not null,
  subject text not null,
  request_context text default ''::text not null,
  source_type text not null,
  source_key text not null,
  source_snapshot jsonb default '{}'::jsonb not null,
  source_fingerprint text default ''::text not null,
  source_changed_at timestamp with time zone,
  source_acknowledged_at timestamp with time zone,
  source_acknowledged_by uuid,
  status text default 'PENDING'::text not null,
  reviewer_team text not null,
  requested_by uuid not null,
  requested_at timestamp with time zone default now() not null,
  assigned_reviewer_id uuid,
  started_at timestamp with time zone,
  information_requested text,
  resubmission_note text,
  decision_summary text,
  approved_constraints text,
  rejection_rework_reason text,
  decided_by uuid,
  decided_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  supersedes_validation_id uuid,
  dedupe_key text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint crm_sales_validation_cancel_integrity CHECK (status <> 'CANCELLED'::text OR cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL),
  constraint crm_sales_validation_decision_integrity CHECK ((status <> ALL (ARRAY['APPROVED'::text, 'REJECTED'::text])) OR decided_by IS NOT NULL AND decided_at IS NOT NULL),
  constraint crm_sales_validations_approved_constraints_check CHECK (approved_constraints IS NULL OR char_length(approved_constraints) <= 4000),
  constraint crm_sales_validations_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  constraint crm_sales_validations_cancel_reason_check CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000),
  constraint crm_sales_validations_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES user_profiles(id) ON DELETE SET NULL,
  constraint crm_sales_validations_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_profiles(id) ON DELETE SET NULL,
  constraint crm_sales_validations_decision_summary_check CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 4000),
  constraint crm_sales_validations_dedupe_key_check CHECK (char_length(dedupe_key) <= 128),
  constraint crm_sales_validations_information_requested_check CHECK (information_requested IS NULL OR char_length(information_requested) <= 4000),
  constraint crm_sales_validations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES sales_meetings(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_pkey PRIMARY KEY (id),
  constraint crm_sales_validations_product_id_fkey FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_rejection_rework_reason_check CHECK (rejection_rework_reason IS NULL OR char_length(rejection_rework_reason) <= 4000),
  constraint crm_sales_validations_request_context_check CHECK (char_length(request_context) <= 4000),
  constraint crm_sales_validations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES crm_requirements(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_resubmission_note_check CHECK (resubmission_note IS NULL OR char_length(resubmission_note) <= 2000),
  constraint crm_sales_validations_reviewer_team_check CHECK (char_length(btrim(reviewer_team)) >= 1 AND char_length(btrim(reviewer_team)) <= 120),
  constraint crm_sales_validations_severity_check CHECK (severity = ANY (ARRAY['GREEN'::text, 'AMBER'::text, 'RED'::text])),
  constraint crm_sales_validations_source_acknowledged_by_fkey FOREIGN KEY (source_acknowledged_by) REFERENCES user_profiles(id) ON DELETE SET NULL,
  constraint crm_sales_validations_source_key_check CHECK (char_length(btrim(source_key)) >= 1 AND char_length(btrim(source_key)) <= 240),
  constraint crm_sales_validations_source_snapshot_check CHECK (jsonb_typeof(source_snapshot) = 'object'::text),
  constraint crm_sales_validations_source_type_check CHECK (source_type = ANY (ARRAY['REQUIREMENT'::text, 'PACKAGE_FIT'::text, 'MEETING'::text, 'MANUAL'::text])),
  constraint crm_sales_validations_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'IN_REVIEW'::text, 'NEEDS_INFORMATION'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'STALE'::text])),
  constraint crm_sales_validations_subject_check CHECK (char_length(btrim(subject)) >= 6 AND char_length(btrim(subject)) <= 240),
  constraint crm_sales_validations_supersedes_validation_id_fkey FOREIGN KEY (supersedes_validation_id) REFERENCES crm_sales_validations(id) ON DELETE RESTRICT,
  constraint crm_sales_validations_validation_type_check CHECK (validation_type = ANY (ARRAY['TECHNICAL'::text, 'COMMERCIAL'::text, 'TIMELINE'::text, 'COMPLIANCE_RISK'::text, 'SCOPE'::text]))
);

alter table public.crm_sales_validations add column if not exists id uuid default gen_random_uuid() not null;
alter table public.crm_sales_validations add column if not exists lead_id uuid not null;
alter table public.crm_sales_validations add column if not exists opportunity_id uuid;
alter table public.crm_sales_validations add column if not exists requirement_id uuid;
alter table public.crm_sales_validations add column if not exists meeting_id uuid;
alter table public.crm_sales_validations add column if not exists product_id uuid;
alter table public.crm_sales_validations add column if not exists package_fit_policy_key text;
alter table public.crm_sales_validations add column if not exists package_fit_policy_version integer;
alter table public.crm_sales_validations add column if not exists validation_type text not null;
alter table public.crm_sales_validations add column if not exists severity text not null;
alter table public.crm_sales_validations add column if not exists subject text not null;
alter table public.crm_sales_validations add column if not exists request_context text default ''::text not null;
alter table public.crm_sales_validations add column if not exists source_type text not null;
alter table public.crm_sales_validations add column if not exists source_key text not null;
alter table public.crm_sales_validations add column if not exists source_snapshot jsonb default '{}'::jsonb not null;
alter table public.crm_sales_validations add column if not exists source_fingerprint text default ''::text not null;
alter table public.crm_sales_validations add column if not exists source_changed_at timestamp with time zone;
alter table public.crm_sales_validations add column if not exists source_acknowledged_at timestamp with time zone;
alter table public.crm_sales_validations add column if not exists source_acknowledged_by uuid;
alter table public.crm_sales_validations add column if not exists status text default 'PENDING'::text not null;
alter table public.crm_sales_validations add column if not exists reviewer_team text not null;
alter table public.crm_sales_validations add column if not exists requested_by uuid not null;
alter table public.crm_sales_validations add column if not exists requested_at timestamp with time zone default now() not null;
alter table public.crm_sales_validations add column if not exists assigned_reviewer_id uuid;
alter table public.crm_sales_validations add column if not exists started_at timestamp with time zone;
alter table public.crm_sales_validations add column if not exists information_requested text;
alter table public.crm_sales_validations add column if not exists resubmission_note text;
alter table public.crm_sales_validations add column if not exists decision_summary text;
alter table public.crm_sales_validations add column if not exists approved_constraints text;
alter table public.crm_sales_validations add column if not exists rejection_rework_reason text;
alter table public.crm_sales_validations add column if not exists decided_by uuid;
alter table public.crm_sales_validations add column if not exists decided_at timestamp with time zone;
alter table public.crm_sales_validations add column if not exists cancelled_by uuid;
alter table public.crm_sales_validations add column if not exists cancelled_at timestamp with time zone;
alter table public.crm_sales_validations add column if not exists cancel_reason text;
alter table public.crm_sales_validations add column if not exists supersedes_validation_id uuid;
alter table public.crm_sales_validations add column if not exists dedupe_key text not null;
alter table public.crm_sales_validations add column if not exists created_at timestamp with time zone default now() not null;
alter table public.crm_sales_validations add column if not exists updated_at timestamp with time zone default now() not null;

do $add_crm_sales_validation_cancel_integrity$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validation_cancel_integrity'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validation_cancel_integrity CHECK (status <> 'CANCELLED'::text OR cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL);
  end if;
end $add_crm_sales_validation_cancel_integrity$;

do $add_crm_sales_validation_decision_integrity$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validation_decision_integrity'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validation_decision_integrity CHECK ((status <> ALL (ARRAY['APPROVED'::text, 'REJECTED'::text])) OR decided_by IS NOT NULL AND decided_at IS NOT NULL);
  end if;
end $add_crm_sales_validation_decision_integrity$;

do $add_crm_sales_validations_approved_constraints_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_approved_constraints_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_approved_constraints_check CHECK (approved_constraints IS NULL OR char_length(approved_constraints) <= 4000);
  end if;
end $add_crm_sales_validations_approved_constraints_check$;

do $add_crm_sales_validations_assigned_reviewer_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_assigned_reviewer_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
  end if;
end $add_crm_sales_validations_assigned_reviewer_id_fkey$;

do $add_crm_sales_validations_cancel_reason_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_cancel_reason_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_cancel_reason_check CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000);
  end if;
end $add_crm_sales_validations_cancel_reason_check$;

do $add_crm_sales_validations_cancelled_by_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_cancelled_by_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
  end if;
end $add_crm_sales_validations_cancelled_by_fkey$;

do $add_crm_sales_validations_decided_by_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_decided_by_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
  end if;
end $add_crm_sales_validations_decided_by_fkey$;

do $add_crm_sales_validations_decision_summary_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_decision_summary_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_decision_summary_check CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 4000);
  end if;
end $add_crm_sales_validations_decision_summary_check$;

do $add_crm_sales_validations_dedupe_key_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_dedupe_key_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_dedupe_key_check CHECK (char_length(dedupe_key) <= 128);
  end if;
end $add_crm_sales_validations_dedupe_key_check$;

do $add_crm_sales_validations_information_requested_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_information_requested_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_information_requested_check CHECK (information_requested IS NULL OR char_length(information_requested) <= 4000);
  end if;
end $add_crm_sales_validations_information_requested_check$;

do $add_crm_sales_validations_lead_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_lead_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_lead_id_fkey$;

do $add_crm_sales_validations_meeting_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_meeting_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES sales_meetings(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_meeting_id_fkey$;

do $add_crm_sales_validations_opportunity_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_opportunity_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_opportunity_id_fkey$;

do $add_crm_sales_validations_pkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_pkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_pkey PRIMARY KEY (id);
  end if;
end $add_crm_sales_validations_pkey$;

do $add_crm_sales_validations_product_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_product_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_product_id_fkey FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_product_id_fkey$;

do $add_crm_sales_validations_rejection_rework_reason_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_rejection_rework_reason_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_rejection_rework_reason_check CHECK (rejection_rework_reason IS NULL OR char_length(rejection_rework_reason) <= 4000);
  end if;
end $add_crm_sales_validations_rejection_rework_reason_check$;

do $add_crm_sales_validations_request_context_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_request_context_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_request_context_check CHECK (char_length(request_context) <= 4000);
  end if;
end $add_crm_sales_validations_request_context_check$;

do $add_crm_sales_validations_requested_by_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_requested_by_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_requested_by_fkey$;

do $add_crm_sales_validations_requirement_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_requirement_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES crm_requirements(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_requirement_id_fkey$;

do $add_crm_sales_validations_resubmission_note_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_resubmission_note_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_resubmission_note_check CHECK (resubmission_note IS NULL OR char_length(resubmission_note) <= 2000);
  end if;
end $add_crm_sales_validations_resubmission_note_check$;

do $add_crm_sales_validations_reviewer_team_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_reviewer_team_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_reviewer_team_check CHECK (char_length(btrim(reviewer_team)) >= 1 AND char_length(btrim(reviewer_team)) <= 120);
  end if;
end $add_crm_sales_validations_reviewer_team_check$;

do $add_crm_sales_validations_severity_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_severity_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_severity_check CHECK (severity = ANY (ARRAY['GREEN'::text, 'AMBER'::text, 'RED'::text]));
  end if;
end $add_crm_sales_validations_severity_check$;

do $add_crm_sales_validations_source_acknowledged_by_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_source_acknowledged_by_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_source_acknowledged_by_fkey FOREIGN KEY (source_acknowledged_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
  end if;
end $add_crm_sales_validations_source_acknowledged_by_fkey$;

do $add_crm_sales_validations_source_key_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_source_key_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_source_key_check CHECK (char_length(btrim(source_key)) >= 1 AND char_length(btrim(source_key)) <= 240);
  end if;
end $add_crm_sales_validations_source_key_check$;

do $add_crm_sales_validations_source_snapshot_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_source_snapshot_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_source_snapshot_check CHECK (jsonb_typeof(source_snapshot) = 'object'::text);
  end if;
end $add_crm_sales_validations_source_snapshot_check$;

do $add_crm_sales_validations_source_type_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_source_type_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_source_type_check CHECK (source_type = ANY (ARRAY['REQUIREMENT'::text, 'PACKAGE_FIT'::text, 'MEETING'::text, 'MANUAL'::text]));
  end if;
end $add_crm_sales_validations_source_type_check$;

do $add_crm_sales_validations_status_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_status_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'IN_REVIEW'::text, 'NEEDS_INFORMATION'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'STALE'::text]));
  end if;
end $add_crm_sales_validations_status_check$;

do $add_crm_sales_validations_subject_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_subject_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_subject_check CHECK (char_length(btrim(subject)) >= 6 AND char_length(btrim(subject)) <= 240);
  end if;
end $add_crm_sales_validations_subject_check$;

do $add_crm_sales_validations_supersedes_validation_id_fkey$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_supersedes_validation_id_fkey'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_supersedes_validation_id_fkey FOREIGN KEY (supersedes_validation_id) REFERENCES crm_sales_validations(id) ON DELETE RESTRICT;
  end if;
end $add_crm_sales_validations_supersedes_validation_id_fkey$;

do $add_crm_sales_validations_validation_type_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_sales_validations'::regclass and conname='crm_sales_validations_validation_type_check'
  ) then
    alter table public.crm_sales_validations add constraint crm_sales_validations_validation_type_check CHECK (validation_type = ANY (ARRAY['TECHNICAL'::text, 'COMMERCIAL'::text, 'TIMELINE'::text, 'COMPLIANCE_RISK'::text, 'SCOPE'::text]));
  end if;
end $add_crm_sales_validations_validation_type_check$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_sales_validations_active_dedupe_uidx ON public.crm_sales_validations USING btree (dedupe_key) WHERE (status = ANY (ARRAY['PENDING'::text, 'IN_REVIEW'::text, 'NEEDS_INFORMATION'::text]));
CREATE INDEX IF NOT EXISTS crm_sales_validations_cancelled_by_idx ON public.crm_sales_validations USING btree (cancelled_by) WHERE (cancelled_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_decided_by_idx ON public.crm_sales_validations USING btree (decided_by) WHERE (decided_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_lead_requested_idx ON public.crm_sales_validations USING btree (lead_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS crm_sales_validations_meeting_idx ON public.crm_sales_validations USING btree (meeting_id) WHERE (meeting_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_opportunity_idx ON public.crm_sales_validations USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_product_idx ON public.crm_sales_validations USING btree (product_id) WHERE (product_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_queue_idx ON public.crm_sales_validations USING btree (status, severity, reviewer_team, requested_at);
CREATE INDEX IF NOT EXISTS crm_sales_validations_requested_by_idx ON public.crm_sales_validations USING btree (requested_by);
CREATE INDEX IF NOT EXISTS crm_sales_validations_requirement_idx ON public.crm_sales_validations USING btree (requirement_id, status) WHERE (requirement_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_reviewer_idx ON public.crm_sales_validations USING btree (assigned_reviewer_id, status, requested_at) WHERE (assigned_reviewer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_source_acknowledged_by_idx ON public.crm_sales_validations USING btree (source_acknowledged_by) WHERE (source_acknowledged_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_validations_supersedes_idx ON public.crm_sales_validations USING btree (supersedes_validation_id) WHERE (supersedes_validation_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_detail(p_validation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v public.crm_sales_validations%ROWTYPE; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT * INTO v FROM public.crm_sales_validations WHERE id=p_validation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales validation was not found.'; END IF;
  IF NOT (public.crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid) AND (v.assigned_reviewer_id IS NULL OR v.assigned_reviewer_id=v_uid OR public.is_admin())) THEN RAISE EXCEPTION 'You are not authorized for this Sales validation.'; END IF;
  SELECT jsonb_build_object(
    'validation',jsonb_build_object('id',v.id,'leadId',v.lead_id,'opportunityId',v.opportunity_id,'requirementId',v.requirement_id,'meetingId',v.meeting_id,'productId',v.product_id,'validationType',v.validation_type,'severity',v.severity,'status',v.status,'subject',v.subject,'requestContext',v.request_context,'sourceType',v.source_type,'sourceKey',v.source_key,'sourceSnapshot',v.source_snapshot,'sourceChangedAt',v.source_changed_at,'sourceAcknowledgedAt',v.source_acknowledged_at,'reviewerTeam',v.reviewer_team,'requestedBy',v.requested_by,'requestedAt',v.requested_at,'assignedReviewerId',v.assigned_reviewer_id,'startedAt',v.started_at,'informationRequested',v.information_requested,'resubmissionNote',v.resubmission_note,'decisionSummary',v.decision_summary,'approvedConstraints',v.approved_constraints,'rejectionReworkReason',v.rejection_rework_reason,'decidedBy',v.decided_by,'decidedAt',v.decided_at,'cancelledAt',v.cancelled_at,'cancelReason',v.cancel_reason,'supersedesValidationId',v.supersedes_validation_id,'updatedAt',v.updated_at),
    'lead',jsonb_build_object('id',l.id,'title',l.title,'companyName',l.company_name),
    'opportunity',CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'name',o.name,'stage',o.stage) END,
    'requirement',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,'content',r.content,'structuredValue',r.structured_value,'informationCertainty',r.information_certainty,'recordState',r.record_state,'updatedAt',r.updated_at) END,
    'product',CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object('id',sp.id,'code',sp.code,'name',sp.name,'productType',sp.product_type,'technology',sp.technology,'scope',sp.scope,'managerApprovalRequired',sp.manager_approval_required,'timelineImpact',sp.timeline_impact,'updatedAt',sp.updated_at) END,
    'requester',jsonb_build_object('id',req.id,'name',COALESCE(req.full_name,req.email,'Seller')),
    'assignedReviewer',CASE WHEN rev.id IS NULL THEN NULL ELSE jsonb_build_object('id',rev.id,'name',COALESCE(rev.full_name,rev.email),'role',rev.role,'department',rev.department) END
  ) INTO v_result
  FROM public.crm_leads l LEFT JOIN public.crm_opportunities o ON o.id=v.opportunity_id LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id LEFT JOIN public.sales_products sp ON sp.id=v.product_id LEFT JOIN public.user_profiles req ON req.id=v.requested_by LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id WHERE l.id=v.lead_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY priority_rank,requested_at),'[]'::jsonb) INTO v_items FROM (
    SELECT CASE v.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END AS priority_rank,v.requested_at,
      jsonb_build_object('id',v.id,'validationType',v.validation_type,'severity',v.severity,'status',v.status,'subject',v.subject,'leadId',v.lead_id,'leadTitle',l.title,'companyName',l.company_name,'opportunityId',v.opportunity_id,'opportunityName',o.name,'requirementId',v.requirement_id,'requirementTitle',r.title,'requirementKey',r.requirement_key,'sourceType',v.source_type,'sourceKey',v.source_key,'reviewerTeam',v.reviewer_team,'requestedBy',v.requested_by,'requestedByName',COALESCE(req.full_name,req.email,'Seller'),'requestedAt',v.requested_at,'assignedReviewerId',v.assigned_reviewer_id,'assignedReviewerName',COALESCE(rev.full_name,rev.email),'sourceChangedAt',v.source_changed_at,'updatedAt',v.updated_at) AS item
    FROM public.crm_sales_validations v JOIN public.crm_leads l ON l.id=v.lead_id LEFT JOIN public.crm_opportunities o ON o.id=v.opportunity_id LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id LEFT JOIN public.user_profiles req ON req.id=v.requested_by LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id
    WHERE public.crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid) AND (v.assigned_reviewer_id IS NULL OR v.assigned_reviewer_id=v_uid OR public.is_admin())
  ) q;
  RETURN jsonb_build_object('items',v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_workspace(p_lead_id uuid, p_opportunity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_validations jsonb; v_requirements jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required.'; END IF;
  IF p_opportunity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_opportunities o WHERE o.id=p_opportunity_id AND o.lead_id=p_lead_id) THEN RAISE EXCEPTION 'Opportunity does not belong to this Lead.'; END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'requestedAt')::timestamptz DESC),'[]'::jsonb) INTO v_validations FROM (
    SELECT jsonb_build_object('id',v.id,'leadId',v.lead_id,'opportunityId',v.opportunity_id,'requirementId',v.requirement_id,'meetingId',v.meeting_id,'productId',v.product_id,'packageFitPolicyKey',v.package_fit_policy_key,'packageFitPolicyVersion',v.package_fit_policy_version,'validationType',v.validation_type,'severity',v.severity,'subject',v.subject,'requestContext',v.request_context,'sourceType',v.source_type,'sourceKey',v.source_key,'sourceSnapshot',v.source_snapshot,'sourceChangedAt',v.source_changed_at,'status',v.status,'reviewerTeam',v.reviewer_team,'requestedBy',v.requested_by,'requestedByName',COALESCE(req.full_name,req.email,'Seller'),'requestedAt',v.requested_at,'assignedReviewerId',v.assigned_reviewer_id,'assignedReviewerName',COALESCE(rev.full_name,rev.email),'startedAt',v.started_at,'informationRequested',v.information_requested,'resubmissionNote',v.resubmission_note,'decisionSummary',v.decision_summary,'approvedConstraints',v.approved_constraints,'rejectionReworkReason',v.rejection_rework_reason,'decidedBy',v.decided_by,'decidedAt',v.decided_at,'cancelledAt',v.cancelled_at,'cancelReason',v.cancel_reason,'supersedesValidationId',v.supersedes_validation_id,'createdAt',v.created_at,'updatedAt',v.updated_at,'requirementTitle',r.title,'requirementKey',r.requirement_key,'requirementCertainty',r.information_certainty) AS item
    FROM public.crm_sales_validations v LEFT JOIN public.user_profiles req ON req.id=v.requested_by LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id
    WHERE v.lead_id=p_lead_id AND (p_opportunity_id IS NULL OR v.opportunity_id IS NULL OR v.opportunity_id=p_opportunity_id)
  ) x;
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'title'),'[]'::jsonb) INTO v_requirements FROM (
    SELECT jsonb_build_object('id',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,'informationCertainty',r.information_certainty,'updatedAt',r.updated_at,'latestValidationId',lv.id,'latestValidationType',lv.validation_type,'latestValidationSeverity',lv.severity,'latestValidationStatus',lv.status,'latestApprovedConstraints',lv.approved_constraints,'latestInformationRequested',lv.information_requested,'reviewerTeam',lv.reviewer_team) AS item
    FROM public.crm_requirements r LEFT JOIN LATERAL (SELECT v.* FROM public.crm_sales_validations v WHERE v.requirement_id=r.id ORDER BY CASE WHEN v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION') THEN 0 ELSE 1 END, v.updated_at DESC LIMIT 1) lv ON true
    WHERE r.lead_id=p_lead_id AND r.record_state='ACTIVE' AND r.information_certainty='NEEDS_SPECIALIST_VALIDATION'
  ) y;
  RETURN jsonb_build_object('leadId',p_lead_id,'opportunityId',p_opportunity_id,'validations',v_validations,'requirementsNeedingValidation',v_requirements,'summary',jsonb_build_object('requiredReviews',jsonb_array_length(v_requirements),'pending',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status IN ('PENDING','IN_REVIEW')),'needsInformation',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status='NEEDS_INFORMATION'),'approved',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status='APPROVED'),'criticalUnresolved',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.severity='RED' AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','STALE','REJECTED'))));
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_request_sales_validation(p_lead_id uuid, p_opportunity_id uuid DEFAULT NULL::uuid, p_requirement_id uuid DEFAULT NULL::uuid, p_meeting_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_validation_type text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_request_context text DEFAULT NULL::text, p_source_type text DEFAULT 'MANUAL'::text, p_source_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_type text := upper(trim(COALESCE(p_validation_type,''))); v_source_type text := upper(trim(COALESCE(p_source_type,'MANUAL'))); v_subject text := btrim(COALESCE(p_subject,'')); v_context text := btrim(COALESCE(p_request_context,'')); v_source_key text := btrim(COALESCE(p_source_key,''));
  v_policy jsonb; v_entry jsonb; v_severity text; v_team text; v_requirement public.crm_requirements%ROWTYPE; v_meeting_lead uuid; v_current_policy jsonb; v_policy_key text; v_policy_version integer; v_source_state jsonb; v_dedupe text; v_existing public.crm_sales_validations%ROWTYPE; v_row public.crm_sales_validations%ROWTYPE; v_supersedes uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required.'; END IF;
  IF p_opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.id=p_opportunity_id AND o.lead_id=p_lead_id) THEN RAISE EXCEPTION 'Opportunity does not belong to this Lead.'; END IF;
  IF p_requirement_id IS NOT NULL THEN SELECT * INTO v_requirement FROM public.crm_requirements r WHERE r.id=p_requirement_id AND r.lead_id=p_lead_id; IF NOT FOUND THEN RAISE EXCEPTION 'Requirement does not belong to this Lead.'; END IF; END IF;
  IF p_meeting_id IS NOT NULL THEN SELECT COALESCE(sm.lead_id,o.lead_id) INTO v_meeting_lead FROM public.sales_meetings sm LEFT JOIN public.crm_opportunities o ON o.id=sm.opportunity_id WHERE sm.id=p_meeting_id; IF v_meeting_lead IS DISTINCT FROM p_lead_id THEN RAISE EXCEPTION 'Meeting does not belong to this Lead lifecycle.'; END IF; END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sales_products sp WHERE sp.id=p_product_id AND sp.active) THEN RAISE EXCEPTION 'Product reference is missing or inactive.'; END IF;
  IF v_source_type NOT IN ('REQUIREMENT','PACKAGE_FIT','MEETING','MANUAL') THEN RAISE EXCEPTION 'Unsupported Sales validation source type.'; END IF;
  IF v_source_type='REQUIREMENT' AND p_requirement_id IS NULL THEN RAISE EXCEPTION 'Requirement source requires a Requirement reference.'; END IF;
  IF v_source_type='MEETING' AND p_meeting_id IS NULL THEN RAISE EXCEPTION 'Meeting source requires a Meeting reference.'; END IF;
  SELECT sc.config_value INTO v_policy FROM public.system_configuration sc WHERE sc.config_key='crm_sales_validation_policy_v1';
  IF v_policy IS NULL OR (v_policy->>'policyVersion')::integer <> 1 THEN RAISE EXCEPTION 'Sales validation routing policy is unavailable.'; END IF;
  IF v_type='' AND p_requirement_id IS NOT NULL THEN
    SELECT e.key INTO v_type FROM jsonb_each(v_policy->'validationTypes') e WHERE COALESCE((e.value->>'active')::boolean,false) AND COALESCE(e.value->'requirementCategories','[]'::jsonb) ? v_requirement.category ORDER BY CASE e.key WHEN 'TECHNICAL' THEN 1 WHEN 'COMPLIANCE_RISK' THEN 2 WHEN 'COMMERCIAL' THEN 3 WHEN 'SCOPE' THEN 4 ELSE 5 END LIMIT 1;
  END IF;
  IF v_type='' THEN RAISE EXCEPTION 'A supported validation type is required.'; END IF;
  v_entry := v_policy->'validationTypes'->v_type;
  IF v_entry IS NULL OR NOT COALESCE((v_entry->>'active')::boolean,false) THEN RAISE EXCEPTION 'Unsupported or inactive Sales validation type.'; END IF;
  v_severity := v_entry->>'defaultSeverity'; v_team := v_entry->>'teamKey';
  IF v_severity NOT IN ('GREEN','AMBER','RED') OR btrim(COALESCE(v_team,''))='' THEN RAISE EXCEPTION 'Sales validation routing policy is malformed.'; END IF;
  IF char_length(v_subject) < 6 THEN RAISE EXCEPTION 'A clear review subject is required.'; END IF;
  IF char_length(v_context) < 8 THEN RAISE EXCEPTION 'Explain what needs review and why it matters.'; END IF;
  IF v_source_type='PACKAGE_FIT' THEN SELECT sc.config_value INTO v_current_policy FROM public.system_configuration sc WHERE sc.config_key='crm_package_fit_policy_v1'; v_policy_key := 'crm_package_fit_policy_v1'; v_policy_version := NULLIF(v_current_policy->>'policyVersion','')::integer; END IF;
  IF v_source_key='' THEN v_source_key := CASE WHEN p_requirement_id IS NOT NULL THEN 'requirement:'||p_requirement_id::text WHEN p_meeting_id IS NOT NULL THEN 'meeting:'||p_meeting_id::text WHEN p_product_id IS NOT NULL THEN 'product:'||p_product_id::text ELSE 'manual:'||left(md5(lower(v_subject)),24) END; END IF;
  v_source_state := public.crm_sales_validation_source_state(p_lead_id,p_requirement_id,p_product_id,v_policy_key,v_policy_version);
  v_dedupe := md5(concat_ws('|',p_lead_id::text,v_type,COALESCE(p_requirement_id::text,''),v_source_type,v_source_key));
  SELECT * INTO v_existing FROM public.crm_sales_validations v WHERE v.dedupe_key=v_dedupe AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION') ORDER BY v.requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_existing); END IF;
  SELECT v.id INTO v_supersedes FROM public.crm_sales_validations v WHERE v.dedupe_key=v_dedupe AND v.status='STALE' ORDER BY v.updated_at DESC LIMIT 1;
  BEGIN
    INSERT INTO public.crm_sales_validations(lead_id,opportunity_id,requirement_id,meeting_id,product_id,package_fit_policy_key,package_fit_policy_version,validation_type,severity,subject,request_context,source_type,source_key,source_snapshot,source_fingerprint,reviewer_team,requested_by,supersedes_validation_id,dedupe_key)
    VALUES (p_lead_id,p_opportunity_id,p_requirement_id,p_meeting_id,p_product_id,v_policy_key,v_policy_version,v_type,v_severity,left(v_subject,240),left(v_context,4000),v_source_type,left(v_source_key,240),COALESCE(v_source_state->'snapshot','{}'::jsonb),COALESCE(v_source_state->>'fingerprint',''),v_team,v_uid,v_supersedes,v_dedupe) RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.crm_sales_validations v WHERE v.dedupe_key=v_dedupe AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION') ORDER BY v.requested_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF; RETURN to_jsonb(v_row);
  END;
  PERFORM public.crm_write_lead_event(p_lead_id,'sales_validation_requested','Sales validation requested',v_type || ' review requested.',jsonb_build_object('validationId',v_row.id,'validationType',v_type,'severity',v_severity,'status','PENDING','requirementId',p_requirement_id,'policyVersion',1),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':requested');
  PERFORM public.crm_sales_validation_notify_reviewers(v_row.id,v_type,v_team,v_uid,'requested',v_type || ' Sales validation requested','A ' || lower(replace(v_type,'_',' ')) || ' review is waiting in the Sales Validation queue.');
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_notify_reviewers(p_validation_id uuid, p_validation_type text, p_reviewer_team text, p_requested_by uuid, p_event_key text, p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT u.id
    FROM public.user_profiles u
    WHERE u.status = 'active'
      AND u.id IS DISTINCT FROM p_requested_by
      AND public.crm_sales_validation_reviewer_eligible(p_validation_type,p_reviewer_team,u.id)
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v_user.id,
      'Sales Validation',
      left(p_title,240),
      left(p_message,2000),
      '/admin?tab=myWork',
      'sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || v_user.id::text
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_notify_seller(p_validation_id uuid, p_user_id uuid, p_event_key text, p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  PERFORM public.enqueue_in_app_notification(p_user_id,'Sales Validation',left(p_title,240),left(p_message,2000),'/admin?tab=crm_leads','sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || p_user_id::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_policy_entry(p_validation_type text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT sc.config_value->'validationTypes'->upper(trim(p_validation_type)) FROM public.system_configuration sc WHERE sc.config_key = 'crm_sales_validation_policy_v1';
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_prevent_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN RAISE EXCEPTION 'Sales validation history is immutable; use a status transition instead of delete.'; END; $function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_requirement_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v record;
BEGIN
  IF NOT (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.structured_value IS DISTINCT FROM OLD.structured_value OR
    NEW.information_certainty IS DISTINCT FROM OLD.information_certainty OR
    NEW.record_state IS DISTINCT FROM OLD.record_state OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.category IS DISTINCT FROM OLD.category
  ) THEN RETURN NEW; END IF;

  FOR v IN
    SELECT id,lead_id,validation_type,severity,status,requested_by,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status IN ('APPROVED','REJECTED')
    FOR UPDATE
  LOOP
    UPDATE public.crm_sales_validations SET status='STALE',source_changed_at=now() WHERE id=v.id;
    PERFORM public.crm_write_lead_event(
      v.lead_id,'sales_validation_stale','Sales validation became stale',
      v.validation_type||' decision is stale because its source Requirement materially changed.',
      jsonb_build_object('validationId',v.id,'validationType',v.validation_type,'severity',v.severity,'status','STALE','requirementId',NEW.id),
      NULL,NULL,NULL,now(),'sales-validation:'||v.id::text||':stale'
    );
    PERFORM public.crm_sales_validation_notify_seller(
      v.id,v.requested_by,'stale','Sales validation is stale',
      'The source Requirement changed after specialist decision. The previous decision remains historical and a fresh review is required before relying on it.'
    );
  END LOOP;

  UPDATE public.crm_sales_validations
  SET source_changed_at=now()
  WHERE requirement_id=NEW.id AND status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');

  FOR v IN
    SELECT id,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status='IN_REVIEW' AND assigned_reviewer_id IS NOT NULL
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v.assigned_reviewer_id,
      'Sales Validation',
      'Sales validation source changed',
      'A Requirement changed during review. Refresh the current source before deciding.',
      '/admin?tab=myWork',
      'sales-validation:'||v.id::text||':source-changed:'||NEW.updated_at::text||':'||v.assigned_reviewer_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_reviewer_eligible(p_validation_type text, p_reviewer_team text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH policy AS (SELECT public.crm_sales_validation_policy_entry(p_validation_type) AS entry)
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.user_profiles u, policy p
    WHERE u.id = p_user_id AND u.status = 'active' AND COALESCE((p.entry->>'active')::boolean,false)
      AND p.entry->>'teamKey' = p_reviewer_team AND COALESCE(p.entry->'eligibleRoles','[]'::jsonb) ? u.role
      AND (jsonb_array_length(COALESCE(p.entry->'eligibleDepartments','[]'::jsonb)) = 0 OR COALESCE(p.entry->'eligibleDepartments','[]'::jsonb) ? COALESCE(u.department,''))
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_source_state(p_lead_id uuid, p_requirement_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_package_fit_policy_key text DEFAULT NULL::text, p_package_fit_policy_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_requirement public.crm_requirements%ROWTYPE; v_product public.sales_products%ROWTYPE; v_snapshot jsonb := '{}'::jsonb; v_material text := COALESCE(p_lead_id::text,'');
BEGIN
  IF p_requirement_id IS NOT NULL THEN
    SELECT * INTO v_requirement FROM public.crm_requirements r WHERE r.id = p_requirement_id AND r.lead_id = p_lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Requirement does not belong to this Lead.'; END IF;
    v_snapshot := v_snapshot || jsonb_build_object('requirementId',v_requirement.id,'requirementKey',v_requirement.requirement_key,'requirementTitle',v_requirement.title,'informationCertainty',v_requirement.information_certainty,'recordState',v_requirement.record_state,'requirementUpdatedAt',v_requirement.updated_at);
    v_material := v_material || '|' || COALESCE(v_requirement.requirement_key,'') || '|' || COALESCE(v_requirement.title,'') || '|' || COALESCE(v_requirement.category,'') || '|' || COALESCE(v_requirement.content,'') || '|' || COALESCE(v_requirement.structured_value::text,'') || '|' || COALESCE(v_requirement.information_certainty,'') || '|' || COALESCE(v_requirement.record_state,'');
  END IF;
  IF p_product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.sales_products sp WHERE sp.id = p_product_id AND sp.active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product reference is missing or inactive.'; END IF;
    v_snapshot := v_snapshot || jsonb_build_object('productId',v_product.id,'productCode',v_product.code,'productUpdatedAt',v_product.updated_at,'managerApprovalRequired',COALESCE(v_product.manager_approval_required,false),'timelineImpact',v_product.timeline_impact);
    v_material := v_material || '|' || v_product.id::text || '|' || COALESCE(v_product.code,'') || '|' || COALESCE(v_product.updated_at::text,'');
  END IF;
  IF p_package_fit_policy_key IS NOT NULL THEN
    v_snapshot := v_snapshot || jsonb_build_object('packageFitPolicyKey',p_package_fit_policy_key,'packageFitPolicyVersion',p_package_fit_policy_version);
    v_material := v_material || '|' || COALESCE(p_package_fit_policy_key,'') || '|' || COALESCE(p_package_fit_policy_version::text,'');
  END IF;
  RETURN jsonb_build_object('snapshot',v_snapshot,'fingerprint',md5(v_material));
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.crm_transition_sales_validation(p_validation_id uuid, p_action text, p_information_request text DEFAULT NULL::text, p_resubmission_note text DEFAULT NULL::text, p_decision_summary text DEFAULT NULL::text, p_approved_constraints text DEFAULT NULL::text, p_rejection_reason text DEFAULT NULL::text, p_cancel_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := upper(trim(COALESCE(p_action,'')));
  v_row public.crm_sales_validations%ROWTYPE;
  v_state jsonb;
  v_is_reviewer boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT * INTO v_row FROM public.crm_sales_validations WHERE id=p_validation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales validation was not found.'; END IF;

  v_is_reviewer := public.crm_sales_validation_reviewer_eligible(v_row.validation_type,v_row.reviewer_team,v_uid);

  IF v_action IN ('START','NEEDS_INFORMATION','APPROVE','REJECT') THEN
    IF NOT v_is_reviewer THEN RAISE EXCEPTION 'You are not eligible to review this validation.'; END IF;
    IF v_row.requested_by=v_uid THEN RAISE EXCEPTION 'A requester cannot review or approve their own validation.'; END IF;
    IF v_row.assigned_reviewer_id IS NOT NULL AND v_row.assigned_reviewer_id<>v_uid THEN
      RAISE EXCEPTION 'This validation is already assigned to another reviewer.';
    END IF;
  END IF;

  IF v_action='START' THEN
    IF v_row.status NOT IN ('PENDING','IN_REVIEW') THEN RAISE EXCEPTION 'This validation cannot be started from its current status.'; END IF;
    v_state := public.crm_sales_validation_source_state(v_row.lead_id,v_row.requirement_id,v_row.product_id,v_row.package_fit_policy_key,v_row.package_fit_policy_version);
    UPDATE public.crm_sales_validations SET
      status='IN_REVIEW', assigned_reviewer_id=v_uid, started_at=COALESCE(started_at,now()),
      source_snapshot=COALESCE(v_state->'snapshot','{}'::jsonb), source_fingerprint=COALESCE(v_state->>'fingerprint',''),
      source_acknowledged_at=now(), source_acknowledged_by=v_uid
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_started','Sales validation review started',v_row.validation_type||' review started.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','IN_REVIEW','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':started:'||COALESCE(v_row.started_at::text,now()::text));

  ELSIF v_action='NEEDS_INFORMATION' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Information can be requested only from an in-review validation.'; END IF;
    IF char_length(btrim(COALESCE(p_information_request,'')))<10 THEN RAISE EXCEPTION 'State the exact information needed before review can continue.'; END IF;
    UPDATE public.crm_sales_validations SET status='NEEDS_INFORMATION',assigned_reviewer_id=v_uid,information_requested=left(btrim(p_information_request),4000)
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_information_requested','Sales validation needs information',v_row.validation_type||' review needs additional information.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','NEEDS_INFORMATION','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':needs-information:'||v_row.updated_at::text);
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'needs-information:'||v_row.updated_at::text,'Sales validation needs information','A specialist needs clarification before the '||lower(replace(v_row.validation_type,'_',' '))||' review can continue.');

  ELSIF v_action='RESUBMIT' THEN
    IF v_row.status<>'NEEDS_INFORMATION' THEN RAISE EXCEPTION 'Only a validation needing information can be resubmitted.'; END IF;
    IF NOT (public.crm_can_access_lead(v_row.lead_id) OR public.is_admin()) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required to resubmit.'; END IF;
    v_state := public.crm_sales_validation_source_state(v_row.lead_id,v_row.requirement_id,v_row.product_id,v_row.package_fit_policy_key,v_row.package_fit_policy_version);
    UPDATE public.crm_sales_validations SET
      status='PENDING',resubmission_note=NULLIF(left(btrim(COALESCE(p_resubmission_note,'')),2000),''),
      information_requested=NULL,source_snapshot=COALESCE(v_state->'snapshot','{}'::jsonb),source_fingerprint=COALESCE(v_state->>'fingerprint',''),
      source_changed_at=NULL,source_acknowledged_at=NULL,source_acknowledged_by=NULL
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_resubmitted','Sales validation resubmitted',v_row.validation_type||' review resubmitted after clarification.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','PENDING'),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':resubmitted:'||v_row.updated_at::text);
    IF v_row.assigned_reviewer_id IS NOT NULL THEN
      PERFORM public.enqueue_in_app_notification(v_row.assigned_reviewer_id,'Sales Validation','Sales validation resubmitted','Updated canonical CRM information is ready for review.','/admin?tab=myWork','sales-validation:'||v_row.id::text||':resubmitted:'||v_row.updated_at::text||':'||v_row.assigned_reviewer_id::text);
    ELSE
      PERFORM public.crm_sales_validation_notify_reviewers(v_row.id,v_row.validation_type,v_row.reviewer_team,v_row.requested_by,'resubmitted:'||v_row.updated_at::text,'Sales validation resubmitted','Updated canonical CRM information is ready in the Sales Validation queue.');
    END IF;

  ELSIF v_action='APPROVE' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Only an in-review validation can be approved.'; END IF;
    IF char_length(btrim(COALESCE(p_decision_summary,'')))<10 THEN RAISE EXCEPTION 'A meaningful approval decision summary is required.'; END IF;
    IF v_row.source_changed_at IS NOT NULL AND (v_row.source_acknowledged_at IS NULL OR v_row.source_acknowledged_at<v_row.source_changed_at) THEN
      RAISE EXCEPTION 'The source changed during review. Refresh/Start Review again to acknowledge current CRM information before deciding.';
    END IF;
    UPDATE public.crm_sales_validations SET status='APPROVED',assigned_reviewer_id=v_uid,decision_summary=left(btrim(p_decision_summary),4000),approved_constraints=NULLIF(left(btrim(COALESCE(p_approved_constraints,'')),4000),''),rejection_rework_reason=NULL,decided_by=v_uid,decided_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_approved','Sales validation approved',v_row.validation_type||' review approved within recorded constraints.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','APPROVED','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':approved');
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'approved','Sales validation approved','The '||lower(replace(v_row.validation_type,'_',' '))||' review was approved. Review any recorded constraints before making a client commitment.');

  ELSIF v_action='REJECT' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Only an in-review validation can be rejected.'; END IF;
    IF char_length(btrim(COALESCE(p_rejection_reason,'')))<10 THEN RAISE EXCEPTION 'A meaningful rejection/rework reason is required.'; END IF;
    IF v_row.source_changed_at IS NOT NULL AND (v_row.source_acknowledged_at IS NULL OR v_row.source_acknowledged_at<v_row.source_changed_at) THEN
      RAISE EXCEPTION 'The source changed during review. Refresh/Start Review again to acknowledge current CRM information before deciding.';
    END IF;
    UPDATE public.crm_sales_validations SET status='REJECTED',assigned_reviewer_id=v_uid,decision_summary=NULLIF(left(btrim(COALESCE(p_decision_summary,'')),4000),''),approved_constraints=NULL,rejection_rework_reason=left(btrim(p_rejection_reason),4000),decided_by=v_uid,decided_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_rejected','Sales validation rejected',v_row.validation_type||' review rejected; scope/rework is required.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','REJECTED','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':rejected');
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'rejected','Sales validation rejected','The '||lower(replace(v_row.validation_type,'_',' '))||' review was rejected. Resolve the recorded rework reason before relying on the requested approach.');

  ELSIF v_action='CANCEL' THEN
    IF v_row.status NOT IN ('PENDING','NEEDS_INFORMATION','IN_REVIEW') THEN RAISE EXCEPTION 'This validation can no longer be cancelled.'; END IF;
    IF NOT public.is_admin() AND (v_row.requested_by<>v_uid OR v_row.status='IN_REVIEW') THEN
      RAISE EXCEPTION 'Only the requesting Seller may cancel a non-started review; Admin may cancel an active review.';
    END IF;
    IF char_length(btrim(COALESCE(p_cancel_reason,'')))<6 THEN RAISE EXCEPTION 'A cancellation reason is required.'; END IF;
    UPDATE public.crm_sales_validations SET status='CANCELLED',cancelled_by=v_uid,cancelled_at=now(),cancel_reason=left(btrim(p_cancel_reason),2000)
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_cancelled','Sales validation cancelled',v_row.validation_type||' review cancelled.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','CANCELLED'),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':cancelled');

  ELSE
    RAISE EXCEPTION 'Unsupported Sales validation action.';
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;


drop trigger if exists trg_crm_sales_validations_no_delete on public.crm_sales_validations;
CREATE TRIGGER trg_crm_sales_validations_no_delete BEFORE DELETE ON crm_sales_validations FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_prevent_delete();
drop trigger if exists trg_crm_sales_validations_touch_updated_at on public.crm_sales_validations;
CREATE TRIGGER trg_crm_sales_validations_touch_updated_at BEFORE UPDATE ON crm_sales_validations FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_touch_updated_at();
drop trigger if exists trg_crm_requirement_sales_validation_stale on public.crm_requirements;
CREATE TRIGGER trg_crm_requirement_sales_validation_stale AFTER UPDATE ON crm_requirements FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_requirement_changed();

alter table public.crm_sales_validations enable row level security;
drop policy if exists crm_sales_validations_select_authorized on public.crm_sales_validations;
create policy crm_sales_validations_select_authorized
on public.crm_sales_validations
for select to authenticated
using ((crm_can_access_lead(lead_id) OR is_admin() OR (assigned_reviewer_id = ( SELECT auth.uid() AS uid)) OR crm_sales_validation_reviewer_eligible(validation_type, reviewer_team, ( SELECT auth.uid() AS uid))));

revoke all on table public.crm_sales_validations from public, anon, authenticated, service_role;
grant select on table public.crm_sales_validations to authenticated;
grant all on table public.crm_sales_validations to service_role;

revoke all on function public.crm_get_sales_validation_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_get_sales_validation_detail(uuid) to service_role;
grant execute on function public.crm_get_sales_validation_detail(uuid) to authenticated;
revoke all on function public.crm_get_sales_validation_queue() from public, anon, authenticated, service_role;
grant execute on function public.crm_get_sales_validation_queue() to service_role;
grant execute on function public.crm_get_sales_validation_queue() to authenticated;
revoke all on function public.crm_get_sales_validation_workspace(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_get_sales_validation_workspace(uuid,uuid) to service_role;
grant execute on function public.crm_get_sales_validation_workspace(uuid,uuid) to authenticated;
revoke all on function public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text) to service_role;
revoke all on function public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text) to service_role;
revoke all on function public.crm_sales_validation_policy_entry(text) from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_policy_entry(text) to service_role;
revoke all on function public.crm_sales_validation_prevent_delete() from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_prevent_delete() to service_role;
revoke all on function public.crm_sales_validation_requirement_changed() from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_requirement_changed() to service_role;
revoke all on function public.crm_sales_validation_reviewer_eligible(text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_reviewer_eligible(text,text,uuid) to service_role;
grant execute on function public.crm_sales_validation_reviewer_eligible(text,text,uuid) to authenticated;
revoke all on function public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer) to service_role;
revoke all on function public.crm_sales_validation_touch_updated_at() from public, anon, authenticated, service_role;
grant execute on function public.crm_sales_validation_touch_updated_at() to service_role;
revoke all on function public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) to service_role;
grant execute on function public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) to authenticated;

do $p10b6_post$
declare
  r record;
begin
  if (select count(*) from pg_attribute
      where attrelid='public.crm_sales_validations'::regclass and attnum>0 and not attisdropped)<>39 then
    raise exception '[P10B6_VALIDATION_SCHEMA_39_COLUMNS] expected 39 canonical columns.';
  end if;

  for r in select * from (values
    ('id','uuid',true,'gen_random_uuid()'),
      ('lead_id','uuid',true,''),
      ('opportunity_id','uuid',false,''),
      ('requirement_id','uuid',false,''),
      ('meeting_id','uuid',false,''),
      ('product_id','uuid',false,''),
      ('package_fit_policy_key','text',false,''),
      ('package_fit_policy_version','integer',false,''),
      ('validation_type','text',true,''),
      ('severity','text',true,''),
      ('subject','text',true,''),
      ('request_context','text',true,'''''::text'),
      ('source_type','text',true,''),
      ('source_key','text',true,''),
      ('source_snapshot','jsonb',true,'''{}''::jsonb'),
      ('source_fingerprint','text',true,'''''::text'),
      ('source_changed_at','timestamp with time zone',false,''),
      ('source_acknowledged_at','timestamp with time zone',false,''),
      ('source_acknowledged_by','uuid',false,''),
      ('status','text',true,'''PENDING''::text'),
      ('reviewer_team','text',true,''),
      ('requested_by','uuid',true,''),
      ('requested_at','timestamp with time zone',true,'now()'),
      ('assigned_reviewer_id','uuid',false,''),
      ('started_at','timestamp with time zone',false,''),
      ('information_requested','text',false,''),
      ('resubmission_note','text',false,''),
      ('decision_summary','text',false,''),
      ('approved_constraints','text',false,''),
      ('rejection_rework_reason','text',false,''),
      ('decided_by','uuid',false,''),
      ('decided_at','timestamp with time zone',false,''),
      ('cancelled_by','uuid',false,''),
      ('cancelled_at','timestamp with time zone',false,''),
      ('cancel_reason','text',false,''),
      ('supersedes_validation_id','uuid',false,''),
      ('dedupe_key','text',true,''),
      ('created_at','timestamp with time zone',true,'now()'),
      ('updated_at','timestamp with time zone',true,'now()')
  ) as expected(name,data_type,not_null,default_expr)
  loop
    if not exists (
      select 1 from pg_attribute a
      left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
      where a.attrelid='public.crm_sales_validations'::regclass
        and a.attname=r.name and a.attnum>0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod)=r.data_type
        and a.attnotnull=r.not_null
        and coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')=r.default_expr
    ) then
      raise exception '[P10B6_VALIDATION_SCHEMA_39_COLUMNS] column drift: %',r.name;
    end if;
  end loop;

  if (select count(*) from pg_constraint where conrelid='public.crm_sales_validations'::regclass)<>30 then
    raise exception '[P10B6_VALIDATION_CONSTRAINTS_CURRENT] constraint count drift.';
  end if;
  for r in select * from (values
    ('crm_sales_validation_cancel_integrity','CHECK (status <> ''CANCELLED''::text OR cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)'),
      ('crm_sales_validation_decision_integrity','CHECK ((status <> ALL (ARRAY[''APPROVED''::text, ''REJECTED''::text])) OR decided_by IS NOT NULL AND decided_at IS NOT NULL)'),
      ('crm_sales_validations_approved_constraints_check','CHECK (approved_constraints IS NULL OR char_length(approved_constraints) <= 4000)'),
      ('crm_sales_validations_assigned_reviewer_id_fkey','FOREIGN KEY (assigned_reviewer_id) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_cancel_reason_check','CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000)'),
      ('crm_sales_validations_cancelled_by_fkey','FOREIGN KEY (cancelled_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_decided_by_fkey','FOREIGN KEY (decided_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_decision_summary_check','CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 4000)'),
      ('crm_sales_validations_dedupe_key_check','CHECK (char_length(dedupe_key) <= 128)'),
      ('crm_sales_validations_information_requested_check','CHECK (information_requested IS NULL OR char_length(information_requested) <= 4000)'),
      ('crm_sales_validations_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_meeting_id_fkey','FOREIGN KEY (meeting_id) REFERENCES sales_meetings(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_opportunity_id_fkey','FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_pkey','PRIMARY KEY (id)'),
      ('crm_sales_validations_product_id_fkey','FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_rejection_rework_reason_check','CHECK (rejection_rework_reason IS NULL OR char_length(rejection_rework_reason) <= 4000)'),
      ('crm_sales_validations_request_context_check','CHECK (char_length(request_context) <= 4000)'),
      ('crm_sales_validations_requested_by_fkey','FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_requirement_id_fkey','FOREIGN KEY (requirement_id) REFERENCES crm_requirements(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_resubmission_note_check','CHECK (resubmission_note IS NULL OR char_length(resubmission_note) <= 2000)'),
      ('crm_sales_validations_reviewer_team_check','CHECK (char_length(btrim(reviewer_team)) >= 1 AND char_length(btrim(reviewer_team)) <= 120)'),
      ('crm_sales_validations_severity_check','CHECK (severity = ANY (ARRAY[''GREEN''::text, ''AMBER''::text, ''RED''::text]))'),
      ('crm_sales_validations_source_acknowledged_by_fkey','FOREIGN KEY (source_acknowledged_by) REFERENCES user_profiles(id) ON DELETE SET NULL'),
      ('crm_sales_validations_source_key_check','CHECK (char_length(btrim(source_key)) >= 1 AND char_length(btrim(source_key)) <= 240)'),
      ('crm_sales_validations_source_snapshot_check','CHECK (jsonb_typeof(source_snapshot) = ''object''::text)'),
      ('crm_sales_validations_source_type_check','CHECK (source_type = ANY (ARRAY[''REQUIREMENT''::text, ''PACKAGE_FIT''::text, ''MEETING''::text, ''MANUAL''::text]))'),
      ('crm_sales_validations_status_check','CHECK (status = ANY (ARRAY[''PENDING''::text, ''IN_REVIEW''::text, ''NEEDS_INFORMATION''::text, ''APPROVED''::text, ''REJECTED''::text, ''CANCELLED''::text, ''STALE''::text]))'),
      ('crm_sales_validations_subject_check','CHECK (char_length(btrim(subject)) >= 6 AND char_length(btrim(subject)) <= 240)'),
      ('crm_sales_validations_supersedes_validation_id_fkey','FOREIGN KEY (supersedes_validation_id) REFERENCES crm_sales_validations(id) ON DELETE RESTRICT'),
      ('crm_sales_validations_validation_type_check','CHECK (validation_type = ANY (ARRAY[''TECHNICAL''::text, ''COMMERCIAL''::text, ''TIMELINE''::text, ''COMPLIANCE_RISK''::text, ''SCOPE''::text]))')
  ) as expected(name,definition)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid='public.crm_sales_validations'::regclass
        and conname=r.name and pg_get_constraintdef(oid,true)=r.definition
    ) then
      raise exception '[P10B6_VALIDATION_CONSTRAINTS_CURRENT] constraint drift: %',r.name;
    end if;
  end loop;

  if (select count(*) from pg_indexes
      where schemaname='public' and tablename='crm_sales_validations'
        and indexname<>'crm_sales_validations_pkey')<>13 then
    raise exception '[P10B6_VALIDATION_INDEXES_13_CURRENT] expected 13 operational indexes.';
  end if;
  for r in select * from (values
    ('crm_sales_validations_active_dedupe_uidx','CREATE UNIQUE INDEX crm_sales_validations_active_dedupe_uidx ON public.crm_sales_validations USING btree (dedupe_key) WHERE (status = ANY (ARRAY[''PENDING''::text, ''IN_REVIEW''::text, ''NEEDS_INFORMATION''::text]))'),
      ('crm_sales_validations_cancelled_by_idx','CREATE INDEX crm_sales_validations_cancelled_by_idx ON public.crm_sales_validations USING btree (cancelled_by) WHERE (cancelled_by IS NOT NULL)'),
      ('crm_sales_validations_decided_by_idx','CREATE INDEX crm_sales_validations_decided_by_idx ON public.crm_sales_validations USING btree (decided_by) WHERE (decided_by IS NOT NULL)'),
      ('crm_sales_validations_lead_requested_idx','CREATE INDEX crm_sales_validations_lead_requested_idx ON public.crm_sales_validations USING btree (lead_id, requested_at DESC)'),
      ('crm_sales_validations_meeting_idx','CREATE INDEX crm_sales_validations_meeting_idx ON public.crm_sales_validations USING btree (meeting_id) WHERE (meeting_id IS NOT NULL)'),
      ('crm_sales_validations_opportunity_idx','CREATE INDEX crm_sales_validations_opportunity_idx ON public.crm_sales_validations USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL)'),
      ('crm_sales_validations_pkey','CREATE UNIQUE INDEX crm_sales_validations_pkey ON public.crm_sales_validations USING btree (id)'),
      ('crm_sales_validations_product_idx','CREATE INDEX crm_sales_validations_product_idx ON public.crm_sales_validations USING btree (product_id) WHERE (product_id IS NOT NULL)'),
      ('crm_sales_validations_queue_idx','CREATE INDEX crm_sales_validations_queue_idx ON public.crm_sales_validations USING btree (status, severity, reviewer_team, requested_at)'),
      ('crm_sales_validations_requested_by_idx','CREATE INDEX crm_sales_validations_requested_by_idx ON public.crm_sales_validations USING btree (requested_by)'),
      ('crm_sales_validations_requirement_idx','CREATE INDEX crm_sales_validations_requirement_idx ON public.crm_sales_validations USING btree (requirement_id, status) WHERE (requirement_id IS NOT NULL)'),
      ('crm_sales_validations_reviewer_idx','CREATE INDEX crm_sales_validations_reviewer_idx ON public.crm_sales_validations USING btree (assigned_reviewer_id, status, requested_at) WHERE (assigned_reviewer_id IS NOT NULL)'),
      ('crm_sales_validations_source_acknowledged_by_idx','CREATE INDEX crm_sales_validations_source_acknowledged_by_idx ON public.crm_sales_validations USING btree (source_acknowledged_by) WHERE (source_acknowledged_by IS NOT NULL)'),
      ('crm_sales_validations_supersedes_idx','CREATE INDEX crm_sales_validations_supersedes_idx ON public.crm_sales_validations USING btree (supersedes_validation_id) WHERE (supersedes_validation_id IS NOT NULL)')
  ) as expected(name,definition)
  loop
    if not exists (
      select 1 from pg_indexes
      where schemaname='public' and tablename='crm_sales_validations'
        and indexname=r.name and indexdef=r.definition
    ) then
      raise exception '[P10B6_VALIDATION_INDEXES_13_CURRENT] index drift: %',r.name;
    end if;
  end loop;

  if (select count(*) from pg_trigger
      where tgrelid='public.crm_sales_validations'::regclass and not tgisinternal and tgenabled<>'D')<>2
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.crm_requirements'::regclass
         and tgname='trg_crm_requirement_sales_validation_stale' and not tgisinternal and tgenabled<>'D'
         and pg_get_triggerdef(oid,true)='CREATE TRIGGER trg_crm_requirement_sales_validation_stale AFTER UPDATE ON crm_requirements FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_requirement_changed()'
     ) then
    raise exception '[P10B6_VALIDATION_TRIGGERS_3_ENABLED] expected exactly three enabled domain triggers.';
  end if;
  for r in select * from (values
    ('trg_crm_sales_validations_no_delete','CREATE TRIGGER trg_crm_sales_validations_no_delete BEFORE DELETE ON crm_sales_validations FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_prevent_delete()'),
      ('trg_crm_sales_validations_touch_updated_at','CREATE TRIGGER trg_crm_sales_validations_touch_updated_at BEFORE UPDATE ON crm_sales_validations FOR EACH ROW EXECUTE FUNCTION crm_sales_validation_touch_updated_at()')
  ) as expected(name,definition)
  loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid='public.crm_sales_validations'::regclass
        and tgname=r.name and not tgisinternal and tgenabled<>'D'
        and pg_get_triggerdef(oid,true)=r.definition
    ) then
      raise exception '[P10B6_VALIDATION_TRIGGERS_3_ENABLED] trigger drift: %',r.name;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid='public.crm_sales_validations'::regclass)
     or (select count(*) from pg_policies
         where schemaname='public' and tablename='crm_sales_validations')<>1
     or not exists (
       select 1 from pg_policies
       where schemaname='public' and tablename='crm_sales_validations'
         and policyname='crm_sales_validations_select_authorized'
         and cmd='SELECT'
         and roles=array['authenticated']::name[]
         and qual='(crm_can_access_lead(lead_id) OR is_admin() OR (assigned_reviewer_id = ( SELECT auth.uid() AS uid)) OR crm_sales_validation_reviewer_eligible(validation_type, reviewer_team, ( SELECT auth.uid() AS uid)))'
     ) then
    raise exception '[P10B6_VALIDATION_RLS_POLICY_CURRENT] RLS/policy contract drift.';
  end if;

  if to_regprocedure('public.crm_get_sales_validation_detail(uuid)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_get_sales_validation_detail(uuid)')))<>'4921a86ef2cb1ceec62b49d61b1cd24e' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_get_sales_validation_detail(uuid)';
  end if;
  if to_regprocedure('public.crm_get_sales_validation_queue()') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_get_sales_validation_queue()')))<>'bccacfae8264d87d1c10a55ca3b94351' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_get_sales_validation_queue()';
  end if;
  if to_regprocedure('public.crm_get_sales_validation_workspace(uuid,uuid)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_get_sales_validation_workspace(uuid,uuid)')))<>'0da9c862f689e58cd58e5d0912660084' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_get_sales_validation_workspace(uuid,uuid)';
  end if;
  if to_regprocedure('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)')))<>'dce1a970a58ca6d21fcd4271129ad54f' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)';
  end if;
  if to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)')))<>'9f55254be437570f044182a19c7d61ae' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)';
  end if;
  if to_regprocedure('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)')))<>'5ee5b7bae8d86cd47966f2452199fad6' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)';
  end if;
  if to_regprocedure('public.crm_sales_validation_policy_entry(text)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_policy_entry(text)')))<>'693d7866c3dff34b871526242796bf02' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_policy_entry(text)';
  end if;
  if to_regprocedure('public.crm_sales_validation_prevent_delete()') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_prevent_delete()')))<>'00334e7a892b22bfa594306bff927950' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_prevent_delete()';
  end if;
  if to_regprocedure('public.crm_sales_validation_requirement_changed()') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_requirement_changed()')))<>'96ff62d0ae40a1122473e8720bf3d455' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_requirement_changed()';
  end if;
  if to_regprocedure('public.crm_sales_validation_reviewer_eligible(text,text,uuid)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_reviewer_eligible(text,text,uuid)')))<>'5eaf170529ed179a19ae17575cd8e74a' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_reviewer_eligible(text,text,uuid)';
  end if;
  if to_regprocedure('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)')))<>'fbe2ebd9db6250efaf565ca58c999dc3' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)';
  end if;
  if to_regprocedure('public.crm_sales_validation_touch_updated_at()') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_sales_validation_touch_updated_at()')))<>'746dff910f030318f733706a52f4cbcf' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_sales_validation_touch_updated_at()';
  end if;
  if to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)')))<>'ed5003e1b342f0010d9df2db21f9fa43' then
    raise exception '[P10B6_VALIDATION_FUNCTIONS_CURRENT] function definition drift: public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)';
  end if;

  if position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)')))=0
     or position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)')))=0
     or position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_sales_validation_requirement_changed()')))=0 then
    raise exception '[P10B6_VALIDATION_MY_WORK_ROUTING] current My Work routing is missing.';
  end if;

  if has_function_privilege('anon',to_regprocedure('public.crm_get_sales_validation_detail(uuid)'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_get_sales_validation_detail(uuid)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_get_sales_validation_detail(uuid)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_get_sales_validation_detail(uuid)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_get_sales_validation_queue()'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_get_sales_validation_queue()'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_get_sales_validation_queue()'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_get_sales_validation_queue()';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_get_sales_validation_workspace(uuid,uuid)'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_get_sales_validation_workspace(uuid,uuid)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_get_sales_validation_workspace(uuid,uuid)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_get_sales_validation_workspace(uuid,uuid)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_policy_entry(text)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_policy_entry(text)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_policy_entry(text)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_policy_entry(text)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_prevent_delete()'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_prevent_delete()'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_prevent_delete()'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_prevent_delete()';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_requirement_changed()'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_requirement_changed()'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_requirement_changed()'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_requirement_changed()';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_reviewer_eligible(text,text,uuid)'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_reviewer_eligible(text,text,uuid)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_reviewer_eligible(text,text,uuid)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_reviewer_eligible(text,text,uuid)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_sales_validation_touch_updated_at()'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.crm_sales_validation_touch_updated_at()'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_sales_validation_touch_updated_at()'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_sales_validation_touch_updated_at()';
  end if;
  if has_function_privilege('anon',to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)'),'EXECUTE')
     or not has_function_privilege('service_role',to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)'),'EXECUTE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] function ACL drift: public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)';
  end if;

  if has_table_privilege('anon','public.crm_sales_validations','SELECT')
     or not has_table_privilege('authenticated','public.crm_sales_validations','SELECT')
     or has_table_privilege('authenticated','public.crm_sales_validations','INSERT')
     or has_table_privilege('authenticated','public.crm_sales_validations','UPDATE')
     or has_table_privilege('authenticated','public.crm_sales_validations','DELETE')
     or not has_table_privilege('service_role','public.crm_sales_validations','SELECT')
     or not has_table_privilege('service_role','public.crm_sales_validations','INSERT')
     or not has_table_privilege('service_role','public.crm_sales_validations','UPDATE')
     or not has_table_privilege('service_role','public.crm_sales_validations','DELETE') then
    raise exception '[P10B6_VALIDATION_ACLS_CURRENT] table ACL matrix drift.';
  end if;

  if not exists (
    select 1 from public.system_configuration
    where config_key='crm_sales_validation_policy_v1'
      and config_value=$p10b6_validation_policy${"policyKey":"crm_sales_validation_policy_v1","policyVersion":1,"validationTypes":{"SCOPE":{"active":true,"teamKey":"SCOPE_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["PROJECT_SCOPE","CONTENT","BRAND","BUSINESS","PROBLEM","DESIRED_OUTCOME","AUDIENCE_CUSTOMER","DECISION_BUYING_PROCESS"]},"TIMELINE":{"active":true,"teamKey":"TIMELINE_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":[]},"TECHNICAL":{"active":true,"teamKey":"TECHNICAL_REVIEW","eligibleRoles":["developer","admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["Development","General"],"requirementCategories":["TECHNICAL","CUSTOM_APPLICATION","INTEGRATIONS","BOOKING","ECOMMERCE","ANALYTICS"]},"COMMERCIAL":{"active":true,"teamKey":"COMMERCIAL_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"AMBER","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["COMMERCIAL"]},"COMPLIANCE_RISK":{"active":true,"teamKey":"COMPLIANCE_RISK_REVIEW","eligibleRoles":["admin"],"defaultSeverity":"RED","selfReviewAllowed":false,"eligibleDepartments":["General"],"requirementCategories":["RISKS_DEPENDENCIES"]}}}$p10b6_validation_policy$::jsonb
      and (config_value->>'policyVersion')::int=1
  ) then
    raise exception '[P10B6_VALIDATION_POLICY_V1] policy v1 drift.';
  end if;

  if (select count(*) from public.crm_sales_validations)
       <>current_setting('profox.part10b6.validation_count')::bigint then
    raise exception '[P10B6_VALIDATION_ROWS_UNCHANGED] reconciliation inserted or removed validation rows.';
  end if;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] send gate changed from false.';
  end if;
end
$p10b6_post$;
