-- Module 10 closure — operational notification events.
-- Canonical business records remain authoritative. Notifications are an asynchronous consequence only.

-- Extend Admin-editable notification policy without overwriting existing provider/timing choices.
INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES(
  'notification_settings',
  jsonb_build_object(
    'emailEnabled',false,'emailProvider','disabled','providerConfigured',false,
    'fromEmail','','fromName','ProFox','replyTo','',
    'publicBaseUrl','https://www.profoxwebdesigner.com',
    'reminderMinutes',jsonb_build_array(1440,60),
    'noShowFollowUpHours',2,'completedReviewHours',2,'quotationFollowUpDays',2,'maxAttempts',5,
    'quotationApprovalReminderHours',jsonb_build_array(2,8,24),
    'adminReviewReminderHours',jsonb_build_array(4,24,48),
    'paymentDueReminderDays',jsonb_build_array(3,1,0),
    'paymentOverdueReminderDays',jsonb_build_array(1,3,7),
    'paymentVerificationReminderHours',jsonb_build_array(2,8,24),
    'projectTaskReminderDays',jsonb_build_array(1,0),
    'projectTaskOverdueReminderDays',jsonb_build_array(1,3,7),
    'commissionReviewReminderHours',jsonb_build_array(4,24,48),
    'commissionPayoutReminderDays',jsonb_build_array(1,0)
  ),
  'ProFox server-side notification delivery, reminders and operational automation settings.',
  now()
)
ON CONFLICT(config_key) DO UPDATE SET
  config_value=COALESCE(public.system_configuration.config_value,'{}'::jsonb)
    || jsonb_build_object(
      'quotationApprovalReminderHours',COALESCE(public.system_configuration.config_value->'quotationApprovalReminderHours',jsonb_build_array(2,8,24)),
      'adminReviewReminderHours',COALESCE(public.system_configuration.config_value->'adminReviewReminderHours',jsonb_build_array(4,24,48)),
      'paymentDueReminderDays',COALESCE(public.system_configuration.config_value->'paymentDueReminderDays',jsonb_build_array(3,1,0)),
      'paymentOverdueReminderDays',COALESCE(public.system_configuration.config_value->'paymentOverdueReminderDays',jsonb_build_array(1,3,7)),
      'paymentVerificationReminderHours',COALESCE(public.system_configuration.config_value->'paymentVerificationReminderHours',jsonb_build_array(2,8,24)),
      'projectTaskReminderDays',COALESCE(public.system_configuration.config_value->'projectTaskReminderDays',jsonb_build_array(1,0)),
      'projectTaskOverdueReminderDays',COALESCE(public.system_configuration.config_value->'projectTaskOverdueReminderDays',jsonb_build_array(1,3,7)),
      'commissionReviewReminderHours',COALESCE(public.system_configuration.config_value->'commissionReviewReminderHours',jsonb_build_array(4,24,48)),
      'commissionPayoutReminderDays',COALESCE(public.system_configuration.config_value->'commissionPayoutReminderDays',jsonb_build_array(1,0))
    ),
  description='ProFox server-side notification delivery, reminders and operational automation settings.',
  updated_at=now();

