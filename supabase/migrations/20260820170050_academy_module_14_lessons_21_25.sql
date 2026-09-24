-- Module 14 lessons 21–25 · Phase 5 — Outcome & Handoff

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'When an Objection Appears, Stop Closing',$md$
## Objective
Recognize when the buyer is no longer decision-ready and return to objection-handling behavior.

## Operating rule
**An unresolved objection means the close is not ready.**

Buyer: “I still don’t know if I’m comfortable with the investment.”

Do not intensify the close. Return to Module 13:
**PAUSE → CLARIFY → VALIDATE → ISOLATE → RESPOND → CONFIRM.**

Only after the concern is genuinely resolved should you reassess readiness.

### Example
Seller: “Would you like us to prepare the quotation?”
Buyer: “I’m worried the team won’t actually use the system.”
Correct response: explore adoption risk. Do not answer, “You’ll love it—shall I send the invoice?”

### Mistakes to avoid
- treating objections as resistance to overpower;
- repeating the same close after the buyer says no;
- negotiating before understanding;
- moving to quotation while a major concern remains unresolved.

### Practice prompt
Write the first three sentences you would use when a new trust objection appears immediately after your closing ask.
$md$,21,true),

  (v_module,'Turn “I Need to Think” Into Clarity',$md$
## Objective
Respect genuine thinking time while avoiding vague pipeline limbo.

## Operating rule
**Clarify what needs thinking, then establish a real next step.**

Buyer: “I need to think about it.”
Seller: “Of course. What specifically would you like to think through before you’re comfortable deciding?”

Possible underlying issues include price, stakeholder alignment, scope, timing, trust or comparison.

If the buyer genuinely needs time, ask when they realistically expect to decide and agree the appropriate follow-up.

### Do not
- create a today-only discount;
- say “What is there to think about?”;
- schedule fake follow-ups every few days;
- leave CRM as “hot” without a reason/date.

### Practice prompt
Write a professional follow-up commitment for a buyer who needs one week to review the decision with a partner.
$md$,22,true),

  (v_module,'Mutual Next Steps Need Owner, Date and Outcome',$md$
## Objective
End every qualified closing conversation with a precise next action.

## Operating rule
Use **ACTION → OWNER → DATE → EXPECTED OUTCOME**.

Weak: “I’ll send something and follow up next week.”

Strong: “We’ll prepare the approved quotation by Tuesday. You and your partner will review it Wednesday, and we’ll reconnect Thursday at 3 PM to resolve any final commercial questions and decide whether to proceed.”

The next step must be mutual—not a seller task that the buyer never agreed to.

### CRM minimum
Record:
- buyer decision/status;
- remaining condition;
- next action;
- owner;
- target date/time;
- stakeholder involved;
- quotation/technical/payment dependency.

### Practice prompt
Rewrite three vague next steps into ACTION → OWNER → DATE → OUTCOME format.
$md$,23,true),

  (v_module,'A Clear No Is Better Than a Fake Opportunity',$md$
## Objective
Close the loop professionally when the answer is no, not now or not a fit.

## Operating rule
**Truthful pipeline data is more valuable than false momentum.**

If the buyer clearly declines:
“Understood. Thank you for being clear. If you’re comfortable sharing it, what was the main reason so I can record the outcome accurately?”

Possible outcomes:
- Closed Lost — competitor;
- Closed Lost — budget;
- Closed Lost — no priority;
- Nurture — legitimate future date;
- Disqualified — poor fit;
- Technical no-fit;
- internal cancellation.

Do not argue after a final decision. Respect explicit no-contact immediately.

### Mistakes to avoid
- keeping a lost deal in active pipeline;
- inventing a follow-up date;
- recording a false loss reason;
- pressuring after a clear no;
- treating “not a fit” as salesperson failure.

### Practice prompt
Write CRM outcomes for: explicit no, six-month budget cycle, technical incompatibility and buyer no-contact request.
$md$,24,true),

  (v_module,'Phase 5 Checkpoint — Close the Decision, Protect the Handoff',$md$
## Objective
Connect ethical closing to the formal quotation, payment and delivery system.

## Operating rule
**Closing is the beginning of delivery trust.**

The correct business flow remains:
**Decision clarity → Formal quotation → Approved acceptance → Approved payment workflow → Payment verification → Protected Won transition → Client/Project handoff.**

The seller must never manually create a stronger state than the verified business event supports.

### Final mastery checklist
Before leaving Module 14, you should be able to:
- judge readiness;
- ask clearly;
- pause and listen;
- distinguish intent from formal commitment;
- return to objection handling when needed;
- protect pricing, scope, technical and payment authority;
- recommend the right fit regardless of commission;
- accept no/not-yet professionally;
- record mutual next steps precisely;
- hand the opportunity into Module 15 without fabricating `Won`.

### Practice prompt
Run a complete close from 30-second recap through the exact next CRM action for three outcomes: **Yes**, **Not Yet**, and **No**.

**Final standard:** Closing is leadership, not pressure. Ask clearly, listen carefully, record truthfully and move only through the approved workflow.
$md$,25,true);
end $$;
