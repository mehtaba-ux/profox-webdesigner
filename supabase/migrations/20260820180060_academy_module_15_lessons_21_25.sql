-- Module 15 lessons 21–25 — Review, Approval & Version Control

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Run the Pre-Issue Quality Check',$md$
## Objective
Catch commercial errors before the quotation reaches the buyer.

## Operating rule
**Accurate + complete + authorized + understandable + traceable.**

Before submitting a quotation for its route, verify:
- correct customer and opportunity;
- correct package/service;
- correct add-ons;
- line-item quantities and price rules;
- scope summary;
- material assumptions/exclusions;
- approved payment/commercial terms;
- appropriate validity/timeline wording;
- no unverified technical commitment;
- no conflicting totals or descriptions.

### Example
The scope says Growth package, but an old payment note refers to a different commercial structure. Stop and correct it before issue.

### Mistakes to avoid
- assuming the CRM prevents every content mistake;
- sending because the buyer is waiting;
- reviewing only the total and ignoring scope;
- skipping customer identity checks.

### Practice prompt
What are the five fastest checks you would perform before submitting a standard quotation?
$md$,21,true),

  (v_module,'Understand Draft, Approval Route and Approved Status',$md$
## Objective
Use quotation statuses as workflow truth rather than decoration.

## Operating rule
**A status describes what has actually happened.**

Conceptually:
- **Draft** — seller is still preparing the quote.
- **Ready for Approval** — the system detected custom/approval-required scope or a review-required exception.
- **Approved** — either the catalog-standard route auto-approved it or an authorized reviewer approved the exception.
- **Sent** — the approved quotation has been issued through the business process.
- **Accepted / Rejected / Expired / Cancelled** — later lifecycle outcomes.

### Corrected standard route
A package/add-on combination that the live catalog marks as no-approval can move from submission into **Approved automatically**. It does not need a person to rubber-stamp it.

### Custom route
Custom or approval-required items remain **Ready for Approval** until authorized.

### Practice prompt
Why is “Approved” valid for a standard quote even when `approved_by` is empty but the system recorded the catalog auto-approval route?
$md$,22,true),

  (v_module,'Never Circumvent Required Approval',$md$
## Objective
Protect ProFox from unofficial commercial commitments.

## Operating rule
**If the system routes a quotation for approval, do not create a parallel path around it.**

Forbidden workarounds include:
- emailing a manually edited PDF;
- removing an approval-required product and promising it verbally;
- renaming custom work as a standard add-on;
- sending screenshots of an unapproved draft as a “final quote”;
- promising the buyer that Admin will approve the exception.

### Example
A custom application quotation routes to Ready for Approval. The buyer wants it immediately. The seller explains the approval step and keeps the buyer informed—without issuing an unofficial commitment.

### Practice prompt
Write one sentence explaining the custom-quote approval step confidently to a buyer who is in a hurry.
$md$,23,true),

  (v_module,'Preserve Version History When Scope Changes',$md$
## Objective
Ensure everyone can identify the current commercial truth.

## Operating rule
**Do not silently rewrite an issued or accepted quotation.**

If the buyer requests a material change after issue:
1. record what changed;
2. assess scope/price/timeline impact;
3. obtain approval if the change requires it;
4. create/revise through the approved workflow;
5. make clear which quotation/version is current.

Historical quotations are evidence of what was previously proposed or accepted. They should not be overwritten to make history look cleaner.

### Example
Buyer adds a membership portal after receiving the website quote. Do not edit the already-issued scope invisibly. Treat it as a revision/custom scope decision.

### Practice prompt
What information should remain traceable when a quotation is superseded?
$md$,24,true),

  (v_module,'Phase Checkpoint — One Current Commercial Truth',$md$
## Objective
Keep Sales, Finance, Delivery and the buyer aligned on the same quotation.

## Operating rule
At any decision point you should know:
- which quote is current;
- whether it needs approval;
- whether it is approved;
- whether it has been issued;
- what changed from any prior version;
- what the buyer is being asked to accept.

### Scenario
The buyer has two PDFs with different totals. One is old, one is current. Never ask them to “just use the latest email.” Make the CRM/current commercial record clear and identify the superseded version through the approved process.

### Practice prompt
Explain why version clarity is not merely administrative—it protects trust, commission accuracy, payment collection and project delivery.

**Phase standard:** one active commercial truth, with history preserved.
$md$,25,true);
end $$;
