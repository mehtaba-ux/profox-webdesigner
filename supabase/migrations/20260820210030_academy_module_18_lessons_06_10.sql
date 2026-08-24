-- Module 18 lessons 06–10 — booking, duration, invitations and confirmation

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Match Duration to the Job',$md$
## Objective
Stop turning every conversation into the same-length meeting.

## Operating rule
**Use the shortest duration that can realistically achieve the meeting objective.**

ProFox supports multiple meeting durations. Use the current live options rather than memorizing old defaults.

Examples:
- simple follow-up → shorter;
- normal discovery → standard;
- complex consultation → longer where justified.

Longer does not automatically mean more valuable.

### Mistakes to avoid
- booking 60 minutes by habit;
- squeezing complex discovery into an unrealistic slot;
- leaving no time to document the outcome;
- letting one meeting overrun into the next.

### Practice prompt
List the factors that should determine meeting duration.
$md$,6,true),

  (v_module,'Book the Next Meeting While Momentum Exists',$md$
## Objective
Reduce deals that stall because nobody schedules the next legitimate conversation.

## Operating rule
**When a real next meeting is mutually agreed, schedule it while context and momentum are fresh whenever practical.**

Instead of:
“We’ll reconnect sometime next week.”

Prefer:
“Would Tuesday or Wednesday work for reviewing the recommendation together?”

Once the buyer agrees, create the meeting correctly.

### Important
Do not manufacture a meeting simply to show activity. A meeting is only valid when there is a real purpose and agreed attendance.

### Practice prompt
Turn “we’ll talk again next week” into an executable next meeting step without pressuring the buyer.
$md$,7,true),

  (v_module,'Make Booking Easy Without Surrendering Calendar Control',$md$
## Objective
Remove scheduling friction while protecting real availability.

## Operating rule
**Offer convenient choices inside approved availability.**

Avoid long scheduling chains such as:
Monday? No. Tuesday? What time? Not then. Wednesday?

Use the approved booking workflow or offer a small number of real, timezone-safe choices.

Fast booking does not mean unlimited availability. Working hours, buffers, existing meetings and time-off still control what can be offered.

### Mistakes to avoid
- offering times that are not truly free;
- ignoring buffers;
- giving the buyer twenty choices when two good options will do;
- bypassing the booking workflow to save a few seconds.

### Practice prompt
Write a concise message offering two valid meeting choices to an international buyer.
$md$,8,true),

  (v_module,'Every Invitation Must Be Complete',$md$
## Objective
Create meeting invitations that eliminate uncertainty.

## Operating rule
**A good invitation answers WHO → WHAT → WHEN → WHERE → WHY.**

Verify:
- descriptive title;
- correct attendee identity;
- date and time;
- timezone;
- duration;
- meeting type;
- approved provider/link;
- short purpose or agenda;
- relevant preparation if needed.

Never make the buyer search through old messages for the join link or wonder why the meeting exists.

### Example
Weak: “30-minute meeting.”
Better: “Northstar Roofing — Proposal Review” with attendee, buyer-facing time, approved joining method and a short objective.

### Practice prompt
List everything you would check before sending an external meeting invitation.
$md$,9,true),

  (v_module,'Confirmation Starts the Meeting Experience',$md$
## Objective
Make the booking feel professional immediately.

## Operating rule
**Confirmation should remove uncertainty, not create another conversation.**

A strong confirmation reinforces:
- date/time;
- buyer-facing timezone;
- purpose;
- duration;
- joining method;
- preparation if applicable;
- reschedule/cancellation path.

The meeting experience begins before anyone joins the call.

### Mistakes to avoid
- confirming only “Booked”;
- sending a link without context;
- forgetting the timezone;
- adding new commercial promises inside the meeting confirmation;
- making rescheduling unnecessarily difficult.

### Practice prompt
Draft a short confirmation for a 30-minute discovery meeting with a buyer in another timezone.

**Phase standard:** booking should be easy for the buyer and controlled for ProFox.
$md$,10,true);
end $$;
