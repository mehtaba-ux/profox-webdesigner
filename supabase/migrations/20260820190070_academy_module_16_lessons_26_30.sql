-- Module 16 lessons 26–30 — Collection, Handoff & Judgment

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Later Milestones Need the Same Discipline',$md$
## Objective
Apply payment integrity throughout the project, not only to the initial advance.

## Operating rule
**Every later milestone follows the same chain: approved trigger → correct request → clear communication → official payment channel → protected verification.**

Do not assume that because the first payment was correct, later payments can be handled casually.

Before a later milestone request:
- verify the accepted commercial schedule;
- confirm the milestone is actually due under the project/commercial process;
- verify earlier payment state;
- use the correct amount and currency;
- use the official request linked to the same commercial truth.

### Example
A Growth engagement has a later Design Milestone. Sales should not request that milestone simply because the calendar reached a certain date if the agreed milestone trigger has not occurred.

### Mistakes to avoid
- requesting milestones early to improve collections;
- skipping a milestone and jumping to Final Payment;
- duplicating an already verified milestone;
- changing later milestone percentages without approval;
- treating a project delay as permission to invent a new schedule.

### Practice prompt
Describe the checks you would perform before requesting a second or third milestone.
$md$,26,true),

  (v_module,'Handle Payment Delay Like a Consultant',$md$
## Objective
Diagnose delayed payment and remove friction without manipulation.

## Operating rule
**Understand the reason for delay before deciding the next follow-up action.**

Possible causes include:
- link/payment-method issue;
- internal procurement/finance approval;
- unclear milestone;
- disputed scope;
- customer cash-flow problem;
- wrong billing information;
- legitimate due date not yet reached;
- unresolved commercial concern.

Useful questions:
“Is anything unclear about this milestone?”
“Did the official request work correctly?”
“Is there an internal approval step we should account for?”

### If the delay reveals an objection
Do not disguise objection handling as payment chasing. Return to the appropriate sales/commercial conversation.

### Avoid
- fake penalties;
- threats not supported by approved terms;
- daily harassment;
- creating multiple requests to force attention;
- promising unauthorized deadline extensions or concessions.

### Practice prompt
A customer is seven days late and has not replied. Outline a professional follow-up sequence that stays within approved ProFox policy.
$md$,27,true),

  (v_module,'Special Payment Requests — Know When to Escalate',$md$
## Objective
Distinguish normal payment execution from a financial/commercial exception.

## Operating rule
**If the request changes who pays, how much, when, in what currency, through which channel, or what the payment means, verify authority before agreeing.**

Examples that may require escalation:
- “Can I pay a personal account?”
- “Can we split this into a different schedule?”
- “Can another company be the payer?”
- “Can we change the currency?”
- “Can you start before the required payment?”
- “Can you waive the remaining balance?”
- “Can you accept a different method not shown in the approved process?”

Not every unusual request is wrong. The seller’s skill is recognizing that **reasonable request does not equal salesperson authority**.

### Response pattern
**Acknowledge → clarify → record → verify authority → return with approved answer.**

### Practice prompt
Write one sentence you can use whenever a customer asks for a payment exception you are not authorized to approve.
$md$,28,true),

  (v_module,'Full Payment Workflow Rehearsal',$md$
## Objective
Combine all Module 16 skills in one realistic customer case.

## Scenario
You receive:
- an accepted quotation;
- package/custom-scope information;
- current Admin-configured payment schedule;
- customer/currency details;
- prior payment history;
- a customer message asking for the next step.

Your task is to determine:
1. Is payment ready to request?
2. Which milestone/type is correct?
3. What amount/currency should the protected workflow use?
4. What should you say to the customer?
5. Which official payment path is valid?
6. What do you do if the customer reports payment?
7. What counts as verification?
8. What happens after a full qualifying verification?
9. What changes if only a partial amount is confirmed?
10. What requires escalation?

### Self-check
Your answer should never rely on memory, personal accounts, screenshots as verification, manual Won changes or unauthorized commercial promises.

### Practice prompt
Write your complete step-by-step response to this case as if you were handling the live opportunity today.
$md$,29,true),

  (v_module,'Payment Process Readiness — Make It Easy Without Losing Control',$md$
## Objective
Finish Module 16 with a repeatable professional operating standard.

## Operating rule
**Request clearly. Verify independently. Advance only after confirmed payment.**

Before every payment action, remember the framework:
**ACCEPT → PREPARE → CHECK → REQUEST → FOLLOW UP → CONFIRM → VERIFY → ACTIVATE → HANDOFF**

### Final readiness checklist
I can:
- read the accepted commercial truth;
- use the current Admin-configured schedule;
- choose the correct milestone;
- explain payment professionally;
- use official channels only;
- protect customer credentials;
- follow up without pressure;
- interpret CRM states correctly;
- handle partial/failed/mismatched payment safely;
- distinguish Sales communication from Admin verification;
- escalate refunds/disputes/exceptions;
- trust the protected workflow for Won/client handoff.

### Final practice prompt
Teach this entire payment process to a new ProFox seller in two minutes without referring to notes.

> **I never trade financial accuracy for sales speed.**

Fast means the approved workflow has low friction. It never means bypassing control.
$md$,30,true);
end $$;
