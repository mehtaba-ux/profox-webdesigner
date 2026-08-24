-- Module 16 lessons 21–25 — Verification, Exceptions & Control

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Verification Is a Protected Admin Workflow',$md$
## Objective
Understand exactly where Sales authority ends.

## Operating rule
**Only the protected ProFox verification workflow may set a payment to Verified.**

In the live system, `verify_payment_atomic` requires an active Admin. Sales cannot turn a payment into Verified through normal record updates, and protected settlement fields such as amount paid, verified time and verifier are locked from Sales manipulation.

### Why this exists
A salesperson is financially motivated to close opportunities quickly. That does not make Sales dishonest; it means the system should remove unnecessary conflicts of interest. Independent verification protects the customer, salesperson, Finance, commission reporting and Delivery.

### Example
Customer sends a bank receipt. Sales records the communication and asks the authorized process to verify. Sales does **not** change `amount_paid`, `verified_at`, `verified_by`, status or opportunity stage.

### Mistakes to avoid
- asking an Admin to “just mark it paid” without checking;
- modifying fields through another screen/API;
- treating an external screenshot as final evidence;
- creating a duplicate payment that you can control more easily.

### Practice prompt
Explain why separating seller authority from payment verification improves trust rather than slowing Sales down.
$md$,21,true),

  (v_module,'Verified Qualifying Payment Activates the Business Handoff',$md$
## Objective
Understand what the protected verification workflow can trigger after a qualifying Advance or Full Payment.

## Operating rule
**Do not manually recreate downstream actions that the verified-payment workflow already controls.**

For a qualifying Advance/Full Payment linked to an accepted quotation, the existing atomic verification workflow can:
- verify the full required payment;
- move the linked opportunity to Won;
- create or reuse the correct Client record;
- link the opportunity, quotation and payment to that client;
- trigger verified-payment commission logic.

A partial receipt does not perform these stronger transitions.

### Why atomicity matters
These steps belong together. If Sales separately marks Won, creates a client, and later payment verification fails, the CRM becomes inconsistent.

### Seller action after verification
Confirm the CRM shows the expected state, then follow the approved handoff/onboarding process. Do not create duplicate clients or projects because you are excited the payment cleared.

### Practice prompt
Describe the difference in downstream effect between a Partially Paid advance and a fully Verified qualifying advance.
$md$,22,true),

  (v_module,'Amount Mismatch — Stop and Reconcile',$md$
## Objective
Respond safely when the expected and reported payment amounts differ.

## Operating rule
**Never hide a mismatch by editing the expected amount, received amount or quotation.**

Possible mismatch sources include:
- wrong payment request;
- wrong quotation/version;
- customer paid a different amount;
- partial payment;
- duplicate/retried payment;
- approved exception not reflected in the current record;
- currency confusion.

### Example
CRM expects $1,189.50 but the customer says they transferred $1,100. Do not mark the request complete and write off the difference informally. Preserve both facts and escalate/reconcile through the approved process.

### Correct approach
1. Check accepted quotation/version.
2. Check configured milestone.
3. Check payment reference.
4. Check official provider/verification evidence.
5. Identify whether this is partial payment, wrong transaction or a commercial exception.
6. Escalate if needed.

### Practice prompt
What would you verify before telling a customer they paid the wrong amount?

**Critical rule:** never alter financial truth to make the records “look right.”
$md$,23,true),

  (v_module,'Refunds Are Not Sales Concessions',$md$
## Objective
Know how to respond to a refund request without making unauthorized financial commitments.

## Operating rule
**Sales may receive and document a refund request; Sales does not independently promise or execute the refund.**

A refund can affect:
- contractual obligations;
- project status;
- delivered work;
- payment settlement;
- commission;
- accounting;
- customer relationship.

### Example
Customer says, “I changed my mind. Refund the deposit today.”

Do not answer, “Sure, I’ll refund it now.” Instead acknowledge the request, capture the reason/context, and route it through the authorized refund/commercial process. Do not promise the outcome before authorization.

### Mistakes to avoid
- refunding from personal money;
- promising a full refund without checking terms;
- deleting the payment record after refund;
- modifying verified amount to simulate a refund;
- arguing emotionally with the customer.

### Practice prompt
Write a professional response to a refund request that is helpful but does not commit ProFox to an unauthorized outcome.
$md$,24,true),

  (v_module,'Phase Checkpoint — Disputes and Chargebacks',$md$
## Objective
Preserve evidence and escalate financial disputes professionally.

## Operating rule
**When a payment is disputed, protect the record—do not manipulate it, argue, or promise the outcome.**

Important evidence may include:
- accepted quotation/version;
- customer communication;
- payment request/reference;
- approved terms;
- project/delivery evidence;
- invoices/receipts where applicable;
- prior resolutions or refund discussions.

### Seller response
Stay calm. Record the customer’s wording accurately. Do not delete messages, change dates, alter scope, create replacement transactions, or pressure the buyer to withdraw a dispute.

Escalate promptly to the authorized Admin/financial process.

### Scenario
A customer says their bank has opened a chargeback and asks you to “just change the invoice so it looks different.” That request must be refused and escalated. Commercial records remain truthful.

### Practice prompt
List five pieces of evidence you would preserve after a dispute notice.

**Phase standard:** protect evidence, protect truth, escalate.
$md$,25,true);
end $$;
