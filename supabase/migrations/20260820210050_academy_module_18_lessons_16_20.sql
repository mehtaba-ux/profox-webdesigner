-- Module 18 lessons 16–20 — next steps, CRM capture, rescheduling, no-shows and operating system

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Never End Without Decision Clarity',$md$
## Objective
Convert conversation into an executable next action.

## Operating rule
Before closing a meaningful meeting, clarify:
**ACTION → OWNER → DATE → EXPECTED OUTCOME**

Example:
- ProFox confirms the technical scope Monday.
- Sarah reviews it with Daniel Tuesday.
- Proposal review is Wednesday at 2 PM Eastern.

Weak:
“We’ll keep in touch.”

If there is no legitimate next step, record that truthfully. Do not manufacture momentum to keep the opportunity looking active.

### Practice prompt
Rewrite “I’ll follow up soon” into a real operational commitment.
$md$,16,true),

  (v_module,'The Meeting Is Not Finished Until CRM Is Updated',$md$
## Objective
Stop losing buyer context between conversation and system.

## Operating rule
**Complete the knowledge handoff while memory is fresh.**

Record the meaningful outcome, including:
- what changed;
- requirements or problem context;
- decision-maker/stakeholder information;
- commercial/timeline context where relevant;
- objections or conditions;
- next action and date.

A completed calendar event with an empty CRM outcome is an incomplete sales operation.

### Mistakes to avoid
- waiting until the end of the week to reconstruct calls;
- writing “good call” as the entire outcome;
- marking a meeting Completed when it never happened;
- forgetting the next activity.

### Practice prompt
Write a concise CRM meeting outcome for a buyer who likes the recommendation but needs owner approval before accepting the quotation.
$md$,17,true),

  (v_module,'Reschedule and Cancel Cleanly',$md$
## Objective
Preserve one truthful meeting history.

## Operating rule
**Modify the real meeting through the approved workflow instead of creating calendar clutter.**

When rescheduling:
- update the existing meeting;
- preserve lead/opportunity relationship;
- confirm new buyer-facing time/timezone;
- allow the proper notifications to update.

When cancelling:
- preserve truthful history;
- record appropriate reason/context;
- determine whether another legitimate next action remains.

### Never
Create several active duplicates because the buyer changed the time multiple times.

### Practice prompt
A buyer moves Friday’s meeting to Monday. Explain how you would preserve one authoritative meeting record.
$md$,18,true),

  (v_module,'Recover No-Shows Professionally',$md$
## Objective
Recover potential opportunities without desperation or false records.

## Operating rule
**No-show → record truth → recover appropriately → reassess engagement.**

A calm recovery message can say:
“Looks like we missed each other today. If this is still a priority, I’m happy to find another suitable time.”

Do not:
- mark the meeting attended/completed;
- write an angry message;
- repeatedly call immediately;
- create endless new bookings with an unresponsive buyer;
- hide the no-show from CRM history.

A no-show is information. Use it to decide whether the next step is reschedule, follow-up, nurture or close the loop.

### Practice prompt
Write a professional first no-show recovery message that gives the buyer an easy next step without pressure.
$md$,19,true),

  (v_module,'Final Operating Standard — The High-Performance Calendar System',$md$
## Objective
Combine the whole module into one repeatable operating system.

## ProFox framework
**PROTECT → OFFER → CONFIRM → PREPARE → MEET → CAPTURE → ADVANCE**

1. **PROTECT** selling capacity before filling the calendar.
2. **OFFER** only real, appropriate availability.
3. **CONFIRM** time, timezone, purpose and joining method clearly.
4. **PREPARE** from CRM context and define the desired outcome.
5. **MEET** with structure, buyer focus and time discipline.
6. **CAPTURE** the real outcome immediately.
7. **ADVANCE** only through a legitimate next action.

### 10× operating mindset
The goal is not to work ten times longer or promise a literal ten-times result. The goal is to remove scheduling waste, protect high-value selling blocks, reduce preventable no-shows, avoid repeated context gathering and make each customer meeting create a useful commercial outcome.

### Final practice prompt
Before accepting or creating any meeting, ask:
**“Why does this meeting deserve time, what outcome should it create, and what must be protected around it?”**

**Certification standard:** after these lessons, you will complete ten synthetic scheduling missions and a judgment assessment. Training never creates or changes a live customer meeting.
$md$,20,true);
end $$;
