-- Module 10 · Call Practice · Lessons 15–18
WITH m AS (SELECT id FROM public.training_modules WHERE slug='call-practice'),
lesson_data(title,content,sort_order) AS (VALUES
('Practice Lab · Handle Curveballs Without Losing Control',$lesson$
# Handle curveballs without losing control

Real buyers do not follow your lesson plan. Practise staying calm when the conversation changes direction.

## Common curveballs

### “Just send me pricing.”
Answer known pricing clearly, then ask enough context to avoid pointing them toward the wrong solution.

### “We’re just looking.”
Reduce pressure and understand what they are trying to learn.

### “We already have an agency.”
Do not attack the agency. Ask what made this conversation worth having anyway.

### One-word answers
Use easier, contextual questions and examples rather than increasing pressure.

### Long tangent
Acknowledge what matters, then gently reconnect it to the business issue.

### Technical question you cannot verify

> “I don’t want to guess. I’ll confirm that with our technical team and give you an accurate answer.”

### “Can you guarantee results?”
Never fabricate certainty. Explain what ProFox can control, what depends on the market/client, and what would need to be measured.

### Explicit “not interested” or stop request
Respect it immediately.

## Drill

Run six rapid-response situations. Give yourself no more than ten seconds to begin each response. The goal is calm judgment, not a perfect script.
$lesson$,15),
('Practice Lab · Summarise Before Recommending',$lesson$
# Summarise before recommending

Before you suggest a direction, prove that you understood the buyer.

Use:

**WHAT I HEARD → IMPACT → DESIRED STATE → CONFIRMATION**

Example:

> “Let me make sure I’ve got this right. You are already generating enquiries, but follow-up is inconsistent because the team handles it manually. That slows response time and some opportunities go cold. Ideally you want a system that keeps follow-up consistent while still letting the team step in personally. Have I captured that properly?”

Then stop.

Let the buyer correct you.

Only after validation should you say something like:

> “Based on that, there is a direction I think makes sense.”

Do not use the summary as a disguised pitch. If the buyer corrects you, update your understanding.

## Drill

Listen to or read a one-minute simulated buyer story and deliver a 30–45 second summary without adding any fact the buyer did not provide.
$lesson$,16),
('Practice Lab · End With a Clear Mutual Next Step',$lesson$
# End with a clear mutual next step

A discovery call should end with clarity, even when the correct outcome is “not now” or “not a fit.”

Use:

**RECAP → FIT → NEXT STEP → OWNER → DATE**

Possible outcomes include:

- move to a solution/product presentation;
- gather missing technical or commercial information;
- involve another stakeholder;
- create a specific future follow-up;
- disqualify because the problem is outside ProFox scope;
- close the opportunity because priorities changed.

Avoid:

> “I’ll follow up sometime.”

Instead:

> “The next useful step is for us to show how we would approach the website and lead journey based on what you told me. James should join because he will approve the investment. Would Wednesday or Thursday work?”

Do not manufacture a next step merely to keep a deal alive in CRM.

## Drill

Practise closing five conversations: strong fit, missing stakeholder, missing technical information, later timing, and poor fit.
$lesson$,17),
('Practice Lab · Full Discovery Rehearsal & Readiness',$lesson$
# Full discovery rehearsal and readiness

Now combine the skills.

You must complete **three full practice conversations** before the live Mock Sales Call is scheduled.

## Rehearsal 1 — Straightforward buyer

Clear problem and cooperative prospect. Focus on structure, confidence, listening, and a clean next step.

## Rehearsal 2 — Ambiguous buyer

Vague problem, incomplete information, and answers that do not arrive in the order you expect. Focus on following the thread and finding root cause.

## Rehearsal 3 — Challenging buyer

Early price question, stakeholder uncertainty, mild resistance, unclear urgency, or a technical question. Focus on judgment under pressure.

After each rehearsal, self-score ten areas from 0–2:

1. preparation;
2. opening and agenda;
3. listening;
4. question quality;
5. root cause;
6. business impact;
7. outcome and priority;
8. commercial and decision context;
9. summary;
10. next step.

The 20-point score is a **coaching tool, not your formal certification**. A suggested readiness benchmark is 16/20. Module 11 is where an eligible senior evaluator will judge the live call.

Before marking yourself ready, provide your mock-assessment availability. The system will then automatically choose an unseen simulated cold-outreach lead, select a qualified available evaluator, find a mutual time, schedule the call, and send each person the correct private brief.

## Final rule

**Practise honestly. The point is not to look ready; the point is to become ready.**
$lesson$,18)
)
INSERT INTO public.training_lessons(module_id,title,content,sort_order,active,updated_at)
SELECT m.id,d.title,d.content,d.sort_order,true,now() FROM m CROSS JOIN lesson_data d;
