-- Module 12 — Product Presentation — Lessons 15–18

do $$
declare v_module uuid;
begin
  select id into v_module from public.training_modules where slug='presentation-skills';
  if v_module is null then raise exception 'Module 12 presentation-skills not found.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Make the Presentation Easy to Consume',$lesson$
## Objective
Reduce cognitive load so the buyer can focus on the recommendation instead of decoding the presentation.

### Presentation hygiene
- One main message per screen or section.
- Minimal text where a visual/example is clearer.
- Use buyer language instead of internal jargon.
- Keep desktop and browser clean before screen sharing.
- Close unrelated tabs and disable personal notifications.
- Prepare links, examples and backup material in advance.
- Do not show another customer's confidential information.
- Avoid unnecessary architecture diagrams for non-technical audiences.

### Visuals should serve understanding
A diagram is useful when it makes a workflow easier to see.

A diagram is harmful when it exists only to make the seller look technical.

### Match depth to the audience
Founder → outcome, risk, investment.

Marketing → journey, trust, conversion, campaigns.

Operations → workflow, handoffs, visibility.

Technical → architecture, integrations, security—but only with verified facts.

Finance → commercial logic and scope clarity.

### Rule
> **Professional presentation quality is clarity under control.**

### Practice prompt
Review a typical slide deck or screen-share plan and remove anything that does not help the buyer make a decision.
$lesson$,15,true),

  (v_module,'Present the Right Commercial Direction',$lesson$
## Objective
Connect the recommendation to the appropriate ProFox commercial direction without turning this lesson into quotation training.

### Always check the live Sales Catalog
Package names, prices, inclusions and payment terms are Admin-controlled and may change. The live Sales Catalog is the source of truth.

Current training examples may include standard Website, Business and Premium directions plus custom application scope, but **never rely on memory when quoting live commercial information**.

### Best-fit recommendation
A seller should explain why one direction fits better than another.

Example:
> “Based on what you've described, the entry website direction would not cover the broader follow-up and customer-journey requirement. The Business direction is closer to the need because those connected elements matter to the outcome.”

### Do not
- recommend the highest-priced option because commission is larger;
- invent discounts;
- hide approved pricing to manipulate the buyer;
- remove essential scope just to make a number look attractive;
- add unapproved deliverables;
- promise a custom scope before assessment;
- negotiate quotation terms that belong to later approval/process stages.

### Rule
> **Commercial confidence comes from fit and transparency, not pressure.**

### Practice prompt
Explain why a lower-tier option is insufficient without insulting it or pushing the buyer toward the most expensive package by default.
$lesson$,16,true),

  (v_module,'Present to Multiple Stakeholders Without Changing the Truth',$lesson$
## Objective
Adapt emphasis for the room while keeping one consistent business case.

A presentation may include:
- founder/owner;
- marketing;
- operations;
- finance;
- technical stakeholder;
- day-to-day user.

### Start by understanding the room
> “Before we get into the recommendation, would it help if we quickly clarify what each of you most wants to understand from today's discussion?”

### Different people may care about different evidence
**Founder:** strategic outcome, risk, confidence.

**Marketing:** customer journey, trust, conversion.

**Operations:** workflow, efficiency, accountability.

**Technical:** integrations, security, maintainability.

**Finance:** scope, commercial justification, risk.

### Adapt emphasis, not facts
Never tell one stakeholder a capability is guaranteed and another that it is still under validation.

Never change pricing, scope or expected outcome depending on who is in the room unless an approved change has actually happened.

### Watch for missing stakeholders
If the person who must approve or technically validate the project is absent, the right next step may be to include them rather than force progression.

### Practice prompt
Take one custom-app recommendation and explain the same solution in three different 30-second versions: founder, operations manager and technical lead.
$lesson$,17,true),

  (v_module,'Handle Questions, Confirm Fit and Advance the Right Next Step',$lesson$
## Objective
Finish the presentation with clarity while preserving the boundaries of Modules 13–16.

Buyer questions are not interruptions. They are buying information.

### When you know the answer
Answer clearly, briefly and truthfully.

### When you do not know
> “That's important, and I don't want to guess. I'll capture the exact requirement and have the right team member confirm the available options.”

This is stronger than inventing an answer.

### When a question becomes an objection
Clarify what the concern actually is, but do not force a rehearsed objection script here. Module 13 trains objection handling in depth.

### End with
**RECAP → CONFIRM FIT → AGREE NEXT STEP → OWNER → DATE**

Example:
> “Based on what we've reviewed, the direction still appears to fit the priorities we agreed: stronger trust, a clearer enquiry journey and more consistent follow-up. Is there anything material that would prevent us from moving to scope and quotation preparation?”

Then agree the correct process step.

### Valid next outcomes
- proceed to quotation/scope preparation;
- technical validation;
- stakeholder review;
- requirements follow-up;
- defer with a real follow-up date;
- disqualify/no next step when the fit is not strong.

### Final ProFox Presentation Standard
**HEARD → RECOMMEND → SHOW → PROVE → CONFIRM → ADVANCE**

> **Do not show everything ProFox can do. Show exactly what this buyer needs to understand.**

### Practice prompt
Deliver a 90-second close to a presentation that summarizes value and secures the next logical step without using pressure or fake urgency.
$lesson$,18,true);
end $$;
