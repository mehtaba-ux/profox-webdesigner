-- Module 20 certification briefings 06–10

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='final-certification';
 if v_module is null then raise exception 'Module 20 final-certification is missing.'; end if;
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
 (v_module,'Ask for the Decision Clearly',$md$
## Objective
Lead the buyer toward a clear decision without pressure.

## Operating rule
Use the closing structure:
**READINESS → RECAP → ASK → PAUSE → CLARIFY → COMMIT → HANDOFF**

A strong seller does not hide from the decision. They summarize the agreed problem and direction, ask clearly, then allow the buyer to respond.

Do not:
- beg;
- manipulate;
- create false scarcity;
- invent guarantees;
- offer unauthorized discounts;
- mark a deal closed because an influencer sounded positive.

### Practice prompt
Turn “Let me know what you think” into a clear but respectful decision question.

**Certification standard:** clarity without pressure.
$md$,6,true),
 (v_module,'Commercial Truth Cannot Bend',$md$
## Objective
Keep scope, pricing, payment terms and authority accurate under closing pressure.

## Operating rule
**Never trade accuracy for speed.**

You must know the boundary between:
- standard catalog authority; and
- approval-required exception.

Never improvise:
- package price;
- discount;
- payment schedule;
- scope;
- feature or integration capability;
- delivery date;
- guarantee;
- contract/commercial condition.

The accepted quotation and live Admin-managed catalog are the commercial source of truth.

### Practice prompt
A buyer says they will sign today if you change the payment schedule. What do you do?

**Certification standard:** urgency never creates authority.
$md$,7,true),
 (v_module,'CRM and Calendar Must Tell the Truth',$md$
## Objective
Leave every opportunity operationally understandable.

## Operating rule
Every active opportunity should reveal:
- what happened;
- what matters now;
- what is still unknown;
- the real stage;
- the next action;
- the owner;
- the due time/purpose.

Use the next-step standard:
**ACTION + OWNER + DATE + PURPOSE / EXPECTED OUTCOME**

Do not fabricate calls, meetings, stages or commitments to make performance look stronger.

### Practice prompt
Rewrite “follow up later” into an actionable next step.

**Certification standard:** another authorized team member should understand the deal without guessing.
$md$,8,true),
 (v_module,'Trust Is Part of Sales Performance',$md$
## Objective
Protect customer, company and commercial information while selling quickly.

## Operating rule
Security and confidentiality are not separate from sales performance.

Protect:
- customer/prospect data;
- ProFox internal information;
- credentials and authentication prompts;
- quotation/payment information;
- meeting records;
- files and exports;
- other customers’ confidential information.

If something suspicious happens, use the Module 19 incident mindset:
**STOP → PROTECT → REPORT → PRESERVE → FOLLOW**

### Practice prompt
A prospect sends an admin password during a sales chat. What should happen next?

**Certification standard:** a seller who creates serious security risk is not ready for production access.
$md$,9,true),
 (v_module,'Final Certification Rules',$md$
## Objective
Understand exactly what must be passed.

Final Certification requires:
1. all required Modules 1–19 already Passed/Completed;
2. all 10 certification briefings;
3. all 12 end-to-end synthetic deal missions;
4. the 30-scenario judgment gate at **90/100 or higher with zero critical misses**;
5. all 8 final operating commitments;
6. a three-round live Management buyer simulation;
7. self-assessment before evaluator results;
8. live score **90/100 or higher with zero critical failures**.

No averaging away a dangerous weakness.

A charismatic seller who invents features fails. A strong discovery seller who corrupts payment truth fails. A high scorer who exposes confidential customer information fails.

Passing Module 20 creates **Sales Academy Certified** status only. It does **not** automatically grant production access. Final Approval and the secure activation workflow remain separate.

### Practice prompt
Explain why 100/100 discovery cannot compensate for manually marking a payment Verified.

**Final standard:** **KNOWLEDGE + JUDGMENT + EXECUTION + INTEGRITY.**
$md$,10,true);
end $$;
