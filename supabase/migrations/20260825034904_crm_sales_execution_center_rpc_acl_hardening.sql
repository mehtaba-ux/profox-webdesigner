do $$
declare fn text;
begin
  foreach fn in array array[
    'crm_get_activity_execution_config()','crm_admin_save_activity_execution_config(jsonb)','crm_can_manage_activity(uuid)',
    'crm_adjust_activity_due(uuid,timestamp with time zone)','crm_start_activity(uuid)',
    'crm_reschedule_activity(uuid,timestamp with time zone,text,boolean)','crm_cancel_activity(uuid,text)',
    'crm_launch_activity_plan(text,uuid,text)','crm_pause_activity_plan(uuid,text,timestamp with time zone)',
    'crm_resume_activity_plan(uuid)','crm_stop_activity_plan(uuid,text)','crm_advance_activity_plan(uuid,text)',
    'crm_complete_activity(uuid,text,text,jsonb)','crm_get_activity_execution_context(uuid)',
    'crm_get_sales_work_queue(text,text,integer)','crm_get_activity_effectiveness(integer,text)',
    'crm_create_activity(text,uuid,text,text,timestamp with time zone,text,text,uuid)',
    'crm_reassign_activity(uuid,uuid)','crm_get_activity_history(text,integer)'
  ] loop
    execute 'revoke execute on function public.'||fn||' from public, anon';
    execute 'grant execute on function public.'||fn||' to authenticated';
  end loop;
end $$;
