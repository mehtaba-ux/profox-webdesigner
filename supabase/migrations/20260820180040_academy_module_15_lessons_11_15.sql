-- Module 15 lessons 11–15 — Approval Routing & Exceptions

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='quotation-process';
  if v_module is null then raise exception 'Module 15 quotation-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Standard Packages Do Not Need Separate Manager Approval',$md$
## Objective
Learn the corrected ProFox quotation-authority rule for standard packages.

## Operating rule
**An active standard package that the live Sales Catalog marks as not requiring manager approval may be quoted through the normal seller workflow without separate Admin/Manager review.**

This applies to the approved standard package family when it remains within its configured catalog scope and price rules.

The seller does **not** need to send every normal package quotation to Admin merely because a quotation exists.

### What still matters
No separate approval does **not** mean unlimited authority. The seller must still:
- use the live catalog item;
- follow its configured price rule;
- keep scope within the approved package;
- use approved payment/commercial terms;
- avoid unauthorized discounts or promises.

### Example
A buyer selects the current standard Growth package at its catalog-approved commercial terms. No custom scope and no exception are added. The quotation can follow the standard no-manager-review route.

### Mistakes to avoid
- teaching “all quotations need Admin approval”;
- changing catalog scope because the package itself is pre-approved;
- manually lowering the package price;
- confusing no approval with no accountability.

### Practice prompt
Explain the difference between **pre-approved catalog authority** and **permission to change the offer**.
$md$,11,true),

  (v_module,'Approved Add-Ons Also Flow Without Separate Approval',$md$
## Objective
Know when a seller can add an add-on without creating an approval bottleneck.

## Operating rule
**An active add-on already approved in the Sales Catalog and marked `manager_approval_required = false` does not require separate manager approval when used within its approved scope and price rules.**

Examples can include approved pages, integrations, SEO items, branding items, e-commerce items, automation items or care plans currently configured in the catalog.

The catalog setting—not the seller's memory—decides.

### Example
The customer chooses a standard package plus an active approved Booking / Calendar Integration add-on. If both catalog items are configured without approval, the combined quotation remains on the standard route.

### Important boundary
If the customer asks for work beyond what the approved add-on actually covers, do **not** hide custom work under the add-on label. That becomes custom/non-standard scope and needs the appropriate review.

### Practice prompt
A buyer needs a highly customized proprietary booking engine. Why might the approved Booking Integration add-on not be enough?
$md$,12,true),

  (v_module,'Custom Packages and Custom Scope Require Approval',$md$
## Objective
Recognize the point where seller authority stops and commercial/technical review begins.

## Operating rule
**Custom work requires approval when the live catalog marks it approval-required or when the quotation includes non-catalog/custom scope.**

Approval is required for cases such as:
- the ProFox custom package with `manager_approval_required = true`;
- non-catalog/custom quotation line items;
- materially custom application scope;
- custom pricing outside configured seller authority;
- a catalog item used beyond its approved scope;
- a special commercial commitment that standard configuration does not authorize.

### Example
A customer wants a custom internal portal with role-based workflows and a proprietary ERP integration. That is not made “standard” by selecting several unrelated add-ons. It must be scoped and approved appropriately.

### Seller language
> “This moves into custom scope, so I need to have the requirements and commercial structure approved before I can issue the final quotation.”

That is professionalism, not weakness.

### Practice prompt
Name three signals that a request has crossed from approved catalog scope into custom scope.
$md$,13,true),

  (v_module,'Commercial Exceptions Still Require Authorization',$md$
## Objective
Understand that approval routing covers more than the product name.

## Operating rule
**A standard package can become an exception if the seller changes the commercial rules.**

Even when the package/add-ons themselves are pre-approved, authorization is still required for non-standard requests such as:
- an unauthorized discount;
- free add-ons not configured as approved promotions;
- custom payment terms;
- special contractual wording;
- an unapproved delivery commitment;
- custom functionality disguised inside a standard line;
- any commercial exception outside seller authority.

### Example
A standard package normally does not require approval. The buyer then asks for 20% off and a six-month payment plan. The **products** remain standard, but the **commercial exception** requires authorization.

### Rule
> **Approval follows the actual commercial promise, not only the package label.**

### Practice prompt
Explain why “standard package + unauthorized discount” is not a standard no-approval quotation anymore.
$md$,14,true),

  (v_module,'Phase Checkpoint — Let the System Route the Quote',$md$
## Objective
Use the ProFox routing model confidently without creating unnecessary Admin work.

## Operating rule
The normal decision should be:

**ACTIVE CATALOG PACKAGE / APPROVED ADD-ON + STANDARD TERMS**
→ **No separate manager approval**

**CUSTOM / NON-CATALOG / MANAGER-APPROVAL PRODUCT / COMMERCIAL EXCEPTION**
→ **Approval required**

The seller should not manually decide based on seniority or personal judgment when the catalog already contains the approval rule. The CRM uses the live product configuration to route the quotation.

### Important
Do not attempt to avoid approval by:
- renaming custom work as a standard add-on;
- choosing a lower-risk catalog item that does not match scope;
- removing an approval-required product and hiding its work in notes;
- sending an unofficial PDF outside the system.

### Practice prompt
Classify these three cases:
1. Standard package only, configured no approval.
2. Standard package + approved add-on, both no approval.
3. Standard package + custom non-catalog functionality.

Correct route: **standard / standard / approval required.**

**Phase standard:** automate routine quotes; review exceptions.
$md$,15,true);
end $$;
