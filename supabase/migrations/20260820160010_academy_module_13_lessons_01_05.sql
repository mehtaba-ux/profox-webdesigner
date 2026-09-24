-- Module 13 lessons 01–05

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Objections Are Information, Not Attacks',$md$
## Objective
Treat buyer resistance as information, not personal rejection.

## Operating rule
**An objection tells you something is unresolved. Understand it before trying to change it.**

A weak seller hears **“That seems expensive”** and immediately defends ProFox. A strong seller hears: **“There is a value, risk, comparison, affordability or scope concern I have not understood yet.”**

Common underlying concerns include financial risk, unclear value, missing trust, timing, implementation effort, stakeholder disagreement, previous bad experiences, technical uncertainty and simple misunderstanding.

### Better response
Buyer: “That seems expensive.”

Seller: “Understood. When you say expensive, what are you comparing it with?”

That question creates information before persuasion.

### Mistakes to avoid
- reacting defensively;
- assuming the objection is personal;
- dumping features immediately;
- trying to “win” before understanding;
- talking over the buyer.

### Practice prompt
Write one neutral clarification question for: **“I’m not sure this is worth it.”**

**Remember:** an objection is information. Do not treat it like an attack.
$md$,1,true),
  (v_module,'Question, Objection, Condition, Stall or Rejection?',$md$
## Objective
Classify buyer resistance correctly before deciding what to do.

## Operating rule
**Not every hesitation should be overcome.**

### Question
“Does this integrate with HubSpot?” — the buyer needs information.

### Objection
“I’m worried the HubSpot integration may not work reliably.” — the buyer perceives risk.

### Stall
“Maybe later.” — the buyer may be postponing or avoiding the real concern.

### Condition
“Our procurement policy requires a certification your company does not have.” — persuasion may not solve this.

### Rejection
“We’ve decided not to proceed.” — respect the decision.

### No-contact instruction
“Please don’t contact me again.” — stop. This is **not** an objection-handling opportunity.

### Mistakes to avoid
- treating a procurement condition like a sales objection;
- repeatedly contacting a buyer who has declined;
- trying to reframe a no-contact request;
- assuming “I need to think” always means hidden interest.

### Practice prompt
Classify these statements: **“Can you support SSO?”**, **“We cannot appoint vendors without ISO 27001.”**, and **“Please remove me from follow-up.”**
$md$,2,true),
  (v_module,'Pause Before You Respond',$md$
## Objective
Build emotional control so you do not interrupt or launch into a defensive monologue.

## Operating rule
**Pause first. Question second. Respond later.**

Buyer: “Your proposal is way too expensive.”

Poor response: “We’re actually cheaper than most agencies, and you get design, development, SEO, automation…”

Better: pause, then ask: **“Understood. Can I ask what feels out of range—the total amount, the scope, or the value you expected?”**

The pause helps you listen, prevents reactive selling and gives the buyer room to explain.

### Micro-drill
Read each objection aloud and force a short pause before speaking:
- “We already have an agency.”
- “I need to think.”
- “Can you guarantee results?”
- “Your competitor is half the price.”
- “This is not a priority.”

Your first sentence should usually be a calm acknowledgement or clarification—not a rebuttal.

### Mistakes to avoid
Interrupting, speaking faster when challenged, stacking counterarguments, sounding offended, or using filler to cover discomfort.

### Practice prompt
What would you ask after: **“I don’t see why this costs so much.”**
$md$,3,true),
  (v_module,'Clarify Before You Answer',$md$
## Objective
Uncover what the buyer actually means before responding.

## Operating rule
**Surface statement ≠ confirmed objection.**

“It’s expensive” can mean above budget, compared with a freelancer, unclear return, wrong package, cash-flow pressure, fear of wasting money, or surprise at scope.

Useful questions:
- “What are you comparing it against?”
- “Is the concern the amount itself or whether the value justifies it?”
- “Which part feels least aligned?”
- “Tell me more about what feels uncomfortable.”

### Example
Buyer: “We don’t need automation.”

Seller: “Understood. Is that because the current manual process is working well, or because the automation we discussed doesn’t feel useful enough?”

Now you can diagnose whether the issue is **need**, **value**, or **fit**.

### Mistakes to avoid
Answering an undefined objection, assuming budget when the concern is trust, asking five questions in a row, or using questions as traps.

### Practice prompt
Create two possible meanings behind **“Not right now.”** Then write one question that separates them.
$md$,4,true),
  (v_module,'Validate Without Automatically Agreeing',$md$
## Objective
Acknowledge the buyer’s perspective without pretending every claim is correct.

## Operating rule
Validation means **“I understand why you would consider that.”** It does not mean **“You are right about everything.”**

Examples:
- Price: “That’s a fair thing to evaluate—it is an important investment.”
- Previous agency: “I can understand why you’d be cautious after that experience.”
- Technical risk: “Yes, that integration needs to be verified properly before we commit.”
- Timing: “That makes sense. If the team is already in a major launch, another project needs careful timing.”

Validation lowers defensiveness and keeps the conversation human.

### Avoid saying
- “No, that’s wrong.”
- “Trust me.”
- “Don’t worry about it.”
- “Everyone says that.”

Fake empathy followed by an aggressive pitch is not validation.

### Practice prompt
Rewrite: **“No, our price isn’t high—you just don’t understand the value.”**
$md$,5,true);
end $$;
