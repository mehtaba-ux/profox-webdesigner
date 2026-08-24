-- Module 10 · Call Practice · Lessons 11–14
WITH m AS (SELECT id FROM public.training_modules WHERE slug='call-practice'),
lesson_data(title,content,sort_order) AS (VALUES
('Practice Lab · Explore Priority & Why Now',$lesson$
# Explore priority and why now

Urgency should be discovered, never manufactured.

Useful questions include:

> “Why has this become important now?”

> “Is there a date, event, launch, season, target, or operational change driving the timing?”

> “What happens if nothing changes over the next six months?”

> “Where does this sit compared with the other priorities you are working on?”

The buyer may reveal a genuine critical event, a soft preference, or very little urgency. All three are useful information.

Do not convert a weak timeline into fake scarcity such as “we only have two slots left” unless that statement is genuinely true and relevant.

## Drill

Practise three situations:

- genuine deadline;
- buyer says “sometime this year”;
- buyer is interested but has no meaningful reason to act now.

Your task is to clarify priority without pressure.

## Rule

**Discover urgency. Never manufacture urgency.**
$lesson$,11),
('Practice Lab · Discuss Money Professionally',$lesson$
# Discuss money professionally

Money is business context, not a trap.

Practise three common situations.

### Buyer already has a range

Understand the range and what it is meant to cover.

### Buyer has not set a budget

> “Would it help if I explain the typical investment ranges we work within?”

### Buyer asks price early

Answer transparently using the **live Sales Catalog**, then continue discovery if useful.

Current commercial references include the approved Website, Business and Premium package structure plus scoped Custom Web Application quotations, but **always verify the live catalog before quoting**.

Do not:

- hide known approved pricing purely to force another meeting;
- ask for the buyer’s absolute maximum as a pressure tactic;
- offer an unauthorized discount;
- promise custom scope before it is understood and approved.

## Drill

Practise responding to:

1. “How much does this cost?” in the first two minutes.
2. “We only have a small budget.”
3. “We have not decided what we can spend.”

Stay commercially clear without losing curiosity.
$lesson$,12),
('Practice Lab · Understand How the Decision Gets Made',$lesson$
# Understand how the decision gets made

A good opportunity can still stall when the seller discovers the buying process too late.

Practise learning:

- who uses the solution;
- who cares about the problem;
- who evaluates options;
- who approves the investment;
- what criteria matter;
- what sequence the organisation normally follows;
- whether another person should join the next conversation.

Avoid the blunt qualification theatre of:

> “Are you the decision maker?”

Try:

> “Besides you, who would need to feel confident about this before you could move forward?”

or:

> “How does a project like this normally get approved?”

Treat influencers and researchers with respect. The person speaking to you may become the strongest internal champion even when they are not the signer.

## Drill

Practise a founder-led business, a company with a finance approver, and a contact researching for their boss.
$lesson$,13),
('Practice Lab · Adapt Discovery to the Service',$lesson$
# Adapt discovery to the service

The discovery framework stays consistent, but the diagnostic path changes by service.

## Website Design & Development

Explore acquisition, trust, traffic, conversion, mobile experience, lead capture, customer journey, content, proof, follow-up and business goals.

## Custom Web Applications

Explore workflow, users, roles, permissions, data, approvals, manual work, integrations, reporting, error risk, security and scalability.

## Email Marketing & Business Automation

Explore lead capture, response time, segmentation, nurture, lifecycle stages, follow-up, retention, repeat purchase, CRM handoffs, repetitive communication and reporting.

Do not force a website onto an operational problem or automation onto a positioning problem simply because it is a service you want to sell.

## Service-switch drill

Take one simulated company and run three possible discovery directions. Your questions must change when the underlying business problem changes.

## Rule

**Diagnose the business outcome underneath the technology.**
$lesson$,14)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,updated_at)
SELECT m.id,d.title,d.content,d.sort_order,true,now() FROM m CROSS JOIN lesson_data d;
