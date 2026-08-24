-- Module 16 lessons 06–10 — Build the Right Payment Request

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='payment-process';
  if v_module is null then raise exception 'Module 16 payment-process is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Choose the Correct Payment Type',$md$
## Objective
Select the payment type that matches the accepted commercial milestone.

## Operating rule
**The payment type describes the approved commercial milestone; it is not a free-form label.**

ProFox payment types can include:
- **Advance** — qualifying initial payment for an approved engagement;
- **Design Milestone** — payment connected to an agreed design-stage milestone;
- **Staging Milestone** — payment connected to an agreed staging/delivery milestone;
- **Final Payment** — final scheduled balance;
- **Full Payment** — approved one-time full settlement;
- **Custom Milestone** — used only where the approved custom commercial structure requires it.

The standard package schedule is Admin-configured. Do not memorize percentages as permanent policy; read the live schedule attached to the accepted package.

### Example
If the accepted package’s first configured milestone is Advance, create an Advance request. Do not choose Full Payment simply because the buyer says they are willing to “pay everything now” unless that path is allowed by the commercial workflow.

### Mistakes to avoid
- using Custom Milestone to bypass a standard schedule;
- choosing a payment type based on convenience;
- requesting a later milestone early;
- inventing labels that change the commercial meaning.

### Practice prompt
Explain when you would use Advance, Final Payment and Custom Milestone.
$md$,6,true),

  (v_module,'Milestones Come From the Agreement',$md$
## Objective
Understand that payment schedules are commercial commitments, not salesperson preferences.

## Operating rule
**Follow the accepted quotation and Admin-configured package schedule exactly.**

For standard packages, the CRM reads the structured payment schedule managed in the Sales Catalog. For custom projects, Sales cannot invent a custom milestone amount; the approved custom quotation controls.

### Example
A standard package uses a three-stage schedule. The customer asks, “Can we do 20% now and the rest after launch?” Do not simply create a 20% request. That changes the commercial agreement and must follow the correct exception/approval path.

### Why this matters
Changing a payment schedule affects cash flow, delivery risk, project activation, commission timing and customer expectations. A casual promise on a call can create a serious operational problem.

### Mistakes to avoid
- agreeing verbally before authorization;
- changing milestone order;
- skipping a due milestone because the buyer asks;
- using an old training percentage instead of the current Admin setting.

### Practice prompt
A buyer requests a different installment pattern. Describe the exact steps you take before any new payment request is created.
$md$,7,true),

  (v_module,'Verify the Amount Before You Send',$md$
## Objective
Prevent incorrect payment amounts and duplicate collection mistakes.

## Operating rule
**Never estimate a payment amount manually when the CRM can derive it from the accepted commercial record.**

Before sending, compare:
**accepted quotation total → approved milestone → prior verified/partial amounts → amount due → remaining balance.**

For standard seller-created requests, the protected database workflow derives the milestone amount from the package’s active Admin-configured schedule. That means changing the amount field in the browser is not authority to change the amount.

### Example
Quotation total is $2,379 and the current package schedule says the initial approved milestone is 50%. The protected workflow calculates the request. Do not type a different amount because the customer asked for a “round number.”

### Amount mismatch
If the system-derived amount does not match the accepted agreement, stop. Investigate the quotation, package schedule, earlier payments and any approved exception.

### Mistakes to avoid
- copying an amount from another opportunity;
- rounding without approval;
- ignoring a prior partial payment;
- creating duplicate milestone requests;
- editing records simply to make two numbers match.

### Practice prompt
List the records you would compare if a customer says, “Your link is for the wrong amount.”
$md$,8,true),

  (v_module,'Currency Is Commercial Data',$md$
## Objective
Treat currency as part of the accepted commercial agreement.

## Operating rule
**Use the quotation currency. Never switch currency casually during payment collection.**

Currency affects what the customer owes and how Finance reconciles the transaction. A customer asking, “Can I pay this in another currency?” may be making a reasonable request, but the salesperson cannot silently rewrite the accepted deal.

### Example
The accepted quotation is USD. The customer asks to pay in a different local currency. Do not convert the amount using a rate from Google or your phone. Record the request and follow the approved commercial/finance process if a currency change is permitted.

### Mistakes to avoid
- performing your own FX conversion;
- changing the currency field to make payment easier;
- promising that ProFox absorbs conversion/processing costs unless approved;
- confusing the cardholder’s local display currency with the quotation currency.

### Practice prompt
Write a professional response to: “Can you just tell me the amount in my currency and I’ll transfer it?”
$md$,9,true),

  (v_module,'Phase Checkpoint — Use Only the Official Payment Channel',$md$
## Objective
Lock in secure channel discipline before learning customer communication.

## Operating rule
**Every customer payment must use an approved ProFox payment path. Never route business money through a personal or improvised channel.**

Approved methods/providers are defined by ProFox/Admin and the live payment workflow. When a secure payment link is available, use the payment request linked to the correct quotation/customer.

### Never send
- your personal bank account;
- personal PayPal/wallet details;
- another employee’s account;
- an unapproved shortened or edited payment URL;
- instructions copied from an unrelated customer;
- a screenshot of account details when an approved system process should be used.

### Scenario
Customer says: “Your official link is inconvenient. Send me your personal account and I’ll pay immediately.”

Correct response: politely refuse the personal route and help them use an approved company method or escalate if another company-approved method is needed.

### Practice prompt
Explain why accepting money personally is a major trust, accounting and security failure even if your intention is to forward it to ProFox immediately.

**Phase standard:** correct milestone, correct amount, correct currency, official channel.
$md$,10,true);
end $$;
