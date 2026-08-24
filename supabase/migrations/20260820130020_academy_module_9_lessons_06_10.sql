-- Module 9 lessons 6–10
WITH m AS (SELECT id FROM public.training_modules WHERE slug='discovery-script'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 6 · Impact — Problems Without Impact Rarely Create Strong Decisions',$lesson$
# Problems without impact rarely create strong decisions

A problem becomes commercially meaningful when you understand what it changes in the business.

Prospect:

> “Our enquiry follow-up is slow.”

Weak seller:

> “Great. We provide automation.”

Expert seller:

> “What normally happens when follow-up is delayed?”

Prospect:

> “Some people contact another company.”

Seller:

> “Do you have a sense of how often that happens, or how many enquiries are affected?”

Now you are moving from a feature conversation into business impact.

## Explore the right impact categories

**Revenue** — missed opportunities, lower conversion, lost repeat business.

**Cost** — unnecessary tools, rework, expensive manual processes.

**Time** — repetitive administration, delays, staff capacity.

**Customer experience** — confusion, slow response, abandonment, poor trust.

**Operational risk** — mistakes, missing information, weak visibility, dependence on one person.

**Strategic impact** — inability to scale, launch, expand, or compete effectively.

**Personal impact** — stress, pressure, frustration, loss of confidence.

Do not force every category into every call. Follow what matters to the buyer.

## Ask, do not invent

Useful prompts:

> “What effect does that have downstream?”

> “How much staff time does this usually consume?”

> “Does that affect revenue, customer experience, or both?”

> “Who feels the impact most?”

> “If this continues, what becomes difficult?”

## Rule

**Pain tells you something is wrong. Impact tells you whether fixing it matters.**
$lesson$,6),
('Phase 7 · Value — Turn Vague Pain Into Business Mathematics',$lesson$
# Turn vague pain into business mathematics

Business value becomes easier to understand when the buyer can connect the problem to real numbers.

Suppose the buyer tells you:

- 100 enquiries arrive each month;
- around 20 become customers;
- the average first purchase is $1,500;
- slow follow-up appears to affect about 10 potentially qualified enquiries.

You may explore what those numbers imply. You may **not** claim that ProFox will recover every lost opportunity.

Bad:

> “Our automation will definitely recover $15,000 per month.”

Better:

> “If even a portion of those enquiries are being lost because of response time, there may be meaningful commercial value in improving the process. Would that be fair?”

## Buyer-supplied mathematics

Ask for available numbers such as:

- enquiry volume;
- conversion rate;
- average customer value;
- staff hours;
- error/rework frequency;
- software/tool costs;
- missed appointments;
- repeat purchase frequency.

If the buyer does not know, do not fabricate precision. Record the unknown and decide whether it needs to be measured later.

## Scenario thinking

You can use clearly labelled scenarios:

> “If the business converted even two additional qualified enquiries per month, what would that be worth approximately?”

The buyer's answer is an exploration—not a ProFox guarantee.

## Rule

**Quantify the problem when evidence allows. Never convert a hypothetical improvement into promised ROI.**
$lesson$,7),
('Phase 8 · Desired Future — Understand What Success Actually Looks Like',$lesson$
# Understand what success actually looks like

A problem tells you what the buyer wants to move away from. Discovery also needs to reveal what they want to move **toward**.

Ask:

> “If this worked the way you wanted, what would be different six months from now?”

> “What would success look like?”

> “How would you know the project had worked?”

> “What would you want customers to experience differently?”

> “What would you want your team to stop doing manually?”

> “Which outcome matters most?”

Different buyers may want very different outcomes from similar technology.

A website buyer may want:

- more qualified enquiries;
- stronger trust before a sales conversation;
- easier recruiting;
- clearer positioning;
- a better mobile buying experience.

An application buyer may want:

- one operational source of truth;
- fewer errors;
- faster approvals;
- better reporting;
- controlled permissions;
- less spreadsheet dependency.

An automation buyer may want:

- faster lead response;
- consistent follow-up;
- better lifecycle communication;
- fewer manual handoffs;
- improved retention.

## Outcome test

Can you state the desired future in the buyer's language without mentioning a ProFox feature?

If not, you probably still know the solution category better than the customer's goal.

## Rule

**Current problem → desired business state comes before feature → feature → feature.**
$lesson$,8),
('Phase 9 · Priority — Find the Problem Worth Solving First',$lesson$
# Find the problem worth solving first

Good discovery may reveal many problems. That does not mean you should sell every possible service.

A buyer may mention:

- poor conversion;
- outdated branding;
- weak SEO;
- slow follow-up;
- manual reporting;
- disconnected tools;
- poor customer retention.

Your job is to identify which problem creates the strongest reason to act first.

Ask:

> “Of everything we have discussed, which issue matters most?”

> “If you could improve only one of these things first, which would create the biggest difference?”

> “Which issue is creating the most commercial or operational pressure?”

Then validate why.

## Broad discovery, narrow recommendation

Explore enough of the system to understand context, then narrow the recommendation to the highest-value problem or small connected set of problems.

As a coaching reference, strong discovery conversations often concentrate on roughly **three to four meaningful problems**, rather than creating a giant list. This is not a quota. A complex application may require more; an executive discussion may require fewer.

## Beware solution stacking

Do not respond to every problem by adding another service:

> “Website + SEO + automation + app + email + maintenance…”

unless the business case genuinely supports a connected solution.

## Rule

**Prioritisation is part of selling. A clear first problem is more valuable than ten loosely connected opportunities.**
$lesson$,9),
('Phase 10 · Critical Event — Discover Urgency; Never Manufacture It',$lesson$
# Discover urgency; never manufacture it

Ask one of the most important discovery questions:

> **“Why are you looking at this now?”**

The answer may reveal a genuine critical event:

- new business launch;
- expansion;
- rebrand;
- new service;
- hiring growth;
- seasonal demand;
- contract expiry;
- operational breakdown;
- leadership deadline;
- funding event;
- market change;
- compliance need.

Then understand whether the date has real consequences.

> “What needs to be true by that date?”

> “What happens if the project is not ready by then?”

> “Is that deadline fixed or flexible?”

A date without consequence may simply be a preference. A date connected to an important business event creates genuine priority.

## Never manufacture urgency

Do not say:

> “You need to decide today.”

> “This price disappears tonight.”

> “Only one implementation slot remains.”

unless the claim is true, approved, and relevant.

False urgency may create short-term movement but destroys the trust that long-term business relationships require.

## Rule

**Your job is to discover the customer's clock, not invent one.**
$lesson$,10)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
