-- Module 10 · Call Practice · Lessons 1–5
WITH m AS (SELECT id FROM public.training_modules WHERE slug='call-practice'),
lesson_data(title,content,sort_order) AS (VALUES
('Practice Lab · Practice Before Performance',$lesson$
# Practice before performance

Module 9 taught the discovery system. Module 10 turns that knowledge into behavior you can use while a buyer is speaking, interrupting, challenging you, changing direction, or asking a question you did not expect.

The ProFox Discovery Map remains your compass:

**CURRENT → GAP → IMPACT → OUTCOME → WHY NOW → DECISION → FIT → NEXT STEP**

It is **not a screenplay**. A real buyer will not answer in perfect order. Your job is to understand the business while keeping the conversation human.

## Four levels of practice

1. **Micro drills** — practise one difficult moment at a time.
2. **Conversation drills** — connect several moments naturally.
3. **Full rehearsals** — run realistic discovery conversations from opening to next step.
4. **Self-coaching** — identify exactly what to improve before the next attempt.

## Baseline self-check

Before practising, rate yourself from 1–5 on: opening, agenda setting, asking questions, listening, going deeper, discussing money, handling unexpected answers, summarising, and agreeing next steps.

Do not chase perfection. The purpose of deliberate practice is to expose weakness **before a real opportunity is at risk**.

## Rule

**Know the framework. Practise the moments. Build the conversation.**
$lesson$,1),
('Practice Lab · Sound Calm, Clear & Credible',$lesson$
# Sound calm, clear and credible

A technically correct question can still reduce trust if it is rushed, robotic, defensive, overexcited, or difficult to understand.

Practise six elements of delivery:

- **Pace** — slow enough to think and be understood.
- **Clarity** — short sentences and one question at a time.
- **Tone** — genuinely interested, not scripted enthusiasm.
- **Energy** — engaged and professional without performing.
- **Pauses** — silence is allowed; do not rescue every pause.
- **Accuracy** — when you do not know, say you will verify rather than guessing.

Reduce filler words such as “um,” “basically,” “you know,” and repeated “actually.” Do not replace them with unnatural silence; replace them with a short pause.

## 60-second drill

Introduce yourself and explain the purpose of a discovery conversation for 60 seconds. Repeat three times. On each repetition remove one unnecessary sentence.

Your target is not a “sales voice.” Your target is:

**Calm. Prepared. Curious. Credible.**
$lesson$,2),
('Practice Lab · The First 90 Seconds',$lesson$
# The first 90 seconds

The opening determines whether the buyer expects a conversation or a pitch.

A strong opening usually contains:

1. a natural greeting;
2. thanks for the time;
3. brief evidence that you prepared;
4. a clear reason for the conversation;
5. a low-pressure expectation of what happens next.

Avoid beginning with a company history, package list, or portfolio tour.

### Weak

> “Let me tell you about ProFox and all of our services.”

### Better

> “Thanks for making the time. I reviewed what you shared and looked at the business before the call. I’d like to understand what you’re trying to improve, what is getting in the way today, and then we can see whether there is actually a sensible way for us to help.”

Do not memorise that wording. Practise several versions until the structure feels natural.

## Drill

Run three openings:

- a friendly inbound prospect;
- a prospect who replied to cold outreach;
- a busy founder who wants you to get to the point quickly.

The buyer should know **why the call is useful** within the first 90 seconds.
$lesson$,3),
('Practice Lab · Set the Agenda Without Sounding Scripted',$lesson$
# Set the agenda without sounding scripted

An agenda gives structure without taking control away from the buyer.

Use:

**PURPOSE → PROCESS → PERMISSION**

### PURPOSE

Why are we here?

### PROCESS

How will the conversation work?

### PERMISSION

What does the buyer need from the conversation, and are they comfortable with the approach?

Example:

> “I’d like to understand where things stand today, what you want to improve and what is driving the priority. If it looks like there is a fit, I can explain the direction I think makes sense and we can decide on a useful next step. Anything you want to make sure we cover?”

An agenda should not sound like legal terms and conditions. Keep it short.

## Drill

Practise a 20–30 second agenda three ways: formal buyer, relaxed founder, and buyer who says, “I only have 15 minutes.”

## Rule

**Structure creates confidence; permission keeps it collaborative.**
$lesson$,4),
('Practice Lab · Ask Better First Questions',$lesson$
# Ask better first questions

Your first question should open the buyer’s world, not force them into your solution.

Useful openings include:

### Website

> “What made improving the website worth discussing now?”

### Web application

> “Walk me through how this process works today.”

### Automation

> “Where does the customer journey currently require the most manual follow-up?”

Do not ask five questions at once. Do not begin with budget unless the buyer has made price the immediate topic. Do not ask something basic that your research already answered.

A good first question has three characteristics:

- it is relevant to what brought the prospect to the meeting;
- it invites explanation rather than yes/no;
- it gives you information you can follow rather than a box to tick.

## Drill

For three simulated leads, write or say one opening question and two possible follow-up questions depending on how the buyer answers.

The aim is not “more questions.” The aim is **better conversation direction**.
$lesson$,5)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,updated_at)
SELECT m.id,d.title,d.content,d.sort_order,true,now() FROM m CROSS JOIN lesson_data d;
