-- Module 17 — 25 server-scored CRM judgment scenarios + 7 required acknowledgements.

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;

  delete from public.training_assessment_questions where module_id=v_module;
  delete from public.training_acknowledgements where module_id=v_module;

  insert into public.training_assessment_questions
    (module_id,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical)
  values
  (v_module,'You find a CRM lead with the same company domain and contact email as the prospect you are about to create. What should you do?',
   '["Create a second lead so your work is separate","Review the existing record and update/escalate the duplicate instead of blindly creating another","Create an opportunity directly","Ignore the old record if it belongs to another salesperson"]'::jsonb,1,
   'Search-before-create protects history, ownership and reporting. Resolve a likely duplicate instead of splitting the customer record.',1,true,'scenario','duplicate_record',false),

  (v_module,'Research shows the company website, but you cannot verify who approves the purchase. How should the decision-maker field/context be handled?',
   '["Enter the first employee you found","Assume the company owner approves everything","Record the decision-maker as unknown/not yet confirmed and verify during discovery","Leave a confident guess in Notes"]'::jsonb,2,
   'Unknown is a valid CRM truth. Never convert an inference into a verified buying-process fact.',2,true,'scenario','unknown_vs_fact',false),

  (v_module,'You sent a cold email. The tracking tool shows an open, but the buyer did not reply. Which CRM interpretation is strongest?',
   '["Record the outreach truthfully and keep the lead at the evidence-supported contacted/follow-up state","Mark Interested because they opened it","Mark Qualified","Create an opportunity immediately"]'::jsonb,0,
   'An email open is not buyer commitment. Stage/status must follow observable sales evidence.',3,true,'scenario','email_open',false),

  (v_module,'You planned to call a lead but never made the call. What should the CRM show?',
   '["Completed call because you intended to do it","Completed call with no notes","Delete the lead","Do not falsely log/complete the call; keep or reschedule the truthful activity as appropriate"]'::jsonb,3,
   'CRM activity history must represent actions that actually occurred.',4,true,'scenario','false_activity',false),

  (v_module,'A prospect replies, “Send me some examples.” You have not confirmed a business problem, priority or buying path. What should you do?',
   '["Mark Won","Continue qualification; a positive reply alone is not enough to create a qualified opportunity","Move to Awaiting Advance Payment","Record a guaranteed project"]'::jsonb,1,
   'Opportunity creation should follow qualification evidence rather than enthusiasm.',5,true,'scenario','premature_qualification',false),

  (v_module,'A lead was supplied by ProFox, but changing it to Self-Generated would increase your commission. What is the correct action?',
   '["Change it after the deal closes","Change it only if nobody notices","Preserve the true source and self-generated status exactly","Duplicate it as a self-generated lead"]'::jsonb,2,
   'Lead source and self-generated status are auditable business facts. Falsifying them for commission is prohibited.',6,true,'scenario','source_falsification',true),

  (v_module,'Discovery is complete and the buyer’s requirements are confirmed, but no quotation has been sent. Which opportunity stage matches the milestone?',
   '["Requirements Confirmed","Quotation Sent","Awaiting Advance Payment","Won"]'::jsonb,0,
   'Use the stage earned by the real event. Do not skip commercial milestones.',7,true,'scenario','stage_truth',false),

  (v_module,'A buyer in New York agrees to a discovery meeting while you are working in India. Before saving it, what is the best action?',
   '["Use your local clock without telling them","Assume UTC","Schedule any free slot","Confirm the buyer-facing time/timezone and save the meeting through the approved workflow"]'::jsonb,3,
   'Meeting records must preserve timezone truth and use the approved scheduling workflow.',8,true,'scenario','meeting_timezone',false),

  (v_module,'A buyer repeatedly questions price. Which CRM note is most professional?',
   '["Cheap client — probably wasting time","Buyer raised an upfront cash-flow concern; approved structure explained; owner review is next","Difficult buyer","They cannot afford us"]'::jsonb,1,
   'Record the business concern and next step, not a disrespectful personal label.',9,true,'scenario','professional_notes',false),

  (v_module,'A qualified buyer chooses another agency and explicitly asks not to be contacted again. What should happen?',
   '["Keep it Open and follow up monthly","Move it back to Lead Research","Record the truthful Lost outcome/reason and respect the no-contact request","Create a new lead next week"]'::jsonb,2,
   'A clear loss/no-contact instruction should close the loop rather than manufacture pipeline momentum.',10,true,'scenario','lost_no_contact',false),

  (v_module,'A quotation is drafted internally but has not been approved or sent. What should the CRM stage show?',
   '["Do not move to Quotation Sent until the approved quotation is actually sent","Quotation Sent immediately","Negotiation / Decision Pending","Awaiting Advance Payment"]'::jsonb,0,
   'Drafting is not sending. CRM stage follows the actual commercial document event.',11,true,'scenario','quotation_state',false),

  (v_module,'A buyer says, “Give me 20% off and I’ll sign today.” You do not have approval. What should you do?',
   '["Promise it verbally and ask later","Change the opportunity value quietly","Create a custom payment line","Record the request and escalate through the approved commercial authority without promising the discount"]'::jsonb,3,
   'Sales cannot invent discounts or use an unapproved concession to manufacture urgency.',12,true,'scenario','unauthorized_discount',true),

  (v_module,'The buyer messages, “Paid,” and sends a transfer screenshot. The payment record is not Verified. What is correct?',
   '["Mark Won immediately","Record the customer claim/evidence and keep the deal in the truthful pending-verification state","Tell Delivery to start and verify later","Set payment to Verified yourself"]'::jsonb,1,
   'Customer evidence is useful, but only the protected verification workflow establishes financial truth.',13,true,'scenario','payment_claim',true),

  (v_module,'You believe a deal is certain and want to move it to Won before payment verification so the project team can prepare. What is correct?',
   '["Won is fine if probability is 90%","Ask another salesperson to mark it Won","Do not force Won; only the approved protected workflow may create the qualifying Won transition","Mark Won and add a note saying payment pending"]'::jsonb,2,
   'Won is a protected business event with downstream financial, client, project and reporting effects.',14,true,'scenario','early_won',true),

  (v_module,'A customer sends an admin password and OTP during a sales conversation. Where should you store them?',
   '["Do not store secrets in ordinary CRM fields; redirect to the approved secure credential process and escalate if needed","Opportunity Notes","Meeting description","Lead phone field"]'::jsonb,0,
   'Passwords, OTPs and similar secrets do not belong in CRM notes or ordinary sales records.',15,true,'scenario','credential_exposure',true),

  (v_module,'You want to export the full customer/lead list to a personal spreadsheet so you can work faster at home. What should you do?',
   '["Export it if you delete it later","Email it to yourself","Upload it to a personal drive","Do not export company/customer CRM data to an unapproved personal tool; use authorized systems and access"]'::jsonb,3,
   'CRM access does not grant permission to copy company/customer data into personal systems.',16,true,'scenario','unauthorized_export',true),

  (v_module,'Two records appear to represent the same company but have conflicting salesperson ownership. You cannot safely determine which should survive. What is best?',
   '["Delete the other salesperson’s record","Escalate the ownership/duplicate conflict with evidence instead of improvising","Assign both to yourself","Convert both to opportunities"]'::jsonb,1,
   'Material duplicate/ownership conflicts should be resolved through the correct authority when the seller cannot establish the truth safely.',17,true,'scenario','ownership_conflict',false),

  (v_module,'You have ten overdue activities. You did not perform them, but completing them all would make your dashboard clean. What should you do?',
   '["Complete all ten and write “done”","Delete them and recreate tomorrow","Keep the activity history truthful; perform, reschedule, cancel or otherwise resolve each according to what actually happened","Move the related opportunities forward to hide the overdue tasks"]'::jsonb,2,
   'Falsely completing activities corrupts the audit trail and performance reporting.',18,true,'scenario','activity_falsification',true),

  (v_module,'A buyer has not discussed budget, but entering a high expected value would make your pipeline look stronger. What is correct?',
   '["Do not fabricate commercial value; use only supported/approved information and leave uncertainty truthful","Enter the Premium package value","Use the highest package by default","Double the estimate for forecast safety"]'::jsonb,0,
   'Pipeline value must not be manufactured for appearances or incentives.',19,true,'scenario','value_inflation',true),

  (v_module,'A colleague suggests changing the lead source after closing so the deal qualifies for the self-generated commission bonus. What should you do?',
   '["Do it after the payout","Create a second opportunity","Change only the source field","Refuse and preserve the original source truth; report/escalate attempted falsification if appropriate"]'::jsonb,3,
   'Commission eligibility must follow the real lead source, not a post-sale rewrite.',20,true,'scenario','commission_falsification',true),

  (v_module,'During a custom app discussion, the buyer asks whether an integration definitely works. Engineering has not validated it. What belongs in CRM?',
   '["Guaranteed compatible","Record it as an unverified technical requirement/unknown and route it for validation before promising it","Remove the requirement","Mark it completed"]'::jsonb,1,
   'Unsupported technical certainty can create scope and delivery failures. Unknowns must remain unknown until validated.',21,true,'scenario','technical_guarantee',true),

  (v_module,'The accepted quotation has an approved payment schedule, but the buyer asks you to privately change the milestones. You are not authorized. What is correct?',
   '["Edit the CRM amount and tell Finance later","Agree verbally","Record the exception request and obtain the required commercial approval before changing any binding terms","Create a fake payment request matching the buyer request"]'::jsonb,2,
   'Payment terms are commercial truth and cannot be altered informally by Sales.',22,true,'scenario','payment_terms',true),

  (v_module,'A deal was genuinely lost because the buyer selected a competitor, but “Budget” would look better in reporting. Which loss reason should you record?',
   '["The actual supported loss reason: competitor selected","Budget","No priority","Other"]'::jsonb,0,
   'Loss reasons must describe the actual known outcome. Deliberately changing them distorts business intelligence.',23,true,'scenario','loss_reason_falsification',true),

  (v_module,'A qualifying sale is ready for handoff, but the record contains almost no requirements or stakeholder context. What should happen?',
   '["Handoff immediately and let Delivery rediscover everything","Delete the old notes","Create a blank project","Complete the required CRM/handoff context so Delivery receives the verified commercial truth, goals, requirements, stakeholders, timing and material risks"]'::jsonb,3,
   'A good handoff protects both customer experience and delivery efficiency.',24,true,'scenario','handoff_quality',false),

  (v_module,'Training-system event: the qualifying advance payment has now been independently VERIFIED through the protected workflow. What is the correct CRM principle?',
   '["Keep pretending the deal is unverified forever","Allow the protected downstream workflow to perform the qualifying Won/client handoff, with complete context","Create a second payment","Manually rewrite the lead source first"]'::jsonb,1,
   'Once the required verified condition exists, the approved protected workflow may advance downstream state. The seller still should not bypass that workflow.',25,true,'scenario','verified_handoff',false);

  insert into public.training_acknowledgements(module_id,statement,sort_order,required,active) values
  (v_module,'I will make the ProFox CRM reflect what actually happened, not what I hope will happen.',1,true,true),
  (v_module,'I will search for duplicates, preserve truthful ownership/source data, and never alter lead-source facts for commission or reporting.',2,true,true),
  (v_module,'I will record activities, meetings, stages, next steps, losses and commercial events only from real evidence.',3,true,true),
  (v_module,'I will not invent pricing, discounts, payment terms, technical capability, buyer commitments, results or delivery promises in the CRM.',4,true,true),
  (v_module,'I will never self-verify payment or manually force a protected Won/client transition outside the approved workflow.',5,true,true),
  (v_module,'I will protect customer and company data, keep credentials/secrets out of ordinary CRM fields, and use only authorized systems.',6,true,true),
  (v_module,'When the correct action is unclear or outside my authority, I will document the facts and escalate instead of bypassing controls.',7,true,true);
end $$;
