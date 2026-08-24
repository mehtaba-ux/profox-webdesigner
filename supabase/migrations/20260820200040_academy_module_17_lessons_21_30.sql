-- Module 17 lessons 21–30 — commercial truth, security, handoff and CRM independence

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Quotation Status Must Reflect the Commercial Workflow',$md$
## Objective
Keep CRM stage aligned with the real quotation state.

## Operating rule
**Drafted, sent, accepted and superseded quotations are different events.**

A quotation being prepared does not justify “Quotation Sent.” A quotation sent does not mean accepted. If a corrected version replaces an earlier one, the current approved version controls the commercial truth.

Use the formal Quotation Process from Module 15. Do not duplicate quotation totals into free-text CRM notes as if they are authoritative.

### Practice prompt
A quotation was drafted Friday, approved Monday and sent Tuesday. When should the opportunity enter Quotation Sent, and what should the next activity be?

**Standard:** CRM stage follows the real document event.
$md$,21,true),

  (v_module,'Never Edit Commercial Truth From Memory',$md$
## Objective
Protect price, scope, payment terms and package truth.

## Operating rule
**Use the live Sales Catalog and accepted quotation—not remembered training examples.**

Prices, add-ons, payment schedules and package rules can change. The CRM should point to or reflect the current approved commercial record. Sales may not invent a discount, add-on, payment split, expiry or delivery promise.

If the buyer asks for an exception, record the request accurately and escalate through the approved authority. Do not quietly alter the opportunity value to make the request appear approved.

### Practice prompt
What should you record when a buyer asks for a payment structure that is different from the accepted quotation?
$md$,22,true),

  (v_module,'Payment State Is Protected Financial Truth',$md$
## Objective
Understand the CRM boundary around payment.

## Operating rule
**Customer says paid ≠ payment verified.**

Sales may send the approved payment request, follow up and record communication. Sales may not set payment to Verified, force Won or create downstream client state based on a screenshot or message.

The protected workflow is:
**Commercial acceptance → payment submitted/received → payment verification → qualifying protected transition → Won/client handoff.**

### Critical mistake
Changing an opportunity to Won before the approved verified-payment condition is satisfied is not “helping the project start faster.” It corrupts financial and operational truth.

### Practice prompt
A buyer sends a transfer screenshot and says “start today.” What do you update, what do you not update, and what do you tell the buyer?
$md$,23,true),

  (v_module,'Won Is a Protected Business Event',$md$
## Objective
Know why Won cannot be manually manufactured.

## Operating rule
**Only the approved protected business workflow may establish Won when the required condition is satisfied.**

Won can trigger client creation, project handoff, reporting and commission consequences. That makes it a security-sensitive state, not a motivational pipeline stage.

The application intentionally blocks ordinary seller code from manually forcing this state. If the buyer has accepted but payment is still pending verification, the CRM should stay at the truthful pre-Won stage.

### Practice prompt
Explain to a new salesperson why “the customer agreed” and “the opportunity is Won” are not always the same event.
$md$,24,true),

  (v_module,'Protect Customer and Company Data',$md$
## Objective
Operate the CRM without turning it into a security risk.

## Operating rule
**Record the minimum business information needed for the sales process; never store secrets in CRM notes.**

Do not place passwords, PINs, OTPs, card credentials, private API keys, identity documents or unnecessary sensitive personal information in ordinary CRM fields.

Respect role permissions. Do not export customer lists, copy records to personal tools, share screenshots casually or access records you do not need for your role.

### Practice prompt
A customer sends an admin password in WhatsApp while discussing a future project. What should you do instead of pasting it into the opportunity Notes field?

**Standard:** useful CRM context without secret leakage.
$md$,25,true),

  (v_module,'Ownership and Handoffs Must Be Explicit',$md$
## Objective
Make responsibility visible during sales transitions.

## Operating rule
**Every important next action has an owner. Every handoff carries context.**

When responsibility changes, the CRM should make it clear who owns the record/action and what the receiving person needs to know. Do not reassign a lead simply to remove overdue work from your dashboard.

A strong sales-to-delivery handoff includes the verified commercial record, buyer goals, confirmed requirements, stakeholders, timing, material risks and promises actually approved.

### Practice prompt
List the information Delivery should receive after a correctly verified sale without needing to re-interview Sales about basic facts.
$md$,26,true),

  (v_module,'CRM Hygiene Is Daily Sales Work',$md$
## Objective
Build a repeatable routine that keeps the pipeline usable.

## Operating rule
**Update the CRM close to the event, then review your open commitments regularly.**

A daily CRM hygiene routine can include:
- complete activities actually done;
- record material call/email outcomes;
- create the next action where appropriate;
- resolve overdue tasks;
- update stages only from evidence;
- close dead records truthfully;
- inspect meetings and follow-ups ahead;
- correct obvious data-quality issues.

### Mistakes to avoid
Waiting until Friday to reconstruct the week from memory or mass-completing overdue activities without doing the work.

### Practice prompt
Design a 10-minute end-of-day CRM routine for yourself.
$md$,27,true),

  (v_module,'Reporting Is Only as Good as the Records',$md$
## Objective
Understand how seller behaviour affects Management decisions.

## Operating rule
**Dashboards summarize CRM truth; they cannot repair false inputs.**

Inflated stages, missing loss reasons, false activity completion, wrong source data and stale open opportunities distort conversion rates, pipeline health, forecasting, commission analysis and staffing decisions.

Do not “clean” metrics by changing underlying facts. Correct the record only when the record itself is wrong and you have the evidence/authority to correct it.

### Practice prompt
Name three business decisions that could be harmed by sellers marking opportunities Won too early.
$md$,28,true),

  (v_module,'Know When to Escalate Instead of Improvise',$md$
## Objective
Work independently without exceeding your authority.

## Operating rule
**Independence means knowing the normal workflow and recognizing the exception.**

Escalate when you encounter material conflicts such as:
- duplicate ownership you cannot resolve;
- unsupported technical commitments;
- requested commercial exceptions;
- payment mismatches;
- suspected data/privacy incident;
- a protected state that appears wrong;
- conflicting customer identities;
- a workflow action your role cannot legitimately perform.

Do not bypass controls because the customer is impatient.

### Practice prompt
Give one example where escalation is faster and safer than trying to “fix” the CRM yourself.
$md$,29,true),

  (v_module,'Final Operating Standard — Make the CRM Tell the Truth',$md$
## Objective
Combine the whole Module 17 operating model into one repeatable standard.

## ProFox CRM operating loop
**CAPTURE → VERIFY → ACT → RECORD → ADVANCE → PROTECT → HANDOFF**

1. **CAPTURE** the right record and useful context.
2. **VERIFY** identity, source, facts and current commercial state.
3. **ACT** through the approved workflow.
4. **RECORD** what actually happened and the next commitment.
5. **ADVANCE** status/stage only when the milestone is real.
6. **PROTECT** permissions, customer data, money and protected states.
7. **HANDOFF** complete context when responsibility changes.

### Certification standard
After these lessons you will practise the lifecycle with synthetic data. The sandbox is intentionally isolated from live CRM records. Passing the practice missions demonstrates process skill; it does not grant permission to bypass production controls.

### Final practice prompt
Before touching any CRM field, ask: **“What is the business truth, what evidence supports it, and what approved action should happen next?”**

**Remember:** accurate CRM work is part of selling professionally.
$md$,30,true);
end $$;
