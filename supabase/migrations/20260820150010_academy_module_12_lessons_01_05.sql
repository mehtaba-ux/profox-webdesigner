-- Module 12 — Product Presentation — Lessons 01–05

do $$
declare v_module uuid;
begin
  select id into v_module from public.training_modules where slug='presentation-skills';
  if v_module is null then raise exception 'Module 12 presentation-skills not found.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Presentation Is Prescription, Not Pitch',$lesson$
## Objective
Move from **explaining ProFox** to **recommending the right change for this buyer**.

Discovery was diagnosis. Presentation is prescription.

A weak seller asks: **“How do I show everything we can do?”**

A strong seller asks: **“What does this buyer need to understand in order to make the next good decision?”**

### Core rule
> **Never present a service simply because ProFox sells it. Present it because verified discovery supports it.**

Your presentation should connect:

**Buyer reality → priority → ProFox recommendation → relevant capability → business effect → next decision**

Do not begin with a company history, a package dump, or twenty features. Begin with the buyer.

### What 10X presentation behavior looks like
- You can explain the buyer's situation in their own language.
- You know the 1–3 priorities that deserve presentation time.
- You leave irrelevant capabilities out.
- You translate every capability into why it matters.
- You distinguish facts from assumptions.
- You are willing to recommend a smaller solution—or no solution—when that is the honest fit.

### Never do this
- Manufacture a problem to justify a service.
- Recommend the highest-priced package by default.
- Present an unvalidated technical solution as certain.
- Treat a presentation as a monologue.

### Practice prompt
Choose one ProFox service. Explain it in one sentence **without naming a feature first**. Start from the business problem it solves.
$lesson$,1,true),

  (v_module,'Prepare From the CRM, Not Memory',$lesson$
## Objective
Enter the presentation already knowing what the buyer told ProFox.

Before preparing slides, examples, a prototype, or a recommendation, review the live CRM record and all relevant notes.

### Review before the meeting
- requirements summary;
- problems identified;
- decision makers and stakeholders;
- commercial notes;
- timeline / critical event;
- agreed next step;
- qualification information;
- previous outreach and Loom/video context;
- buyer role and service interest;
- known decision criteria;
- unanswered questions or technical unknowns.

### You should be able to answer
1. What is the buyer's **#1 priority**?
2. What is the second priority, if any?
3. What impact did the buyer describe?
4. What does success look like to them?
5. Why is this being considered now?
6. Who will evaluate or approve the decision?
7. What must be true for the recommendation to fit?
8. What should this meeting achieve?

If you cannot answer those questions, do not compensate with more slides. Re-establish the missing context.

### Research is a hypothesis, not a fact
Use phrases such as:
- “From our discovery…”
- “You mentioned…”
- “What I understood was…”

Do not present an external assumption as something the buyer already confirmed.

### Practice prompt
Take any past discovery note and reduce it to **five lines**: current state, primary problem, impact, desired outcome, decision path.
$lesson$,2,true),

  (v_module,'Define the Meeting Outcome Before You Present',$lesson$
## Objective
Know what a successful presentation should produce before the call begins.

A presentation does not always need to end in a sale.

Possible legitimate outcomes include:
- confirm solution direction;
- bring another stakeholder into the process;
- collect missing requirements;
- validate technical feasibility;
- prepare quotation/proposal scope;
- schedule a specialist conversation;
- decide that ProFox is not the right fit.

### Use the correct success test
A presentation succeeds when the buyer reaches the **right next decision with more clarity**.

It is not successful merely because:
- the deck looked impressive;
- the buyer said “nice”;
- you used every slide;
- you spoke for the full booked time;
- you forced a quotation step.

### Set a meeting objective
Before the call, complete this sentence:

> **“If this presentation goes well, the correct next step is ______ because ______.”**

That next step must be consistent with the ProFox sales process and what discovery supports.

### Example
If a custom application requires unverified integration feasibility, the correct outcome may be:

**Technical validation → then scope/quotation**

—not an immediate delivery promise.

### Practice prompt
Write the correct presentation outcome for three cases: straightforward website fit, custom app with unknown API, and buyer with missing final stakeholder.
$lesson$,3,true),

  (v_module,'Open With Context, Agenda and Permission',$lesson$
## Objective
Start the presentation calmly and make the meeting feel relevant immediately.

Do not share your screen and start clicking without context.

Use:

**CONNECTION → PURPOSE → AGENDA → PERMISSION**

### Example
> “Thanks again for the conversation earlier. Based on what you shared, I’ve focused today around the areas that seem most important: generating more qualified enquiries, improving online trust, and making follow-up more consistent. I’ll quickly recap what I understood, show the direction I think fits, and then we can look at the specific parts that relate to those priorities. Please stop me if anything doesn’t reflect what you need.”

### Why this works
- demonstrates preparation;
- tells the buyer what to expect;
- gives permission to interrupt;
- prevents a one-way pitch;
- anchors the discussion in their priorities.

### Avoid
- “Let me tell you about ProFox.”
- “I have 35 slides, so let’s get started.”
- “I’ll show you all our services first.”

### Strong habit
Ask whether anything important has changed since discovery before you present the recommendation.

### Practice prompt
Create a 30-second presentation opening for a roofing website prospect. Then create a different one for an operations team considering a custom app.
$lesson$,4,true),

  (v_module,'Start With “What We Heard”',$lesson$
## Objective
Prove that ProFox understood the buyer before asking them to believe the recommendation.

The first meaningful business section should normally be the buyer's situation—not **About ProFox**.

### Structure
**CURRENT STATE → PROBLEM → IMPACT → DESIRED CHANGE → CONFIRM**

### Example
> “From our discovery, referrals are still your strongest source of roofing work, but you want a more predictable digital channel alongside that. The current site gets some traffic but does not make requesting an estimate particularly easy, especially on mobile. Follow-up can also depend on someone manually noticing the enquiry. You want that journey working more consistently before the next expansion. Is that still accurate?”

Then stop.

Let the buyer confirm, correct, or update the picture.

### Why confirmation matters
A presentation built on an outdated or misunderstood problem is still a bad presentation, even if the design is beautiful.

### Use buyer language
If the buyer said “too many requests get lost between email and WhatsApp,” do not instantly translate it into vague jargon such as “digital transformation inefficiency.”

### Rule
> **Earn the right to recommend by showing that you listened.**

### Practice prompt
Turn a messy discovery note into a 60-second “What We Heard” recap without mentioning a ProFox service.
$lesson$,5,true);
end $$;
