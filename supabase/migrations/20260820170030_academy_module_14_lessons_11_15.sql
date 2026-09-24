-- Module 14 lessons 11–15 · Phase 3 — Commitment Clarity

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='closing';
  if v_module is null then raise exception 'Module 14 closing is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Do Not Talk Yourself Out of a Yes',$md$
## Objective
Respond correctly when the buyer gives a clear positive answer.

## Operating rule
**Once the buyer commits to the next step, confirm it—do not restart the sale.**

Buyer: “Yes, let’s move ahead with the quotation.”

Correct response: “Perfect. I’ll record that as approval to prepare the quotation based on the agreed scope. Before I do, let me confirm the decision stakeholders and the review timing.”

Do not suddenly introduce new competitors, optional services, fears or concessions.

### Mistakes to avoid
- adding features after agreement;
- repeating risk disclaimers unnecessarily;
- offering a discount after the buyer already said yes;
- changing scope during the confirmation;
- treating approval to prepare a quotation as final payment or Won status.

### Practice prompt
Write the first three things you should confirm after a buyer says, “Yes, prepare the quotation.”
$md$,11,true),

  (v_module,'Understand Exactly What Yes Means',$md$
## Objective
Separate positive sentiment from specific business commitment.

## Operating rule
**Never convert ambiguous language into stronger commitment than the buyer actually gave.**

“Looks good” may mean approval of the concept.
“Send the quote” means permission to prepare/review a quotation.
“We accept the quotation” is stronger, but still must follow the application’s formal acceptance process.
“We sent payment” is not the same as verified payment.

### Example
Buyer: “Yes, this works for me.”
Seller: “Great. Just so I record this correctly, are you approving the recommended direction so we can prepare the formal quotation, or are you saying the final approved commercial terms are already accepted?”

Clarity prevents false forecasting and protects the buyer.

### Mistakes to avoid
- marking Won from verbal enthusiasm;
- recording acceptance before the approved acceptance event;
- treating promised payment as received payment;
- using vague notes such as “client agreed” without stating what they agreed to.

### Practice prompt
Rewrite “Customer said yes” into a CRM note that states the exact commitment and next step.
$md$,12,true),

  (v_module,'Know the Levels of Commitment',$md$
## Objective
Recognize which commitment is appropriate at each stage.

## Operating rule
**Close for the next legitimate commitment, not every commitment at once.**

### Commitment ladder
1. Information commitment — buyer provides missing requirements.
2. Stakeholder commitment — relevant approver joins.
3. Evaluation commitment — buyer reviews solution/proposal.
4. Scope commitment — buyer confirms direction.
5. Commercial commitment — approved terms are accepted through the required process.
6. Payment commitment — buyer proceeds through approved payment workflow.
7. Verified business transition — payment/acceptance conditions are confirmed by the system.

A good seller knows where the buyer currently stands.

### Example
If technical feasibility is unresolved, close for technical validation. Do not jump directly to full custom-app commitment.

### Mistakes to avoid
- skipping approval stages;
- asking for payment before formal commercial clarity;
- assuming the champion can sign;
- marking stages based on what you hope happens next.

### Practice prompt
For a deal needing finance approval, identify the current commitment level and the next legitimate commitment.
$md$,13,true),

  (v_module,'Use the Right Closing Style for the Situation',$md$
## Objective
Choose a close that fits the buyer and stage rather than relying on tricks.

## Operating rule
**Closing style should reduce decision friction, not manipulate emotion.**

### Direct close
“Are you comfortable moving forward to the quotation stage?”
Use when alignment is strong.

### Summary close
“You wanted X, Y and Z; we agreed this direction addresses those priorities. Are you ready to formalize the next step?”
Use when a longer buying cycle benefits from a concise recap.

### Recommendation close
“Based on the requirement, I recommend the smaller-fit direction rather than the larger option. Would you like us to formalize that?”
Use when professional judgment helps the buyer choose.

### Mistakes to avoid
- fake alternative-choice closes;
- pretending there are only two options when there are more;
- using a close that assumes authority the buyer does not have;
- choosing the highest-priced package by default.

### Practice prompt
Write one direct, one summary and one recommendation close for the same qualified website opportunity.
$md$,14,true),

  (v_module,'Phase 3 Checkpoint — Commitment Must Be Precise',$md$
## Objective
Consolidate commitment language and CRM truthfulness.

## Operating rule
**Every “yes” must answer: yes to what?**

Use the **COMMITMENT SNAPSHOT**:
- What exactly did the buyer agree to?
- Who agreed?
- What still requires approval?
- What commercial document is next?
- What event must occur before payment?
- What event must occur before `Won`?
- Who owns the next action and by when?

### Mini-case
Buyer says, “Go ahead.” The quotation has not been issued. The seller should record: “Buyer approved recommended scope direction and requested formal quotation.” The seller should **not** record “Deal won” or “Payment confirmed.”

### Practice prompt
Create commitment snapshots for: quotation requested, quotation accepted, payment promised, and payment verified.

**Phase takeaway:** Ambiguity creates pipeline errors. Precise commitment language creates operational trust.
$md$,15,true);
end $$;
