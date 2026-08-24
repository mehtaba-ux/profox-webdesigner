-- Module 13 lessons 21–25

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Email Marketing & Automation Objections',$md$
## Objective
Handle automation concerns without selling automation for its own sake.

### “We don’t want robotic communication.”
“Neither do we. The question is which repetitive steps benefit from consistency and where human conversation is more valuable.”

### “Our team already follows up manually.”
Ask how consistently and effectively the process works. If it works well and scales, there may be no meaningful problem.

### “We already use HubSpot, Mailchimp or another platform.”
Ask what is missing from the current process. The issue may be workflow, configuration—or no issue at all.

### Mistakes to avoid
Replacing tools just to sell, describing all manual work as bad, claiming automation guarantees conversions, or ignoring consent/data requirements.

### Practice prompt
A buyer says their current email platform is fine but response time is inconsistent. What should you diagnose before recommending anything?
$md$,21,true),
  (v_module,'Authority: “I Need to Talk to My Partner or Boss”',$md$
## Objective
Treat internal approval as a buying-process reality, not an insult.

## Operating rule
**Help the contact become a strong internal champion.**

Ask:
- “What will they care about most?”
- “What questions do you expect?”
- “Would it help for us to give them the same context directly?”

Provide a concise, truthful summary of the business problem, recommendation, rationale, verified proof, commercial context and open questions.

Do not make the contact feel powerless or unimportant.

### Mistakes to avoid
“So you’re not the decision-maker?”, forcing a decision without stakeholders, giving exaggerated claims to repeat internally, or bypassing the contact behind their back.

### Practice prompt
The marketing manager supports ProFox, but finance must approve. What information should the next meeting emphasize?
$md$,22,true),
  (v_module,'Multiple Objections: One at a Time',$md$
## Objective
Stay structured when the buyer raises several concerns together.

Buyer: “It’s expensive, the timing is bad, and my partner prefers another agency.”

Do not answer all three at once.

Say: **“There are a few things there. Which one is the biggest concern for you right now?”**

Resolve one using the framework: clarify → validate → isolate → respond → confirm. Then move to the next unresolved issue.

## Operating rule
**One objection at a time.**

This prevents long seller monologues and makes the buyer choose what matters most.

### Mistakes to avoid
Three rebuttals in one speech, ignoring one concern, rushing toward closing, or assuming every objection must be resolved today.

### Practice prompt
Create a prioritization question for a buyer who raises **price + implementation risk + internal approval** together.
$md$,23,true),
  (v_module,'When the Correct Outcome Is No',$md$
## Objective
Recognize when professional selling means not progressing the deal.

## Operating rule
**Qualification is two-way.**

The correct outcome may be **no**, **not now**, or **not a fit** when:
- the buyer cannot responsibly afford the service;
- ProFox cannot meet a critical technical requirement;
- the timeline is impossible;
- the need is weak;
- the solution is unsuitable;
- the buyer asks for unethical or prohibited work.

Professional response: **“Based on what you’ve described, I don’t think we should recommend this project in its current form.”**

That protects trust and delivery quality.

### Mistakes to avoid
Forcing a sale to protect commission, pretending impossible requirements are possible, hiding known fit problems, or endless follow-up after a clear no.

### Practice prompt
Write one example where walking away protects both the buyer and ProFox.
$md$,24,true),
  (v_module,'Advance Only After the Concern Is Resolved',$md$
## Objective
Transition from objection handling into the correct next decision.

## Operating rule
**Module 13 resolves resistance. Module 14 teaches closing.**

After the buyer confirms the concern is resolved:
“Given that we’ve addressed that point, what would be the most useful next step from your side?”

Possible outcomes:
- technical validation;
- stakeholder meeting;
- quotation;
- additional proof;
- agreed follow-up date;
- no action.

Do not attempt a close while material objections remain.

### CRM discipline
Record the exact objection, underlying concern, context/evidence, response, whether resolved, remaining blocker, required follow-up, owner, next-step date, technical validation need and competitor where relevant.

### Mistakes to avoid
Marking an objection resolved when it is not, fabricating CRM notes, forcing quotation creation or confusing a next step with a closed deal.

### Practice prompt
The buyer says: **“Yes, that answers my concern about support.”** Name three legitimate next steps depending on the opportunity.
$md$,25,true);
end $$;
