-- Module 14 lessons 16–20 · Phase 4 — Commercial Integrity

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Do Not Manufacture Urgency or Scarcity',$md$
## Objective
Use genuine business timing without creating fake pressure.

## Operating rule
**Urgency must belong to reality—not to the seller’s month-end target.**

Legitimate urgency can come from an actual event, operational deadline, campaign date, contract expiry or buyer-owned priority. It should be documented and represented accurately.

### Example
Buyer: “We need the new site ready before our October 14 trade show.”
Seller: “If that date still matters, we should work backward from the approved delivery plan after scope is confirmed.”

That is different from: “You need to sign today or you’ll lose your chance.”

### Never invent
- expiring prices;
- limited slots;
- competitor demand;
- delivery cutoffs;
- management deadlines;
- discounts that do not actually exist.

### Practice prompt
Rewrite a fake scarcity close into a truthful statement based on a real buyer deadline.
$md$,16,true),

  (v_module,'Protect Pricing, Discounts and Payment Authority',$md$
## Objective
Know where seller authority ends during the close.

## Operating rule
**Use the live Sales Catalog and approved commercial rules. Never improvise money terms.**

The seller must not invent package prices, discount percentages, payment schedules, add-ons, expiration dates or custom-app estimates.

If a buyer requests an exception:
“I can document that request, but I’m not authorized to approve it myself. I’ll have the correct person review it.”

That is professional control—not weakness.

### Mistakes to avoid
- discounting to fill silence;
- changing payment milestones verbally;
- promising free add-ons;
- quoting from memory when the live catalog can be checked;
- implying management approval that has not occurred.

### Practice prompt
The buyer asks for 20% off and a different payment schedule. Write the exact response that preserves momentum without making an unauthorized commitment.
$md$,17,true),

  (v_module,'Never Close With an Unverified Technical Promise',$md$
## Objective
Protect delivery quality when technical questions appear late in the deal.

## Operating rule
**Closing pressure never creates technical certainty.**

Buyer: “If you can integrate our legacy ERP, we’ll proceed.”

If that integration is not verified, the correct close is conditional:
“That sounds like the key remaining condition. I don’t want to guess. Let’s document the exact ERP/version/API requirement and have the technical team validate it. If it is confirmed, we can finalize the commercial scope from there.”

### Correct outcomes
- technical validation;
- paid/approved discovery;
- revised scope;
- unsupported requirement disclosed honestly.

### Mistakes to avoid
- saying “yes” to save the deal;
- promising dates before feasibility review;
- hiding technical risk from delivery;
- treating a conditional buyer statement as final acceptance.

### Practice prompt
Write the closing next step for a custom app where SSO, data migration and ERP integration are still unverified.
$md$,18,true),

  (v_module,'Commission Must Never Distort the Recommendation',$md$
## Objective
Separate seller compensation from buyer-fit judgment.

## Operating rule
**Recommend the best-fit solution even when it produces less commission.**

A smaller right-fit engagement can build more trust, reduce delivery risk and create a healthier long-term customer relationship than an oversized package.

Forbidden behavior includes:
- pushing Premium because commission is higher;
- refusing a smaller scope that genuinely fits;
- changing lead-source data to claim a bonus;
- creating month-end pressure around commission payout;
- marking the deal Won early to influence commission timing.

### Example
If the Business-level direction solves the buyer’s needs and the Premium scope is unnecessary, recommend Business.

### Practice prompt
A buyer can afford the largest package but only needs the middle package. Write a recommendation close that explains why the smaller option is the professional choice.
$md$,19,true),

  (v_module,'Phase 4 Checkpoint — Win Without Creating Delivery Risk',$md$
## Objective
Consolidate ethical commercial decision-making.

## Operating rule
**Never win the sale by creating a problem for delivery, finance or the buyer.**

Use the **INTEGRITY CHECK** before progressing:
- Is pricing current and approved?
- Are discount/payment terms authorized?
- Are scope and deliverables accurate?
- Are technical claims verified?
- Is timing realistic?
- Is urgency genuine?
- Is the recommended package a real fit?
- Is the CRM status truthful?

### Mini-case
A prospect says they will sign today only if you guarantee launch in three weeks. Delivery has not approved that timeline. The correct response is to preserve the opportunity while refusing the unverified promise and escalating the timeline for confirmation.

### Practice prompt
Identify the commercial or operational risk in five sample closing statements. Rewrite each into an approved version.

**Phase takeaway:** Strong closers protect the future customer experience, not just the current sale.
$md$,20,true);
end $$;
