-- Module 16 lessons 01–05 — Payment Readiness

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Payment Is Part of the Customer Experience',$md$
## Objective
Understand why payment is part of the sales experience, not an awkward administrative afterthought.

## Operating rule
**A good close should flow naturally into a clear, secure payment process.**

The customer has just decided to trust ProFox. Confusing instructions, random account details, vague amounts or aggressive chasing can damage that trust immediately.

The ideal transition is:
**Decision → Accepted quotation → Correct payment request → Secure payment → Verification → Onboarding.**

### Example
Instead of saying, “Here is the link—pay it today,” say:
“Your quotation is accepted. The next step is the agreed initial milestone. I’ll send the official ProFox payment request, and once it is securely verified in our system we’ll move into onboarding.”

### Mistakes to avoid
- sounding like a debt collector immediately after closing;
- sending a payment request before checking the accepted quotation;
- creating urgency that was never agreed;
- treating payment as separate from customer experience;
- promising project activation before verification.

### Practice prompt
Explain the next payment step to a newly closed buyer in 30 seconds using calm, professional language.

**Remember:** payment should feel easy for the client and controlled for ProFox.
$md$,1,true),

  (v_module,'Accepted Does Not Mean Paid',$md$
## Objective
Separate commercial agreement from financial confirmation.

## Operating rule
**Quotation acceptance, customer payment claims and verified payment are different events.**

Understand the chain:
1. **Quotation Accepted** — the buyer accepted the commercial proposal.
2. **Payment Requested** — ProFox created the correct milestone request.
3. **Customer Says “Paid”** — useful information, but not financial verification.
4. **Payment Evidence/Provider State** — the transaction is being processed or reported.
5. **Payment Verified** — the protected ProFox workflow has confirmed the qualifying payment.
6. **Protected downstream transition** — where applicable, the opportunity can become Won and the client handoff can proceed.

### Example
The customer messages, “Done, I have paid.” The correct response is to thank them and tell them the payment will be checked through the official process. Do not announce that the project is active until the CRM shows the approved verified state.

### Mistakes to avoid
- treating a screenshot as verification;
- marking Won after verbal confirmation;
- telling Delivery to begin before the qualifying payment is verified;
- confusing an accepted quote with settled funds.

### Practice prompt
In your own words, explain the difference between **Accepted**, **Customer says paid**, and **Verified**.

**Memory rule:** acceptance creates the commercial obligation; verification activates the protected business transition.
$md$,2,true),

  (v_module,'Know Your Payment Authority',$md$
## Objective
Know exactly what Sales owns and what must remain controlled by the financial workflow.

## Operating rule
**Sales owns payment communication. Sales does not own financial truth.**

### Sales may
- prepare an approved payment request;
- select the correct approved milestone;
- send the official payment link/instructions;
- explain the agreed payment structure;
- follow up professionally;
- record customer communication;
- identify mismatches;
- escalate exceptions.

### Sales may not
- declare money received without verification;
- set a payment to Verified;
- mark a deal Won to speed up delivery;
- use a personal payment account;
- invent payment schedules, fees or currency rules;
- collect card credentials, passwords, PINs or OTPs;
- independently approve refunds;
- start work by bypassing the qualifying payment requirement.

### Example
A client sends a successful-transfer screenshot and asks you to start immediately. Your role is to acknowledge it, record the information, and let the protected verification process decide what happens next.

### Practice prompt
Write two columns: “Sales can do” and “Sales cannot do.” Add five actions to each without looking back at this lesson.
$md$,3,true),

  (v_module,'Read the Accepted Quotation First',$md$
## Objective
Use the accepted commercial record as the source for the payment request.

## Operating rule
**Never create a payment request from memory.**

Before requesting money, confirm:
- accepted quotation number and current accepted version;
- customer/company identity;
- currency;
- quotation total;
- selected package/custom scope;
- approved payment schedule;
- current milestone;
- earlier verified/partial payments;
- outstanding amount;
- any approved exception.

### Example
You remember a Growth buyer as a 50/30/20 project, but the accepted quote contains an Admin-approved exception. The accepted commercial record controls; your memory does not.

For standard packages, use the current Admin-configured product payment schedule in the CRM. For custom work, follow the approved custom quotation/milestone structure.

### Mistakes to avoid
- copying a payment from an old client;
- using an outdated quotation version;
- assuming currency;
- requesting the next milestone before checking earlier payment state;
- relying on training examples instead of the live commercial record.

### Practice prompt
Create a 60-second pre-payment checklist that would prevent you from sending the wrong amount or milestone.
$md$,4,true),

  (v_module,'Phase Checkpoint — Payment Readiness',$md$
## Objective
Confirm that you can decide whether a payment request is ready before touching the payment workflow.

## Operating rule
Before sending anything, be able to answer:
**What was accepted? → What is due now? → Why is it due? → How much? → Which currency? → Which official channel? → What happens after verification?**

### Readiness checkpoint
Ask yourself:
- Is the quotation formally accepted?
- Am I working from the current accepted version?
- Is the milestone approved for this package/project?
- Is the amount system-derived or otherwise approved?
- Is the currency correct?
- Am I using an official ProFox payment method?
- Do I understand the verification boundary?

If any answer is unclear, stop and verify before requesting money.

### Scenario
The buyer accepted the scope but asks you to split the first milestone differently from the approved schedule. The payment is **not** ready to improvise. The requested commercial change must be reviewed through the correct authority first.

### Practice prompt
Explain why “the customer is ready to pay” is not, by itself, enough information to create a payment request.

**Phase standard:** verify before you request.
$md$,5,true);
end $$;
