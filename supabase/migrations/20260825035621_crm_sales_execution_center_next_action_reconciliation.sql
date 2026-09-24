create or replace function public.get_productivity_next_action(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare
  v_type text:=lower(trim(coalesce(p_entity_type,'')));v_row record;v_role text;v_label text;v_key text;v_url text;v_reason text;v_quick boolean:=false;v_input boolean:=false;v_confirm boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.productivity_can_access_entity(v_type,p_entity_id) then raise exception 'You do not have access to this record.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  case v_type
    when 'lead' then
      select * into v_row from public.crm_leads where id=p_entity_id;
      if v_row.converted_opportunity_id is not null then v_label:='Open opportunity';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='This lead is already converted.';
      elsif v_row.status='New' then v_label:='Research this lead';v_key:='open';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='New leads should be researched before outreach.';
      elsif v_row.status='Researching' then v_label:='Record first contact';v_key:='mark_lead_contacted';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='Research is ready to turn into outreach.';v_quick:=true;v_confirm:=true;
      elsif v_row.status in ('Contacted','Follow-Up','Interested') then v_label:='Schedule next follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Keep a dated next action so this lead cannot go stale.';v_input:=true;
      elsif v_row.status='Qualified' then v_label:='Convert to opportunity';v_key:='convert_lead';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Qualified leads should enter the deal pipeline.';v_input:=true;v_confirm:=true;
      else v_label:='Review lead';v_key:='open';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='Review the record and decide the next useful action.'; end if;
    when 'opportunity' then
      select * into v_row from public.crm_opportunities where id=p_entity_id;
      if v_row.status='Won' then
        if exists(select 1 from public.projects p where p.source_opportunity_id=p_entity_id) then v_label:='Open delivery project';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='The verified sale already has a delivery project.';
        elsif v_role in ('admin','project_manager') then v_label:='Create delivery project';v_key:='create_project_from_sale';v_url:='/admin/app/projects?tab=projects';v_reason:='The verified sale is ready for a controlled Sales-to-Delivery handoff.';v_quick:=true;v_confirm:=true;
        else v_label:='Delivery handoff queued';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Sales is complete. ProFox has handed project launch to Admin/Project Management.'; end if;
      elsif v_row.status='Lost' then v_label:='Review loss notes';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Use the loss reason to improve future qualification.';
      elsif v_row.stage='Qualified' then v_label:='Schedule discovery meeting';v_key:='open';v_url:='/admin/meetings?opportunityId='||p_entity_id;v_reason:='The deal is qualified and ready for discovery.';
      elsif v_row.stage='Meeting Scheduled' then v_label:='Prepare for meeting';v_key:='open';v_url:=case when v_row.meeting_at is null then '/admin/meetings?opportunityId='||p_entity_id else '/admin/app/crm?tab=pipeline' end;v_reason:='Preparation should happen before the call, not during it.';
      elsif v_row.stage='Requirements Confirmed' then v_label:='Create quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Requirements are confirmed; move to a commercial proposal.';
      elsif v_row.stage='Quotation Sent' then v_label:='Schedule quotation follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Every sent quotation needs a dated follow-up.';v_input:=true;
      elsif v_row.stage='Negotiation / Decision Pending' then v_label:='Follow up decision';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Keep the decision process moving with a clear next date.';v_input:=true;
      elsif v_row.stage='Awaiting Advance Payment' then v_label:='Follow up payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The deal is commercially agreed and waiting for payment.';
      else v_label:='Review opportunity';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Review the deal stage and next commitment.'; end if;
    when 'activity' then
      select * into v_row from public.crm_activities where id=p_entity_id;
      if lower(coalesce(v_row.status,'')) in ('completed','cancelled') then v_label:='Open CRM activities';v_key:='open';v_url:='/admin/app/crm?tab=activities';v_reason:='This activity is already closed.';
      else v_label:='Complete with outcome';v_key:='open';v_url:='/admin/app/crm?tab=activities&focusActivityId='||p_entity_id;v_reason:='Execute the activity, record the real outcome, and leave a committed next action when appropriate.';v_quick:=false;v_input:=true; end if;
    when 'meeting' then
      select * into v_row from public.sales_meetings where id=p_entity_id;
      if v_row.status in ('Scheduled','Rescheduled') then v_label:='Open meeting preparation';v_key:='open';v_url:='/admin/meeting-prep/'||p_entity_id;v_reason:='Prepare from qualification and CRM context before joining.';
      elsif v_row.status='No Show' then v_label:='Schedule rebooking follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='A no-show should create a clear rebooking action.';v_input:=true;
      else v_label:='Review outcome and next step';v_key:='open';v_url:='/admin/meeting-prep/'||p_entity_id;v_reason:='Make sure the meeting outcome has a dated next action.'; end if;
    when 'quotation' then
      select * into v_row from public.quotations where id=p_entity_id;
      if v_row.status='Draft' then v_label:='Complete quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Finish the commercial details before approval.';
      elsif v_row.status='Ready for Approval' then v_label:='Review approval';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='This quotation is waiting for approval.';
      elsif v_row.status='Approved' then v_label:='Send quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Approved quotations should reach the prospect quickly.';
      elsif v_row.status='Sent' then v_label:='Schedule quotation follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Do not leave a sent quotation without a next date.';v_input:=true;
      elsif v_row.status='Accepted' then v_label:='Open payment workflow';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The customer accepted; move to payment and activation.';
      else v_label:='Review quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Review the current commercial state.'; end if;
    when 'payment' then
      select * into v_row from public.payments where id=p_entity_id;
      if lower(coalesce(v_row.status,'')) in ('verified','paid') or v_row.verified_at is not null then v_label:='Open client/project';v_key:='open';v_url:='/admin/app/clients?tab=clients';v_reason:='This payment is already verified.';
      elsif public.is_admin() then v_label:='Verify payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='Payment verification remains a protected Admin workflow.';
      else v_label:='Follow up payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The customer payment still needs action.'; end if;
    when 'project_task' then select * into v_row from public.project_tasks where id=p_entity_id;if lower(coalesce(v_row.status,'')) in ('completed','done') or v_row.completed_at is not null then v_label:='Open project';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='This task is already complete.';else v_label:='Mark task complete';v_key:='complete_project_task';v_url:='/admin/app/projects?tab=myWork';v_reason:='Finish the current owned task before pulling more work.';v_quick:=true;end if;
    when 'project' then select * into v_row from public.projects where id=p_entity_id;if v_row.status='Completed' or v_row.completed_at is not null then v_label:='Review project closure';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Confirm final delivery, approvals and closure history.';elsif v_row.project_manager_id is null and public.is_admin() then v_label:='Assign project manager';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Every active project needs one accountable owner.';else v_label:='Open current project work';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Work from the active tasks, blockers and next client approval.';end if;
    when 'applicant' then select * into v_row from public.applicants where id=p_entity_id;v_label:='Open candidate';v_key:='open';v_url:='/admin/app/recruitment?tab=recruitment';v_reason:='Move the candidate using the controlled recruitment workflow.';
    when 'client' then v_label:='Review client activity';v_key:='open';v_url:='/admin/app/clients?tab=clients';v_reason:='See projects, payments, meetings and client history together.';
    else v_label:='Open record';v_key:='open';v_url:='/admin/workspace';v_reason:='Review the connected record.';
  end case;
  return jsonb_build_object('entityType',v_type,'entityId',p_entity_id,'label',v_label,'actionKey',v_key,'url',v_url,'reason',v_reason,'quick',v_quick,'requiresInput',v_input,'requiresConfirmation',v_confirm);
end $$;
