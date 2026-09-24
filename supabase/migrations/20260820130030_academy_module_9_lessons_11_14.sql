-- Module 9 lessons 11–14
WITH m AS (SELECT id FROM public.training_modules WHERE slug='discovery-script'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 11 · Status Quo — Understand the Cost of Doing Nothing',$lesson$
# Understand the cost of doing nothing

Every sales opportunity competes with a powerful alternative: **leave things as they are**.

A buyer can agree that a problem exists and still decide that changing it is not worth the disruption, money, time, or risk.

Discovery must therefore understand the status quo honestly.

Ask:

> “What happens if the current situation stays the same for another year?”

> “Is that something the business can comfortably live with?”

> “What does continuing this manually mean for the team?”

> “If nothing changes before the expansion, what happens?”

> “What is the risk of delaying this?”

## Do not weaponise consequences

You are not trying to frighten the buyer. You are helping them compare two real paths:

**Change** versus **no change**.

Sometimes the buyer will say:

> “Honestly, nothing serious happens. It would just be nice to improve.”

That is useful information. Urgency may be low. The opportunity may need to be nurtured rather than pushed.

Sometimes the answer reveals a major cost:

- lost staff capacity;
- expansion delay;
- continued lost enquiries;
- compliance exposure;
- customer churn;
- reporting blindness.

Let the buyer describe the consequence. Do not put dramatic words in their mouth.

## Rule

**Good discovery can lower urgency as well as raise it. Truth is more valuable than pipeline theatre.**
$lesson$,11),
('Phase 12 · Buying Process — Understand How the Customer Will Actually Buy',$lesson$
# Understand how the customer will actually buy

A strong business problem does not automatically become a purchase. You also need to understand how decisions are made.

Avoid the blunt question:

> “Are you the decision maker?”

It can make valuable contacts feel dismissed.

Ask instead:

> “For a project like this, who would normally be involved in evaluating the decision?”

> “Who else would want input?”

> “Who ultimately approves the investment?”

> “Are there technical, finance, marketing, operational, or ownership stakeholders we should involve?”

> “How have you made similar decisions in the past?”

A contact may be:

- final approver;
- joint decision maker;
- internal champion;
- researcher;
- end user;
- technical evaluator;
- finance reviewer;
- influencer.

Every role can matter.

## Multi-thread without bypassing

If another stakeholder should join, do not go around your contact secretly. Ask how they would like that person involved.

> “Would it be useful to include James in the next conversation so he can hear the same context and raise any concerns directly?”

## Understand the process

Clarify:

- who evaluates;
- who approves;
- what criteria matter;
- whether procurement/legal/security review exists;
- whether budget has to be released;
- what sequence normally happens.

## Rule

**Do not just qualify the person. Understand the decision system around the person.**
$lesson$,12),
('Phase 13 · Decision Criteria — Discover What Good Means to the Buyer',$lesson$
# Discover what “good” means to the buyer

Different customers judge the same project differently.

One website buyer may prioritise conversion. Another may prioritise premium visual identity. Another may care most about ease of updating, SEO, speed, or ongoing support.

Ask:

> “When you compare possible partners or approaches, what will matter most?”

Possible criteria include:

- business outcomes;
- price/investment;
- speed;
- design quality;
- custom functionality;
- reliability;
- SEO capability;
- communication;
- support;
- technical expertise;
- security;
- integrations;
- ownership/control;
- relevant experience;
- maintenance and long-term fit.

Then distinguish importance:

> “Which of those are absolute requirements?”

> “Which would be nice to have?”

> “If two providers were similar, what would break the tie?”

## Why this matters

Without decision criteria, sellers often present what **they** are proud of rather than what the customer will use to choose.

Do not manipulate the criteria by telling the buyer what they “should” care about. You can educate when a risk is genuinely important, but the final criteria belong to the buyer.

## Rule

**Your presentation later should map ProFox strengths to buyer-stated criteria, not to a generic feature list.**
$lesson$,13),
('Phase 14 · Commercial Context — Budget Is Business Context, Not a Trap',$lesson$
# Budget is business context, not a trap

Money belongs in a business conversation. The goal is not to make the prospect reveal the highest amount they could possibly spend. The goal is to understand what level of investment is realistic relative to the problem and desired outcome.

Current approved ProFox commercial reference:

- **$599 Website Package**
- **$2,379 Business Package**
- **$5,799+ Premium Package**
- **Custom Web Applications — quotation based on approved scope**

Always verify the **live Sales Catalog** before quoting because Admin may update pricing or terms.

A natural transition is:

> “We have talked about the impact and what you are hoping to improve. It would also be useful to understand investment expectations so I do not recommend something unrealistic. Have you already established a range?”

If they have not:

> “Would it help if I explain the typical investment ranges we work within?”

If they ask your price first, answer approved information honestly rather than hiding it to force another meeting.

## What not to do

Never:

- invent a discount;
- promise an unapproved payment arrangement;
- ask “What is your maximum budget?” as a manipulation tactic;
- quote a custom application before sufficient scoping;
- imply that spending more automatically produces a guaranteed result;
- hide known approved pricing solely to force the next call.

## Budget can reveal fit

A limited budget does not make someone a bad prospect or a bad person. It may mean:

- smaller scope;
- phased work;
- different approved package;
- later timing;
- no current fit.

## Rule

**Discuss money in proportion to your understanding of the problem. Use commercial truth to create clarity, not pressure.**
$lesson$,14)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
