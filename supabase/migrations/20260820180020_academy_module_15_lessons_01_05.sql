-- Module 15 lessons 01–05 — Quote Readiness

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Quotation Is Commercial Truth, Not a Sales Brochure',$md$
## Objective
Understand what a ProFox quotation represents and why accuracy matters.

## Operating rule
**A quotation is the commercial record of what ProFox can actually deliver—not a place to add persuasive promises.**

A strong quotation answers six questions clearly:
1. What are we delivering?
2. What is outside the agreed scope?
3. What does it cost?
4. What approved payment structure applies?
5. What assumptions or customer responsibilities matter?
6. What happens after acceptance?

The quotation should reflect the solution already developed through Discovery, Presentation, Objection Handling and Closing. It should not introduce a new solution because the seller wants the document to look more impressive.

### Example
Buyer agreed to a conversion-focused website with one approved booking integration. The quotation should reflect that exact direction. It should not suddenly add an email automation program because ProFox also sells automation.

### Mistakes to avoid
- treating quotation creation as another pitch;
- adding features that were never agreed;
- vague descriptions such as “premium digital solution”;
- promising outcomes instead of deliverables;
- using memory instead of the CRM and Sales Catalog.

### Practice prompt
Before drafting a quotation, write one sentence describing the buyer's agreed commercial direction without naming any additional service.

**Remember:** one customer, one agreed scope, one commercial truth.
$md$,1,true),

  (v_module,'Know When the Opportunity Is Ready to Quote',$md$
## Objective
Recognize when a quotation is appropriate and when more scoping is required.

## Operating rule
**Do not quote uncertainty as if it were scope.**

A quotation is normally ready when the seller can identify the buyer, solution direction, scope boundaries, stakeholders, commercial direction, important dependencies and next step.

Do not rush to quote when:
- core requirements are unclear;
- the buyer has not agreed which direction fits;
- a material stakeholder has not been heard;
- an important custom integration has not been validated;
- custom-application scope is still undefined;
- the requested commercial exception has not been reviewed.

### Example
A prospect wants “a complete internal operations app,” but user roles, workflows, integrations and reporting requirements are unknown. The correct next step is additional discovery or a Solution Blueprint—not an invented custom-app price.

### Mistakes to avoid
- quoting simply because the prospect says “send me a price”;
- creating an arbitrary custom price to keep momentum;
- assuming technical feasibility;
- treating an estimated opportunity value as an approved quotation value.

### Practice prompt
List the three missing facts that would stop you from quoting a custom application responsibly.
$md$,2,true),

  (v_module,'Review the CRM Before You Build the Quote',$md$
## Objective
Use verified opportunity information instead of memory or assumptions.

## Operating rule
**Quotation inputs come from the latest verified CRM record and approved catalog—not from what you vaguely remember from the call.**

Before creating the quote, review:
- customer/company identity;
- contact and decision-maker information;
- discovery requirements;
- problems and desired outcomes;
- presentation recommendation;
- objections and unresolved risks;
- selected service/package direction;
- timeline notes;
- commercial notes;
- agreed next step.

If the CRM conflicts with your memory, verify before quoting.

### Example
Your notes say the buyer asked for a booking integration, but the final meeting summary says they decided not to include it. Use the final verified decision—not the earlier discussion.

### Mistakes to avoid
- copying an old quotation and forgetting to update details;
- using outdated meeting notes;
- assuming a stakeholder approved something they did not;
- pricing against an old package list.

### Practice prompt
Write a pre-quote CRM checklist you can complete in under two minutes.
$md$,3,true),

  (v_module,'Confirm the Commercial Customer and Billing Identity',$md$
## Objective
Prevent quotations from being issued to the wrong person or business entity.

## Operating rule
**Never guess the legal or commercial recipient.**

The person you spoke with may not be the entity that will receive the quotation or pay the invoice. Verify the applicable customer/company name and the available billing/contact information.

Where relevant, confirm:
- company/customer name;
- primary contact;
- email;
- country;
- billing information required by the business process;
- tax/business information if the approved workflow requires it.

### Example
You spoke with “John Smith,” but the contracting customer is “Smith Roofing LLC.” The quotation should use the correct commercial customer rather than assuming John's personal name is enough.

### Mistakes to avoid
- inventing a company name from an email domain;
- issuing to a nickname when the business entity is known;
- copying recipient details from another opportunity;
- changing customer details after issue without proper revision/history.

### Practice prompt
What information would you verify if a buyer says, “Send the quote to me, but our finance company will actually pay it”?
$md$,4,true),

  (v_module,'Phase Checkpoint — Quote Only What Was Agreed',$md$
## Objective
Consolidate quote-readiness discipline before moving into scope and catalog selection.

## Operating rule
Before creating commercial line items, be able to state:
**Buyer → Problem → Agreed Direction → Scope Boundary → Commercial Next Step.**

### Readiness checkpoint
Ask yourself:
- Do I know who the quotation is for?
- Do I know what the buyer has actually agreed to evaluate?
- Are major technical unknowns either resolved or explicitly identified?
- Am I using the latest opportunity information?
- Is quotation creation the agreed next step?

If several answers are “No,” do not compensate by creating a more detailed-looking quote. Return to the missing sales step.

### Example
A buyer likes the presentation but has not involved the owner who makes the final commercial decision. A quotation may still be useful if the agreed next step is owner review—but do not record it as final commercial commitment.

### Practice prompt
Explain in one sentence why “the prospect is interested” is not sufficient quotation readiness.

**Phase standard:** accuracy before speed.
$md$,5,true);
end $$;
