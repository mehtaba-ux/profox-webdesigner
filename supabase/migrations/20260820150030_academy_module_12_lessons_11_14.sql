-- Module 12 — Product Presentation — Lessons 11–14

do $$
declare v_module uuid;
begin
  select id into v_module from public.training_modules where slug='presentation-skills';
  if v_module is null then raise exception 'Module 12 presentation-skills not found.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Demonstrate Only What Matters',$lesson$
## Objective
Control the demo so every screen, example or workflow earns its place.

Do not click through everything ProFox has built.

Use:

**SET CONTEXT → SHOW → EXPLAIN VALUE → ASK**

### Example
> “You mentioned managers cannot see which requests still need action.”

Show the relevant dashboard concept.

> “This is the type of centralized view I mean. Instead of checking several spreadsheets, outstanding actions can be visible in one place.”

Then ask:
> “Would that solve the visibility issue you described, or is there another part we'd need to account for?”

### Demo discipline
- Prepare the exact pages/examples before the meeting.
- Do not expose unrelated client data.
- Do not improvise unsupported capabilities.
- Skip features that do not connect to a buyer priority.
- If a live environment is unstable, use an approved backup example rather than pretending.

### Rule
> **A shorter relevant demo is stronger than a longer feature tour.**

### Practice prompt
Choose a hypothetical buyer problem and identify exactly two things you would show and three things you would deliberately leave out.
$lesson$,11,true),

  (v_module,'Present in Short Bursts and Create Dialogue',$lesson$
## Objective
Make the buyer part of the presentation instead of waiting until the end for questions.

Avoid:

**Seller talks 20 minutes → “Any questions?”**

Use:

**EXPLAIN → PAUSE → CHECK → ADAPT**

### Better questions
- “How does that compare with what you're doing now?”
- “Would that address the issue you described?”
- “What part of this matters most from your side?”
- “How would your team expect this to work?”
- “Is there anything important we've missed?”

Avoid repeatedly asking:
> “Does that make sense?”

That often produces automatic yes/no answers instead of useful buying information.

### Listen to presentation questions
Buyer questions reveal:
- what they value;
- where they are uncertain;
- what risk they perceive;
- what stakeholder concerns may exist.

Do not rush past a useful question simply because you have slides remaining.

### Practice prompt
Take a 10-minute presentation section and identify three deliberate points where you would stop and engage the buyer.
$lesson$,12,true),

  (v_module,'Use Relevant, Verified Proof',$lesson$
## Objective
Build confidence with evidence without exaggerating or inventing results.

The strongest proof is not automatically the biggest logo.

### Proof hierarchy
**Highly similar verified case study**

↓

**Relevant portfolio example**

↓

**Relevant capability demonstration**

↓

**Process / methodology evidence**

↓

**Team / technical expertise**

### Case-study formula
**SIMILAR SITUATION → PROBLEM → WHAT PROFOX DID → VERIFIED RESULT**

### Only use facts you can substantiate
Never fabricate:
- revenue growth;
- lead growth;
- conversion percentage;
- traffic improvement;
- client quotation/testimonial;
- project scope;
- company size;
- relationship with a brand.

If no similar case study exists, say so and use the next strongest honest form of proof.

### Confidentiality
A real client screenshot can still be inappropriate if it exposes confidential information. Use only approved presentation assets.

### Rule
> **Credibility compounds. One invented result can destroy all the real proof around it.**

### Practice prompt
For a legal-services buyer, rank four possible proof assets by relevance and explain which one you would show first.
$lesson$,13,true),

  (v_module,'Tell the Buyer’s Before → Change → After Story',$lesson$
## Objective
Create a clear narrative of business change without promising guaranteed outcomes.

Use:

### BEFORE
What is happening now?

### CHANGE
What process, experience or system needs to change?

### AFTER
What operating state becomes possible if implemented properly?

### Example
**Before:** leads arrive through several forms and follow-up is manual.

**Change:** centralize capture, acknowledgement and agreed follow-up logic.

**After:** every new lead enters one defined process while the sales team retains control of high-value personal conversations.

Notice what is missing:

> “This will increase revenue by 37%.”

The future state is useful and specific without becoming a fabricated guarantee.

### Keep the buyer as the protagonist
ProFox is not the hero of the story. The buyer's business is changing; ProFox is the partner helping design and implement the system.

### Practice prompt
Create a three-line Before → Change → After narrative for a business currently managing internal requests through email and spreadsheets.
$lesson$,14,true);
end $$;
