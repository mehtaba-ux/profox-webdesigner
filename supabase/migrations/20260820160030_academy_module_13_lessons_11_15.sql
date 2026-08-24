-- Module 13 lessons 11–15

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Budget: “We Don’t Have the Money”',$md$
## Objective
Separate a real affordability condition from a value objection.

## Operating rule
**Do not keep selling value to a buyer who has a genuine cash-flow constraint.**

Clarify: “Is this because the project wasn’t budgeted, or because this level of investment is not feasible right now?”

Possible outcomes:
- wrong scope → resize only if genuinely appropriate;
- budget cycle → document the next review period;
- timing/cash flow → agree a truthful follow-up;
- low priority → requalify;
- genuine affordability limit → nurture or disqualify.

Only discuss approved payment schedules from the live commercial system.

### Mistakes to avoid
Encouraging irresponsible spending, inventing financing, offering unauthorized milestone changes, turning a budget condition into pressure, or assuming every “no budget” is fake.

### Practice prompt
A small business likes the project but says it cannot responsibly allocate the funds this quarter. What is a good outcome for the call?
$md$,11,true),
  (v_module,'“I Need to Think About It”',$md$
## Objective
Turn a vague stall into useful clarity without pressure.

## Operating rule
Respect the request, then ask what specifically needs thought.

Professional response: **“Of course. What specifically would you like to think through?”**

Possible answers reveal investment concerns, partner approval, competitor comparison, timing, implementation risk or unresolved trust.

Then ask: **“What information would make that decision easier?”**

If the buyer genuinely needs space, give it.

### Mistakes to avoid
- “What is there to think about?”
- surprise discounts;
- fake expiring offers;
- repeated pressure;
- scheduling a follow-up the buyer did not agree to.

### Practice prompt
The buyer says they need to think and later reveals they are comparing two agencies. What should you explore next?
$md$,12,true),
  (v_module,'Timing: “Not Right Now”',$md$
## Objective
Understand whether timing is a real constraint, weak priority or hidden objection.

## Operating rule
**Discover urgency. Never manufacture urgency.**

Ask:
- “What makes the timing difficult?”
- “What is taking priority right now?”
- “When would this become realistic to revisit?”
- “What changes between now and then?”

Possible causes include busy season, cash flow, leadership change, another implementation, no meaningful urgency or low priority.

If timing is real, agree a legitimate follow-up. If the problem has little consequence, do not invent one.

### Mistakes to avoid
Fake deadlines, false “price goes up tonight” claims, fear tactics, automatic chasing, or claiming lost revenue without buyer evidence.

### Practice prompt
A contractor says peak season makes implementation impossible for eight weeks. What information should you record in CRM?
$md$,13,true),
  (v_module,'Competitor: “We Already Have an Agency”',$md$
## Objective
Handle incumbent-provider resistance without attacking the competitor.

## Operating rule
Find out why the buyer is talking to you at all.

Ask: **“Understood. What prompted you to take this conversation if you already have a partner?”**

Possible answers:
- exploring backup;
- new capability needed;
- poor service;
- contract ending;
- benchmarking;
- simply responding politely.

If they are genuinely satisfied, respect that.

### Mistakes to avoid
Saying their work is bad, making unsupported claims about outsourcing/SEO/security, manufacturing dissatisfaction, or telling the buyer they chose badly.

### Practice prompt
The buyer says their current agency is performing well. What would make a professional ProFox response different from a desperate one?
$md$,14,true),
  (v_module,'Cheaper Competitor: Compare Scope, Not Ego',$md$
## Objective
Respond to lower-priced competitors through objective comparison.

## Operating rule
Do not match price automatically. Compare what the buyer is actually buying.

Useful comparison areas:
- scope;
- deliverables;
- customization;
- ownership;
- support;
- integrations;
- maintenance;
- project process;
- acceptance criteria;
- timeline assumptions.

Ask: **“Would it help if we compare what each proposal actually includes?”**

If the competitor genuinely offers equivalent value at lower cost, do not lie. The buyer may reasonably choose them.

### Mistakes to avoid
Price matching without authority, hidden-fee accusations without evidence, insulting the competitor, inflating ProFox scope, or claiming all cheaper providers are low quality.

### Practice prompt
What three facts would you want before responding to **“They are half your price”**?
$md$,15,true);
end $$;
