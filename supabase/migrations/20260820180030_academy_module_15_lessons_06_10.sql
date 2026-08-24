-- Module 15 lessons 06–10 — Scope & Catalog Accuracy

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Scope Is the Heart of the Quotation',$md$
## Objective
Translate the agreed solution into clear deliverables.

## Operating rule
**Price without scope creates future conflict.**

A quotation should describe the deliverables clearly enough that the buyer and ProFox delivery team can understand what is being purchased.

Weak:
> Website Development — $2,379

Stronger:
> The selected ProFox website package with the agreed page structure, responsive design/development, enquiry functionality and approved catalog add-ons shown as separate line items.

Use the live catalog scope and the verified agreement from the sales conversation. Do not rewrite the package into something materially different.

### Mistakes to avoid
- vague “premium website” language;
- hidden extra work;
- promising unspecified revisions or functionality;
- changing package scope just to make the quote more attractive.

### Practice prompt
Turn “business website” into a concise scope summary using only confirmed deliverables.
$md$,6,true),

  (v_module,'Use Deliverables, Not Marketing Hype',$md$
## Objective
Write quotation language that delivery can actually honor.

## Operating rule
**Describe what ProFox will do, not an uncontrolled outcome the buyer hopes will happen.**

Deliverable:
> Configure the approved enquiry form and lead-routing integration.

Business intention:
> Create a clearer enquiry journey.

Uncontrolled guarantee:
> Increase qualified leads by 50%.

Only the deliverable is a direct contractual work commitment. The buyer's desired outcome can provide context, but the quotation must not convert an aspiration into a guarantee.

### Avoid
- “guaranteed conversion”; 
- “#1 Google rankings”; 
- “guaranteed revenue”; 
- “unlimited everything”; 
- words that imply scope not actually included.

### Practice prompt
Rewrite “advanced automation that will double follow-up results” as a concrete deliverable.
$md$,7,true),

  (v_module,'Make Material Exclusions and Assumptions Visible',$md$
## Objective
Prevent scope misunderstandings by documenting meaningful boundaries.

## Operating rule
**If an assumption or exclusion can change delivery, price or responsibility, do not hide it.**

Relevant examples may include:
- third-party subscription/license costs;
- customer-supplied content or credentials;
- integrations not listed in the quote;
- paid advertising or ongoing marketing not purchased;
- additional pages or custom features outside catalog scope;
- API access controlled by a third party.

Do not create long defensive exclusions for things nobody reasonably expects. Focus on material boundaries.

### Example
If an approved CRM Integration add-on assumes the buyer already has a supported CRM account and credentials, make that dependency clear where appropriate.

### Practice prompt
Write one assumption for a third-party integration whose API access is controlled by the buyer's provider.
$md$,8,true),

  (v_module,'Use the Live Sales Catalog as the Source of Truth',$md$
## Objective
Stop pricing from memory and keep quotations aligned with Admin configuration.

## Operating rule
**The live Sales Catalog decides the current product, price mode, base price, scope and approval requirement.**

Do not memorize package names or prices as permanent facts. Admin may update them. Select the active catalog item in the CRM and let the system snapshot the current product code/name into the quotation.

The live catalog can contain:
- standard packages;
- approved add-ons;
- care plans;
- approved discovery services;
- custom products that require approval.

### Important
A catalog item marked `manager_approval_required = false` is pre-approved for normal quotation use under its configured price rules. A catalog item marked `true` must go through approval.

### Mistakes to avoid
- typing an old price from WhatsApp notes;
- manually creating a catalog item as “custom” because it is faster;
- quoting an inactive product;
- assuming every catalog product requires Admin review.

### Practice prompt
If the training shows an old price but the live Sales Catalog shows a new one, which value do you quote and why?
$md$,9,true),

  (v_module,'Phase Checkpoint — Scope and Catalog Must Agree',$md$
## Objective
Confirm that the selected catalog items represent the agreed scope before approval routing begins.

## Operating rule
**Every line item should have a reason to exist.**

Before continuing, verify:
- the package matches the buyer's agreed need;
- every add-on was agreed or is clearly being proposed for buyer review;
- descriptions do not expand catalog scope silently;
- price follows the live catalog rules;
- exclusions/assumptions are visible where material;
- no custom requirement is disguised as a standard add-on.

### Example
A buyer wants a proprietary ERP workflow. Selecting “Simple Third-Party Integration” simply to avoid custom approval is not acceptable if the requirement is materially outside that approved add-on's scope.

### Practice prompt
Explain why choosing the closest catalog label is not enough when the actual requested work exceeds that product's approved scope.

**Phase standard:** the catalog organizes approved offers; it does not authorize mislabeling custom work.
$md$,10,true);
end $$;
