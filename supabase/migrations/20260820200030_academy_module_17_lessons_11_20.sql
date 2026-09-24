-- Module 17 lessons 11–20 — qualification, opportunities, meetings and pipeline truth

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Qualification Comes Before Opportunity Creation',$md$
## Objective
Know when a lead is ready to become an opportunity.

## Operating rule
**An opportunity represents a qualified commercial pursuit—not simply a company you hope will buy.**

Before conversion, confirm enough evidence around problem, relevance, fit, priority, buying path and a legitimate next step. Qualification does not require every detail to be known, but it must be stronger than “they replied.”

### Example
A prospect asks for your portfolio but has not described a problem or project. Keep learning. A prospect confirms an outdated site is hurting enquiries, wants to improve it this quarter, and agrees to a discovery meeting: that can justify qualification if the rest of the fit is sound.

### Mistakes to avoid
- converting every positive reply;
- creating opportunities to inflate pipeline value;
- qualifying based on company size alone;
- hiding disqualifying facts in Notes instead of recording the correct outcome.

### Practice prompt
List the evidence that would make you comfortable converting a lead after discovery.
$md$,11,true),

  (v_module,'Convert Without Losing the Story',$md$
## Objective
Carry accurate lead context into the opportunity.

## Operating rule
**Conversion should preserve history and improve clarity, not start the record from zero.**

The opportunity should retain the relevant company, contact, source, service interest and qualification context. The lead history remains useful evidence of how the relationship began.

Use the protected conversion workflow where available rather than manually creating a disconnected opportunity and changing the lead separately.

### Example
The lead came from your own verified research and personalized outreach. Preserve the truthful source and self-generated flag when converting. Do not change the source to improve commission eligibility.

### Practice prompt
Name five fields/history items you would verify immediately after conversion.

**Integrity rule:** conversion must never rewrite how the lead was actually acquired.
$md$,12,true),

  (v_module,'Opportunity Stages Must Match Real Milestones',$md$
## Objective
Move opportunities based on evidence.

## Operating rule
**Stage is a business milestone, not a probability guess.**

Current ProFox opportunity stages include:
Qualified → Meeting Scheduled → Requirements Confirmed → Quotation Sent → Negotiation / Decision Pending → Awaiting Advance Payment → Won.

Advance only when the event represented by the stage has actually happened. A meeting booked is not “Requirements Confirmed.” A quotation drafted is not “Quotation Sent.” A buyer saying “I paid” is not “Won.”

### Practice prompt
For each stage above, write the observable event that should justify entering it.

**Standard:** a manager should be able to trust the pipeline without reading every note.
$md$,13,true),

  (v_module,'Probability Does Not Override Evidence',$md$
## Objective
Use probability as supporting context, never as a substitute for stage truth.

## Operating rule
**Do not force stage or status because you personally feel confident.**

A salesperson may feel 90% sure a buyer will proceed, but the CRM must still reflect the buyer's actual milestone. Forecast confidence and operational state are different things.

### Mistakes to avoid
- “They love us, so I moved it to Awaiting Payment.”
- setting Won because the verbal conversation sounded final;
- reducing a truthful loss to Open because you hope they return;
- using probability to hide unresolved objections.

### Practice prompt
A buyer says, “This looks right; I need my partner to approve it Friday.” What stage and next step would you record, and why?
$md$,14,true),

  (v_module,'Discovery Belongs in Structured CRM Context',$md$
## Objective
Turn discovery into information that drives the next decision.

## Operating rule
**Record the buyer's requirements, problems, decision path, commercial context, timing and next step—not a transcript dump.**

Useful discovery information includes:
- current situation;
- problem/gap;
- business impact;
- desired outcome;
- why now;
- decision-makers;
- requirements/scope direction;
- commercial constraints where disclosed;
- timeline;
- remaining unknowns;
- next step.

### Example
“Needs better site” is weak. “Owner says mobile visitors struggle to request quotes; improving qualified enquiries before October campaign is priority; owner + operations lead approve; integration feasibility still needs confirmation” is usable.

### Practice prompt
Compress a five-minute discovery conversation into six factual CRM lines.
$md$,15,true),

  (v_module,'Schedule Meetings Through the Meeting Workflow',$md$
## Objective
Keep meeting timing and CRM activity synchronized.

## Operating rule
**Use the ProFox meeting workflow for scheduled customer meetings; do not rely on a note saying a call is booked.**

Verify meeting type, attendee, salesperson, start/end time, timezone, provider/link and related lead/opportunity. Respect working hours, buffers and current meeting settings.

The ProFox Calendar is the source of truth for internal meeting scheduling even when the provider is Manual.

### Mistakes to avoid
- ignoring the customer's timezone;
- manually inventing a meeting URL when the provider process says otherwise;
- scheduling conflicting times;
- leaving the opportunity stage unchanged after a genuinely scheduled sales meeting when the workflow should advance it.

### Practice prompt
What would you check before saving a discovery meeting with a buyer in another timezone?
$md$,16,true),

  (v_module,'Finalize Meeting Outcomes, Don’t Just Mark Complete',$md$
## Objective
Make completed meetings useful to the next person and next action.

## Operating rule
**A completed meeting should capture outcome + requirements + decision context + timeline + next step.**

A meeting marked Completed with empty outcome fields creates false operational certainty. The follow-up should be based on what actually happened.

### Example
After discovery, record the identified problem, confirmed requirements, decision-maker situation, commercial notes, timeline and agreed action. If no next meeting is agreed, state what is pending and who owns it.

### Practice prompt
Write a meeting outcome for a buyer who likes the direction but needs technical integration confirmation before scope can be finalized.

**Standard:** meeting completion is a knowledge handoff, not a checkbox.
$md$,17,true),

  (v_module,'Record Objections Without Turning Them Into Labels',$md$
## Objective
Preserve meaningful objection context without misrepresenting the buyer.

## Operating rule
**Record the concern, what was clarified, what remains unresolved and the agreed next step.**

Avoid emotional or disrespectful notes such as “cheap client,” “difficult buyer” or “doesn't understand websites.” CRM notes may be seen by colleagues and can become part of an audit trail.

### Example
Better: “Buyer concerned about upfront cash flow. Confirmed current approved milestone structure; no unauthorized alternative offered. Buyer will review with finance lead by Tuesday.”

### Practice prompt
Rewrite: “Client keeps complaining about price and is wasting time.”

**Professional standard:** describe the sales fact, not your frustration.
$md$,18,true),

  (v_module,'Lost and Not Qualified Are Useful Truths',$md$
## Objective
Close records accurately when the sales process should stop.

## Operating rule
**A truthful loss is better than a fake open opportunity.**

Use Not Qualified when the prospect fails qualification. Use Lost when a qualified opportunity ends without a sale, and record the primary reason accurately when the workflow asks for it.

Do not keep a deal Open because you do not want your conversion rate to fall. Do not create a fake follow-up date when the buyer clearly said no.

### Possible truthful reasons
budget, competitor, timing, no priority, missing capability, internal cancellation, trust, or poor fit—only when supported by the actual outcome.

### Practice prompt
A buyer chooses another agency and asks you not to follow up. What should the CRM show?
$md$,19,true),

  (v_module,'Phase Checkpoint — Opportunity and Meeting Discipline',$md$
## Objective
Confirm you can operate the middle of the pipeline without creating false momentum.

## Readiness check
You should now be able to:
- decide whether a lead is genuinely qualified;
- convert without changing source truth;
- select an evidence-based opportunity stage;
- record discovery cleanly;
- schedule a meeting with correct timezone/context;
- finalize meeting outcomes;
- document objections professionally;
- close a lost or unqualified record truthfully.

### Scenario
The buyer completed discovery, confirmed requirements and asks for a formal quotation. Correct CRM behaviour is to record discovery, confirm the appropriate stage and next action, then enter the approved quotation workflow. It is not to jump to Won.

### Practice prompt
Explain the difference between **pipeline movement** and **pipeline inflation**.
$md$,20,true);
end $$;
