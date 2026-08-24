-- Module 16 lessons 11–15 — Send & Follow Up Professionally

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Explain the Payment Before You Send It',$md$
## Objective
Make the payment request feel like a clear next step, not a surprise invoice.

## Operating rule
**Explain what the payment is, why it is due, and what verified payment enables before expecting the customer to act.**

Use this structure:
**Milestone → Amount/currency → Purpose → Official payment method → What happens after verification.**

### Example
“This is the agreed initial milestone from your accepted quotation. The official payment request is for the amount shown in the CRM. Once that qualifying payment is verified, ProFox can move the opportunity into the onboarding/handoff workflow.”

The seller should sound calm and certain. Do not apologize for an agreed payment, but do not create pressure either.

### Mistakes to avoid
- sending a bare payment link with no context;
- introducing new terms at the payment stage;
- saying work is already active when verification is pending;
- promising an immediate start date that Delivery has not approved;
- turning the payment message into another sales pitch.

### Practice prompt
Write a four-sentence payment explanation for a buyer who has just accepted a standard website quotation.
$md$,11,true),

  (v_module,'Build a Clear Payment Request Message',$md$
## Objective
Communicate enough information for the customer to act confidently without overwhelming them.

## Operating rule
A good payment message should contain:
- customer/project context;
- current approved milestone;
- amount and currency;
- purpose of the milestone;
- official secure payment route;
- due timing if one is approved;
- what happens after verification;
- a simple invitation to ask if anything is unclear.

### Example structure
“Hi Sarah — as agreed in quotation Q-____, the next step is the approved Advance milestone of ____. Here is the official ProFox payment request. Once the payment is verified in our system, we’ll move into the approved onboarding process. If the link or any payment detail looks different from what you expected, please tell me before completing it.”

### Mistakes to avoid
- adding surprise fees in the message;
- quoting a different amount from the CRM;
- using a personal URL;
- saying “non-refundable” or adding legal terms that are not in the approved agreement;
- requesting sensitive credentials by reply.

### Practice prompt
Draft a payment request message that a customer could understand in under 20 seconds.
$md$,12,true),

  (v_module,'Never Collect Sensitive Payment Credentials',$md$
## Objective
Protect customers and ProFox by keeping sensitive payment data inside approved secure systems.

## Operating rule
**Sales representatives must never request, store, copy or use a customer’s sensitive payment credentials.**

Never request or retain:
- full card number;
- CVV/security code;
- PIN;
- online banking password;
- OTP/one-time code;
- recovery/security answers;
- screenshots exposing sensitive credentials.

### Scenario
Customer says: “I’m busy. I’ll send you the card number and OTP—please complete it for me.”

Correct response: do not accept or use the information. Explain that for their security they must complete the approved secure checkout themselves. If they already sent sensitive data, do not copy it into CRM notes or other systems; escalate according to company security procedure.

### Why this matters
A helpful intention does not make credential handling safe. The salesperson should help with process questions, not become the payment processor.

### Practice prompt
Write one short response that refuses an OTP/card-detail request without making the customer feel blamed.

**Critical standard:** never trade customer security for convenience.
$md$,13,true),

  (v_module,'“I’ve Paid” Is Information, Not Verification',$md$
## Objective
Respond correctly when a customer says payment is complete.

## Operating rule
**Thank the customer, record the information if useful, and check the official payment state. Do not declare the transaction verified yourself.**

### Correct conversation
Customer: “Paid. Screenshot attached.”

Seller: “Thank you — I’ve noted it. The payment will now be confirmed through our official verification process. I’ll follow the CRM status rather than the screenshot so we keep the record accurate.”

### Why screenshots are not enough
A screenshot can be delayed, incomplete, duplicated, edited, refer to another transaction, or show a state that has not settled. Even genuine evidence is not the same thing as the protected ProFox verification event.

### Mistakes to avoid
- setting Verified manually;
- marking the opportunity Won;
- telling the project team to begin;
- promising commission is earned;
- changing amount_paid based on a screenshot.

### Practice prompt
A customer sends proof at 11 PM and asks you to “confirm receipt now.” What do you say and what do you do in CRM?
$md$,14,true),

  (v_module,'Phase Checkpoint — Follow Up Without Chasing',$md$
## Objective
Use professional follow-up that removes friction rather than creating pressure.

## Operating rule
**Diagnose the delay before pushing for payment.**

Useful questions include:
- “Did the official payment link open correctly?”
- “Is anything unclear about this milestone?”
- “Is there an internal approval step on your side?”
- “Would you like me to resend the official request?”

Do not assume a delay means the buyer is avoiding payment. The issue may be a technical failure, procurement step, time-zone difference, card limit or simply an agreed future due date.

### Avoid
- “Why haven’t you paid?”
- daily pressure when no such cadence is approved;
- fake deadlines;
- threats not supported by the agreement;
- sending multiple different payment links because the customer has not replied.

### Scenario
The payment request was sent yesterday and is not due for five days. The seller should not manufacture urgency just to improve month-end numbers.

### Practice prompt
Write two follow-ups: one for a technical payment problem and one for a customer who simply missed an agreed due date.

**Phase standard:** clear, helpful, persistent when appropriate—never manipulative.
$md$,15,true);
end $$;
