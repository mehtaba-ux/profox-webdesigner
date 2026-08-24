-- Module 18 — 10 sequential synthetic calendar/meeting missions.

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;

  delete from public.calendar_training_missions where module_id=v_module;

  insert into public.calendar_training_missions(module_id,mission_key,title,objective,instructions,scenario_data,sort_order,active) values
  (v_module,'configure_availability','Configure Synthetic Sales Availability','Build a truthful working calendar before offering meeting slots.','Configure the supplied synthetic seller’s primary timezone, working days/hours and active availability. Use a normal working-day range and do not create impossible overnight hours.',
   jsonb_build_object('seller','Training Seller A','recommendedTimezone','Asia/Kolkata','workingDaysExample','1,2,3,4,5'),1,true),

  (v_module,'build_high_performance_day','Build a High-Performance Sales Day','Protect revenue-producing work before filling the day with meetings.','Create distinct prospecting, follow-up, customer-meeting and CRM/admin blocks. Add a priority rule that explains which work is protected from optional interruptions.',
   jsonb_build_object('day','Synthetic Monday','goal','Protect pipeline generation while preserving customer meeting capacity.'),2,true),

  (v_module,'configure_capacity','Configure Meeting Capacity','Use duration and buffers to protect meeting quality.','Choose an approved default meeting duration, reasonable before/after buffers and a sustainable maximum number of back-to-back meetings.',
   jsonb_build_object('allowedDurations',jsonb_build_array(15,30,45,60),'recommendedBufferAfter',15,'maxAllowedBackToBack',4),3,true),

  (v_module,'international_discovery','Schedule an International Discovery Meeting','Demonstrate timezone-safe scheduling with a real meeting purpose.','The synthetic buyer is in New York. Schedule a future Discovery Meeting with valid start/end timing and explicitly record the buyer-facing confirmed time.',
   jsonb_build_object('buyer','Sarah Miller','company','Northstar Roofing Co.','buyerTimezone','America/New_York','meetingType','Discovery Meeting'),4,true),

  (v_module,'complete_invite','Create a Complete Meeting Invitation','Build an invite that answers who, what, when, where and why.','Create the synthetic buyer invitation with a descriptive title, correct attendee, meeting type, approved platform label and a concise purpose/agenda. Do not use real customer data.',
   jsonb_build_object('attendeeName','Sarah Miller','attendeeEmail','sarah@northstar-example.test','company','Northstar Roofing Co.','meetingType','Discovery Meeting','platform','Manual / Approved Provider'),5,true),

  (v_module,'prepare_meeting_brief','Prepare the Meeting Brief','Enter a customer meeting knowing the account context, objective and important unknowns.','Use the supplied synthetic CRM context to prepare a concise brief: account context, meeting objective, known facts, unresolved unknowns and desired outcome.',
   jsonb_build_object('crmContext','Northstar wants to improve mobile quote requests before an October campaign. Sarah is the operational champion; owner approval is still required.','knownRisk','Integration requirements are not fully confirmed.'),6,true),

  (v_module,'mutual_next_step','Create a Mutual Next Step','Turn the meeting into an executable commitment.','Record one specific action, owner, future due date/time and expected outcome. Avoid vague wording such as follow up soon.',
   jsonb_build_object('standard','ACTION → OWNER → DATE → EXPECTED OUTCOME','minimumActionLength',15),7,true),

  (v_module,'reschedule_existing','Reschedule Without Duplicating','Preserve one authoritative meeting record when the buyer changes timing.','The synthetic buyer needs to move the meeting. Choose the action that updates the existing meeting, provide a valid future start/end and record buyer confirmation. Do not create a duplicate.',
   jsonb_build_object('existingMeeting','TRAIN-MTG-018-001','expectedDecision','reschedule_existing'),8,true),

  (v_module,'no_show_recovery','Recover a Synthetic No-Show','Respond professionally without falsifying attendance or chasing aggressively.','The synthetic buyer did not attend. Record the truthful outcome and choose one professional recovery action with a calm reschedule message.',
   jsonb_build_object('meetingOutcome','No-Show','expectedAction','send_reschedule_once','buyer','Sarah Miller'),9,true),

  (v_module,'weekly_calendar_audit','Run the Weekly Calendar Audit','Identify capacity waste before it becomes a sales-performance problem.','Review the synthetic week and document protected selling blocks, one fragmentation/capacity risk, one meeting-quality risk and one concrete improvement for next week.',
   jsonb_build_object('syntheticWeek','3 discovery calls, 2 proposal reviews, 14 follow-ups due, several short gaps between meetings.','goal','Protect pipeline generation while keeping meeting quality high.'),10,true);
end $$;
