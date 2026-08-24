-- Module 18 lessons 01–05 — capacity, timezone and meeting purpose

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Your Calendar Is Revenue Capacity',$md$
## Objective
Understand that calendar management is part of selling performance.

## Operating rule
**Time is inventory. Protect it before other people consume it.**

A salesperson can have excellent outreach and closing skills and still underperform if the day is fragmented by random calls, unnecessary meetings, constant rescheduling and reactive admin work.

Your calendar must preserve capacity for prospect research, outreach, follow-up, customer meetings, preparation, CRM updates, quotation/payment follow-up, learning and recovery.

### Example
Two sellers each work eight hours. One reacts to email and meetings all day. The other protects prospecting blocks, batches follow-ups, prepares before calls and records outcomes immediately. The second seller does not work longer; their time produces more useful sales actions.

### Mistakes to avoid
- confusing a full calendar with productivity;
- allowing meetings to consume all prospecting time;
- leaving important work for “whenever I get time”;
- checking messages constantly;
- scheduling without preparation/follow-up space.

### Practice prompt
Design an eight-hour sales day that protects both pipeline generation and customer conversations.

**Standard:** protect revenue-producing capacity before filling availability.
$md$,1,true),

  (v_module,'Protect Revenue-Producing Time First',$md$
## Objective
Prevent low-value work from consuming high-value selling hours.

## Operating rule
**Schedule priority work before scheduling optional work.**

Protect recurring blocks for activities such as:
- prospecting and research;
- personalized outreach;
- follow-up;
- customer meetings;
- CRM/admin completion.

A high-performance seller should know before the day begins when prospecting happens, when follow-ups happen, when customer meetings may be accepted, when CRM work happens and where preparation time exists.

### Example
Instead of leaving 9 AM–5 PM open for anyone to book, protect the morning prospecting block, define legitimate meeting windows and keep a short end-of-day CRM reset.

### Mistakes to avoid
- starting every morning from an empty plan;
- allowing internal interruptions during prime selling blocks;
- scattering five small follow-ups across five different hours;
- allowing the whole day to become meeting availability.

### Practice prompt
Which two daily blocks should a ProFox seller protect most aggressively and why?
$md$,2,true),

  (v_module,'Your Timezone Must Always Be Correct',$md$
## Objective
Eliminate one of the easiest ways to damage trust before a meeting begins.

## Operating rule
**Never perform timezone math casually when the system can preserve it.**

Your operating timezone must be correct. When working internationally, also confirm the buyer-facing time explicitly.

Example:
“Perfect — that is 2:00 PM Eastern Time for you. I’ll send the confirmation now.”

A meeting stored at the wrong time is not a harmless admin mistake. It can create a no-show, waste seller capacity and damage buyer confidence.

### Never
- assume “3 PM” means your timezone;
- copy a meeting time manually without checking;
- ask the buyer to calculate your timezone;
- silently move a meeting because your conversion was wrong.

### Practice prompt
A prospect says, “Thursday at 11 works.” List what must be confirmed before saving the meeting.

**Standard:** both seller and buyer should understand the same moment in time.
$md$,3,true),

  (v_module,'Working Hours, Buffers and Limits Protect Performance',$md$
## Objective
Build availability that is sustainable and meeting-ready.

## Operating rule
**Being technically free does not automatically mean being available.**

Calendar settings should protect working days/hours, preparation, post-meeting notes, breaks, deep work and approved buffers.

ProFox already supports working days, working hours, timezone, meeting duration, buffer-before and buffer-after controls. Use those settings intentionally rather than leaving unlimited availability.

### Example
Six back-to-back discovery calls may look productive. By meeting four, notes are late, context is blurred, energy falls and the next buyer receives a weaker conversation. A buffer can protect both preparation and CRM capture.

### Mistakes to avoid
- booking outside approved working hours without a legitimate exception;
- removing all buffers to look more available;
- accepting overlapping commitments;
- treating preparation time as optional.

### Practice prompt
Explain how meeting buffers can increase sales quality even though they reduce the number of bookable slots.
$md$,4,true),

  (v_module,'Use the Right Meeting Type',$md$
## Objective
Make the calendar communicate why the meeting exists.

## Operating rule
**Every meeting needs one primary purpose.**

Typical ProFox meeting purposes include Discovery, Proposal Review, Project Consultation and Follow-Up. Use the current approved meeting types shown by the live system.

Do not create vague titles such as “Call.” Prefer a descriptive meeting title that helps everyone understand the context, for example:
**Northstar Roofing — Discovery Meeting**

The meeting type determines the expected preparation and outcome.

### Example
A buyer has already received the recommendation and quotation and wants to review scope and commercial questions. That is not another discovery meeting; use the current appropriate review meeting type.

### Mistakes to avoid
- choosing a meeting type by habit;
- using discovery for every customer conversation;
- creating a generic “Call” record;
- selecting a stage or meeting type that implies work not yet completed.

### Practice prompt
Choose the correct meeting purpose for a buyer who has received a quotation and wants to discuss it before deciding.

**Phase standard:** protect capacity, preserve timezone truth and know exactly why the meeting exists.
$md$,5,true);
end $$;
