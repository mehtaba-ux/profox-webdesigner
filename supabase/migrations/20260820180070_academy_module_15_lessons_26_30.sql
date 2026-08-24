-- Module 15 lessons 26–30 — Issue, Acceptance & Payment Handoff

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;
  delete from public.training_lessons where module_id=v_module and sort_order between 26 and 30;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Issue the Approved Quote With Context',$md$
## Objective
Keep quotation delivery connected to the buyer's decision process.

## Operating rule
**Do not send a quotation and disappear.**

Once the quotation is approved—automatically for standard catalog scope or manually for approval-required scope—issue it through the approved process and explain what the buyer is receiving.

A useful review confirms scope, meaningful assumptions or exclusions, commercial value, approved payment structure, outstanding questions and the next decision.

### Practice prompt
Write a short quotation delivery message that sets a clear review next step without pressure.
$md$,26,true),

  (v_module,'Review Scope Before Discussing Final Commercial Acceptance',$md$
## Objective
Help the buyer verify what they are actually being asked to buy.

## Operating rule
**Quotation review begins with alignment.**

Walk through the agreed objective, scope and line items, meaningful boundaries, commercial total, payment structure and next step. Ask whether anything materially differs from what the buyer understood was agreed.

If a material concern appears, resolve it before requesting acceptance. Do not ask the buyer to accept first and correct the scope later.

### Practice prompt
The buyer expected an item that is not included. What should happen before acceptance?
$md$,27,true),

  (v_module,'Know What Formal Acceptance Actually Means',$md$
## Objective
Distinguish positive buyer language from a formal system event.

## Operating rule
**Positive feedback is not automatically formal acceptance.**

Use the approved ProFox acceptance mechanism and preserve the accepted quotation, version and timestamp through the system. Do not record acceptance on the customer's behalf or change an accepted quote outside the approved revision process.

### Practice prompt
What approved system event should determine formal quotation acceptance?
$md$,28,true),

  (v_module,'Acceptance Hands Off to the Approved Payment Workflow',$md$
## Objective
Protect the boundary between quotation acceptance and later financial workflow states.

## Operating rule
**QUOTATION ACCEPTED → MODULE 16 PAYMENT PROCESS → VERIFIED BUSINESS TRANSITION**

Formal quotation acceptance completes the commercial-document stage. It does not authorize the seller to skip the payment workflow or manually create stronger downstream states.

Module 16 teaches payment handling and verification in depth. Module 15 ends by handing the accepted commercial truth into that protected workflow.

### Practice prompt
After formal quotation acceptance, what is the seller's next approved process?
$md$,29,true),

  (v_module,'Final Standard — Quote What We Can Deliver',$md$
## Objective
Consolidate the complete Module 15 operating standard.

## ProFox quotation framework
**VERIFY → SCOPE → CATALOG → ROUTE → REVIEW → ISSUE → TRACK → ACCEPT → PAYMENT HANDOFF**

### Permanent rules
- Quote only verified scope.
- Use the live Sales Catalog.
- Standard packages configured no-approval do not need separate manager review.
- Approved catalog add-ons configured no-approval also flow normally.
- Custom or approval-required products and non-catalog scope require approval.
- Commercial exceptions still require authorization even when the package is standard.
- Do not improvise discounts, payment terms or delivery commitments.
- Preserve quotation/version history.
- Use the approved acceptance mechanism.
- After acceptance, follow Module 16's protected payment workflow.

### Final practice prompt
Explain the route for a standard package plus approved add-on under standard terms versus a custom package with a non-standard commercial request.

# Quote exactly what we can deliver—and deliver exactly what we quote.
$md$,30,true);
end $$;
