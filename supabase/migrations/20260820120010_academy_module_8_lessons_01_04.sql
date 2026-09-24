-- Sales Academy Module 8 — Meeting Booking lessons 1–4.

WITH m AS (SELECT id FROM public.training_modules WHERE slug='meeting-booking'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 1 · Booking Mindset — The Meeting Has One Job: Earn the Conversation', $lesson$
# The meeting has one job: earn the conversation

Getting a reply is not the goal. Sending a booking link is not the goal. The purpose of prospecting is to create the **right business conversation with the right prospect at the right time**.

A first discovery meeting is not a presentation, quotation meeting, or service dump. Do not pressure someone toward the **$599 Website Package, $2,379 Business Package, $5,799+ Premium Package, or a custom application** before understanding the business need.

The discovery meeting exists so both sides can answer:

> **Is there a meaningful business problem or opportunity that ProFox may be able to help solve?**

Before asking for a meeting, establish enough relevance that the prospect understands:

1. Why you contacted them.
2. What business issue or opportunity may be worth discussing.
3. Why a short conversation could be useful.
4. What they can expect from that conversation.

Do not prove the entire solution before the call. Over-explaining creates longer messages, more misunderstanding, and less reason to meet.

## ProFox standard

**Sell the value of the conversation before you sell the solution.**

Create enough value to earn the next conversation. Save diagnosis and prescription for discovery.
$lesson$,1),
('Phase 1 · Booking Mindset — Know When a Prospect Is Ready for a Meeting', $lesson$
# Know when a prospect is ready for a meeting

Not every response deserves calendar time. Your calendar should contain real opportunities for useful conversations, not random names.

## Strong readiness signals

A meeting is usually appropriate when the prospect:

- describes a real problem;
- asks how ProFox could help;
- asks about process, timeline, capabilities, pricing, or examples;
- explains what they want to improve;
- says they are considering a website, application, automation, redesign, or related solution;
- asks to speak;
- sends detailed questions that are easier to answer conversationally;
- confirms the issue you identified is relevant;
- introduces another stakeholder;
- is actively planning a project.

## Medium signals

Examples include “Interesting,” “Tell me more,” “Can you send information?”, “How much?”, or “Maybe later.” These require judgment. Respond to the meaning behind the message first; do not attack the prospect with a calendar link.

## Weak or false signals

A meeting may not yet be appropriate when there is no identifiable business relevance, the prospect gives courtesy-only replies, explicitly says there is no need, the request is unrelated to ProFox, information appears fraudulent, or the person asks not to be contacted.

## Rule

**Interest earns qualification. Qualification earns the meeting.**

Do not confuse politeness with buying intent.
$lesson$,2),
('Phase 1 · Booking Mindset — Qualify Enough, But Do Not Interrogate', $lesson$
# Qualify enough, but do not interrogate

Qualification protects both ProFox and the prospect. Excessive qualification creates friction.

Do not conduct the full discovery call by message. Before booking, you only need enough information to know whether the conversation is worth having and who should handle it.

Use five lenses:

1. **Relevance** — Is there a problem, goal, or opportunity ProFox can reasonably help with?
2. **Business** — Is this a real company, professional, founder, organization, or viable project?
3. **Intent** — Are they genuinely exploring improvement or simply being polite?
4. **Timing** — Is there a reason a conversation makes sense now?
5. **People** — Are you speaking with the decision maker, an influencer, or someone researching for another stakeholder?

You do not need perfect answers to all five. You need enough signal to justify the conversation.

Bad qualification feels like an interrogation: budget, authority, revenue, employees, timeline, and purchase date fired at the buyer one after another.

Better qualification begins with relevance:

> “Before I point you in the right direction, what are you mainly hoping to improve — generating more enquiries, improving the customer experience, or something operational behind the scenes?”

## ProFox rule

**Qualify for relevance before you qualify for money.**
$lesson$,3),
('Phase 2 · Momentum — Speed Matters When Intent Is High', $lesson$
# Speed matters when intent is high

A warm prospect can become a cold prospect quickly. When someone submits an enquiry, requests a consultation, asks for a meeting, requests pricing, gives a strong positive reply, or says they want to move forward, they have created a **buyer-intent moment**.

Do not create unnecessary delay.

## Inbound lead

Respond as soon as operationally practical. If the lead is qualified and ready, make booking easy immediately.

## Positive outbound reply

Do not restart the entire pitch. Acknowledge what they said, answer the necessary question, and move toward the logical next step.

Example:

> “If enquiries are the main issue, it would be useful to understand where visitors are dropping off and how leads are handled after they contact you. A short strategy call would probably be more useful than me guessing over email.”

Momentum is not pressure. Momentum means helping an interested buyer take the next sensible step while the problem is still important to them.
$lesson$,4)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
