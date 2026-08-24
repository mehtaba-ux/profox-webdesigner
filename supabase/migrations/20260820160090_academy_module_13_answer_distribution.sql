-- Module 13 assessment quality hardening
-- Rotate the originally-correct option away from index 0 across the question bank
-- so learners cannot game the certification by choosing the same letter repeatedly.

do $$
declare v_module uuid;
begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  update public.training_assessment_questions q
  set options = case (q.sort_order - 1) % 4
      when 0 then q.options
      when 1 then jsonb_build_array(q.options->1,q.options->0,q.options->2,q.options->3)
      when 2 then jsonb_build_array(q.options->1,q.options->2,q.options->0,q.options->3)
      when 3 then jsonb_build_array(q.options->1,q.options->2,q.options->3,q.options->0)
    end,
    correct_index = case (q.sort_order - 1) % 4 when 0 then 0 when 1 then 1 when 2 then 2 when 3 then 3 end,
    updated_at = now()
  where q.module_id=v_module and q.active=true and jsonb_array_length(q.options)=4;
end $$;
