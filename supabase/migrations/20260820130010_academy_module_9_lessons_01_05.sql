-- Module 9 lessons 1–5
WITH m AS (SELECT id FROM public.training_modules WHERE slug='discovery-script'),
lesson_data(title,content,sort_order) AS (VALUES
('Phase 1 · Discovery Mindset — Discovery Is Diagnosis, Not Presentation',$lesson$
# Discovery is diagnosis, not presentation

A discovery call is not a company presentation, portfolio tour, quotation meeting, or permission to talk about ProFox for 30 minutes. It is a structured business conversation used to determine whether there is a meaningful problem or opportunity, whether solving it matters, and whether ProFox is genuinely relevant.

A weak seller enters thinking: **“How can I explain our package?”**

A ProFox advisor enters thinking: **“What is happening in this business, what is preventing the desired outcome, why does it matter, and is there something we can responsibly help solve?”**

By the end of discovery, both sides should understand four truths:

1. **Business truth** — what is actually happening today.
2. **Problem truth** — the important gap and its likely root cause.
3. **Commercial truth** — whether solving the gap has enough value or importance.
4. **Buying truth** — whether the organisation can realistically act, who is involved, and what must happen next.

Do not manufacture pain. Do not exaggerate a weakness you noticed in research. Do not turn every problem into a ProFox service. Good discovery can lead to **fit, more investigation, later timing, or honest disqualification**.

## Operating rule

**Diagnose before you prescribe.**

A doctor who prescribes before understanding symptoms creates risk. A seller who recommends before understanding the business does the same thing commercially.

Your goal is not to force ProFox into the conversation. Your goal is to understand the conversation well enough to know whether ProFox belongs in it.
$lesson$,1),
('Phase 2 · Preparation — Enter the Meeting Already Informed',$lesson$
# Enter the meeting already informed

Discovery does not mean arriving with no knowledge. Earlier Academy modules taught lead research, outreach, and meeting booking. Module 9 uses that context.

Before the call, review what the CRM already knows:

- company, website and niche;
- prospect name and role;
- lead source and original outreach;
- previous replies and Loom/video context;
- booking qualification answers;
- problem or goal already mentioned;
- service interest;
- known stakeholders;
- timeline or budget information already supplied;
- existing opportunity notes and prior activities.

Do not ask questions the buyer has already answered just because they appear on your script.

Bad opening:

> “So, what does your company do?”

when two minutes of research would have answered it.

Better:

> “I saw that you serve residential and commercial roofing customers around Dallas, and you mentioned referrals are still your main source of new business. You are looking for a more predictable flow of enquiries. Have I understood that correctly?”

Research creates a **hypothesis**, not a fact. Use language such as:

- “From what I saw…”
- “It looks like…”
- “You mentioned…”
- “My understanding is…”

Then give the buyer room to correct you.

## Five-minute preparation check

Before joining, be able to answer:

1. Why did this prospect agree to talk?
2. What do we already know?
3. What important information is still missing?
4. What assumptions must I validate rather than treat as facts?
5. What would make this conversation useful to the buyer even if they do not purchase?

## Rule

**Research before the call. Validate during the call. Never pretend research equals understanding.**
$lesson$,2),
('Phase 3 · Opening — The First Five Minutes Establish Trust',$lesson$
# The first five minutes establish trust

The opening should create comfort, clarity and permission. Do not begin with an interrogation and do not spend ten minutes describing ProFox.

Use:

# CONNECTION → EXPECTATIONS → PERMISSION

## Connection

Be human and professional.

> “Hi Sarah, good to meet you. Thanks for making the time.”

Avoid fake familiarity. Do not waste the meeting with forced small talk when the buyer wants to get to the point.

## Expectations

Explain how the conversation will work.

> “I reviewed what you shared and did a little homework before we spoke. I would like to understand what is happening today, what you want to improve, and why it matters. If it looks like there is somewhere ProFox can genuinely help, I can explain what I think makes sense. If not, I will tell you that as well.”

## Permission

> “Does that sound okay?”

This simple question changes the conversation from something being done **to** the buyer into something being done **with** them.

If the prospect has a specific agenda, adapt.

> “Before we start, is there anything you particularly want to make sure we cover today?”

## Never use the agenda as a trap

Do not say the call is exploratory and then force a same-call purchase. The agenda should honestly describe the conversation.

## Strong opening outcome

Within the first few minutes, the buyer should know:

- why you are there;
- what will be discussed;
- that they can correct you;
- that you will not force a recommendation if there is no fit.

That is the foundation for deeper answers later.
$lesson$,3),
('Phase 4 · Current State — Understand How the Business Works Today',$lesson$
# Understand how the business works today

Before diagnosing a gap, understand the system around it.

The purpose is not to collect trivia. It is to understand enough of the customer journey, workflow, team and commercial model to see where the problem lives.

Useful prompts include:

> “Walk me through how customers normally find you today.”

> “What happens from the moment somebody discovers the business until they become a customer?”

> “What role does the website play today?”

> “What happens after someone submits an enquiry?”

> “Who handles those leads?”

> “Which systems are you using?”

> “What is working well that you definitely do not want to lose?”

That last question matters. Discovery is not a demolition exercise. A buyer should not feel they must insult their current business to qualify for your help.

## Listen for the operating chain

For a website opportunity, that chain may be:

**traffic → website experience → enquiry → response → qualification → sale**

For an application:

**user → task → data → workflow → approval → output**

For automation:

**lead/customer event → trigger → communication → handoff → follow-up → outcome**

If you do not understand the current chain, your recommendation will probably address a symptom instead of the system.

## Rule

**Understand before evaluating.** Ask how it works before telling the buyer how it should work.
$lesson$,4),
('Phase 5 · Root Cause — Symptom Is Not Root Cause',$lesson$
# Symptom is not root cause

Prospects usually describe the problem in the language they can see.

> “We need a better website.”

That is a request, not yet a diagnosis.

Ask:

> “What is making you feel the current website needs to change?”

They may say:

> “It does not generate many leads.”

Go deeper:

> “How are people reaching the business instead?”

> “Mostly referrals.”

Then:

> “And what problem does that create for the business?”

> “Growth is unpredictable.”

Now the possible chain is:

**dated/weak website experience → low conversion → dependence on referrals → unpredictable enquiries → limited growth confidence**

Do not assume that chain is true. Validate every important link.

## Depth prompts

When you hear a problem, resist the urge to solve it. Try:

- “Tell me more about that.”
- “What do you think is causing it?”
- “How long has this been happening?”
- “Where does it show up most?”
- “Who else does it affect?”
- “What have you already tried?”
- “What happened when you tried that?”

## The root-cause test

Before recommending, ask yourself:

**If we fixed the symptom the buyer mentioned, would the important business problem actually improve?**

If the answer is unclear, keep diagnosing.

## Rule

**Do not celebrate the first pain statement. The first answer is often the doorway, not the room.**
$lesson$,5)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,created_at,updated_at)
SELECT m.id,l.title,l.content,l.sort_order,true,now(),now() FROM m CROSS JOIN lesson_data l;
