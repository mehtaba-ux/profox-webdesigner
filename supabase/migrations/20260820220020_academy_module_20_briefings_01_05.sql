-- Module 20 certification briefings 01–05

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='final-certification';
 if v_module is null then raise exception 'Module 20 final-certification is missing.'; end if;
 delete from public.training_lessons where module_id=v_module;
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
 (v_module,'Certification Is About Judgment',$md$
## Objective
Understand what the final certification measures.

This capstone does not reward memorising labels. You must demonstrate that you can decide:
- what matters now;
- what should happen next;
- what should **not** happen;
- what requires verification;
- what requires escalation;
- what must be recorded for the next authorized person.

## Operating rule
**Know → Decide → Execute → Record.**

A certified ProFox seller can combine the Academy into one operating system under pressure. If a buyer creates urgency, the standard does not disappear. If a deal is valuable, commercial truth does not bend. If the CRM looks weaker after an honest update, truth still wins.

### Practice prompt
Think of one situation where the fastest action is not the best action. What must be verified first?

**Certification standard:** good judgment must survive pressure.
$md$,1,true),
 (v_module,'Customer Outcome Before Seller Activity',$md$
## Objective
Stop optimizing for visible activity when the buyer has not genuinely progressed.

## Operating rule
**The goal is legitimate customer progress—not attractive activity counts.**

Do not optimize for:
- number of calls;
- meeting count;
- quotation count;
- pipeline appearance;
- moving stages early.

Instead ask:
> What must genuinely become true before this opportunity belongs in the next stage?

A seller can send 100 generic messages and create little value. Another seller can research fewer high-fit accounts, send relevant outreach, run better discovery and create more qualified opportunities.

### Practice prompt
Name three actions that can make a dashboard look busy without creating legitimate buyer progress.

**Certification standard:** activity supports revenue; it does not replace it.
$md$,2,true),
 (v_module,'Diagnose Before Prescribing',$md$
## Objective
Apply the discovery operating map before recommending a solution.

## Operating rule
Use the full discovery logic:
**CURRENT → GAP → IMPACT → OUTCOME → WHY NOW → DECISION → FIT → NEXT STEP**

Do not recommend because a prospect sounds interested. Learn enough to connect the recommendation to a real business outcome.

A strong seller can distinguish:
- a symptom from the underlying problem;
- a feature request from the desired outcome;
- curiosity from buying intent;
- an influencer from the final decision-maker.

### Practice prompt
If a prospect says “we need a new website,” list four things you still need to understand before recommending a package.

**Certification standard:** diagnosis earns the right to prescribe.
$md$,3,true),
 (v_module,'Recommend, Don’t Dump Options',$md$
## Objective
Turn discovery into a confident, evidence-based recommendation.

## Operating rule
**Recommend the best-fit current ProFox direction and explain why.**

Do not dump the full catalog and ask the buyer to solve the problem themselves.

A strong recommendation connects:
**problem → requirement → ProFox direction → business value → validation/next step**

Use the live Sales Catalog. If a feature, integration or scope detail is uncertain, say what needs validation instead of inventing certainty.

### Practice prompt
Write the first two sentences of a recommendation that begins with the buyer’s stated outcome rather than a package name.

**Certification standard:** fit beats commission size.
$md$,4,true),
 (v_module,'Handle Resistance Without Fighting',$md$
## Objective
Apply objection handling as diagnosis rather than argument.

## Operating rule
**PAUSE → CLARIFY → VALIDATE → ISOLATE → RESPOND → CONFIRM → ADVANCE**

When a buyer says “too expensive,” do not assume the objection is purely price. It may be comparison, risk, internal justification, timing, budget or uncertainty about value.

Do not:
- become defensive;
- immediately discount;
- talk over the buyer;
- manufacture urgency.

### Practice prompt
What question would you ask before responding to “Your competitor is cheaper”?

**Certification standard:** understand the resistance before answering it.
$md$,5,true);
end $$;
