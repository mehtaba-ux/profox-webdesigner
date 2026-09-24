-- Sales Academy Module 8 — Meeting Booking lessons 5–8.

WITH m AS (SELECT id FROM public.training_modules WHERE slug='meeting-booking'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 2 · Momentum — From Reply to Meeting Without Becoming Pushy', $lesson$
# Move from reply to meeting without becoming pushy

A meeting request feels natural when it follows the conversation. It feels pushy when it appears before the prospect understands why the meeting is useful.

Use:

## CONTEXT → REASON → VALUE → INVITATION

**CONTEXT** — Acknowledge what the prospect just told you.

**REASON** — Explain why conversation is now more useful than continued messaging.

**VALUE** — Give a clear outcome for the meeting.

**INVITATION** — Offer an easy next step without pressure.

Example:

> “Since lead quality and follow-up are both affecting you, it may be worth looking at the full customer journey rather than only the website. We can use a short call to understand what is happening now and identify where the biggest gap is. If that would be useful, we can find a suitable time.”

Notice what is missing: fake urgency, aggressive closing, unsupported promises, and a giant service list.

Do not ask yourself, “Can I get them on a call?” Ask:

> **Have I made the value of the conversation clear?**
$lesson$,5),
('Phase 2 · Momentum — The ProFox Meeting Booking Framework', $lesson$
# The ProFox meeting booking framework

Use this framework consistently:

# READY → REASON → VALUE → CHOICE → CONFIRM

## READY

Confirm a meeting makes sense. Is there enough interest, relevance, and intent?

## REASON

State why conversation is the logical next step.

> “There are a couple of things here that would be easier to understand properly in conversation.”

## VALUE

Tell the prospect what the conversation should accomplish.

> “We can map what is happening now, where the main gap appears to be, and whether there is a sensible solution.”

## CHOICE

Give the easiest appropriate scheduling path: book together while live, select from ProFox availability, use the public booking flow, or choose between a small number of suitable times.

## CONFIRM

A meeting is not booked until the practical details are clear:

- date;
- time;
- prospect timezone;
- meeting purpose;
- attendee name and email;
- meeting link/location;
- relevant CRM context.

Never finish with “Let me know when you are free” when you can make the next action clearer.
$lesson$,6),
('Phase 3 · Booking Execution — Live Conversation: Book While Momentum Exists', $lesson$
# Live conversation: book while momentum exists

If a prospect agrees to meet during a live call or conversation, finish the booking while you are together whenever practical.

Do not create unnecessary work by saying, “I will email you later and then you can send me some times.” Every extra step is another place for momentum to disappear.

Better:

> “Perfect. Do you have your calendar handy?”

Then agree the time and make sure the meeting is actually recorded.

A verbal “We should talk sometime” is not a booked meeting. The booking is complete when:

- the time is agreed;
- timezone is clear;
- attendee details are correct;
- the meeting exists in ProFox;
- confirmation can be issued.

## Rule

**Interest is emotional. Calendar commitment is operational. Secure both.**
$lesson$,7),
('Phase 3 · Booking Execution — Async Conversation: Make Booking Frictionless', $lesson$
# Async conversation: make booking frictionless

Email, LinkedIn, and other asynchronous channels work differently from a live call. Give the buyer a low-friction path.

## Option A — Direct booking

> “Happy to look at that with you. The easiest next step is a short discovery conversation so we can understand the current setup before suggesting anything. You can choose whichever available time works best.”

## Option B — Suggested availability

> “Happy to talk it through. I can make Tuesday afternoon or Wednesday morning work. If neither is convenient, I can send the live availability.”

## Option C — Ask permission

Useful when interest is weaker:

> “This may be easier to unpack in a short conversation. Would that be useful?”

Do not send only “Here is my calendar.” A booking option without context transfers all the work to the buyer and fails to explain why the meeting deserves their time.
$lesson$,8)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
