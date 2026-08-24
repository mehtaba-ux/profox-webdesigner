-- Module 13 lessons 06–10

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Isolate the Real Blocker',$md$
## Objective
Determine whether the stated objection is the main issue or only one of several.

## Operating rule
**Resolve the right problem, not the loudest sentence.**

Useful isolation questions:
- “Apart from the investment, is there anything else making you uncertain?”
- “If this concern were resolved, what else would you still need to feel comfortable?”
- “Which issue is the biggest blocker right now?”

### Example
Buyer: “It’s too expensive.”

After discussion: “Actually, my partner does not want to change the website.”

Price was not the main blocker.

### Ethical use
Isolation is diagnostic. Do **not** turn it into pressure with lines like: “So if I fix this, you’ll definitely sign today, right?”

### Mistakes to avoid
Forcing commitment before understanding, treating three objections at once, assuming the first objection is final, or using isolation as a closing trick.

### Practice prompt
A buyer says: **“The price is high and I’m also worried about changing systems.”** How would you ask them to prioritize the concern?
$md$,6,true),
  (v_module,'Respond to the Actual Concern',$md$
## Objective
Give a response that directly matches the confirmed concern.

## Operating rule
Use **CONCERN → EVIDENCE → RELEVANCE**.

Buyer: “I’m worried ProFox doesn’t understand roofing.”

Response: “That’s reasonable. Rather than asking you to take our word for it, I can show the roofing-specific work, playbook or relevant experience we can verify, then you can judge whether the understanding is strong enough.”

The evidence must be true, relevant, authorized to share and current enough to be useful.

### Mistakes to avoid
- unrelated portfolio dumping;
- company-history speeches;
- invented case studies;
- changing the subject;
- overclaiming expertise.

### Practice prompt
Buyer concern: **“Your team may not understand our multi-location workflow.”** What evidence would be relevant, and what evidence would not help?
$md$,7,true),
  (v_module,'Reframe Without Arguing',$md$
## Objective
Help the buyer compare the right things without insulting alternatives.

## Operating rule
**Reframing changes the comparison—not the facts.**

Buyer: “Why pay thousands for a website when I can make one for a few hundred dollars?”

Professional response: “You absolutely can build an online presence for less. The useful comparison is whether we are solving the same requirement. If you only need a simple presence, a lower-cost option may genuinely be enough. If you need a tailored customer journey, conversion structure and connected workflows, that is a different scope.”

This builds trust because ProFox is not claiming every buyer needs ProFox.

### Mistakes to avoid
- “Cheap websites are terrible.”
- shaming the buyer;
- pretending lower-cost tools never work;
- attacking Wix, Squarespace, freelancers or competitors;
- inventing hidden costs.

### Practice prompt
Reframe **“Why not just use an off-the-shelf tool?”** without assuming custom development is better.
$md$,8,true),
  (v_module,'Confirm Whether the Concern Is Resolved',$md$
## Objective
Stop assuming your answer worked.

## Operating rule
After responding, check.

Useful questions:
- “How does that address your concern?”
- “Does that reduce the uncertainty, or is something still unresolved?”
- “What part would you still want clarified?”

If the concern remains, return to clarification.

### Bad pattern
Answer → immediately continue slides.

### Better pattern
Answer → confirm → either explore again or advance.

The buyer’s response determines whether the objection is actually resolved.

### Mistakes to avoid
“Great, moving on…” before confirmation, asking leading questions that pressure a yes, treating silence as agreement, or repeating the same explanation louder.

### Practice prompt
The buyer says: **“That helps, but I’m still worried about support after launch.”** What should happen next?
$md$,9,true),
  (v_module,'Price: “It’s Too Expensive”',$md$
## Objective
Handle price resistance without reflex discounting.

## Operating rule
**A price objection does not authorize a discount.**

First determine the type:
- affordability;
- value;
- comparison;
- risk;
- scope;
- cash flow.

Questions:
- “What were you expecting to invest?”
- “Is the concern the amount, or whether the scope justifies it?”
- “What are you comparing this with?”
- “Which part of the scope feels unnecessary?”

Then respond using the **live Sales Catalog**, approved scope and buyer-verified value.

If a smaller legitimate solution fits better, recommend it. If the buyer cannot afford the work, accept reality.

### Never
Invent a discount, change payment terms without authority, claim guaranteed payback, create fake urgency or shame the buyer for budget.

### Practice prompt
Buyer says: **“The recommendation makes sense, but this is 40% above what I expected.”** Write the first two questions you would ask.
$md$,10,true);
end $$;
