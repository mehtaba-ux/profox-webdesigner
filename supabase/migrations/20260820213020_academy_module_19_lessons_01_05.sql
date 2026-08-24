-- Module 19 lessons 01–05 — trust, classification, public data, minimization, access

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='confidentiality-data-protection';
 if v_module is null then raise exception 'Module 19 missing.'; end if;
 delete from public.training_lessons where module_id=v_module;
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
(v_module,'Confidentiality Is a Sales Skill',$md$
## Objective
Treat confidentiality as part of trust, speed and sales quality—not as paperwork.

## Operating rule
**Information customers give ProFox is business trust, not seller property.**

Buyers may disclose revenue, internal workflows, weaknesses, budgets, decision processes, upcoming plans and technical information. Use it only for the legitimate ProFox purpose for which it was received.

### Example
A prospect explains that their current agency misses leads. You may use that fact to diagnose their needs. You may not identify them or repeat their private numbers to another prospect unless ProFox has specifically approved the disclosure.

### Mistakes to avoid
- retelling confidential customer stories;
- using customer information to impress another buyer;
- copying private notes into unrelated conversations;
- assuming “I learned it” means “I own it.”

### Practice prompt
Name three things from a discovery call that should never casually appear in another customer's conversation.
$md$,1,true),
(v_module,'Classify Information Before You Handle It',$md$
## Objective
Know how carefully information must be handled before you share, store or discuss it.

## ProFox working classification
**Public** — intentionally published for public use.
**Internal** — intended for ProFox personnel.
**Confidential** — customer, prospect, employee or commercial relationship information.
**Restricted** — passwords, OTPs, API keys, authentication tokens, card/CVV details, banking credentials and similar secrets.

## Operating rule
**If uncertain, handle the information as the more sensitive category until verified.**

### Practice prompt
Classify: website address, internal playbook, customer quotation, CRM contact, API key and OTP.
$md$,2,true),
(v_module,'Public Does Not Mean Unlimited Use',$md$
## Objective
Avoid treating publicly visible contact information as unrestricted permission.

## Operating rule
**Publicly visible is not the same as approved for every use.**

Use the approved ProFox research and outreach workflow. Do not invent your own privacy/legal basis because an email or phone number appears online.

### Example
A personal Gmail address appears on an old forum. That does not automatically make it approved for ProFox outreach. Follow the approved prospecting workflow and suppression rules.

### Practice prompt
What should you do when a contact detail is public but its permitted sales use is unclear?
$md$,3,true),
(v_module,'Collect Less, Sell Better',$md$
## Objective
Use data minimization to reduce clutter, risk and wasted admin time.

## Operating rule
**If we do not need it for the legitimate sales process, do not collect it.**

Useful data helps the next sales decision: stakeholder role, business need, timeline, decision process and next action. Unrelated personal details, unnecessary IDs, passwords, payment secrets or gossip do not belong in ordinary sales records.

### Why this improves performance
Less unnecessary data means faster CRM work, clearer records, less exposure and easier handoff.

### Practice prompt
Given a prospect profile with 15 fields, identify which fields actually help qualification, follow-up or commercial progression.
$md$,4,true),
(v_module,'Need-to-Know Access',$md$
## Objective
Understand why role-based access protects both focus and customer trust.

## Operating rule
**Access only the records and systems required for your authorized job.**

A seller may need their assigned leads, opportunities, meetings and quotations. That does not create a right to HR records, another seller's unrelated pipeline, finance credentials or other clients' private project data.

### Performance principle
Least-privilege access reduces noise as well as risk. You work faster when the system shows what you actually need.

### Practice prompt
A teammate asks for a customer export that is unrelated to their assigned work. What should you verify before sharing anything?
$md$,5,true);
end $$;
