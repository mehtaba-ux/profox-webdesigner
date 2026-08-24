-- Module 14 lessons 06–10 · Phase 2 — Ask & Listen

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Revisit the Business Case Briefly',$md$
## Objective
Reconnect the close to the buyer’s own priorities without replaying the entire presentation.

## Operating rule
Use **PROBLEM → IMPACT → DESIRED STATE → AGREED DIRECTION**.

A concise recap creates confidence because the buyer hears their own reasoning reflected back.

### Example
“From what we established, the current enquiry process is inconsistent and follow-up depends on someone manually noticing each lead. You want a more reliable customer journey, and we agreed the connected website and follow-up direction addresses that. Have I summarized that accurately?”

If the buyer corrects something, listen. A correction is useful information—not resistance.

### Mistakes to avoid
- repeating every feature;
- introducing new benefits during the close;
- using a generic company pitch;
- exaggerating business impact;
- treating your recap as a speech rather than a confirmation.

### Practice prompt
Turn a 10-minute presentation into a 30-second close recap using only the buyer’s top problem, impact, desired state and agreed direction.
$md$,6,true),

  (v_module,'Stop Re-Selling When Alignment Is Clear',$md$
## Objective
Avoid talking the buyer out of a decision by over-explaining after value is already understood.

## Operating rule
**When alignment is clear, reduce complexity.**

Nervous sellers often keep talking because silence feels risky. They add more features, more examples, more pricing context and more caveats until the buyer has new questions that did not exist before.

### Example
Buyer: “Yes, the Business-level direction makes sense.”
Poor seller: launches into another 15-minute walkthrough.
Better seller: “Great. Before we move to the formal next step, is there anything important that still feels unresolved?”

### Mistakes to avoid
- feature dumping after agreement;
- adding optional scope the buyer never requested;
- reopening competitor comparisons;
- introducing an unapproved discount “just in case”;
- confusing more talking with more persuasion.

### Practice prompt
Write one sentence that transitions from confirmed alignment into a closing question without re-presenting the solution.
$md$,7,true),

  (v_module,'Ask for the Decision Clearly',$md$
## Objective
Build confidence in making a direct, professional closing ask.

## Operating rule
**A qualified buyer deserves a clear question.**

Examples:
- “Are you comfortable moving forward with this direction?”
- “Does this feel like the right solution for the business?”
- “Would you like us to move forward and prepare the formal quotation based on the agreed scope?”

The ask must match the stage. If the buyer has not received the formal quotation yet, do not phrase the question as though they are accepting final commercial terms.

### Direct does not mean aggressive
Direct: “Are you ready to proceed to the quotation stage?”
Aggressive: “What is stopping you from signing right now?”

### Mistakes to avoid
- vague endings such as “So…what do you think?”;
- assumptive activation;
- asking for a contractual commitment before the formal process exists;
- apologizing for asking;
- hiding the actual decision behind endless discussion.

### Practice prompt
Write three closing questions: one for stakeholder review, one for quotation preparation and one for a genuinely ready commercial decision.
$md$,8,true),

  (v_module,'Ask, Then Pause',$md$
## Objective
Develop the discipline to give the buyer room to decide.

## Operating rule
**ASK → SILENCE → LISTEN.**

After a clear closing question, stop talking. A few seconds of silence usually means the buyer is thinking—not that the sale is collapsing.

### Example
Seller: “Would you like us to prepare the formal quotation based on the agreed scope?”
Buyer: pauses.
Poor seller: “And of course there’s no pressure and maybe I can change the price…”
Better seller: stays quiet and listens.

Silence helps you hear the real answer. Filling it often introduces unnecessary concessions.

### Micro-drill
Say each question aloud, then count silently to five before speaking again.
- “Are you comfortable with this direction?”
- “Would you like to move to the formal quotation stage?”
- “Is there anything material still preventing a decision?”

### Mistakes to avoid
- negotiating against yourself;
- offering discounts during silence;
- repeating the question;
- nervous filler;
- interrupting the buyer’s first answer.

### Practice prompt
What is the first thing you should do after asking a clear closing question? Write the answer in five words or fewer.
$md$,9,true),

  (v_module,'Phase 2 Checkpoint — Ask Without Pressure',$md$
## Objective
Consolidate directness, brevity and listening.

## Operating rule
**Clear ask + calm silence beats pressure.**

Use this four-part sequence:
1. **Recap** the agreed business direction in one short paragraph.
2. **Check** whether anything material remains unresolved.
3. **Ask** for the correct next commitment.
4. **Pause** and listen.

### Mini-case
A buyer has confirmed fit and says all major questions are resolved. The seller should not create a new urgency story or keep demonstrating. A professional close is simply: “Would you like us to prepare the formal quotation based on what we’ve agreed?” Then pause.

### Self-check
Can you ask for progression without:
- promising a result;
- discounting;
- inventing urgency;
- talking through the silence;
- implying a stronger commitment than the buyer actually made?

### Practice prompt
Record yourself delivering a 45-second close. Remove every sentence that does not help the buyer make the next decision.

**Phase takeaway:** Confident sellers ask. Professional sellers also listen.
$md$,10,true);
end $$;
