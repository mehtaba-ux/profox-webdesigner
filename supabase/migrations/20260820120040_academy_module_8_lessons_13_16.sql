-- Sales Academy Module 8 — Meeting Booking lessons 13–16.

WITH m AS (SELECT id FROM public.training_modules WHERE slug='meeting-booking'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 5 · ProFox Workflow — Book the Right Meeting With the Right Specialist', $lesson$
# Book the right meeting with the right specialist

ProFox uses its own booking and meeting system. Do not create disconnected personal workflows that remove important context from the CRM.

Before booking, confirm:

## Right prospect

Contact information and company are correct.

## Right specialist

Where appropriate consider service expertise, niche experience, language, country/context, and ownership of an existing opportunity.

## Right meeting type

For an initial qualified sales conversation this is usually **Discovery Meeting**. Do not label every call “Discovery” if its real purpose is proposal review, consultation, or follow-up.

## Right duration

Use the **live Admin-configured meeting settings**. The current default may change, so do not invent a duration or rely on an old screenshot.

## Right purpose

The attendee should know what the meeting is for. Never create a calendar event that simply says “Call.”

## System rule

ProFox Calendar is the source of truth. External calendars are optional. Module 8 does not require Google Calendar or OAuth integration.
$lesson$,13),
('Phase 5 · ProFox Workflow — Qualification Information Makes the Meeting Better', $lesson$
# Qualification information makes the meeting better

The ProFox booking flow captures business context so the seller can prepare intelligently.

Current Admin-configured questions may include:

- **Project goal** — What would the prospect like help achieving?
- **Budget range** — What commercial range are they working with?
- **Timeline** — When do they want to begin?
- **Decision-maker context** — Are they the final decision maker, a joint decision maker, or researching for another stakeholder?

Always use the live booking form because Admin may change these questions.

Budget does not determine a person’s worth. It helps determine commercial fit and realistic options.

If the contact is not the final signer, do not disrespect them. Ask who else will be involved in evaluating the project and whether another stakeholder should join discovery.

**Qualification gives you context. Discovery gives you understanding.**

Do not enter the meeting with a predetermined solution just because you saw a budget answer.
$lesson$,14),
('Phase 6 · Attendance — A Booked Meeting Is Not a Held Meeting', $lesson$
# A booked meeting is not a held meeting

The calendar invitation is only the beginning. Automation helps with reminders, but it does not remove salesperson responsibility.

Immediately after booking, the prospect should have:

- confirmed date and time;
- correct timezone;
- meeting purpose;
- meeting access details;
- simple expectations.

Before the meeting review:

- company and website;
- original outreach;
- previous replies;
- qualification answers;
- CRM history;
- relevant niche;
- known stakeholders.

A professional confirmation can say:

> “You are all set. We will use the conversation to understand what you are trying to improve, how the current setup works, and whether there is a sensible way ProFox can help. No preparation is required beyond anything you would particularly like us to look at.”

Do not make reminders desperate. If something changes, make rescheduling easier than abandoning the opportunity.
$lesson$,15),
('Phase 7 · CRM Discipline & Certification — The 10X Meeting Booking Operating Standard', $lesson$
# The ProFox 10X Meeting Booking operating standard

“10X” is the operating standard we pursue — **not a guaranteed numerical result**. High-performing sellers create better meetings, with better context, that actually happen.

## Before booking

- Is there genuine relevance?
- Is the prospect sufficiently interested?
- Do I understand why this conversation should happen?
- Can I explain the value of the meeting in one sentence?

## While booking

Confirm the correct contact, company, specialist, meeting type, date, time, timezone, duration, attendee email, and meeting purpose.

## After booking

Ensure the CRM is correct, qualification context is stored, confirmation is issued, the meeting is visible in ProFox, and the seller can prepare from the available information.

## Rescheduling

Update the **existing meeting**. Preserve history. Do not create a duplicate just because the time changes.

## Cancellation

Record it accurately and understand whether the reason is scheduling, project delay, loss of interest, wrong fit, or missing stakeholder.

## No-show

React professionally, not emotionally:

> “Looks like we missed each other today. No problem if something came up. If the project is still relevant, you are welcome to choose another suitable time. If priorities have changed, that is completely fine too.”

Then update CRM.

## Critical failures

Any of the following can make an otherwise high score fail certification:

1. falsifying availability;
2. knowingly booking the wrong timezone;
3. making guaranteed-results claims;
4. hiding approved pricing solely to force a meeting;
5. offering unauthorized discounts;
6. booking a clearly irrelevant prospect merely to increase activity;
7. fabricating prospect information;
8. intentionally bypassing required qualification;
9. creating duplicate meetings to manipulate performance;
10. misrepresenting ProFox services;
11. ignoring an explicit request not to contact the prospect;
12. falsely claiming decision-maker status;
13. dishonest CRM changes;
14. fake scarcity or misleading urgency;
15. mishandling confidential prospect information.

# Final formula

**READY → REASON → VALUE → CHOICE → CONFIRM**

A weak seller celebrates activity. A ProFox professional asks how many of the **right prospects** entered useful conversations, showed up, trusted the process, and moved naturally to the next stage.

Your goal is more qualified conversations, less booking friction, higher attendance, better preparation, cleaner CRM data, stronger buyer trust, and more real opportunities progressing through the pipeline.

Complete the practical assessment next. Passing is a **one-time onboarding certification**. Normal future meeting bookings do not require Admin approval.
$lesson$,16)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