-- Internal operational email templates. In-app alerts remain available even if an individual email template is disabled.
INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
('quotation_approval_required','Quotation approval required','Approval required — {{quotationNumber}} · {{customerName}}','A quotation is waiting for management review.\n\nQuotation: {{quotationNumber}}\nCustomer: {{customerName}}\nValue: {{currency}} {{total}}\nReason: {{approvalReason}}\n\nReview it in ProFox: {{actionUrl}}',true,'Internal Admin alert when a quotation enters manager review.'),
('quotation_approved_internal','Quotation approved — seller','Quotation approved — {{quotationNumber}}','Management approved {{quotationNumber}} for {{customerName}}. It is ready for the next controlled sales step.\n\nOpen quotation: {{actionUrl}}',true,'Internal seller notice after manager approval.'),
('payment_verification_required','Payment verification required','Payment verification required — {{paymentReference}}','A payment is waiting for Admin verification.\n\nReference: {{paymentReference}}\nCustomer: {{customerName}}\nAmount: {{currency}} {{amountPaid}} / {{amountDue}}\nStatus: {{status}}\n\nVerify only from confirmed evidence in ProFox: {{actionUrl}}',true,'Internal Admin alert for payment verification.'),
('payment_due_internal','Payment due — internal','Payment {{dueLabel}} — {{paymentReference}}','A customer payment requires follow-up.\n\nReference: {{paymentReference}}\nCustomer: {{customerName}}\nAmount due: {{currency}} {{amountDue}}\nDue date: {{dueDate}}\n\nOpen payment: {{actionUrl}}',true,'Internal seller/owner payment due reminder; customer notices belong to Module 11.'),
('payment_overdue_internal','Payment overdue — internal','Payment overdue — {{paymentReference}}','A payment is overdue and needs action.\n\nReference: {{paymentReference}}\nCustomer: {{customerName}}\nOutstanding: {{currency}} {{outstanding}}\nDue date: {{dueDate}}\nDays overdue: {{daysOverdue}}\n\nOpen payment: {{actionUrl}}',true,'Internal seller reminder and management escalation for overdue payments.'),
('payment_status_update_internal','Payment status update — seller','Payment update — {{paymentReference}} · {{status}}','Payment {{paymentReference}} for {{customerName}} is now {{status}}.\n\nDue: {{currency}} {{amountDue}}\nRecorded paid: {{currency}} {{amountPaid}}\n\nOpen payment: {{actionUrl}}',true,'Internal seller notice for material payment settlement/status changes.'),
('project_task_assigned','Project task assigned or materially updated','Project task — {{taskTitle}}','A project task is assigned to you or its schedule/priority changed.\n\nProject: {{projectName}}\nTask: {{taskTitle}}\nPriority: {{priority}}\nDue: {{dueDate}}\n\nOpen My Work: {{actionUrl}}',true,'Internal assignee notice for task assignment/reassignment/material schedule changes.'),
('project_task_needs_owner','High-priority project task needs an owner','High-priority task needs assignment — {{taskTitle}}','A high-priority project task has no assignee.\n\nProject: {{projectName}}\nTask: {{taskTitle}}\nDue: {{dueDate}}\n\nAssign an accountable owner: {{actionUrl}}',true,'Internal PM/Admin exception alert for unassigned high-priority work.'),
('project_task_due','Project task due reminder','Task {{dueLabel}} — {{taskTitle}}','A project task needs attention.\n\nProject: {{projectName}}\nTask: {{taskTitle}}\nPriority: {{priority}}\nDue: {{dueDate}}\n\nOpen My Work: {{actionUrl}}',true,'Internal assignee task due reminder.'),
('project_task_overdue','Project task overdue','Task overdue — {{taskTitle}}','A project task is overdue.\n\nProject: {{projectName}}\nTask: {{taskTitle}}\nPriority: {{priority}}\nDue: {{dueDate}}\nDays overdue: {{daysOverdue}}\n\nOpen task: {{actionUrl}}',true,'Internal assignee reminder and PM/Admin escalation for overdue project work.'),
('commission_earned','Commission earned','Commission earned — {{entryNumber}}','A verified payment created commission {{entryNumber}}.\n\nProduct: {{productName}}\nCommission: {{currency}} {{commissionAmount}}\nEffective rate: {{effectiveRate}}%\nStatus: {{status}}\n\nOpen Commissions: {{actionUrl}}',true,'Internal seller notice when commission is earned.'),
('commission_review_required','Commission review required','Commission review required — {{entryNumber}}','A commission needs management review before it can move forward.\n\nEntry: {{entryNumber}}\nSeller: {{sellerName}}\nProduct: {{productName}}\nCommission: {{currency}} {{commissionAmount}}\n\nReview in ProFox: {{actionUrl}}',true,'Internal Admin alert for commission entries under review.'),
('commission_status_update','Commission status update','Commission {{status}} — {{entryNumber}}','Commission {{entryNumber}} is now {{status}}.\n\nProduct: {{productName}}\nAmount: {{currency}} {{commissionAmount}}\n{{statusNote}}\n\nOpen Commissions: {{actionUrl}}',true,'Internal seller notice for Approved, Paid, Disputed or Reversed commission changes.'),
('commission_payout_scheduled','Commission payout scheduled','Commission payout scheduled — {{batchNumber}}','A commission payout batch containing your eligible commission has been scheduled.\n\nBatch: {{batchNumber}}\nScheduled date: {{scheduledDate}}\n\nOpen Commissions for the itemized entries: {{actionUrl}}',true,'One seller notification per payout batch, deduplicated even when multiple entries are included.'),
('commission_payout_completed','Commission payout completed','Commission payout completed — {{batchNumber}}','Commission payout batch {{batchNumber}} has been marked completed.\n\nOpen Commissions to review the itemized paid entries and payout references: {{actionUrl}}',true,'One seller notification per completed payout batch.'),
('admin_training_review_required','Sales Academy review required','Academy review required — {{moduleTitle}} · {{traineeName}}','A Sales Academy submission is waiting for Admin review.\n\nTrainee: {{traineeName}}\nModule: {{moduleTitle}}\nSubmitted: {{submittedAt}}\n\nReview the canonical submission in ProFox: {{actionUrl}}',true,'Internal Admin alert/reminder only for Academy modules that actually require Admin review.')
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.service_queue_staff_operational_notification(
  p_user_id uuid,
  p_dedupe_key text,
  p_template_key text,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR trim(COALESCE(p_dedupe_key,''))='' THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=p_user_id AND u.status='active' AND u.role NOT IN ('customer','pending')) THEN RETURN; END IF;
  PERFORM public.enqueue_in_app_notification(p_user_id,p_type,p_title,p_message,p_action_url,p_dedupe_key);
  PERFORM public.enqueue_notification(p_dedupe_key,p_template_key,'',p_user_id,COALESCE(p_payload,'{}'::jsonb)||jsonb_build_object('actionUrl',p_action_url),COALESCE(p_scheduled_for,now()));
