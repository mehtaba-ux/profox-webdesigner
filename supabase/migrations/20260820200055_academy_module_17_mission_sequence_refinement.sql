-- Keep the synthetic lifecycle chronological: discovery is recorded first, then the learner schedules the agreed proposal review.

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;

  update public.crm_training_missions
  set title='Schedule the Proposal Review Meeting',
      objective='Use complete meeting context and timezone awareness for the next agreed sales conversation.',
      instructions='Discovery is complete. Schedule the synthetic Proposal Review with attendee identity, future start/end times and timezone. End time must be after start time.',
      scenario_data=jsonb_build_object(
        'meetingType','Proposal Review',
        'attendeeName','Sarah Miller',
        'attendeeEmail','sarah@northstar-example.test',
        'timezone','America/New_York',
        'purpose','Review the recommended scope, answer final questions and agree the commercial next step.'
      ),
      updated_at=now()
  where module_id=v_module and mission_key='schedule_meeting';
end $$;
