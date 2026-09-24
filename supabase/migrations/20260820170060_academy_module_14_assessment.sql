-- Module 14 — Closing Training scenario certification

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;

  delete from public.training_assessment_questions where module_id=v_module;
  delete from public.training_acknowledgements where module_id=v_module;

  insert into public.training_assessment_questions(module_id,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical) values
  (v_module,'A buyer likes the solution, but the seller still does not know who controls final budget approval. What is the best next move?',
   '["Push for verbal commitment before finance gets involved.","Clarify the decision process and close for the appropriate stakeholder/approval step before asking for final commercial commitment.","Send an invoice immediately.","Mark the opportunity as highly likely to close and move on."]'::jsonb,1,
   'Closing readiness requires decision-process clarity. Missing budget authority is a reason to resolve stakeholder alignment, not increase pressure.',1,true,'scenario','readiness_missing_authority',false),

  (v_module,'The prospect says, “This looks amazing.” What should the seller conclude?',
   '["The deal is effectively Won.","The buyer has approved the quotation.","It is positive interest, but the seller should still verify the exact commitment and next decision.","Payment intent can be assumed."]'::jsonb,2,
   'Positive sentiment is not formal commitment. The seller must clarify what the buyer is actually ready to do next.',2,true,'scenario','interest_not_commitment',false),

  (v_module,'The Marketing Manager is aligned, but the owner gives final approval. What is the correct close?',
   '["Close for an owner/stakeholder review with the aligned Marketing Manager rather than asking them to approve beyond their authority.","Ask the Marketing Manager to sign anyway.","Bypass them and contact the owner privately.","Treat the manager’s enthusiasm as final approval."]'::jsonb,0,
   'A professional close asks for the correct next commitment from the person who actually has authority.',3,true,'scenario','stakeholder_close',false),

  (v_module,'All major concerns are resolved and the buyer understands the recommended direction. Which closing question is strongest?',
   '["Do you think maybe we should keep talking about features?","Would you like a discount before deciding?","I’ll activate the project now unless you object.","Would you like us to move forward and prepare the formal quotation based on the agreed scope?"]'::jsonb,3,
   'A qualified buyer deserves a clear stage-appropriate ask. Preparing the formal quotation is the correct next step when scope direction is agreed.',4,true,'scenario','clear_ask',false),

  (v_module,'The seller asks, “Would you like us to prepare the quotation?” The buyer pauses for several seconds. What should the seller do?',
   '["Immediately offer a concession.","Stay quiet and listen rather than negotiating against yourself.","Repeat the question louder.","Start explaining features again."]'::jsonb,1,
   'ASK → SILENCE → LISTEN. A pause usually means the buyer is thinking, not that the seller must fill the space.',5,true,'scenario','closing_silence',false),

  (v_module,'A buyer says, “Yes, this works for me.” The quotation has not yet been issued. What should the seller do?',
   '["Mark Won.","Record payment as pending verification.","Clarify whether the buyer is approving the recommended direction/quotation preparation or expressing some stronger formal commitment.","Create the client immediately."]'::jsonb,2,
   'The seller must define what “yes” means. Approval of direction is not the same as formal quotation acceptance, payment or Won.',6,true,'scenario','ambiguous_yes',false),

  (v_module,'A custom-app deal still needs technical validation of a required integration. What commitment should the seller seek?',
   '["A technical validation/scoping commitment before attempting the full commercial close.","Full implementation payment immediately.","A promise that the buyer will sign if the integration probably works.","Won status because the buyer is interested."]'::jsonb,0,
   'The correct close is the next legitimate commitment. Unverified feasibility makes technical validation the appropriate stage.',7,true,'scenario','commitment_ladder',false),

  (v_module,'The buyer is qualified, major objections are resolved and all stakeholders are aligned. Which is an appropriate direct close?',
   '["What is stopping you from signing right now?","If you do not decide today we may not have space.","I assume you want the biggest package, so I’ll prepare it.","Are you comfortable moving forward with this direction?"]'::jsonb,3,
   'Directness is appropriate when readiness is real. The question should be clear without being aggressive or assumptive.',8,true,'scenario','direct_close',false),

  (v_module,'After a long evaluation cycle, what is the best use of a summary close?',
   '["Replay the entire deck.","Briefly reconnect the buyer’s agreed priorities to the recommended direction, then ask for the next decision.","Add new features to increase excitement.","Compare competitors again."]'::jsonb,1,
   'A summary close reduces complexity by reconnecting the decision to the buyer’s own priorities.',9,true,'scenario','summary_close',false),

  (v_module,'The buyer can afford Premium, but the verified requirements are fully met by the Business-level direction. What should the seller recommend?',
   '["Premium because the commission is higher.","Add unnecessary scope so Premium appears justified.","Recommend the best-fit Business-level direction even though commission is lower.","Hide the smaller option."]'::jsonb,2,
   'Knowingly steering a buyer to an unsuitable larger package for commission violates the ProFox closing standard.',10,true,'scenario','commission_poor_fit',true),

  (v_module,'Month-end is tomorrow and the seller wants the prospect to decide faster. There is no real deadline. What is allowed?',
   '["Use only genuine buyer/business timing and never invent scarcity, expiring pricing or delivery pressure.","Say pricing expires tonight.","Claim only one project slot remains without checking.","Tell the buyer month-end approval is mandatory."]'::jsonb,0,
   'False urgency/scarcity is prohibited. Seller targets never become buyer deadlines.',11,true,'scenario','fake_urgency',true),

  (v_module,'A buyer asks for 20% off if they approve today. The seller has no authority to discount. What should happen?',
   '["Offer 10% instead.","Give free extras rather than a discount.","Agree verbally and request approval later.","Keep to approved pricing, clarify the commercial concern and escalate any genuine exception for authorized review."]'::jsonb,3,
   'Closing pressure does not create discount authority. Unauthorized pricing changes are a critical failure.',12,true,'scenario','unauthorized_discount',true),

  (v_module,'The buyer asks for a payment schedule different from the approved live terms. What is the correct response?',
   '["Promise it if they sign.","Explain only approved live terms and request authorized review for any exception.","Create unofficial split invoices.","Tell finance after the buyer pays."]'::jsonb,1,
   'Sellers cannot invent payment terms. Exceptions require authorized review.',13,true,'scenario','unauthorized_payment_terms',true),

  (v_module,'The buyer says, “If your platform definitely integrates with our proprietary ERP, we’ll proceed.” The integration has not been verified. What should the seller do?',
   '["Say yes because most ERPs expose APIs.","Promise it conditionally after payment.","Treat technical validation as the remaining condition and verify the exact integration before making a commitment.","Mark the opportunity as accepted because the buyer expressed intent."]'::jsonb,2,
   'An unverified integration must remain a condition. Closing never authorizes invented technical certainty.',14,true,'scenario','unverified_technical_commitment',true),

  (v_module,'The buyer asks, “If we choose ProFox, can you guarantee this will double our leads?” What is correct?',
   '["Do not guarantee uncontrolled outcomes; explain what ProFox can control and keep business projections clearly evidence-based and non-guaranteed.","Guarantee it only for the largest package.","Promise a smaller number of leads.","Say similar clients doubled leads even if that evidence is unavailable."]'::jsonb,0,
   'Guaranteed leads, revenue, rankings or other uncontrolled outcomes are prohibited.',15,true,'scenario','guaranteed_outcomes',true),

  (v_module,'The buyer wants a feature that is not in the agreed scope. The seller believes saying it is included will secure the deal. What should happen?',
   '["Say it is included and adjust delivery later.","Hide the scope difference in the quotation.","Promise it verbally but omit it from CRM.","State the scope accurately and route any addition through the approved scope/commercial process."]'::jsonb,3,
   'Misrepresenting deliverables to close a deal creates delivery and trust risk and is a critical failure.',16,true,'scenario','scope_misrepresentation',true),

  (v_module,'The buyer clearly says, “No, we are not proceeding and do not keep trying to sell this to us.” What should the seller do?',
   '["Ask for one more objection round.","Respect the decision, stop pressure/follow-up as required and record the outcome truthfully.","Offer a final discount.","Contact another stakeholder immediately."]'::jsonb,1,
   'Pressure after explicit rejection/no-contact violates the ProFox standard.',17,true,'scenario','pressure_after_no',true),

  (v_module,'A seller sourced the lead from a company-provided list but wants the self-generated commission bonus. What is permitted?',
   '["Change lead source after the deal closes.","Ask the buyer to say they found the seller directly.","Keep the actual source truthful even if it reduces commission.","Leave the source blank until payout."]'::jsonb,2,
   'Lead-source and commission eligibility must be truthful. Manipulating source data is a critical integrity failure.',18,true,'scenario','falsify_lead_source',true),

  (v_module,'The buyer verbally agrees to proceed, but the formal quotation has not been accepted and the required verified commercial/payment condition has not occurred. What should the seller do?',
   '["Do not mark Won; record the actual commitment and continue through the protected quotation/payment workflow.","Mark Won to improve forecast accuracy.","Create the client manually.","Record payment received because verbal intent is strong."]'::jsonb,0,
   'Won is a protected business state. Verbal intent is not sufficient to bypass approved commercial/payment conditions.',19,true,'scenario','premature_won',true),

  (v_module,'The buyer emails, “I sent the payment.” Finance/system verification is still pending. What should the seller record?',
   '["Paid and Won.","Payment verified because the buyer said so.","Client activated.","Payment reported/submitted but not verified; wait for the approved verification workflow before Won/client creation."]'::jsonb,3,
   'Seller-reported payment is not verified payment. Falsifying payment/acceptance state is a critical failure.',20,true,'scenario','false_payment_status',true),

  (v_module,'At the close, the buyer says, “I need to think about it.” What is the best response?',
   '["Create a today-only incentive.","Respect it and ask what specifically they need to think through, then agree a real next step if time is genuinely needed.","Ask why they are wasting time.","Mark the deal Closed Lost immediately."]'::jsonb,1,
   'The seller should create clarity without pressure. Genuine thinking time can be respected with a specific follow-up.',21,true,'scenario','think_about_it_close',false),

  (v_module,'The buyer says, “Send me the proposal.” What should the seller clarify before treating that as meaningful progress?',
   '["Nothing—proposal requested means strong intent.","Only whether they prefer PDF or email.","Who will review it, what it must clarify, what decision follows and when that review will happen.","Whether they want the Premium package."]'::jsonb,2,
   'A proposal request is useful only when the seller understands the buying purpose, stakeholders and next decision.',22,true,'scenario','proposal_without_process',false),

  (v_module,'The buyer says they will “probably review it next week.” The seller records: “Buyer approved; decision Friday at 2 PM,” even though no such commitment was made. What is correct?',
   '["Record only the buyer’s actual statement and agree owner/date/outcome before creating a firm next-step commitment.","Keep the stronger note because it improves follow-up discipline.","Mark the buyer as verbally committed.","Forecast Won for Friday."]'::jsonb,0,
   'CRM next steps and buyer decisions must reflect what was actually agreed. Inventing commitment data is a critical failure.',23,true,'scenario','false_next_step',true),

  (v_module,'The buyer wants a custom application launched in four weeks, but delivery feasibility has not been approved. What is the correct close?',
   '["Promise four weeks if they pay quickly.","Refuse the deal immediately.","Say four weeks is standard.","Treat timeline validation as a condition, document the requested date and confirm feasibility before committing."]'::jsonb,3,
   'A desired timeline can be a real priority, but the seller must not promise an unapproved delivery date.',24,true,'scenario','timeline_condition',false),

  (v_module,'After complete discovery, the seller concludes ProFox cannot responsibly meet a mandatory requirement. What is the strongest closing outcome?',
   '["Disqualify or recommend the appropriate alternative honestly rather than forcing a poor-fit sale.","Hide the limitation until after payment.","Sell a smaller package that still cannot meet the requirement.","Keep the opportunity open indefinitely."]'::jsonb,0,
   'A truthful no-fit decision protects the buyer and ProFox. Closing success includes accurate disqualification.',25,true,'scenario','ethical_disqualification',false);

  insert into public.training_acknowledgements(module_id,statement,sort_order,required,active) values
  (v_module,'I will ask for decisions clearly without using manipulation, pressure or fake scarcity.',1,true,true),
  (v_module,'I will not manufacture urgency, guarantees, buyer commitments, delivery certainty or technical capability.',2,true,true),
  (v_module,'I will only offer approved pricing, discounts, scope, payment schedules and commercial terms.',3,true,true),
  (v_module,'I will recommend the best-fit solution regardless of which option pays me more commission.',4,true,true),
  (v_module,'I will not represent positive intent as formal acceptance, verified payment or Won status before the approved business workflow confirms it.',5,true,true),
  (v_module,'I will respect a clear no, document legitimate future follow-up accurately and never create fake pipeline momentum.',6,true,true),
  (v_module,'I will record buyer decisions, stakeholders, remaining conditions and agreed next steps truthfully in the ProFox CRM.',7,true,true);
end $$;
