-- Module 11D - Client and project lifecycle communication.
-- Only meaningful client-facing moments generate email. Internal task noise stays internal.

-- Fix the existing portal contract: the UI/RPC supports both approval and change requests.
ALTER TABLE public.project_client_approvals
  DROP CONSTRAINT IF EXISTS project_client_approvals_action_check;
ALTER TABLE public.project_client_approvals
  ADD CONSTRAINT project_client_approvals_action_check
  CHECK (action IN ('Approved','Changes Requested'));

-- Track the start of a project stage independently from unrelated updated_at changes.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;
UPDATE public.projects
SET stage_changed_at=COALESCE(stage_changed_at,updated_at,created_at,now())
WHERE stage_changed_at IS NULL;
ALTER TABLE public.projects
  ALTER COLUMN stage_changed_at SET DEFAULT now();
ALTER TABLE public.projects
  ALTER COLUMN stage_changed_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.track_project_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.stage_changed_at:=COALESCE(NEW.stage_changed_at,now());
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at:=now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_track_project_stage_changed_at ON public.projects;
CREATE TRIGGER trg_track_project_stage_changed_at
BEFORE INSERT OR UPDATE OF stage ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.track_project_stage_changed_at();

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
(
 'customer_client_portal_ready',
 'Client portal access ready',
 'Your ProFox client portal is ready',
 E'Hi {{contactFirstName}},\n\nYour secure ProFox client portal is now linked to your client account.\n\nUse it to follow project progress, review payment records and complete client approval steps when they are requested.\n\nClient portal: {{clientPortalUrl}}\n\nIf you cannot sign in, use the Forgot password option with this email address. If you still need help, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Sent after Admin securely links a client account to a portal user.'
),
(
 'customer_project_started',
 'Project started',
 'Your ProFox project is now in delivery',
 E'Hi {{contactFirstName}},\n\nYour project, {{projectName}}, is now in the ProFox delivery system.\n\nProject: {{projectNumber}}\nCurrent stage: {{stage}}\n{{targetDateLine}}\n\nWe will keep communication focused on the moments that need your attention. Internal production tasks stay inside our team workflow.\n\n{{projectAccessLine}}\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Sent once after a protected project is created from a verified sale.'
),
(
 'customer_project_review_required',
 'Project review required',
 'Your review is ready for {{projectName}}',
 E'Hi {{contactFirstName}},\n\n{{reviewIntro}}\n\nProject: {{projectNumber}}\nReview stage: {{stage}}\n\n{{projectAccessLine}}\n\nPlease review the current work and either approve it or request specific changes. Clear feedback helps us keep the next stage moving without unnecessary back-and-forth.\n\nIf anything is unclear before you review, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Sent when the project enters Client Design Approval or Client Review.'
),
(
 'customer_project_review_reminder',
 'Project review reminder',
 'A quick reminder about {{projectName}}',
 E'Hi {{contactFirstName}},\n\nYour review is still waiting for {{projectName}}. The project is currently at {{stage}}.\n\n{{projectAccessLine}}\n\nIf you need clarification before reviewing, reply to this email. If your timing has changed, let us know so we can plan the next step clearly.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Bounded reminder while a project is waiting at a client review stage.'
),
(
 'customer_project_approval_recorded',
 'Client approval recorded',
 'Your approval has been recorded for {{projectName}}',
 E'Hi {{contactFirstName}},\n\nYour approval for {{previousStage}} has been recorded. Thank you.\n\nThe project has moved to {{nextStage}}. We will let you know when another decision or action is needed from you.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Acknowledges a canonical client approval submitted through the secure portal.'
),
(
 'customer_project_changes_recorded',
 'Client changes recorded',
 'Your change request has been recorded for {{projectName}}',
 E'Hi {{contactFirstName}},\n\nWe have recorded your requested changes for {{previousStage}}.\n\nThe project is now at {{nextStage}} so the team can work through the feedback. We will bring the work back to you when the next review is ready.\n\nIf you need to add context, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Acknowledges a canonical client change request submitted through the secure portal.'
),
(
 'customer_project_launch',
 'Project launch stage',
 '{{projectName}} has reached the launch stage',
 E'Hi {{contactFirstName}},\n\n{{projectName}} has reached the launch stage.\n\nThe required commercial launch gate has been satisfied, and the team can continue with the controlled launch work.\n\nWe will keep the remaining steps clear and let you know if anything is needed from you.\n\n{{projectAccessLine}}\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Meaningful client update when the protected project stage reaches Launch.'
),
(
 'customer_project_handover',
 'Project handover stage',
 'Handover is being prepared for {{projectName}}',
 E'Hi {{contactFirstName}},\n\n{{projectName}} has moved into handover.\n\nWe are preparing the final project information, access and handover items that apply to your delivery. We will keep this focused on what you need to receive, retain or act on.\n\n{{projectAccessLine}}\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Client update when the project reaches Handover.'
),
(
 'customer_project_completed',
 'Project completed',
 '{{projectName}} is complete',
 E'Hi {{contactFirstName}},\n\n{{projectName}} is now marked complete in ProFox.\n\nThank you for working through the project with us. Keep your project records and any handover information in a safe place, and reply to this email if something from the agreed delivery needs clarification.\n\n{{projectAccessLine}}\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Sent once when either project stage or status reaches Completed.'
),
(
 'customer_project_paused',
 'Project paused',
 'Project update for {{projectName}}',
 E'Hi {{contactFirstName}},\n\n{{projectName}} is currently paused in the ProFox delivery system.\n\n{{statusReasonLine}}\n\nYour ProFox contact will keep the next step clear. If you need to discuss timing or what is needed to resume, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer update when a project is deliberately paused.'
),
(
 'customer_project_resumed',
 'Project resumed',
 '{{projectName}} is moving again',
 E'Hi {{contactFirstName}},\n\n{{projectName}} is active again and the team can continue from {{stage}}.\n\nWe will keep the next client action clear as the work moves forward.\n\n{{projectAccessLine}}\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer update when a paused project returns to Active.'
),
(
 'customer_project_cancelled',
 'Project cancelled',
 'Project update for {{projectName}}',
 E'Hi {{contactFirstName}},\n\n{{projectName}} is now marked cancelled in the ProFox delivery system.\n\n{{statusReasonLine}}\n\nIf you need clarification about project records, payments or the commercial next step, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer notice when a project is marked Cancelled.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.project_customer_communication_context(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_p public.projects%ROWTYPE;
  v_c public.clients%ROWTYPE;
  v_owner uuid;
  v_portal text;
  v_access text;
  v_review text;
  v_target text;
  v_status_reason text;
BEGIN
  SELECT * INTO v_p FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO v_c FROM public.clients WHERE id=v_p.client_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  v_owner := COALESCE(v_p.project_manager_id,v_c.salesperson_id);
  v_portal := 'https://www.profoxwebdesigner.com/client-portal';
  IF v_c.linked_user_id IS NOT NULL THEN
    v_access := 'Open your secure client portal: '||v_portal;
  ELSE
    v_access := 'Reply to this email if you need secure client portal access for this project.';
  END IF;
  v_review := CASE v_p.stage
    WHEN 'Client Design Approval' THEN 'The current design work is ready for your review.'
    WHEN 'Client Review' THEN 'The current project build is ready for your review.'
    ELSE 'The current project work is ready for your review.'
  END;
  v_target := CASE WHEN v_p.target_date IS NULL THEN '' ELSE 'Target date: '||to_char(v_p.target_date,'FMMonth DD, YYYY') END;
  v_status_reason := CASE WHEN COALESCE(NULLIF(trim(v_p.internal_notes),''),'')='' THEN 'Your ProFox contact can explain the current status and next step.' ELSE 'Your ProFox contact can explain the current status and next step.' END;

  RETURN jsonb_build_object(
    'projectNumber',v_p.project_number,
    'projectName',v_p.project_name,
    'stage',v_p.stage,
    'status',v_p.status,
    'targetDate',COALESCE(v_p.target_date::text,''),
    'targetDateLine',v_target,
    'projectAccessLine',v_access,
    'clientPortalUrl',v_portal,
    'reviewIntro',v_review,
    'statusReasonLine',v_status_reason,
    'resolvedOwnerId',COALESCE(v_owner::text,''),
    'resolvedContactName',COALESCE(NULLIF(trim(v_c.primary_contact_name),''),NULLIF(trim(v_c.company_name),''),''),
    'resolvedCompanyName',COALESCE(NULLIF(trim(v_c.company_name),''),'your business'),
    'resolvedEmail',lower(trim(COALESCE(v_c.email,''))),
    'hasPortalAccess',v_c.linked_user_id IS NOT NULL,
    'stageChangedAt',v_p.stage_changed_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.project_customer_communication_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_customer_communication_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_project_customer_message(p_project_id uuid,p_dedupe text,p_template text,p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_ctx jsonb;
  v_owner uuid;
BEGIN
  v_ctx:=public.project_customer_communication_context(p_project_id);
  IF COALESCE(v_ctx->>'resolvedEmail','')='' THEN RETURN NULL; END IF;
  v_owner:=NULLIF(v_ctx->>'resolvedOwnerId','')::uuid;
  RETURN public.service_queue_customer_communication(
    p_dedupe,p_template,v_ctx->>'resolvedEmail',v_owner,v_ctx->>'resolvedContactName',v_ctx->>'resolvedCompanyName',v_ctx||COALESCE(p_extra,'{}'::jsonb),now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.queue_project_customer_message(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_project_customer_message(uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_client_portal_linked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_context jsonb;
BEGIN
  IF NEW.linked_user_id IS NULL OR NEW.linked_user_id IS NOT DISTINCT FROM OLD.linked_user_id THEN RETURN NEW; END IF;
  IF lower(trim(COALESCE(NEW.email,'')))='' THEN RETURN NEW; END IF;
  v_context:=jsonb_build_object('clientPortalUrl','https://www.profoxwebdesigner.com/client-portal');
  PERFORM public.service_queue_customer_communication(
    'customer-client-portal-ready:'||NEW.id::text||':'||NEW.linked_user_id::text,
    'customer_client_portal_ready',NEW.email,NEW.salesperson_id,NEW.primary_contact_name,NEW.company_name,v_context,now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_client_portal_linked() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_client_portal_linked ON public.clients;
CREATE TRIGGER trg_notify_client_portal_linked
AFTER UPDATE OF linked_user_id ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_linked();

CREATE OR REPLACE FUNCTION public.notify_project_customer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.queue_project_customer_message(NEW.id,'customer-project-started:'||NEW.id::text,'customer_project_started');
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF NEW.stage IN ('Client Design Approval','Client Review') THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-review:'||NEW.id::text||':'||lower(replace(NEW.stage,' ','-')),'customer_project_review_required');
    ELSIF NEW.stage='Launch' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-launch:'||NEW.id::text,'customer_project_launch');
    ELSIF NEW.stage='Handover' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-handover:'||NEW.id::text,'customer_project_handover');
    ELSIF NEW.stage='Completed' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-completed:'||NEW.id::text,'customer_project_completed');
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='Paused' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-paused:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint,'customer_project_paused');
    ELSIF NEW.status='Active' AND OLD.status='Paused' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-resumed:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint,'customer_project_resumed');
    ELSIF NEW.status='Cancelled' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-cancelled:'||NEW.id::text,'customer_project_cancelled');
    ELSIF NEW.status='Completed' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-completed:'||NEW.id::text,'customer_project_completed');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_project_customer_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_project_customer_event ON public.projects;
CREATE TRIGGER trg_notify_project_customer_event
AFTER INSERT OR UPDATE OF stage,status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_project_customer_event();

CREATE OR REPLACE FUNCTION public.notify_project_client_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_extra jsonb;
  v_template text;
  v_key text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id=NEW.project_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_extra:=jsonb_build_object('previousStage',NEW.from_stage,'nextStage',NEW.to_stage,'clientResponseNotes',COALESCE(NEW.notes,''));
  IF NEW.action='Changes Requested' THEN
    v_template:='customer_project_changes_recorded';
    v_key:='customer-project-changes-recorded:'||NEW.id::text;
  ELSE
    v_template:='customer_project_approval_recorded';
    v_key:='customer-project-approval-recorded:'||NEW.id::text;
  END IF;
  PERFORM public.queue_project_customer_message(NEW.project_id,v_key,v_template,v_extra);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_project_client_response() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_project_client_response ON public.project_client_approvals;
CREATE TRIGGER trg_notify_project_client_response
AFTER INSERT ON public.project_client_approvals
FOR EACH ROW EXECUTE FUNCTION public.notify_project_client_response();

CREATE OR REPLACE FUNCTION public.queue_due_project_customer_communications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb:='{}'::jsonb;
  v_days integer[];
  v_project record;
  v_age integer;
  v_milestone integer;
  v_count integer:=0;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='communication_settings';
  IF COALESCE((v_cfg->>'customerEmailEnabled')::boolean,true) IS NOT TRUE THEN RETURN jsonb_build_object('projectReviewReminders',0); END IF;
  v_days:=public.communication_integer_array(v_cfg,'projectApprovalReminderDays',ARRAY[2,1],1,30);

  FOR v_project IN
    SELECT p.id,p.stage,p.stage_changed_at
    FROM public.projects p
    JOIN public.clients c ON c.id=p.client_id AND lower(trim(COALESCE(c.email,'')))<>''
    WHERE p.status='Active' AND p.stage IN ('Client Design Approval','Client Review')
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-v_project.stage_changed_at))/86400)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_days) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      PERFORM public.queue_project_customer_message(
        v_project.id,
        'customer-project-review-reminder:'||v_project.id::text||':'||lower(replace(v_project.stage,' ','-'))||':'||v_milestone::text,
        'customer_project_review_reminder',
        jsonb_build_object('daysWaitingForReview',v_age)
      );
      v_count:=v_count+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('projectReviewReminders',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_project_customer_communications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_project_customer_communications() TO service_role;

CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_sales jsonb:='{}'::jsonb;
  v_operational jsonb:='{}'::jsonb;
  v_quote_customer jsonb:='{}'::jsonb;
  v_payment_customer jsonb:='{}'::jsonb;
  v_project_customer jsonb:='{}'::jsonb;
BEGIN
  v_sales:=COALESCE(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational:=COALESCE(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_quote_customer:=COALESCE(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  v_payment_customer:=COALESCE(public.queue_due_payment_customer_communications(),'{}'::jsonb);
  v_project_customer:=COALESCE(public.queue_due_project_customer_communications(),'{}'::jsonb);
  RETURN v_sales
    || jsonb_build_object('module10Operational',v_operational)
    || jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer||v_project_customer);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations() TO service_role;

CREATE INDEX IF NOT EXISTS idx_projects_client_review_communication
ON public.projects(stage_changed_at,id)
WHERE status='Active' AND stage IN ('Client Design Approval','Client Review');
