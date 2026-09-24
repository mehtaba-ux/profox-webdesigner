-- Module 15 lessons 16–20 — Payment, Pricing & Delivery Commitments

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Use Only the Approved Payment Structure',$md$
## Objective
Keep payment commitments aligned with ProFox configuration.

## Operating rule
**Payment terms are part of the commercial agreement and cannot be improvised.**

Standard packages use the currently approved payment structure configured by ProFox. Custom engagements use the payment structure approved for that quotation.

Examples from the current commercial policy include milestone structures such as 50/50, 50/30/20 or 40/30/20/10, but the seller must verify the current approved configuration rather than treating training examples as permanent pricing rules.

### Buyer request
“Can I pay 10% now and the rest six months later?”

Correct response:
> “That is outside the standard payment structure I can commit to. I can submit the request for approval.”

### Mistakes to avoid
- agreeing verbally and asking Finance to fix it later;
- creating unofficial instalments;
- hiding changed terms in internal notes;
- assuming a previous customer's terms apply here.

### Practice prompt
Write a professional response to a buyer asking for a payment schedule you are not authorized to offer.
$md$,16,true),

  (v_module,'Never Create an Unauthorized Discount',$md$
## Objective
Protect pricing integrity while still handling commercial conversations professionally.

## Operating rule
**A difficult closing conversation does not create discount authority.**

If the live catalog price rule does not permit the proposed lower price, do not enter it. If a legitimate exception is requested, follow the approval workflow.

A lower price can also come from a legitimately smaller scope—but the scope change must be transparent.

### Example
Buyer: “Can you bring this from $2,379 to $2,000?”

Do not silently reduce the same package. Instead determine whether:
- the buyer wants a smaller approved scope; or
- a commercial discount exception needs approval.

### Mistakes to avoid
- secret discounts;
- “free” add-ons used as hidden discounts;
- unofficial credits;
- changing the product snapshot to disguise a price change.

### Practice prompt
Explain the difference between an approved smaller scope and an unauthorized discount.
$md$,17,true),

  (v_module,'Timeline Requests Are Not Delivery Commitments',$md$
## Objective
Prevent sellers from creating delivery risk while trying to close a quote.

## Operating rule
**Record the buyer's requested date; commit only to an approved delivery expectation.**

Buyer:
> “Can it be live in 15 days?”

Seller should not automatically answer yes. Scope, dependencies and delivery capacity may need validation.

Use precise language such as:
- requested date;
- target date;
- estimated timeline;
- approved committed date.

These are not interchangeable.

### Example
A buyer has a real trade-show deadline. Capture that business date. The project team can then determine whether the approved scope can support it. Do not transform urgency into an unverified promise.

### Practice prompt
Rewrite “Yes, we'll definitely launch by October 1” when delivery has not confirmed the date.
$md$,18,true),

  (v_module,'Use Approved Commercial Terms and Customer Responsibilities',$md$
## Objective
Keep quotation terms standardized, clear and maintainable.

## Operating rule
**Salespeople use approved terms; they do not write custom legal/commercial clauses on the fly.**

Depending on the approved template, terms may address:
- payment milestones;
- change requests;
- customer content/credential responsibilities;
- third-party costs;
- acceptance;
- support/maintenance boundaries;
- ownership/IP rules;
- cancellation or other approved commercial conditions.

If the buyer requests a material term change, route it for the appropriate approval instead of editing the clause personally.

### Customer responsibilities
Where delivery depends on the customer providing content, access, approvals or credentials, make the applicable responsibility visible.

### Practice prompt
A buyer asks you to delete a material approved contract term from the quotation. What do you do?
$md$,19,true),

  (v_module,'Phase Checkpoint — Price, Terms and Timeline Must Be Authorized',$md$
## Objective
Confirm commercial integrity before the quote is reviewed or issued.

## Checklist
- Catalog item selected correctly?
- Price follows current product price mode?
- No unauthorized discount/free work?
- Payment terms are approved?
- Any exception routed for authorization?
- Timeline wording accurately distinguishes request from commitment?
- Customer responsibilities/dependencies visible where material?
- Terms come from approved templates/guidance?

### Scenario
The package and add-ons are all standard, but the buyer requests a special discount and a non-standard payment schedule.

The correct conclusion is **approval required for the commercial exceptions**. Do not say “the products are standard, so no approval is needed.”

### Practice prompt
Name the two different layers of approval logic in this module: **product approval configuration** and **commercial exception authority**.

**Phase standard:** never win a quote by creating a Finance or Delivery problem.
$md$,20,true);
end $$;
