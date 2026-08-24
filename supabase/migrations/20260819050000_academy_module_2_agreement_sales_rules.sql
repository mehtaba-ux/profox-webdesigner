-- Module 2 — Agreement & Sales Rules
-- Approved seller-facing high-ticket sales operating curriculum.
-- Organized into six learning parts, a scenario knowledge check, and final acknowledgement.
-- All lesson text remains editable through the existing Admin Curriculum & Module Editor.
-- Existing user progress records are intentionally preserved.

UPDATE public.training_modules
SET description = 'Understand your Sales Partner agreement, authority limits, pricing and quotation controls, high-ticket qualification discipline, CRM and payment rules, and the ProFox operating standard for ethical, professional selling.',
    module_type = 'lesson',
    required = true,
    active = true,
    passing_score = NULL,
    requires_admin_review = false,
    updated_at = now()
WHERE slug = 'agreement-rules';

DELETE FROM public.training_lessons
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug = 'agreement-rules' LIMIT 1);

INSERT INTO public.training_lessons (module_id, title, content, video_url, sort_order, active, updated_at)
SELECT m.id, v.title, v.content, '', v.sort_order, true, now()
FROM public.training_modules m
CROSS JOIN (VALUES

(1, 'Part 1 · Agreement, Role & Authority', $lesson$
# Part 1 — Agreement, Role & Authority

**Learning goal:** Understand the agreement you signed, the authority you have, the authority you do not have, and how to communicate confidently without creating unauthorized commitments.

---

## Training 1 — Why These Rules Matter

High-value selling requires freedom to have good conversations—but it also requires clear boundaries.

A ProFox Sales Partner may be discussing projects worth thousands of dollars, business-critical applications, customer data, payment commitments and long-term client relationships.

One inaccurate promise can create consequences far beyond one sales call.

That is why ProFox uses a simple principle:

> **Sell confidently. Commit carefully. Record accurately.**

You are expected to take ownership of the sales conversation.

But you must never create obligations for ProFox that have not been approved.

---

## Training 2 — Your Agreement and Your Role

Before receiving Sales Academy access, your ProFox Independent Sales Partner Agreement must already have been signed and verified through the approved agreement process.

This training **does not replace your signed agreement**.

It helps you understand how to operate under it.

As a Sales Partner, your role may include:

- researching prospects;
- qualifying opportunities;
- conducting approved outreach;
- booking meetings;
- conducting discovery conversations;
- understanding business problems;
- presenting appropriate ProFox solutions;
- preparing or supporting quotations through the authorized system;
- following up professionally;
- helping an appropriate prospect reach a purchase decision;
- maintaining accurate CRM records;
- handing a successful sale to the delivery team.

You are trusted to sell.

You are **not automatically authorized to legally bind ProFox**.

That distinction is critical.

---

## Training 3 — The ProFox Rule of Authority

There are three categories you must always distinguish:

### You may discuss
You may explain approved ProFox services, capabilities, processes and currently authorized commercial information.

### You may recommend
You may recommend an appropriate solution based on the customer's needs.

### You may not authorize
You cannot independently create binding commitments for ProFox unless the system or an authorized Admin specifically gives you that authority.

> **Recommendation is not authorization.**

If something requires approval, you do not need to sound uncertain.

Use language such as:

> **“That requirement is possible for us to review. Let me confirm the exact scope with our team before I commit it to the proposal.”**

That increases credibility. It does not weaken the sale.

---

## Training 4 — Never Invent an Answer

A professional Sales Partner must be comfortable saying:

> **“I need to confirm that.”**

Never invent:

- technical capabilities;
- integrations;
- features;
- delivery timelines;
- project staffing;
- guarantees;
- prices;
- discounts;
- payment terms;
- legal provisions;
- support commitments;
- custom scope;
- results;
- ROI statistics;
- security claims.

If you do not know, confirm.

> **Uncertainty can be checked. A false promise cannot be unsaid.**

### Key takeaway
**Know your authority. Communicate confidently. Confirm before committing.**
$lesson$),

(2, 'Part 1 · Think Like a Business Advisor', $lesson$
# Part 1 — Think Like a Business Advisor

**Learning goal:** Shift from “convincing someone to buy” to diagnosing whether ProFox can create meaningful business value.

---

## Training 5 — Think Like a Business Advisor

High-ticket customers are rarely buying only a collection of technical features.

They are evaluating:

- whether they trust the company;
- whether the solution fits their business;
- whether the problem is important enough to solve;
- whether the investment makes commercial sense;
- whether ProFox can actually deliver;
- whether the buying process is clear and low-risk.

Your job is therefore not:

> **“How can I convince this person to buy?”**

Your job is:

> **“Can I understand this business well enough to determine whether ProFox should help them?”**

That change in mindset is fundamental.

Qualification protects both sides.

A strong high-value seller wants clarity around the business problem, measurable impact, decision authority, buying process, timing and fit before treating an opportunity as healthy.

### Questions to keep in mind

- What is the business trying to improve?
- Why does it matter now?
- What happens if nothing changes?
- Who is affected?
- What would a successful outcome look like?
- Is ProFox genuinely a good fit?

### Key takeaway
**Do not pitch first. Understand first.**
$lesson$),

(3, 'Part 2 · Pricing, Packages & Discounts', $lesson$
# Part 2 — Pricing, Packages & Discounts

**Learning goal:** Use only current Admin-approved commercial information and handle price pressure without weakening the deal.

---

## Training 6 — Pricing and Package Rules

ProFox pricing and commercial information can change.

Therefore, you must always use the **current approved information available inside the ProFox system**.

Never rely on:

- an old screenshot;
- an old PDF;
- a message saved months ago;
- a price you remember;
- a quotation created for another customer.

When Admin changes a product, package, price, add-on or commercial rule, the current Admin-controlled configuration becomes the operating source of truth for new business.

### Never independently:

- reduce an approved price;
- create an unofficial package;
- add free deliverables;
- promise an unapproved bonus;
- change the payment schedule;
- alter a quotation;
- offer a special discount.

If a customer asks for something outside the approved structure:

> **Record the request → explain that it requires approval → escalate it.**

---

## Training 7 — Discounts Are Not a Closing Technique

When a prospect hesitates, inexperienced sellers often immediately reduce the price.

Do not do this.

A price objection can mean many different things:

- value is unclear;
- urgency is low;
- the wrong stakeholder is involved;
- budget truly does not exist;
- the proposed scope is wrong;
- the buyer is comparing alternatives;
- risk still feels too high;
- the buyer is simply negotiating.

Discounting before understanding the reason can weaken the deal.

Instead ask:

> **“Can you help me understand which part of the investment is creating concern?”**

Then listen.

A ProFox Sales Partner can discuss the concern.

Only authorized pricing changes can change the commercial offer.

### Key takeaway
**Diagnose the objection before discussing a commercial change.**
$lesson$),

(4, 'Part 2 · Custom Scope, Quotations & Commitments', $lesson$
# Part 2 — Custom Scope, Quotations & Commitments

**Learning goal:** Protect the client, the delivery team and the sale by controlling scope and commercial commitments carefully.

---

## Training 8 — Custom Projects Need More Discipline

Custom web applications and larger digital systems may involve:

- integrations;
- data structures;
- user roles;
- security requirements;
- workflows;
- third-party services;
- migration;
- APIs;
- complex UI/UX;
- automation;
- regulatory considerations;
- long delivery timelines.

Therefore never casually promise:

> **“Yes, we can build that.”**

before the requirement is understood.

A professional response is:

> **“That sounds like something our custom-development team can evaluate. I'll capture the requirement clearly so we can confirm the architecture, scope and commercial impact before the proposal is finalized.”**

For large custom opportunities:

> **Discovery before prescription. Scope before commitment.**

---

## Training 9 — Quotations Are Controlled Commercial Documents

A quotation is not a casual email.

It may define:

- services;
- deliverables;
- price;
- payment schedule;
- assumptions;
- timing;
- exclusions;
- commercial terms.

Therefore, only use the approved ProFox quotation process.

Never:

- manually change a final quotation outside the system;
- send a fake quotation;
- copy another customer's quotation without reviewing it;
- remove important terms to make a sale easier;
- add unapproved scope verbally after the quotation is issued.

If the client requests a change:

> **Update the requirement → follow the approved revision process → send the approved version.**

---

## Training 10 — Your Word Has Commercial Weight

When you represent ProFox, customers may reasonably believe what you say.

Therefore phrases such as:

- “We'll include that.”
- “That's guaranteed.”
- “No problem, that's free.”
- “It will definitely be ready next week.”

can matter enormously.

Before committing, ask yourself:

1. **Do I have authority?**
2. **Is this approved?**
3. **Is it written in the current scope?**
4. **Can the delivery team actually deliver it?**

If any answer is unclear:

> **Confirm before committing.**

### Key takeaway
**The proposal and approved system define the commitment—not an improvised promise on a call.**
$lesson$),

(5, 'Part 3 · Qualification, Fit & Decision Process', $lesson$
# Part 3 — Qualification, Fit & Decision Process

**Learning goal:** Recognize a real high-value opportunity and avoid wasting time on interest that is not commercially qualified.

---

## Training 11 — Never Sell a Bad-Fit Project

High-ticket sales does not mean closing everyone.

Some opportunities should not move forward.

Examples may include a prospect who:

- has no meaningful business need;
- expects something ProFox cannot reasonably deliver;
- wants unrealistic guarantees;
- refuses the approved commercial process;
- expects deceptive or unlawful work;
- does not have access to the real decision process;
- continually changes the project without accepting the commercial impact;
- behaves fraudulently or abusively.

A poor-fit $10,000 deal can be worse than no deal.

It can create:

> **scope problems → delivery problems → payment problems → unhappy customers → reputational damage**

Good sellers qualify in.

Great sellers can also qualify out.

---

## Training 12 — The High-Value Opportunity Standard

Before treating a significant opportunity as genuinely advanced, you should be able to answer:

### Problem
What business problem are they actually trying to solve?

### Impact
What happens because this problem exists?

### Desired outcome
What would improve if it were solved?

### Value
Why would solving it justify investment?

### Decision maker
Who ultimately has the authority to approve the purchase?

### Stakeholders
Who else influences the decision?

### Decision criteria
What will they use to choose a provider?

### Decision process
What needs to happen internally before they can say yes?

### Timing
Why does this need to happen now?

### Budget reality
Is the expected investment commercially realistic?

### Competition
What alternatives are they considering—including doing nothing?

### Next step
What specific action has both sides agreed will happen next?

> **A high-value deal should become clearer as it progresses—not more mysterious.**

---

## Training 13 — Do Not Confuse Interest With Qualification

These statements do **not** mean you have a qualified opportunity:

- “Looks interesting.”
- “Send me some information.”
- “We might need a new website.”
- “Send the proposal.”
- “I'll talk to my partner.”

Interest is useful.

It is not qualification.

Before investing substantial time in a high-ticket proposal, try to understand:

- the problem;
- business impact;
- priority;
- authority;
- timing;
- commercial fit;
- buying process.

---

## Training 14 — Understand the Decision Maker

One common reason complex deals stall is that the person you are speaking with cannot actually approve the purchase.

Never disrespect an existing contact simply because they are not the final decision maker.

They may become an important internal advocate.

Instead understand:

- Who owns the problem?
- Who will use the solution?
- Who controls the budget?
- Who can approve the investment?
- Who could block the decision?
- Who needs to be involved before the proposal is approved?

### Key takeaway
**Interest is not qualification. Qualification means understanding the business case and the buying process.**
$lesson$),

(6, 'Part 3 · High-Ticket Momentum & Deal Self-Check', $lesson$
# Part 3 — High-Ticket Momentum & Deal Self-Check

**Learning goal:** Move qualified deals forward with clear next steps while avoiding fake urgency and pressure.

---

## Training 15 — High-Ticket Selling Requires Next-Step Discipline

A good meeting should not end with:

> **“Okay, we'll stay in touch.”**

Before ending an important sales conversation, establish what happens next.

For example:

> **“Based on what we've discussed, the logical next step is for us to prepare the recommended scope and review it together. Would Tuesday or Wednesday work better?”**

Every meaningful deal should ideally have:

> **Next action + owner + date/time**

Then record it in CRM.

---

## Training 16 — Do Not Pressure a Prospect Into a Bad Decision

A high-ticket purchase may require serious consideration.

Pressure can create cancellations, refund requests and distrust.

Your goal is to create:

> **clarity + confidence + appropriate urgency**

Not fear.

Good urgency can come from:

- a genuine business problem;
- a real deadline;
- opportunity cost;
- a known operational issue;
- an approved availability constraint.

Fake urgency includes:

> **“This price disappears in ten minutes!”**

when that is not true.

Do not use it.

---

## Training 17 — High-Ticket Deal Self-Check

Before telling yourself:

> **“This deal is close.”**

ask:

### Problem
Can I explain their real business problem in one sentence?

### Impact
Do I understand why it matters?

### Outcome
Do I know what improvement they want?

### Value
Can the investment be reasonably justified?

### Decision
Do I know who actually approves it?

### Process
Do I know how they make the decision?

### Fit
Can ProFox genuinely solve this?

### Scope
Is what we are proposing clear?

### Commercials
Am I using approved pricing and terms?

### Competition
What else are they considering?

### Next step
Is there an agreed action and date?

If several answers are **“I don't know,”** the deal is not as advanced as it looks.

Return to discovery.

---

## Training 18 — What Excellent ProFox Selling Looks Like

An excellent Sales Partner can be:

- **confident without exaggerating;**
- **persistent without becoming intrusive;**
- **commercial without becoming greedy;**
- **consultative without becoming passive;**
- **knowledgeable without pretending to know everything;**
- **focused on closing without forcing a bad deal.**

The goal is not merely to become good at talking.

The goal is to become good at **judgment**.

That is especially important when selling expensive, custom and business-critical solutions.

### Key takeaway
**Every serious deal needs clarity, momentum and judgment—not pressure.**
$lesson$),

(7, 'Part 4 · CRM, Lead Ownership & Commission Integrity', $lesson$
# Part 4 — CRM, Lead Ownership & Commission Integrity

**Learning goal:** Use the CRM as the source of truth and protect lead attribution and commission accuracy.

---

## Training 19 — Never Bypass the ProFox CRM

If a conversation matters, the CRM must know about it.

Your memory is not the system of record.

Your WhatsApp history is not the system of record.

Your private notebook is not the system of record.

### Record important information such as:

- prospect details;
- source;
- qualification;
- business pain;
- objectives;
- relevant stakeholders;
- calls;
- meetings;
- notes;
- agreed next actions;
- quotation status;
- important objections;
- expected timing;
- payment progress;
- handover details.

The CRM protects attribution, follow-up, forecasting, customer continuity and commission accuracy.

> **If the next person handling the account would need to know it, record it.**

---

## Training 20 — Lead Ownership and Self-Sourced Opportunities

Do not assume that finding a company online automatically makes it your lead.

A self-sourced opportunity must follow the current ProFox attribution rules.

Before claiming a prospect, check the system.

The business may already be:

- an existing ProFox client;
- an active lead;
- an opportunity owned by another representative;
- associated with a current campaign;
- otherwise protected by the Company's attribution rules.

Never manipulate lead-source records to obtain additional commission.

Lead attribution must reflect reality.

---

## Training 21 — The Self-Sourced Commission Principle

ProFox may provide additional commission treatment for eligible opportunities that are genuinely **self-generated and closed by the same Sales Partner**.

The exact percentage is dynamic and governed by current Admin commission settings and the seller's applicable agreement.

Do not memorize the percentage from an old training document.

Always rely on the current authorized system.

> **The bonus rewards genuine business development—not creative CRM editing.**

False source attribution is a serious integrity issue.

---

## Training 22 — Commission Must Follow the System

Do not calculate your expected earnings from memory and treat them as final.

Commission can depend on:

- product/service;
- approved rate;
- verified payment;
- payment installments;
- self-source eligibility;
- approved custom-project rate;
- applicable bonuses;
- refunds/reversals;
- other current contractual rules.

The ProFox commission ledger is the operating record.

If something appears incorrect:

> **Do not alter deal records to fix commission. Raise the issue through the appropriate review process.**

### Key takeaway
**Accurate CRM records protect the client, the company and your commission.**
$lesson$),

(8, 'Part 4 · Client Payments & Verified Won', $lesson$
# Part 4 — Client Payments & Verified Won

**Learning goal:** Understand exactly how client payments are handled and when a sale officially becomes Won.

---

## Training 23 — Client Payments

Never collect ProFox client payments personally.

Do not ask a client to send Company project money to:

- your personal bank account;
- personal PayPal;
- personal Wise account;
- personal payment wallet;
- cryptocurrency wallet;
- another unauthorized destination.

Use only the current official payment method generated or approved by ProFox.

If a client sends payment evidence, record or forward it through the approved process.

Do not independently declare the payment verified.

---

## Training 24 — A Sale Is Not Won Until Payment Is Verified

A customer's verbal agreement is progress.

A signed quotation can be progress.

A payment screenshot can be progress.

But ProFox uses a controlled commercial transition.

The deal becomes officially **Won** only through the approved payment-verification process.

Sales Partners do not manually bypass that process.

This protects:

- revenue records;
- clients;
- project creation;
- commissions;
- delivery;
- financial reporting.

> **Promise to buy ≠ verified sale.**

### Key takeaway
**Only approved, verified client funds can complete the commercial sale transition.**
$lesson$),

(9, 'Part 5 · Data, Outreach, Claims & Evidence', $lesson$
# Part 5 — Data, Outreach, Claims & Evidence

**Learning goal:** Protect confidential information and build trust through lawful outreach and accurate claims.

---

## Training 25 — Protect Client and Company Information

During sales activity, you may encounter:

- names;
- email addresses;
- phone numbers;
- project requirements;
- budgets;
- credentials;
- proposals;
- business problems;
- internal company information;
- customer records;
- payment information.

Access to information does not mean ownership of it.

Use it only for authorized ProFox work.

Never:

- sell lead lists;
- export customer information for yourself;
- share credentials;
- send internal information to unauthorized people;
- reuse confidential client information to impress another prospect;
- publicly discuss private customer details.

A later Academy module covers Confidentiality & Data Protection in depth.

For now:

> **If information is private, treat it as private.**

---

## Training 26 — Professional Outreach Rules

ProFox does not want sales created through spam, harassment or deception.

Never:

- pretend to be someone else;
- hide your commercial intent dishonestly;
- fabricate a customer relationship;
- continue contacting someone who has clearly opted out where applicable;
- send abusive or threatening messages;
- use fake scarcity;
- publish false claims;
- make false statements about competitors;
- use customer data unlawfully.

Be persistent when appropriate.

Do not become intrusive.

Your reputation and ProFox's reputation travel together.

---

## Training 27 — Never Guarantee Results You Cannot Control

Do not promise:

- “This website will definitely double your revenue.”
- “You are guaranteed to rank #1.”
- “This automation will save exactly 50 hours every month.”
- “You will recover your investment in 30 days.”

Unless a specific statement is formally approved and supported, do not present forecasts as guaranteed outcomes.

You can talk about:

- business objectives;
- expected benefits;
- relevant evidence;
- previous results where accurately documented;
- reasonable potential;
- measurable targets.

There is an enormous difference between:

> **“Our goal is to improve conversion.”**

and

> **“I guarantee you will make $100,000.”**

Understand that difference.

---

## Training 28 — Evidence Before Claims

When using case studies or previous ProFox work:

Use only information that is:

- accurate;
- approved;
- relevant;
- supported.

Do not inflate project results.

Do not claim work ProFox did not perform.

Do not claim a client endorsement that does not exist.

Trust is difficult to earn and very easy to destroy.

### Key takeaway
**Trust is built through truth, evidence and professional conduct.**
$lesson$),

(10, 'Part 5 · Escalation, Competitors & Red Flags', $lesson$
# Part 5 — Escalation, Competitors & Red Flags

**Learning goal:** Know what to do when something falls outside your authority or creates commercial, legal, security or reputational risk.

---

## Training 29 — Handling Something Outside Your Authority

Use this four-step rule:

### 1. Do not guess.
### 2. Capture the requirement clearly.
### 3. Tell the client you will confirm it.
### 4. Escalate through the appropriate ProFox process.

For example:

**Client:**
“Can you integrate this with our proprietary warehouse system and deliver everything in three weeks?”

**Wrong response:**

> “Absolutely. No problem.”

**Better response:**

> **“That's an important requirement. I'll document the integration and timeline correctly and have our technical team validate both before we include them in the final scope.”**

That response protects the deal **and** makes you sound more professional.

---

## Training 30 — Never Attack a Competitor

A prospect may ask:

> **“Why should I choose ProFox instead of Agency X?”**

Do not respond by inventing negative information about Agency X.

Instead compare:

- approach;
- scope;
- process;
- fit;
- capability;
- customer experience;
- transparency;
- relevant differentiators.

Professional sellers elevate their own position.

They do not need to damage someone else's reputation.

---

## Training 31 — Red Flags That Require Escalation

Pause and escalate when you encounter situations such as:

- request for unusual payment routing;
- suspected fraud;
- customer asking you to falsify something;
- abusive or threatening conduct;
- request for deceptive marketing;
- serious legal/compliance concern;
- unclear ownership of intellectual property;
- extraordinary security requirement;
- highly unusual contract clause;
- very large unapproved discount;
- major custom requirement;
- conflict involving another ProFox representative;
- potential data incident;
- request to bypass the CRM or payment process.

Good escalation is not failure.

It is professional judgment.

---

## Training 32 — What You Must Never Do

A ProFox Sales Partner must never knowingly:

1. create unauthorized discounts;
2. make false promises;
3. guarantee unapproved outcomes;
4. fabricate capabilities;
5. accept client money personally;
6. self-verify payments;
7. manipulate lead attribution;
8. falsify CRM records;
9. misuse confidential information;
10. share account credentials;
11. sign binding documents for ProFox without authority;
12. hide material customer requirements from delivery;
13. promise custom scope without approval;
14. bypass approved quotations or payment processes;
15. misrepresent ProFox, a client or a competitor;
16. use deceptive or unlawful sales practices.

These are not suggestions.

They are operating boundaries.

### Key takeaway
**When risk or authority is unclear, stop, document and escalate.**
$lesson$),

(11, 'Part 6 · ProFox High-Ticket Sales Operating Standard', $lesson$
# Part 6 — ProFox High-Ticket Sales Operating Standard

**Learning goal:** Bring the entire module together into one repeatable operating standard.

---

## Training 33 — The ProFox High-Ticket Sales Operating Standard

Before moving a serious opportunity forward, remember:

### **Understand before pitching.**
Know the problem.

### **Qualify before investing heavily.**
Know whether the opportunity is real.

### **Value before price defense.**
Make the business case clear.

### **Authority before commitment.**
Know who can decide—and know what you can authorize.

### **Scope before promise.**
Do not sell undefined work.

### **CRM before memory.**
Keep the record accurate.

### **Approved quotation before verbal changes.**
Commercial terms belong in the controlled process.

### **Verified payment before Won.**
Never bypass the financial gate.

### **Truth before commission.**
Never distort information to earn a sale.

### **Long-term relationship before short-term win.**
Sell something ProFox can be proud to deliver.

---

## Training 34 — Before You Continue

You should now understand:

- what authority a ProFox Sales Partner has;
- what you may not commit without approval;
- why current Admin information is the commercial source of truth;
- why discounts require authorization;
- how to treat custom projects;
- why qualification matters in high-value sales;
- why decision authority and buying process matter;
- why CRM accuracy is mandatory;
- how lead-source integrity affects commission;
- why quotations are controlled documents;
- how payments become verified;
- when a sale becomes Won;
- how to handle confidential information;
- what claims and guarantees are unacceptable;
- how to escalate uncertainty;
- why every serious opportunity needs an agreed next step.

## The standard in one sentence

> **Understand deeply, sell truthfully, commit carefully, document accurately and move the right customer forward.**
$lesson$),

(12, 'Knowledge Check · 10 High-Ticket Sales Scenarios', $lesson$
# Knowledge Check — 10 High-Ticket Sales Scenarios

**Purpose:** Test whether you can apply the rules in a real conversation—not merely remember the wording.

For each scenario, decide what you would do **before reading the recommended action**.

---

## Scenario 1 — “Give me 20% off and I'll pay today.”

A qualified prospect says they will pay immediately if you reduce the current quotation by 20%.

### What should you do?
Do **not** promise the discount. First understand what is driving the objection. If a commercial adjustment is genuinely appropriate, record the request and obtain the required Admin approval.

**Principle:** Discounting is controlled; diagnose before changing price.

---

## Scenario 2 — Payment screenshot

A customer sends you a screenshot showing that they transferred the deposit.

### Can you mark the opportunity Won?
No. Record or forward the evidence through the approved process. The payment must be received, matched and verified through the authorized ProFox process before the opportunity becomes Won.

**Principle:** Payment evidence is not payment verification.

---

## Scenario 3 — Unknown integration

A prospect asks whether ProFox can integrate with a proprietary system you have never seen.

### What should you say?
Capture the requirement clearly and explain that the technical team will validate feasibility, scope and commercial impact before it is included in the proposal.

**Principle:** Confirm before committing.

---

## Scenario 4 — “Send me a proposal” after five minutes

A prospect likes the idea and immediately asks for a proposal, but you do not know the business impact, budget reality, decision maker or buying process.

### Is this a qualified opportunity?
Not yet. Continue discovery before investing heavily in a high-value proposal.

**Principle:** Interest is not qualification.

---

## Scenario 5 — Your contact is not the final approver

Your contact loves the solution but says their managing director must approve the investment.

### What should you do?
Respect your current contact and understand how the managing director becomes involved, what they care about, and what the internal decision process requires.

**Principle:** Understand authority without undermining your champion.

---

## Scenario 6 — Old package screenshot

A prospect refers to an old screenshot showing a lower package price.

### Which price should you use?
Use the current Admin-approved commercial information in the ProFox system. Explain any difference accurately and escalate if a special commercial decision is requested.

**Principle:** Current Admin configuration is the source of truth for new business.

---

## Scenario 7 — Competitor comparison

A prospect asks you to explain why another agency is “bad.”

### What should you do?
Do not invent negative claims. Compare ProFox on relevant approach, scope, process, fit, capability and customer experience.

**Principle:** Elevate ProFox without attacking competitors.

---

## Scenario 8 — Self-sourced lead conflict

You discover a company independently, but the CRM shows an active opportunity owned by another ProFox representative.

### Can you claim it as self-sourced?
No. Follow the attribution rules and escalate any genuine ownership dispute using the CRM history and evidence.

**Principle:** Lead-source integrity comes before bonus commission.

---

## Scenario 9 — “Guarantee me #1 on Google.”

A prospect says they will sign if you guarantee a #1 search ranking.

### What should you do?
Do not make an unsupported guarantee. Explain approved objectives, relevant capabilities, evidence and realistic expectations.

**Principle:** Sell expected value without guaranteeing outcomes outside your control.

---

## Scenario 10 — Great meeting, vague ending

A strong discovery call ends with the prospect saying, “Sounds good. We'll speak soon.”

### What should you do before ending the call?
Agree on a specific next action, identify who owns it, and set a date or time where possible. Then record it in CRM.

**Principle:** High-ticket momentum requires a clear next step.

---

# Self-check

If any scenario surprised you, review the relevant lesson before completing the module.

You should be able to explain **why** each recommended action protects the customer, the deal and ProFox.
$lesson$),

(13, 'Final Rules Acknowledgement', $lesson$
# Final Rules Acknowledgement

Before completing Module 2, review each statement carefully.

- **I understand that my signed Sales Partner Agreement governs my relationship with ProFox and this training does not replace it.**
- **I understand the limits of my authority and will not create unauthorized commitments for ProFox.**
- **I will use current Admin-approved pricing, packages, quotations and commercial terms.**
- **I will not offer unauthorized discounts, free work, guarantees or custom scope.**
- **I will keep CRM records accurate and will not manipulate lead attribution or sales records.**
- **I will never collect ProFox client payments through an unauthorized personal account or verify payments myself.**
- **I understand that a sale becomes Won only through the approved payment-verification process.**
- **I will protect customer, prospect and Company information.**
- **When I am uncertain about scope, pricing, legal terms, technical feasibility or authority, I will confirm before committing.**
- **I will prioritize truthful, professional, customer-fit selling over earning a commission from a bad sale.**

## Final confirmation

> **I have read and understood the ProFox Agreement & Sales Rules and agree to follow them throughout my Sales Partner relationship with ProFox.**

When you are ready, select **Complete Module** below. Completing the module records your confirmation that you have reviewed and understood these rules.

---

## Next Module

**Module 3 — Product & Package Training**
$lesson$)

) AS v(sort_order, title, content)
WHERE m.slug = 'agreement-rules';
