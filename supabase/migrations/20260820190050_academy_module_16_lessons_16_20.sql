-- Module 16 lessons 16–20 — Understand Payment Status

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Learn the ProFox Payment Lifecycle',$md$
## Objective
Understand the payment states shown in ProFox CRM and respond according to state rather than assumption.

## Operating rule
**The CRM payment status tells you what is known; do not mentally upgrade it to a stronger state.**

Current ProFox payment states include:
- **Draft** — request is being prepared;
- **Ready** — request is ready for the next approved action;
- **Sent** — payment request has been issued;
- **Pending** — payment is still outstanding/in process;
- **Verification Pending** — information exists that requires the protected verification step;
- **Partially Paid** — confirmed amount is less than the full request amount;
- **Verified** — the authorized verification workflow confirmed the payment;
- **Failed / Cancelled** — request/transaction is not proceeding;
- **Refunded / Partially Refunded** — settlement was reversed fully or partly through an authorized process.

### Seller mindset
Do not treat status names as buttons you are entitled to click. They are controlled business facts with different authorities.

### Practice prompt
For each state above, write the safest next Sales action in five words or fewer.
$md$,16,true),

  (v_module,'Intermediate Provider States Are Not ProFox Verification',$md$
## Objective
Avoid incorrectly translating a payment-provider event into final business state.

## Operating rule
**Follow the ProFox verified status, not your own interpretation of a provider message.**

Payment processors may report intermediate events such as an authorization, processing state or pending capture. These can be useful operational signals, but the seller should not use them to declare the payment financially verified.

### Example
The customer’s bank has authorized a card transaction, but the ProFox CRM still shows Verification Pending. Your action is to follow the protected process—not to mark Verified or tell Delivery that money is settled.

### Why this matters
Different payment systems use different state names. Training sellers to interpret every gateway state would create inconsistency and security risk. ProFox therefore gives Sales one simple source of truth: the protected CRM payment state.

### Mistakes to avoid
- screenshot interpretation;
- assuming “authorized” means settled;
- manually changing CRM to match a provider dashboard;
- bypassing Admin verification because a gateway email looks convincing.

### Practice prompt
Explain to another seller why “provider says authorized” and “ProFox says Verified” are not interchangeable.
$md$,17,true),

  (v_module,'Partial Payment Is Still an Open Obligation',$md$
## Objective
Handle confirmed partial receipts without pretending a milestone is complete.

## Operating rule
**Partially Paid means some value has been confirmed, not that the requested milestone is satisfied.**

The protected verification function records a confirmed amount lower than the request as **Partially Paid**. It does not mark the opportunity Won, does not create a new client from the qualifying-payment transition, and does not treat the full milestone as verified.

### Example
A $1,000 milestone receives a confirmed $400. The CRM records the partial amount. Sales should communicate the remaining balance accurately and follow the approved commercial process.

Do not create a second unrelated payment request simply to hide the partial payment unless the approved workflow specifically requires a replacement request.

### Mistakes to avoid
- saying “payment complete”;
- treating partial advance as qualifying full verification;
- manually setting amount_paid;
- creating duplicate records to make reporting look cleaner;
- demanding a remaining amount without checking the actual outstanding balance.

### Practice prompt
How would you explain a partially paid milestone to the customer without sounding accusatory?
$md$,18,true),

  (v_module,'Failed, Cancelled and Expired Requests',$md$
## Objective
Respond correctly when a payment request can no longer be used successfully.

## Operating rule
**Do not revive or alter a failed/cancelled request by improvisation. Use the approved reissue or resolution process.**

If payment fails, first determine whether the problem is technical, customer-side, provider-side or commercial. If the request is cancelled/expired, use the correct ProFox process to create or resend the current valid request.

### Example
A customer tries an expired payment link. Do not edit the URL or send a link from another opportunity. Confirm the current accepted quotation/milestone and issue the appropriate official request.

### Communication
Keep the tone neutral:
“It looks like that request is no longer active. I’ll make sure you receive the current official payment request linked to your quotation.”

### Mistakes to avoid
- blaming the customer;
- asking them to keep retrying a clearly invalid link;
- changing the amount to make the payment work;
- using another customer’s payment link;
- moving a failed record to Verified.

### Practice prompt
Write the exact steps you take after a customer says, “The link says expired.”
$md$,19,true),

  (v_module,'Phase Checkpoint — Duplicate Events Are Not Duplicate Money',$md$
## Objective
Understand why payment systems can report the same event more than once and why Sales must not create duplicate business records.

## Operating rule
**Repeated notifications do not mean repeated money. Let the backend’s idempotent processing and payment record determine truth.**

A payment provider can resend event notifications. Secure integrations identify/process events idempotently so the same external event does not create duplicate downstream effects.

### Seller scenario
You receive two notifications that look identical for one payment. Do not:
- create two clients;
- generate another commission expectation;
- create a second payment record;
- mark a second opportunity Won;
- tell the customer they paid twice without verified evidence.

Instead, check the existing payment reference/status and escalate only if the actual transaction record shows something inconsistent.

### Practice prompt
A teammate says, “We got two webhook alerts, so the customer must have paid twice.” Explain why that conclusion is unsafe.

**Phase standard:** status is evidence; notifications are signals.
$md$,20,true);
end $$;