END;
$$;
REVOKE ALL ON FUNCTION public.service_queue_staff_operational_notification(uuid,text,text,text,text,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_queue_staff_operational_notification(uuid,text,text,text,text,text,text,jsonb,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.service_queue_active_admins_operational_notification(
  p_dedupe_prefix text,
  p_template_key text,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_admin record; v_count integer:=0;
BEGIN
  FOR v_admin IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
    PERFORM public.service_queue_staff_operational_notification(v_admin.id,p_dedupe_prefix||':'||v_admin.id,p_template_key,p_type,p_title,p_message,p_action_url,p_payload,p_scheduled_for);
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.service_queue_active_admins_operational_notification(text,text,text,text,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_queue_active_admins_operational_notification(text,text,text,text,text,text,jsonb,timestamptz) TO service_role;

-- Quotation manager-review request/result events.
CREATE OR REPLACE FUNCTION public.notify_quotation_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_payload jsonb; v_request boolean:=false; v_approved boolean:=false;
BEGIN
  IF TG_OP='INSERT' THEN
    v_request := NEW.status='Ready for Approval' AND NEW.approval_required IS TRUE;
  ELSE
    v_request := NEW.status='Ready for Approval' AND NEW.approval_required IS TRUE
      AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.approval_required IS DISTINCT FROM NEW.approval_required OR OLD.approval_checked_at IS DISTINCT FROM NEW.approval_checked_at);
    v_approved := NEW.status='Approved' AND OLD.status='Ready for Approval';
  END IF;
  v_payload:=jsonb_build_object('quotationNumber',NEW.quotation_number,'customerName',NEW.customer_name,'currency',NEW.currency,'total',NEW.total,'approvalReason',COALESCE(NEW.approval_reason,''));
  IF v_request THEN
    PERFORM public.service_queue_active_admins_operational_notification(
      'quotation-approval-required:'||NEW.id||':'||COALESCE(extract(epoch FROM NEW.approval_checked_at)::bigint::text,extract(epoch FROM NEW.updated_at)::bigint::text),
      'quotation_approval_required','Approval','Quotation approval required — '||NEW.quotation_number,
      COALESCE(NULLIF(NEW.customer_name,''),'Customer')||' · '||NEW.currency||' '||COALESCE(NEW.total,0)::text||' is waiting for review.',
      '/admin/app/sales?tab=quotations',v_payload,now());
  END IF;
  IF v_approved AND NEW.salesperson_id IS NOT NULL THEN
    PERFORM public.service_queue_staff_operational_notification(
      NEW.salesperson_id,'quotation-approved:'||NEW.id||':'||extract(epoch FROM COALESCE(NEW.approved_at,NEW.updated_at))::bigint,
      'quotation_approved_internal','Quotation','Quotation approved — '||NEW.quotation_number,
      'Management approved this quotation. Continue with the approved sales workflow.',
      '/admin/app/sales?tab=quotations',v_payload,now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_quotation_operational_event ON public.quotations;
CREATE TRIGGER trg_notify_quotation_operational_event AFTER INSERT OR UPDATE OF status,approval_required,approval_checked_at,approved_at ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.notify_quotation_operational_event();
REVOKE ALL ON FUNCTION public.notify_quotation_operational_event() FROM PUBLIC,anon,authenticated;

-- Payment review and material status transitions. Customer-facing payment communication is intentionally deferred to Module 11.
CREATE OR REPLACE FUNCTION public.notify_payment_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_verification boolean:=false; v_status_changed boolean:=false; v_payload jsonb; v_note text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_verification:=NEW.status='Verification Pending';
  ELSE
    v_verification:=NEW.status='Verification Pending' AND OLD.status IS DISTINCT FROM NEW.status;
    v_status_changed:=OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Verified','Partially Paid','Failed','Refunded','Partially Refunded');
  END IF;
  v_payload:=jsonb_build_object('paymentReference',NEW.payment_reference,'customerName',NEW.customer_name,'currency',NEW.currency,'amountDue',NEW.amount_due,'amountPaid',NEW.amount_paid,'status',NEW.status,'dueDate',COALESCE(NEW.due_date::text,''));
  IF v_verification THEN
    PERFORM public.service_queue_active_admins_operational_notification(
      'payment-verification-required:'||NEW.id||':'||extract(epoch FROM NEW.updated_at)::bigint,
      'payment_verification_required','Payment','Payment verification required — '||NEW.payment_reference,
      COALESCE(NULLIF(NEW.customer_name,''),'Customer')||' payment is waiting for protected Admin verification.',
      '/admin/app/sales?tab=payments',v_payload,now());
  END IF;
  IF v_status_changed AND NEW.salesperson_id IS NOT NULL THEN
    v_note:=CASE NEW.status WHEN 'Verified' THEN 'Payment has been verified.' WHEN 'Partially Paid' THEN 'A partial receipt was recorded; the payment is not fully verified.' WHEN 'Failed' THEN 'Payment was marked failed.' WHEN 'Refunded' THEN 'Payment was refunded.' WHEN 'Partially Refunded' THEN 'Payment was partially refunded.' ELSE 'Payment status changed.' END;
    PERFORM public.service_queue_staff_operational_notification(
      NEW.salesperson_id,'payment-status:'||NEW.id||':'||lower(replace(NEW.status,' ','-'))||':'||extract(epoch FROM NEW.updated_at)::bigint,
      'payment_status_update_internal','Payment','Payment update — '||NEW.payment_reference||' · '||NEW.status,
      v_note,'/admin/app/sales?tab=payments',v_payload,now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_payment_operational_event ON public.payments;
CREATE TRIGGER trg_notify_payment_operational_event AFTER INSERT OR UPDATE OF status,amount_paid,verified_at ON public.payments FOR EACH ROW EXECUTE FUNCTION public.notify_payment_operational_event();
REVOKE ALL ON FUNCTION public.notify_payment_operational_event() FROM PUBLIC,anon,authenticated;

-- Project task ownership/schedule events. Routine edits do not notify; only ownership, due-date or priority changes do.
CREATE OR REPLACE FUNCTION public.notify_project_task_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_project public.projects%ROWTYPE; v_material boolean:=false; v_payload jsonb; v_key text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id=NEW.project_id;
  IF TG_OP='INSERT' THEN
    v_material:=NEW.assigned_to IS NOT NULL;
  ELSE
    v_material:=NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.priority IS DISTINCT FROM OLD.priority;
  END IF;
  v_payload:=jsonb_build_object('projectName',COALESCE(v_project.project_name,'Project'),'taskTitle',NEW.title,'priority',COALESCE(NEW.priority,''),'dueDate',COALESCE(NEW.due_date::text,''));
  IF v_material AND NEW.assigned_to IS NOT NULL AND lower(COALESCE(NEW.status,'')) NOT IN ('completed','done','cancelled') THEN
    v_key:='project-task-assignment:'||NEW.id||':'||NEW.assigned_to||':'||extract(epoch FROM NEW.updated_at)::bigint;
    PERFORM public.service_queue_staff_operational_notification(
      NEW.assigned_to,v_key,'project_task_assigned','Project Task','Project task — '||NEW.title,
      COALESCE(v_project.project_name,'Project')||' · '||COALESCE(NEW.priority,'Normal')||' priority · due '||COALESCE(NEW.due_date::text,'not set'),
      '/admin/app/projects?tab=myWork',v_payload,now());
  END IF;
  IF NEW.assigned_to IS NULL AND lower(COALESCE(NEW.priority,''))='high' AND lower(COALESCE(NEW.status,'')) NOT IN ('completed','done','cancelled')
     AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR OLD.priority IS DISTINCT FROM NEW.priority))) THEN
    v_key:='project-task-needs-owner:'||NEW.id||':'||extract(epoch FROM NEW.updated_at)::bigint;
    IF v_project.project_manager_id IS NOT NULL THEN
      PERFORM public.service_queue_staff_operational_notification(v_project.project_manager_id,v_key,'project_task_needs_owner','Project Task','High-priority task needs assignment — '||NEW.title,'Assign an accountable owner before this task becomes a delivery risk.','/admin/app/projects?tab=projects',v_payload,now());
    ELSE
      PERFORM public.service_queue_active_admins_operational_notification(v_key,'project_task_needs_owner','Project Task','High-priority task needs assignment — '||NEW.title,'The project has no PM/assignee for this high-priority task.','/admin/app/projects?tab=projects',v_payload,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_project_task_operational_event ON public.project_tasks;
CREATE TRIGGER trg_notify_project_task_operational_event AFTER INSERT OR UPDATE OF assigned_to,due_date,priority,status ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.notify_project_task_operational_event();
REVOKE ALL ON FUNCTION public.notify_project_task_operational_event() FROM PUBLIC,anon,authenticated;

-- Commission earned/review/status/payout-scheduled events.
CREATE OR REPLACE FUNCTION public.notify_commission_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_payload jsonb; v_seller_name text:=''; v_batch public.commission_payout_batches%ROWTYPE; v_changed boolean:=false; v_note text:='';
BEGIN
  SELECT COALESCE(NULLIF(full_name,''),email,'Seller') INTO v_seller_name FROM public.user_profiles WHERE id=NEW.salesperson_id;
  v_payload:=jsonb_build_object('entryNumber',NEW.entry_number,'sellerName',v_seller_name,'productName',NEW.product_name,'currency',NEW.currency,'commissionAmount',NEW.commission_amount,'effectiveRate',NEW.effective_rate_percent,'status',NEW.status,'statusNote','');
  IF TG_OP='INSERT' THEN
    IF NEW.status='Earned' THEN
      PERFORM public.service_queue_staff_operational_notification(NEW.salesperson_id,'commission-earned:'||NEW.id,'commission_earned','Commission','Commission earned — '||NEW.entry_number,'A verified payment created an earned commission.','/admin/app/commissions',v_payload,now());
    ELSIF NEW.status='Under Review' THEN
      PERFORM public.service_queue_staff_operational_notification(NEW.salesperson_id,'commission-under-review-seller:'||NEW.id,'commission_status_update','Commission','Commission under review — '||NEW.entry_number,'This commission requires management review before approval.','/admin/app/commissions',v_payload||jsonb_build_object('statusNote','Management review is required.'),now());
      PERFORM public.service_queue_active_admins_operational_notification('commission-review-required:'||NEW.id,'commission_review_required','Commission','Commission review required — '||NEW.entry_number,v_seller_name||' has a commission requiring management review.','/admin/app/commissions',v_payload,now());
    END IF;
  ELSE
    v_changed:=OLD.status IS DISTINCT FROM NEW.status;
    IF v_changed AND NEW.status IN ('Approved','Disputed','Reversed') THEN
      v_note:=CASE NEW.status WHEN 'Approved' THEN 'Management approved this commission.' WHEN 'Disputed' THEN 'This commission is marked disputed and needs review.' WHEN 'Reversed' THEN COALESCE(NULLIF(NEW.reversal_reason,''),'This commission was reversed.') ELSE '' END;
      IF NOT (NEW.status='Approved' AND NEW.payout_batch_id IS NOT NULL) THEN
        PERFORM public.service_queue_staff_operational_notification(NEW.salesperson_id,'commission-status:'||NEW.id||':'||lower(NEW.status)||':'||extract(epoch FROM NEW.updated_at)::bigint,'commission_status_update','Commission','Commission '||NEW.status||' — '||NEW.entry_number,v_note,'/admin/app/commissions',v_payload||jsonb_build_object('statusNote',v_note),now());
      END IF;
      IF NEW.status='Disputed' THEN
        PERFORM public.service_queue_active_admins_operational_notification('commission-disputed:'||NEW.id||':'||extract(epoch FROM NEW.updated_at)::bigint,'commission_review_required','Commission','Commission disputed — '||NEW.entry_number,v_seller_name||' has a disputed commission requiring management attention.','/admin/app/commissions',v_payload,now());
      END IF;
    ELSIF v_changed AND NEW.status='Paid' AND NEW.payout_batch_id IS NULL THEN
      v_note:='This commission was marked paid.';
      PERFORM public.service_queue_staff_operational_notification(NEW.salesperson_id,'commission-paid-direct:'||NEW.id||':'||extract(epoch FROM NEW.updated_at)::bigint,'commission_status_update','Commission','Commission Paid — '||NEW.entry_number,v_note,'/admin/app/commissions',v_payload||jsonb_build_object('statusNote',v_note),now());
    END IF;
  END IF;
  IF NEW.payout_batch_id IS NOT NULL AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.payout_batch_id IS DISTINCT FROM NEW.payout_batch_id)) THEN
    SELECT * INTO v_batch FROM public.commission_payout_batches WHERE id=NEW.payout_batch_id;
    IF FOUND AND v_batch.status='Approved' THEN
      PERFORM public.service_queue_staff_operational_notification(
        NEW.salesperson_id,'commission-payout-scheduled:'||v_batch.id||':'||NEW.salesperson_id,
        'commission_payout_scheduled','Commission','Commission payout scheduled — '||v_batch.batch_number,
        'Your eligible commission has been included in a scheduled payout batch.',
        '/admin/app/commissions',jsonb_build_object('batchNumber',v_batch.batch_number,'scheduledDate',v_batch.scheduled_date),now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_commission_operational_event ON public.commission_entries;
CREATE TRIGGER trg_notify_commission_operational_event AFTER INSERT OR UPDATE OF status,payout_batch_id,reversal_reason ON public.commission_entries FOR EACH ROW EXECUTE FUNCTION public.notify_commission_operational_event();
REVOKE ALL ON FUNCTION public.notify_commission_operational_event() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_commission_payout_batch_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_seller record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status='Completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_seller IN SELECT DISTINCT salesperson_id FROM public.commission_entries WHERE payout_batch_id=NEW.id AND salesperson_id IS NOT NULL LOOP
      PERFORM public.service_queue_staff_operational_notification(
        v_seller.salesperson_id,'commission-payout-completed:'||NEW.id||':'||v_seller.salesperson_id,
        'commission_payout_completed','Commission','Commission payout completed — '||NEW.batch_number,
        'The payout batch containing your commission has been marked completed.',
        '/admin/app/commissions',jsonb_build_object('batchNumber',NEW.batch_number,'scheduledDate',NEW.scheduled_date),now());
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_commission_payout_batch_event ON public.commission_payout_batches;
CREATE TRIGGER trg_notify_commission_payout_batch_event AFTER UPDATE OF status ON public.commission_payout_batches FOR EACH ROW EXECUTE FUNCTION public.notify_commission_payout_batch_event();
REVOKE ALL ON FUNCTION public.notify_commission_payout_batch_event() FROM PUBLIC,anon,authenticated;

-- Sales Academy submissions that genuinely require Admin review.
CREATE OR REPLACE FUNCTION public.notify_training_admin_review_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_module public.training_modules%ROWTYPE; v_user public.user_profiles%ROWTYPE; v_assignment_id uuid; v_key text; v_payload jsonb; v_should boolean:=false;
BEGIN
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.requires_admin_review IS NOT TRUE OR NEW.status<>'Submitted' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN v_should:=true; ELSE v_should:=OLD.status IS DISTINCT FROM NEW.status OR OLD.updated_at IS DISTINCT FROM NEW.updated_at; END IF;
  IF NOT v_should THEN RETURN NEW; END IF;
  SELECT * INTO v_user FROM public.user_profiles WHERE id=NEW.user_id;
  SELECT id INTO v_assignment_id FROM public.training_assignments WHERE progress_id=NEW.id ORDER BY created_at DESC,id DESC LIMIT 1;
  v_key:='academy-review-required:'||NEW.id||':'||COALESCE(v_assignment_id::text,extract(epoch FROM NEW.updated_at)::bigint::text);
  v_payload:=jsonb_build_object('traineeName',COALESCE(NULLIF(v_user.full_name,''),v_user.email,'Trainee'),'moduleTitle',v_module.title,'submittedAt',NEW.updated_at);
  PERFORM public.service_queue_active_admins_operational_notification(
    v_key,'admin_training_review_required','Academy Review','Academy review required — '||v_module.title,
    COALESCE(NULLIF(v_user.full_name,''),v_user.email,'Trainee')||' submitted '||v_module.title||' for Admin review.',
    '/admin/app/academy?tab=training',v_payload,now());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_training_admin_review_event ON public.user_training_progress;
CREATE TRIGGER trg_notify_training_admin_review_event AFTER INSERT OR UPDATE OF status,updated_at ON public.user_training_progress FOR EACH ROW EXECUTE FUNCTION public.notify_training_admin_review_event();
REVOKE ALL ON FUNCTION public.notify_training_admin_review_event() FROM PUBLIC,anon,authenticated;
