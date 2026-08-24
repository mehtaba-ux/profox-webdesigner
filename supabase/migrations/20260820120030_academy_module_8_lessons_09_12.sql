-- Sales Academy Module 8 — Meeting Booking lessons 9–12.

WITH m AS (SELECT id FROM public.training_modules WHERE slug='meeting-booking'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 3 · Booking Execution — Booking Link vs Suggested Times', $lesson$
# Booking link vs suggested times

There is no single correct method. Use judgment.

## Use the ProFox booking page when

- the prospect asks to schedule;
- the conversation is asynchronous;
- timezone complexity exists;
- several live slots are available;
- the prospect prefers self-service;
- the buyer may need to choose among ProFox specialists;
- the enquiry came through the website.

## Suggest specific times when

- you are already in active conversation;
- the buyer seems busy;
- they asked when you are available;
- reducing choice will make the decision easier.

## Book together when

- you are speaking live;
- the prospect agreed to meet;
- both calendars are available.

Avoid scheduling tennis: “Whenever works for you” / “I am flexible” / “Same.” Be helpful and take responsibility for the next step.
$lesson$,9),
('Phase 4 · Booking Friction — Send Me Information First', $lesson$
# “Send me information first”

This is not automatically a rejection. The prospect may genuinely need context.

Do not fight the request.

Weak:

> “It will be better on a call.”

Better:

> “Absolutely. I will send something relevant rather than a general service brochure. Based on what you mentioned about the problem, I will include the most useful information. Once you have had a look, we can decide whether a conversation is worthwhile.”

When appropriate, include a relevant resource and a low-pressure meeting option.

Your job is to distinguish genuine research, lack of clarity, timing issues, and polite avoidance. Do not force every prospect into the same booking sequence.
$lesson$,10),
('Phase 4 · Booking Friction — How Much Does It Cost?', $lesson$
# “How much does it cost?”

Do not hide approved pricing and do not manipulate a prospect into a meeting just to reveal basic commercial information.

The current approved ProFox package structure is:

- **$599 Website Package**
- **$2,379 Business Package**
- **$5,799+ Premium Package**
- **Custom Web Applications — quotation based on approved scope**

Always verify the live Sales Catalog before quoting because Admin may update commercial terms.

A good response is transparent while preserving discovery:

> “We have solutions starting at $599, with the Business package at $2,379 and Premium projects from $5,799+, while custom applications are scoped separately. Which one makes sense depends on what you are trying to achieve. If you tell me a little about the project, I can point you in the right direction, or we can cover it properly in a short discovery call.”

Never invent discounts, hide known pricing solely to force a call, quote unapproved custom work, or promise features outside the approved offer.
$lesson$,11),
('Phase 4 · Booking Friction — Busy, Maybe Later, or Not Ready', $lesson$
# “I am busy,” “Maybe later,” or “Not ready”

Do not turn a timing issue into a pressure campaign.

## “I am busy.”

> “Understood. Is there a better period for me to come back to this, or would you prefer the booking option so you can choose a time when things settle down?”

## “Maybe next month.”

Make the follow-up specific.

> “No problem. Would it make sense for me to follow up in the first week of next month?”

Then record the follow-up in CRM.

## “We are just researching.”

> “That is completely fine. A discovery call does not require you to make a decision, but there is no reason to book one before it is useful. What are you mainly trying to understand at this stage?”

## Principle

**Protect the relationship even when you do not win the calendar today.**
$lesson$,12)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
