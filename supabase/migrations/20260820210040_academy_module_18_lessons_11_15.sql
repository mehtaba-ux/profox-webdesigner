-- Module 18 lessons 11–15 — reminders, preparation, agenda and meeting discipline

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Use Reminders to Recover Human Forgetfulness',$md$
## Objective
Reduce avoidable no-shows without manually chasing every buyer.

## Operating rule
**Automate predictable reminders and reserve manual follow-up for situations that need judgment.**

The approved ProFox meeting workflow may send confirmation and reminder notifications around scheduled meetings. Let the configured system handle routine reminders instead of duplicating them with repeated manual messages.

A reminder should reinforce the meeting time, joining method and purpose. It should not pressure the buyer or create new commercial claims.

### Mistakes to avoid
- manually sending several reminders when automation already exists;
- changing reminder timing without authority;
- sending the wrong meeting link;
- treating a reminder as a sales-pressure message.

### Practice prompt
When should a salesperson send a personal reminder instead of relying on the normal automated reminder workflow?
$md$,11,true),

  (v_module,'Prepare Before the Buyer Arrives',$md$
## Objective
Enter the meeting with context rather than making the buyer repeat information already captured.

## Operating rule
**Never make the buyer pay for your lack of preparation.**

Before a meaningful sales meeting, review the relevant CRM context:
- company and contact;
- source and outreach history;
- earlier activities/meetings;
- opportunity stage;
- known problems and requirements;
- stakeholders/decision process;
- objections;
- quotation/commercial state where applicable;
- last commitment;
- desired meeting outcome.

### Five-minute readiness test
You should be able to answer:
1. Why are we meeting?
2. What do I already know?
3. What must I learn, confirm or decide?
4. What should happen next if the meeting succeeds?

### Practice prompt
Create a five-line pre-call brief for a buyer returning for a proposal review.
$md$,12,true),

  (v_module,'Every Meeting Needs One Primary Outcome',$md$
## Objective
Prevent friendly conversations that accomplish nothing.

## Operating rule
Before joining, complete this sentence:
**“By the end of this meeting, we should know or decide ______.”**

Examples:
- Discovery: understand the business problem, desired outcome, fit and buying process.
- Proposal Review: confirm whether the recommendation aligns and identify unresolved decisions.
- Follow-Up: resolve the agreed outstanding issue and determine the next step.

A meeting may produce unexpected information, but the seller should still know why the meeting deserves calendar time.

### Mistakes to avoid
- joining without an objective;
- treating “have a chat” as sufficient preparation;
- attempting to close before the meeting purpose is satisfied;
- confusing relationship-building with lack of direction.

### Practice prompt
Define a measurable outcome for a 30-minute proposal review.
$md$,13,true),

  (v_module,'Use an Agenda Without Turning the Call Into a Script',$md$
## Objective
Create structure while keeping the meeting human and buyer-centered.

## Operating rule
**The agenda controls direction, not every sentence.**

A simple meeting structure is:
**CONTEXT → OBJECTIVE → DISCUSSION → DECISION → NEXT STEP**

Discovery should remain conversational. Do not turn early discovery into a long presentation when your main job is to understand the buyer. Presentation material belongs where the stage and meeting purpose justify it.

### Example
At the start of discovery:
“To make the best use of our time, I’d like to understand how enquiries work today, what you want to improve, and then we can decide whether there’s a useful next step. Does that work?”

### Practice prompt
Write a 20-second agenda opener for a discovery call.
$md$,14,true),

  (v_module,'Start and End on Time',$md$
## Objective
Treat time discipline as part of customer experience.

## Operating rule
**Respect the time both parties agreed to.**

Before the meeting:
- open required material;
- verify the correct meeting/link;
- test audio/camera where needed;
- remove unrelated distractions;
- be ready before start time.

During the meeting:
- manage tangents;
- watch remaining time;
- reserve time for decision clarity and next steps.

Do not let a 30-minute meeting become an uncontrolled 65-minute conversation because the seller failed to manage it.

### Practice prompt
You have seven minutes left in discovery and still need to confirm decision process and next step. How do you manage the remaining time professionally?

**Phase standard:** a meeting deserves preparation, direction and respect for time.
$md$,15,true);
end $$;
