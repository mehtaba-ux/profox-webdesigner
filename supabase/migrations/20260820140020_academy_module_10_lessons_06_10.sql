-- Module 10 · Call Practice · Lessons 6–10
WITH m AS (SELECT id FROM public.training_modules WHERE slug='call-practice'),
lesson_data(title,content,sort_order) AS (VALUES
('Practice Lab · Listen Without Preparing Your Reply',$lesson$
# Listen without preparing your reply

Many weak discovery calls fail because the seller is technically quiet but mentally rehearsing the next question. Active listening means the buyer's answer changes what you ask next.

Use:

**HEAR → PAUSE → REFLECT → CONFIRM → CONTINUE**

Buyer:

> “Most of our leads come in after hours and we often don’t get to them until the next morning.”

Weak response:

> “Great, we have automation for that.”

Better:

> “So the enquiry arrives while interest is high, but there is often a long gap before anyone responds. Is that right?”

Then:

> “What tends to happen to those leads during that gap?”

## Listening drill

Have a partner or scenario give you a 30–60 second answer. You may not ask another question until you first summarise one important point accurately.

Do not repeat every word. Reflect the **meaning**.

## Rule

**If the buyer’s answer does not influence your next move, you are following a script rather than conducting discovery.**
$lesson$,6),
('Practice Lab · Follow the Thread',$lesson$
# Follow the thread

The most valuable discovery questions are often not on your prepared list. They come from something the prospect just said.

Use four follow-up tools:

### Clarify

> “What do you mean by that?”

### Expand

> “Tell me more about that.”

### Example

> “Can you walk me through the last time that happened?”

### Consequence

> “And what happens when that occurs?”

Suppose a buyer says:

> “Our website is okay, but it doesn’t really help sales.”

Do not jump to another topic. Follow the thread:

> “When you say it doesn’t help sales, what would you expect it to be doing that it is not doing today?”

That answer may reveal trust, conversion, lead quality, follow-up, positioning, or something entirely different.

## Drill

Take five short prospect statements. For each, produce one clarifying, one deepening, and one consequence question.

The goal is to become comfortable **thinking from the answer**, not reading from a checklist.
$lesson$,7),
('Practice Lab · Go From Symptom to Root Cause',$lesson$
# Go from symptom to root cause

A prospect’s first statement is often a symptom.

> “We need a new website.”

That does not tell you why.

Use a natural depth sequence:

**SYMPTOM → EVIDENCE → HISTORY → CAUSE → BUSINESS EFFECT**

Example:

> “What is making the current website feel like it needs to change?”

Buyer:

> “We are not getting enough enquiries.”

Follow:

> “Do you know whether the issue is traffic, conversion after people arrive, lead quality, or something else?”

Then explore what they have tried and what they believe is happening.

Never decide the root cause only from your visual website review. Your research is a hypothesis; the business has context you do not have.

## Drill

Practise three symptom chains:

1. “We need more leads.”
2. “Our process is too manual.”
3. “Our emails don’t work.”

For each, reach a plausible root problem **without putting words in the buyer’s mouth**.
$lesson$,8),
('Practice Lab · Turn Problems Into Business Impact',$lesson$
# Turn problems into business impact

Problems create urgency only when they matter to the business or the people inside it.

Explore impact across:

- revenue and lost opportunities;
- staff time and operating cost;
- customer experience;
- speed and responsiveness;
- errors and operational risk;
- growth and scalability;
- leadership pressure or personal workload.

Buyer:

> “Our team manually sends every follow-up.”

Seller:

> “Roughly how much team time does that consume each week?”

Then:

> “And what gets delayed because they are spending that time on follow-up?”

Do not manufacture financial impact. Use buyer-supplied information.

## Drill

For four common problems, ask enough questions to connect the operational symptom to at least one measurable or observable business effect.

## Rule

**Quantify the problem; never fabricate the result.**
$lesson$,9),
('Practice Lab · Explore Outcomes & Value',$lesson$
# Explore outcomes and value

After understanding what is wrong, learn what the buyer wants instead.

Ask:

> “If this worked the way you wanted, what would be different?”

Then explore the result through several lenses:

- customer experience;
- team workflow;
- speed;
- conversion or revenue;
- visibility and reporting;
- scalability;
- confidence and control.

When numbers are available, use transparent buyer-supported mathematics.

For example, if the buyer gives monthly enquiry volume, conversion rate, average customer value, or staff hours, you can explore scenarios together. You cannot turn a hypothetical improvement into a guaranteed ROI claim.

## Drill

Practise moving from a pain statement to a desired state and then to a value question. End by asking the buyer whether your interpretation is fair.

## Rule

**The buyer defines success. ProFox helps make it concrete.**
$lesson$,10)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,updated_at)
SELECT m.id,d.title,d.content,d.sort_order,true,now() FROM m CROSS JOIN lesson_data d;
