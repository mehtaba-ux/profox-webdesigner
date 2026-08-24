-- Module 9 lessons 15–18
WITH m AS (SELECT id FROM public.training_modules WHERE slug='discovery-script'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 15 · Service Diagnosis — Diagnose Differently for Each Service',$lesson$
# Diagnose differently for each service

The discovery framework stays consistent, but the questions must match the service and business system being investigated.

# Website Design & Development

Understand acquisition, trust, conversion and what happens after the enquiry.

Useful prompts:

> “What should the website accomplish that it is not accomplishing today?”

> “Where does traffic currently come from?”

> “What happens after somebody submits an enquiry?”

> “Which pages or actions matter most commercially?”

> “What questions do customers usually need answered before they trust you?”

> “What proof do prospects need before contacting you?”

Explore mobile experience, conversion, content, SEO visibility, credibility, lead capture, follow-up and maintainability—but only where relevant.

# Custom Web Applications

Do not jump from “we need software” to feature promises. Understand the operational process.

> “Walk me through the workflow today.”

> “Who uses it?”

> “Where is information stored?”

> “Which steps consume the most time?”

> “Where do mistakes or duplicate work happen?”

> “What permissions or approvals are required?”

> “Which systems need to exchange information?”

> “What would make building this commercially worthwhile?”

Never promise custom functionality before feasibility and scope are understood.

# Email Marketing & Business Automation

Understand the customer lifecycle.

> “What happens after someone becomes a lead?”

> “How quickly do they hear from you?”

> “What happens if they do not buy immediately?”

> “How are existing customers re-engaged?”

> “Which communication or handoff is still manual?”

> “Where do leads or customers currently fall through the cracks?”

## Cross-service rule

Technology is not the diagnosis. **Business outcome, customer journey and operational reality come first.**

If several services appear relevant, prioritise the connected business problem rather than stacking products.
$lesson$,15),
('Phase 16 · Listening — Listen for Meaning, Not Your Next Question',$lesson$
# Listen for meaning, not your next question

A discovery script is a navigation system, not a questionnaire.

Bad discovery sounds like this:

> “What is your biggest challenge?”

The prospect answers.

The seller looks down and reads the next prepared question.

Good discovery follows the answer.

Prospect:

> “Our website does not generate much.”

Seller:

> “When you say ‘does not generate much,’ what are you comparing it against?”

Prospect:

> “Most customers still come through referrals.”

Seller:

> “And is the problem that referrals are declining, or that you want a more predictable second channel?”

The second question exists because the seller listened to the first answer.

## Three expert listening moves

### CLARIFY

> “What do you mean by that?”

Use when language is vague.

### DEEPEN

> “Tell me more about that.”

Use when the answer contains important meaning that is not yet developed.

### VALIDATE

> “So if I have understood correctly…”

Use to confirm that your interpretation matches the buyer's reality.

## Use the buyer's words

If the prospect says:

> “Our team wastes hours copying data.”

Later say:

> “You mentioned the team is spending hours copying data…”

Do not replace their language with fashionable jargon such as “digital transformation” unless it genuinely helps understanding.

## Coaching benchmarks, not quotas

Research on successful discovery conversations provides useful reference points such as roughly **11–14 targeted questions**, focus on about **3–4 meaningful problems**, and approximately **46% seller / 54% buyer talk-listen balance**. These are not automatic grading rules.

A senior executive may answer the important questions in a short conversation. A complex application may require more exploration.

The quality test is simpler:

**Did the customer explain their world, or did the seller spend the call explaining ProFox?**
$lesson$,16),
('Phase 17 · Validation — Summarize Before Recommending',$lesson$
# Summarize before recommending

Before prescribing a solution, prove that you understand the diagnosis.

Say:

> “Let me make sure I have understood this correctly.”

Then summarise the important commercial story—not every sentence spoken.

Example:

> “Most new business currently comes through referrals. You want a more predictable source of qualified enquiries. The website receives some traffic but is not turning enough of that traffic into conversations, and follow-up is inconsistent after an enquiry arrives. You are planning to expand into a second location around October, so you would like the acquisition process stronger before then. You and your business partner will make the decision together, and the things that matter most are lead generation, ease of management and ongoing support. Is that accurate?”

Then stop.

Let the customer correct you.

## A strong summary should connect

**CURRENT STATE → GAP → IMPACT → DESIRED OUTCOME → WHY NOW → DECISION CONTEXT**

Do not secretly insert claims the buyer never made.

Bad summary:

> “So your website is terrible and costing you thousands every month.”

when the prospect never said either thing.

## Earn the right to prescribe

After the buyer confirms the summary:

> “Based on what you have explained, I do think there is an area where ProFox could help.”

Now a recommendation has context.

If there is not enough information or fit, say so.

> “I do not think we have enough evidence yet to recommend the right approach. We need to clarify X first.”

That is stronger than pretending certainty.

## Rule

**A recommendation should feel like the logical result of the buyer's story—not the presentation you planned before the call.**
$lesson$,17),
('Phase 18 · Next Step & CRM — Every Good Discovery Ends With Clarity',$lesson$
# Every good discovery ends with clarity

A discovery call does not need to end with a purchase. It does need to end with an honest outcome.

Valid outcomes include:

- **Strong fit** — advance to the appropriate solution/presentation stage.
- **More information needed** — define exactly what is missing.
- **Another stakeholder needed** — agree how and when to involve them.
- **Timing not right** — create a specific follow-up date.
- **Poor fit** — disqualify professionally rather than creating false pipeline.

Use:

# RECAP → CONFIRM FIT → AGREE NEXT STEP → OWNER → DATE

Example:

> “From what we have covered, there does seem to be a strong reason to explore this further. The next useful step would be for us to show how we would approach the website and lead journey based specifically on what you told me. I would also recommend having James on that conversation because he will be part of the decision. Would Tuesday or Wednesday make sense?”

Then confirm who owns each action and when it will happen.

## The ProFox CRM Discovery Record

After every legitimate discovery, record structured truth—not “Call went well.”

Capture:

1. **Current situation** — how the business/process works now.
2. **Primary problem** — the main issue worth solving.
3. **Root cause** — why the issue appears to exist.
4. **Business impact** — revenue, cost, time, CX, risk or strategic effect.
5. **Desired outcome** — what success looks like.
6. **Priority** — what matters first.
7. **Critical event** — why timing matters.
8. **Consequence of inaction** — what happens if nothing changes.
9. **Stakeholders** — who influences/evaluates/approves.
10. **Decision criteria** — how the buyer will judge options.
11. **Decision process** — how approval occurs.
12. **Investment context** — known budget/range/commercial expectations.
13. **Service fit** — website, application, automation or other approved fit.
14. **Risks / unknowns** — what still needs validation.
15. **Agreed next step** — the specific action.
16. **Next-step owner** — ProFox, buyer or named stakeholder.
17. **Next-step date** — concrete date/timeframe.

## Continuity standard

Tell the buyer:

> “I will record today's key points so you do not have to repeat everything next time.”

Discovery data should flow forward into Presentation → Objection Handling → Closing → Quotation → Delivery handoff.

## Final rule

**No vague endings. No fake pipeline. No recommendation without diagnosis. Every real opportunity leaves discovery with shared clarity.**
$lesson$,18)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
