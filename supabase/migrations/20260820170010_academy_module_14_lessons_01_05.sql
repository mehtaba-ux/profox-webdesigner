-- Module 14 lessons 01–05 · Phase 1 — Decision Readiness

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Closing Starts Before the Closing Call',$md$
## Objective
Understand that closing quality is built through discovery, presentation and objection handling—not rescued by a last-minute technique.

## Operating rule
**Never use closing pressure to compensate for incomplete discovery.**

Before a serious closing ask, you should understand the buyer’s current problem, business impact, desired outcome, priority, stakeholders, decision process, commercial context, timing and unresolved risks.

A weak seller notices interest and thinks: “How do I get the signature?” A strong seller asks: “Is this buyer actually ready to make the next decision?”

### Example
The prospect loves the presentation, but you still do not know who gives final approval. The correct move is not a harder close. Clarify the buying process first.

### Mistakes to avoid
- treating enthusiasm as readiness;
- skipping stakeholder discovery;
- using a discount to create artificial readiness;
- pushing for a decision when major technical or scope questions remain;
- confusing a positive meeting with a closed deal.

### Practice prompt
A prospect says, “This looks great—send me the contract,” but you have never discussed who approves the budget. What must you clarify before treating the opportunity as decision-ready?
$md$,1,true),

  (v_module,'The Closing Readiness Standard',$md$
## Objective
Use a consistent readiness test before asking for commitment.

## Operating rule
**A close should confirm alignment, not suddenly test whether alignment existed.**

Before a closing ask, check:
1. problem confirmed;
2. impact understood;
3. desired outcome clear;
4. solution fit confirmed;
5. major objections resolved;
6. stakeholders identified;
7. decision process understood;
8. commercial direction understood;
9. technical unknowns handled or clearly escalated;
10. timing realistic;
11. buyer understands the next workflow.

If several of these are missing, return to the appropriate earlier sales skill instead of “closing harder.”

### Example
A custom-app buyer likes the concept, but integration feasibility is still unknown. The correct close may be technical scoping—not the full implementation commitment.

### Practice prompt
Take one recent opportunity and score each readiness item Yes/No. Which missing item would create the greatest risk if you tried to close today?
$md$,2,true),

  (v_module,'Read Buyer Behavior, Not Seller Excitement',$md$
## Objective
Recognize genuine decision signals without over-interpreting friendliness.

## Operating rule
**Interest is not commitment.**

Buying-readiness questions often become more practical and future-oriented:
- “What happens once we approve?”
- “Who manages implementation?”
- “How does support work?”
- “When could the approved project begin?”
- “How does the commercial process work?”

Positive comments such as “I love this” or “This looks impressive” are encouraging, but they are not authorization to mark the deal Won, assume payment, or skip the buyer’s process.

### Better behavior
Buyer: “Can we start in September?”
Seller: “September may be possible depending on final approved scope. Is that the timing you’re aiming for if everything else aligns?”

### Mistakes to avoid
- interpreting compliments as acceptance;
- moving CRM stages beyond verified reality;
- promising availability before checking delivery capacity;
- assuming a timing question means the buyer has approved the commercial terms.

### Practice prompt
Write two genuine buying-readiness questions and two statements that sound positive but still require clarification.
$md$,3,true),

  (v_module,'Reconfirm the Decision Process Before the Ask',$md$
## Objective
Make sure you know how the organization will actually approve the purchase.

## Operating rule
**Know who recommends, approves, signs and pays.**

Before the final commercial step, reconfirm:
- Who is evaluating the recommendation?
- Who has final approval?
- Who signs or formally accepts?
- Who controls payment?
- Does procurement, finance, legal or IT need involvement?
- What criteria can still stop the decision?

### Example
The Marketing Manager is enthusiastic, but the owner controls budget. A professional close is: “It sounds like the direction works from your side. Since the owner gives final approval, the next commitment should be a review with them. Would you agree?”

You are still closing—just closing the correct next commitment.

### Mistakes to avoid
- asking a contact to approve something outside their authority;
- treating a champion as the signer;
- discovering finance/procurement only after issuing a quotation;
- making the buyer relay complex information when the right stakeholder can join directly.

### Practice prompt
Map a five-person buying committee into recommender, user, approver, signer and payer. Which role must be present before the final commercial decision?
$md$,4,true),

  (v_module,'Phase 1 Checkpoint — Is the Deal Truly Ready?',$md$
## Objective
Consolidate decision-readiness judgment before moving into closing language.

## Operating rule
**Readiness comes before technique.**

Use the **RED / AMBER / GREEN** check:

### GREEN
Problem, value, solution fit, stakeholders, decision process, commercial direction and major risks are understood. A clear closing ask is appropriate.

### AMBER
One or two important conditions remain. Close for the correct intermediate commitment: stakeholder meeting, technical validation, scoped quotation, legal review or follow-up date.

### RED
The problem is weak, authority is unknown, major objections remain, scope is unstable or the buyer is not a fit. Do not force progression.

### Mini-case
A buyer wants a custom portal, but SSO requirements are unverified and security has not reviewed the approach. This is **AMBER**, not GREEN. The right close is technical validation/scoping.

### Mistakes to avoid
- calling every opportunity GREEN because month-end is approaching;
- treating “proposal requested” as decision readiness;
- ignoring unresolved delivery risk;
- forecasting based on optimism instead of evidence.

### Practice prompt
Classify three opportunities as RED, AMBER or GREEN and state the single next commitment appropriate to each.

**Phase takeaway:** Do not ask for the final commitment until the deal has earned that ask.
$md$,5,true);
end $$;
