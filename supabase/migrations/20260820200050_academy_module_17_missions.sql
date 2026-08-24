-- Module 17 — 12 sequential synthetic CRM practice missions.
-- Mission content/scenario data are Admin-editable. Server-side validation semantics remain code-controlled.

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;

  delete from public.crm_training_missions where module_id=v_module;

  insert into public.crm_training_missions(module_id,mission_key,title,objective,instructions,scenario_data,sort_order,active) values
  (v_module,'create_lead','Create the Synthetic Lead','Build a complete lead record from verified prospect information.','Use only the supplied synthetic prospect. Enter the company/contact identity, country, source and service interest. Do not invent facts or use any real customer data.',
   jsonb_build_object('companyName','Northstar Roofing Co.','contactName','Sarah Miller','email','sarah@northstar-example.test','website','https://northstar-example.test','country','United States','industry','Roofing','source','Self-Generated Research','serviceInterest','Website Design & Development'),1,true),

  (v_module,'record_research','Record Research Without Inventing Facts','Turn research into concise factual CRM context.','Record the verified industry, observed problem and research note. Clearly separate what the synthetic source states from what is still unknown.',
   jsonb_build_object('verifiedFact','The synthetic site has no clear mobile quote-request path.','unknown','Budget and final decision-maker are not yet confirmed.','minimumNoteLength',40),2,true),

  (v_module,'log_outreach','Log the First Outreach Activity','Create a truthful outreach history entry.','Choose the channel actually used in the synthetic scenario, add a useful subject and note, and do not claim a reply that has not happened.',
   jsonb_build_object('channel','Email','activityType','Cold Email','context','Personalized email sent about mobile quote-request friction. No reply yet.'),3,true),

  (v_module,'schedule_follow_up','Schedule a Real Next Action','Create an owned follow-up instead of a vague note.','Schedule a future follow-up, state the purpose and keep the lead in a truthful pre-interest status. The timestamp must be in the future.',
   jsonb_build_object('leadStatus','Follow-Up','purpose','Follow up on personalized email and ask whether improving qualified online enquiries is a current priority.'),4,true),

  (v_module,'qualify_convert','Qualify and Convert','Convert only after the synthetic buyer meets the qualification threshold.','The scenario now confirms a relevant business problem, active priority and agreed discovery meeting. Record the qualification reason and create the synthetic opportunity without changing source truth.',
   jsonb_build_object('buyerUpdate','Sarah confirmed inconsistent website enquiries are a Q3 priority and agreed to discovery.','opportunityName','Northstar Roofing — Website Growth System'),5,true),

  (v_module,'record_discovery','Record Discovery Context','Capture structured buyer knowledge that supports the next decision.','Record the problem, desired outcome, confirmed requirements, decision-maker situation, timeline and next step. Do not add an unsupported budget or guarantee.',
   jsonb_build_object('problem','Mobile visitors struggle to request a quote.','desiredOutcome','Increase qualified quote requests and reduce manual enquiry friction.','decisionMakers','Sarah recommends; owner Daniel gives final approval.','timeline','Target launch before the October campaign.','nextStep','Confirm integration requirements, then prepare the approved recommendation.'),6,true),

  (v_module,'schedule_meeting','Schedule the Synthetic Meeting','Use complete meeting context and timezone awareness.','Create a Discovery Meeting with attendee identity, future start/end times, timezone and purpose. End time must be after start time.',
   jsonb_build_object('meetingType','Discovery Meeting','attendeeName','Sarah Miller','attendeeEmail','sarah@northstar-example.test','timezone','America/New_York'),7,true),

  (v_module,'advance_pipeline','Advance Only to the Earned Stage','Use evidence—not optimism—to select the opportunity stage.','Discovery requirements are now confirmed. Select the stage earned by that event and record the next action. Do not jump to Quotation Sent, Awaiting Advance Payment or Won.',
   jsonb_build_object('expectedStage','Requirements Confirmed','nextAction','Prepare recommendation and quotation only after scope/commercial checks are complete.'),8,true),

  (v_module,'record_objection','Record an Objection and Next Step','Document buyer concern professionally without inventing resolution.','The buyer is concerned about cash flow. Record the concern, the approved response boundary and the exact next step. Do not invent a discount or payment plan.',
   jsonb_build_object('concern','Buyer is concerned about upfront cash flow.','boundary','No unauthorized discount or payment schedule change may be promised.','nextStep','Buyer reviews the approved commercial structure with the owner; reconnect after that review.'),9,true),

  (v_module,'record_quotation','Record Quotation State Truthfully','Distinguish a sent quotation from acceptance.','The approved quotation has now been sent. Record the formal quotation reference and move only to Quotation Sent. Create a quotation follow-up; do not mark it accepted or paid.',
   jsonb_build_object('quotationReference','TRAIN-Q-017-001','expectedStage','Quotation Sent','activityType','Quotation Follow-Up'),10,true),

  (v_module,'handle_payment_claim','Handle “I Paid” Without Self-Verification','Protect financial truth when the buyer claims payment.','The synthetic buyer says the advance was paid and provides transfer evidence. Choose the correct CRM action. Sales may record the claim and follow up, but may not mark Verified or Won.',
   jsonb_build_object('customerMessage','Paid — transfer receipt attached. Can you start today?','expectedDecision','record_pending_verification','expectedStage','Awaiting Advance Payment'),11,true),

  (v_module,'verified_handoff','Complete the Synthetic Handoff After Verification','Recognize when the protected verification event allows downstream transition.','Training-system event: the qualifying advance payment is now VERIFIED by the protected workflow. Choose the correct next action and complete the synthetic handoff. This simulation never touches production CRM.',
   jsonb_build_object('systemEvent','Verified qualifying advance payment','expectedDecision','advance_after_verified_payment','result','Synthetic opportunity may now be treated as Won and handed off with complete context.'),12,true);
end $$;
