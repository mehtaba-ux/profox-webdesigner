-- Module 13 — Objection Handling scenario certification

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  delete from public.training_assessment_questions where module_id=v_module;
  delete from public.training_acknowledgements where module_id=v_module;

  insert into public.training_assessment_questions(module_id,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical) values
  (v_module,'A buyer says, “This seems expensive.” What should the seller do first?',
   '["Pause, acknowledge the concern and clarify what the buyer is comparing the investment with.","Immediately explain every feature in the package.","Offer a discount before the buyer leaves.","Tell the buyer premium work is always expensive."]'::jsonb,0,
   'Price is a surface statement until the seller understands whether the concern is affordability, value, comparison, scope, risk or cash flow.',1,true,'scenario','price_clarify',false),

  (v_module,'A buyer says, “I need to think about it.” What is the best next response?',
   '["Respect it and ask what specifically they would like to think through so you can understand whether anything remains unresolved.","Ask what there is to think about.","Offer a today-only discount.","Schedule three follow-ups without asking."]'::jsonb,0,
   'The seller should create clarity without pressure. “Think about it” may hide investment, stakeholder, comparison, timing or trust concerns—or the buyer may simply need space.',2,true,'scenario','think_about_it',false),

  (v_module,'The buyer raises price, implementation risk and partner approval in one sentence. What should the seller do?',
   '["Acknowledge all three and ask which is the biggest blocker to address first.","Answer all three in one long monologue.","Focus only on price because it is easiest.","Move directly to closing before more objections appear."]'::jsonb,0,
   'Multiple objections should be prioritized and handled one at a time so the seller can diagnose and confirm each concern properly.',3,true,'scenario','multiple_objections',false),

  (v_module,'A prospect says the price is too high. The seller is tempted to offer 20% off even though no discount is approved. What should happen?',
   '["Do not discount. Clarify the concern and use only live, approved pricing or seek the required approval for any exception.","Offer 20% off verbally and update CRM later.","Offer free extras instead because they are not technically a discount.","Tell the prospect the discount is confidential."]'::jsonb,0,
   'A price objection never creates authority to change approved pricing, scope or commercial terms.',4,true,'scenario','unauthorized_discount',true),

  (v_module,'A roofing prospect asks whether the investment will pay for itself. The seller has no buyer-supported conversion or revenue data. Which response is correct?',
   '["Explain that ROI cannot be guaranteed; use only buyer-provided inputs for transparent scenarios and label them as scenarios, not promised outcomes.","Say one extra customer will definitely pay for the project.","Use an industry average as if it were the prospect’s own result.","Invent a conservative ROI number so the buyer feels safer."]'::jsonb,0,
   'ProFox does not fabricate ROI. Value math must use buyer-supported inputs and cannot be presented as guaranteed business performance.',5,true,'scenario','fabricated_roi',true),

  (v_module,'The buyer says there is genuinely no budget until the next fiscal quarter. What is the most professional outcome?',
   '["Clarify the budget timing, document it honestly and agree a legitimate follow-up if the buyer wants one.","Keep proving value until the buyer finds money.","Suggest borrowing because the project is important.","Create artificial urgency so they reprioritize funds."]'::jsonb,0,
   'A real affordability or budget-cycle condition should be respected. The goal is an accurate next step, not pressure.',6,true,'scenario','budget_cycle',false),

  (v_module,'A buyer says, “We can revisit next month.” The seller has no real deadline but wants urgency. What is allowed?',
   '["Ask what changes next month and agree a truthful follow-up if appropriate; do not invent scarcity or deadlines.","Say the current price expires tonight even though it does not.","Claim the delivery calendar is nearly full without checking.","Say competitors will take their market share if they wait."]'::jsonb,0,
   'Urgency must be discovered from real buyer/business conditions. Fabricated deadlines, scarcity or fear are prohibited.',7,true,'scenario','fake_urgency',true),

  (v_module,'A prospect asks whether ProFox can integrate with a proprietary ERP the seller has never seen. What is correct?',
   '["State that it needs technical verification, capture the exact system/version/API requirement and get an accurate answer from the technical team.","Say yes because most modern systems have APIs.","Promise it can be built if the buyer signs first.","Say integration is included in every custom application."]'::jsonb,0,
   'Unknown integrations and technical feasibility must be verified. Objection handling is never permission to invent capability.',8,true,'scenario','unverified_capability',true),

  (v_module,'A website prospect asks, “Can you guarantee first-page Google rankings and a specific number of leads?” What should the seller say?',
   '["No. Explain the approved SEO/conversion approach and what ProFox can control, while being clear that rankings and lead volume are not guaranteed.","Guarantee both if they choose the premium package.","Guarantee rankings but not leads.","Promise a minimum lead number based on similar businesses."]'::jsonb,0,
   'Search rankings, leads and revenue depend on factors outside ProFox control and must not be guaranteed.',9,true,'scenario','guaranteed_outcomes',true),

  (v_module,'A competitor is cheaper. The seller has no evidence about how that competitor delivers projects. What can the seller say?',
   '["Compare verified scope, deliverables, support and assumptions without making claims about the competitor that are not known.","Say the competitor probably outsources everything.","Say cheaper agencies always use bad templates.","Tell the buyer the competitor has security problems."]'::jsonb,0,
   'Competitor comparisons must stay factual. Unsupported claims about another provider are prohibited.',10,true,'scenario','false_competitor_claim',true),

  (v_module,'The prospect says they love their current agency. Which response is appropriate?',
   '["Respect that and ask what prompted this conversation; if there is no meaningful gap, do not manufacture dissatisfaction.","Tell them their current agency is obviously failing because they took the call.","List everything ProFox does better without evidence.","Insult the current agency’s work to create doubt."]'::jsonb,0,
   'Disparaging an incumbent without evidence damages trust. A satisfied buyer may simply not need to change.',11,true,'scenario','unsupported_disparagement',true),

  (v_module,'To prove ProFox quality, a seller wants to screen-share a private client dashboard containing customer names and revenue. What should they do?',
   '["Do not reveal it. Use only authorized, sanitized or public proof that protects client and prospect confidentiality.","Show it briefly but ask the buyer not to take screenshots.","Blur only one customer name and show the rest.","Share it because strong proof is more important than confidentiality."]'::jsonb,0,
   'Confidential client/prospect data cannot be used as sales proof without appropriate authorization and protection.',12,true,'scenario','confidentiality_breach',true),

  (v_module,'A cold prospect says, “Please do not contact me again.” What is the correct response?',
   '["Acknowledge the request, stop sales follow-up and ensure the no-contact instruction is respected in the system.","Ask one last objection-handling question.","Wait a week and try from another channel.","Send a final case study because it is useful information."]'::jsonb,0,
   'An explicit no-contact request is not an objection to overcome. Continued outreach is prohibited.',13,true,'scenario','no_contact',true),

  (v_module,'A buyer only needs a simple credibility website, but the seller earns more commission on the largest package. What should the seller recommend?',
   '["The smallest approved solution that genuinely fits the buyer’s verified requirements, even if commission is lower.","The highest package because more capability is always safer.","Add automation the buyer did not request to justify the larger package.","Hide the smaller option unless the buyer asks."]'::jsonb,0,
   'A knowingly unsuitable recommendation made for commission violates ProFox’s buyer-centered selling standard.',14,true,'scenario','commission_poor_fit',true),

  (v_module,'The buyer still has unresolved concerns, but the seller wants the opportunity to look healthy. How should CRM be updated?',
   '["Record the objection, underlying concern, whether it is unresolved, the required follow-up and the true next step.","Mark the objection resolved so the pipeline progresses.","Remove the objection from notes because it may hurt reporting.","Mark the buyer as verbally committed even though they are not."]'::jsonb,0,
   'CRM must reflect the real buyer state. Falsifying resolution, commitment or next-step information is prohibited.',15,true,'scenario','false_crm_record',true),

  (v_module,'A buyer says cash flow is tight and asks for a payment schedule that is not currently approved. What should the seller do?',
   '["Explain only approved live payment options and seek authorized approval if a different structure is genuinely needed.","Agree to the custom schedule verbally to save the deal.","Promise the schedule and ask finance to honor it later.","Split invoices unofficially without recording the change."]'::jsonb,0,
   'Sellers cannot create commercial/payment terms outside approved authority.',16,true,'scenario','unauthorized_payment_terms',true),

  (v_module,'A buyer says, “We already use HubSpot, so we do not need automation.” What is the best response?',
   '["Ask what, if anything, is missing from the current workflow before deciding whether ProFox should recommend changes.","Explain that HubSpot is not enough and ProFox automation is better.","Recommend replacing HubSpot immediately.","Assume manual follow-up is failing and pitch automation."]'::jsonb,0,
   'The existence of a tool does not prove there is a problem. Diagnose the workflow first; sometimes no change is needed.',17,true,'scenario','automation_tool',false),

  (v_module,'A custom-app buyer asks, “Why not buy existing software?” Existing software appears to satisfy nearly all requirements. What is best?',
   '["Acknowledge that off-the-shelf may be the lower-risk choice and compare only the remaining gaps before recommending custom development.","Insist custom software is always better long term.","Say existing software can never scale.","Recommend custom development because ProFox controls the code."]'::jsonb,0,
   'Professional qualification is two-way. If existing software solves the need better, the seller should not force custom development.',18,true,'scenario','off_the_shelf',false),

  (v_module,'A buyer says, “We were burned by our last agency.” What should the seller do first?',
   '["Ask what happened so the specific risk can be understood before explaining how ProFox addresses it.","Say ProFox is completely different.","Offer a guarantee that nothing will go wrong.","Criticize the previous agency."]'::jsonb,0,
   'The seller must understand whether the previous problem was communication, scope, delivery, promises, quality or something else.',19,true,'scenario','bad_previous_agency',false),

  (v_module,'The buyer says, “I’ve never heard of ProFox. How do I know you will deliver?” What is strongest?',
   '["Use relevant verified proof and explain the delivery/scope/approval process transparently.","Say ProFox is the best agency in the market.","Tell them trust is required in every business relationship.","Offer an unapproved discount to reduce perceived risk."]'::jsonb,0,
   'Trust should be built with verifiable evidence and transparent process, not hype.',20,true,'scenario','trust_proof',false),

  (v_module,'The marketing manager likes the recommendation but says finance must approve. What should the seller do?',
   '["Ask what finance will care about and offer a concise, truthful business/context summary or stakeholder conversation.","Tell the manager they are not the real decision-maker.","Go directly to finance without informing the manager.","Pressure the manager to approve before finance becomes involved."]'::jsonb,0,
   'Internal approval is normal. Help the contact become a strong champion without diminishing or bypassing them.',21,true,'scenario','internal_approval',false),

  (v_module,'A buyer says, “Our current website is fine.” What is the best response?',
   '["Ask what, if anything, would make changing it worthwhile; if there is no meaningful business reason, do not force a redesign.","Tell them the website looks outdated.","Say every website should be rebuilt every three years.","Show a competitor site to create fear."]'::jsonb,0,
   'The seller must discover a meaningful reason to change rather than manufacture one.',22,true,'scenario','website_no_need',false),

  (v_module,'A buyer says, “We don’t want robotic email communication.” What should the seller explain?',
   '["Agree that automation should be selective: automate repetitive consistency where useful and preserve human conversation where it adds value.","Tell them automated email always converts better.","Explain that modern customers prefer bots.","Say automation should replace most manual sales activity."]'::jsonb,0,
   'The goal is the right customer journey, not maximum automation.',23,true,'scenario','robotic_automation',false),

  (v_module,'After a response, the buyer says, “That helps, but I’m still worried about support after launch.” What should happen?',
   '["Keep exploring the support concern and provide only approved support information; do not advance until the material concern is resolved or clearly left open.","Assume the objection is mostly resolved and move to closing.","Repeat the same answer more forcefully.","Offer free support without approval."]'::jsonb,0,
   'Confirmation is part of the framework. A partially resolved objection remains an objection.',24,true,'scenario','confirm_resolution',false),

  (v_module,'The buyer confirms the final material concern is resolved. What is the correct transition?',
   '["Ask for the most useful agreed next step—such as technical validation, stakeholder review, quotation, follow-up or no action—based on the real opportunity state.","Immediately demand a signature.","Create a quotation whether or not the buyer wants one.","Reopen old objections to be safe."]'::jsonb,0,
   'Module 13 resolves resistance. Once concerns are genuinely addressed, the seller can advance to the appropriate decision/closing step taught in Module 14.',25,true,'scenario','advance_after_resolution',false);

  insert into public.training_acknowledgements(module_id,statement,sort_order,required,active) values
  (v_module,'I will understand an objection before responding to it.',1,true,true),
  (v_module,'I will not treat every hesitation, condition, rejection or no-contact request as something that must be overcome.',2,true,true),
  (v_module,'I will not fabricate proof, ROI, capabilities, urgency, guarantees or competitor information.',3,true,true),
  (v_module,'I will not offer pricing, discounts, payment terms, scope or commercial commitments outside my approved authority.',4,true,true),
  (v_module,'I will respect rejection and all explicit stop/no-contact instructions.',5,true,true),
  (v_module,'I will recommend only solutions that genuinely fit the buyer, even when a smaller engagement or no sale is the correct outcome.',6,true,true),
  (v_module,'I will record objections, unresolved risks, buyer decisions and next steps truthfully in the ProFox CRM.',7,true,true);
end $$;
