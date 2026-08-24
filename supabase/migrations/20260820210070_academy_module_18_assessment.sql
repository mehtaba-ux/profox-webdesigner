-- Module 18 — 20 server-scored calendar/meeting judgment scenarios + 7 acknowledgements.

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='calendar-setup';
  if v_module is null then raise exception 'Module 18 calendar-setup is missing.'; end if;

  delete from public.training_assessment_questions where module_id=v_module;
  delete from public.training_acknowledgements where module_id=v_module;

  insert into public.training_assessment_questions
    (module_id,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical)
  values
  (v_module,'A buyer says, “Thursday at 11 works,” but does not name a timezone. What should you do before scheduling?',
   '["Assume your own timezone","Confirm the buyer-facing timezone/time before saving the meeting","Use UTC without asking","Create the meeting and correct it later"]'::jsonb,1,
   'A meeting is not safely scheduled until both sides understand the same moment in time.',1,true,'scenario','timezone_ambiguity',false),

  (v_module,'Your calendar shows an open slot outside your configured working hours. A prospect asks for it. What is the strongest default action?',
   '["Always accept because the slot is empty","Ignore working hours permanently","Use approved availability and treat out-of-hours scheduling as an exception rather than normal availability","Delete your working hours"]'::jsonb,2,
   'Free space is not automatically approved availability. Working hours and exceptions protect sustainable capacity.',2,true,'scenario','working_hours',false),

  (v_module,'A simple follow-up needs one decision and no complex discovery. Which duration principle is best?',
   '["Use the shortest approved duration that can realistically achieve the objective","Always book 60 minutes","Use whatever duration pays more commission","Book two meetings instead of one"]'::jsonb,0,
   'Meeting duration should match the job rather than habit.',3,true,'scenario','duration_fit',false),

  (v_module,'At the end of a productive discovery call, both sides agree a proposal review is needed. What is the best next step?',
   '["Say you will reconnect someday","Wait for the buyer to remember","Create an internal note only","Agree and schedule the legitimate next meeting while momentum and context are fresh"]'::jsonb,3,
   'A mutually agreed next meeting should become an executable calendar commitment.',4,true,'scenario','book_next_meeting',false),

  (v_module,'Which invitation is strongest?',
   '["Call — 30 min","Northstar Roofing — Discovery Meeting, correct attendee/timezone/joining method and short purpose","Meeting","Zoom link only"]'::jsonb,1,
   'A complete invitation answers who, what, when, where and why.',5,true,'scenario','invite_quality',false),

  (v_module,'You want your activity numbers to look stronger, so you create two customer meetings that were never agreed with the prospects. What is correct?',
   '["Fine if you delete them later","Fine if the prospects are high fit","Never fabricate meetings or buyer commitments to inflate activity","Ask another rep to create them"]'::jsonb,2,
   'A customer meeting is a factual commitment, not an activity metric to manufacture.',6,true,'scenario','fake_meeting',true),

  (v_module,'You realize you scheduled a buyer at the wrong timezone but do not want Management to see the mistake. What should you do?',
   '["Correct the meeting truthfully, notify the buyer appropriately and preserve accurate history","Change the buyer timezone field to make your time look correct","Mark the meeting completed","Create a duplicate with a different title"]'::jsonb,0,
   'Knowingly falsifying meeting time/timezone corrupts customer and operational truth.',7,true,'scenario','timezone_falsification',true),

  (v_module,'The booking workflow blocks a slot because another meeting already occupies it. What should you do?',
   '["Use a different browser","Create the same meeting manually in another table","Delete the conflicting meeting without checking","Respect the conflict protection and choose a legitimate available time"]'::jsonb,3,
   'Conflict controls exist to protect both customers and seller capacity. Do not bypass them.',8,true,'scenario','conflict_bypass',true),

  (v_module,'Before a proposal review, what should the seller prepare?',
   '["CRM/account history, meeting objective, known facts, important unknowns, commercial context and desired outcome","Only the buyer email address","A generic company presentation","Nothing—the buyer can explain it again"]'::jsonb,0,
   'Preparation should prevent repeated discovery and focus the meeting on the next decision.',9,true,'scenario','meeting_prep',false),

  (v_module,'What is the strongest way to use an agenda?',
   '["Read a script without deviation","Use it to structure context, objective, discussion, decision and next step while remaining conversational","Skip buyer questions to stay on agenda","Use slides for every discovery call"]'::jsonb,1,
   'The agenda gives direction without replacing active listening and judgment.',10,true,'scenario','agenda_use',false),

  (v_module,'A prospect did not attend. Which CRM/calendar record is acceptable?',
   '["Completed because a slot was reserved","Attended because you joined","No-Show with truthful recovery/next action where appropriate","Won because they had previously shown interest"]'::jsonb,2,
   'Attendance must reflect what actually happened. Faking attendance is a critical integrity failure.',11,true,'scenario','fake_attendance',true),

  (v_module,'A buyer misses the meeting without notice. What is the best first recovery behavior?',
   '["Send an angry message","Call repeatedly until they answer","Delete the meeting history","Record the no-show and send one calm, easy reschedule option if continued contact is appropriate"]'::jsonb,3,
   'Professional no-show recovery preserves truth and buyer autonomy without desperation.',12,true,'scenario','no_show_recovery',false),

  (v_module,'A buyer sends an admin password and OTP while arranging a future consultation. Where should you put them?',
   '["Meeting description","Do not store them in ordinary calendar/CRM fields; move the credential issue to the approved secure process","Meeting title","Personal notes app"]'::jsonb,1,
   'Passwords and OTPs are secrets and do not belong in normal sales scheduling records.',13,true,'scenario','credential_storage',true),

  (v_module,'The buyer said they need internal review, but you record “Customer approved project” to make the meeting outcome look stronger. What is correct?',
   '["Record the real outcome: internal review is still required","That is acceptable if you expect approval","Mark Won instead","Remove the meeting outcome entirely"]'::jsonb,0,
   'Buyer commitments and meeting outcomes must never be fabricated.',14,true,'scenario','outcome_falsification',true),

  (v_module,'A buyer explicitly asks ProFox not to contact them again. What should you do with future meeting scheduling?',
   '["Schedule monthly check-ins anyway","Create a hidden follow-up","Respect the no-contact instruction and do not create further customer meetings unless a valid new consent/context exists","Ask another salesperson to contact them"]'::jsonb,2,
   'Continuing scheduled outreach after an explicit no-contact request is a critical failure.',15,true,'scenario','no_contact',true),

  (v_module,'You missed an important meeting and want to reassign/delete the history so your dashboard looks clean. What is correct?',
   '["Reassign it to a colleague","Delete and recreate it","Change the outcome to Completed","Preserve truthful ownership/history and resolve or escalate the missed commitment instead of hiding it"]'::jsonb,3,
   'Meeting ownership and history must not be manipulated to conceal performance or mistakes.',16,true,'scenario','history_manipulation',true),

  (v_module,'The system already sends approved meeting reminders. What should the seller generally do?',
   '["Let the configured automation handle routine reminders and add personal follow-up only when judgment/context requires it","Send five manual reminders too","Disable automation","Change reminder timing for each prospect"]'::jsonb,0,
   'Automation should remove predictable admin work rather than be duplicated manually.',17,true,'scenario','reminder_automation',false),

  (v_module,'Which next step is strongest after a meeting?',
   '["Follow up soon","ProFox sends integration confirmation Monday; Sarah reviews Tuesday; proposal review Wednesday at 2 PM Eastern","Stay in touch","Buyer will think about it"]'::jsonb,1,
   'A strong next step has action, owner, date and expected outcome.',18,true,'scenario','mutual_next_step',false),

  (v_module,'A buyer moves Friday’s meeting to Monday. What should you do?',
   '["Create a second active meeting and leave Friday in place","Delete all meeting history","Reschedule the existing authoritative meeting through the approved workflow and confirm the new time","Create an unrelated activity instead"]'::jsonb,2,
   'Rescheduling should preserve one authoritative meeting record and its history.',19,true,'scenario','reschedule_existing',false),

  (v_module,'Your weekly calendar shows fragmented gaps, several back-to-back calls and no protected prospecting block. What is the best response?',
   '["Add more meetings","Ignore it if revenue is currently fine","Work later every night","Audit capacity, protect selling blocks, add appropriate buffers and improve next week’s structure"]'::jsonb,3,
   'Calendar review should improve future capacity and meeting quality rather than glorify busyness.',20,true,'scenario','weekly_audit',false);

  insert into public.training_acknowledgements(module_id,statement,sort_order,required,active) values
  (v_module,'I will keep my calendar availability, working hours and timezone truthful.',1,true,true),
  (v_module,'I will protect revenue-producing work instead of treating a full calendar as success.',2,true,true),
  (v_module,'I will create customer meetings only for legitimate agreed purposes and record attendance/history accurately.',3,true,true),
  (v_module,'I will prepare from existing CRM context and will not make buyers repeatedly explain information already captured.',4,true,true),
  (v_module,'I will never fabricate attendance, outcomes, buyer commitments, meeting history or next steps.',5,true,true),
  (v_module,'I will protect customer information and never place passwords, OTPs or other secrets in ordinary meeting records.',6,true,true),
  (v_module,'I will end meaningful meetings with a clear next action—or truthfully record that there is none.',7,true,true);
end $$;
