-- PF-SOP-08 v1.1 — governed Admin controls.
-- Admin may tune operating capacity/SLA/package routing and add evidence requirements,
-- while the master SOP's minimum quality gates cannot be weakened from the UI.

create or replace function public.admin_get_design_delivery_settings()
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_config jsonb:='{}'::jsonb; v_packages jsonb:='[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_config
  from public.system_configuration where config_key='design_delivery_sop_v1';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'code',code,'name',name,'productType',product_type,'active',active
  ) order by sort_order,name),'[]'::jsonb)
  into v_packages
  from public.sales_products
  where active=true and product_type in('package','custom');

  return jsonb_build_object(
    'config',v_config,
    'catalogPackages',v_packages,
    'allowedDepths',jsonb_build_array('Launch','Growth','Scale','Custom','Unmapped'),
    'allowedEvidenceTypes',jsonb_build_array(
      'business_objective','target_audience','primary_conversion','approved_content','brand_assets',
      'research','information_architecture','user_flow','wireframe','design_system','design_file','prototype','handoff_notes'
    ),
    'minimumEvidenceByDepth',jsonb_build_object(
      'Launch',jsonb_build_array('design_file'),
      'Growth',jsonb_build_array('research','information_architecture','user_flow','wireframe','design_system','design_file'),
      'Scale',jsonb_build_array('research','information_architecture','user_flow','wireframe','design_system','design_file','prototype'),
      'Custom',jsonb_build_array('user_flow','wireframe','design_system','design_file','prototype'),
      'Unmapped',jsonb_build_array('design_file')
    ),
    'protectedControls',jsonb_build_object(
      'minimumDesignQaScoreFloor',90,
      'independentDesignQa',true,
      'accessibilityReview',true,
      'technicalReview',true,
      'businessObjective',true,
      'targetAudience',true,
      'primaryConversion',true,
      'contentReference',true,
      'brandAssetsReference',true
    )
  );
end;
$$;

create or replace function public.admin_update_design_delivery_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_old jsonb:='{}'::jsonb; v_new jsonb; v_packages jsonb; v_evidence jsonb;
  v_wip int; v_score int; v_review_sla int; v_client_sla int;
  v_key text; v_value text; v_depth text; v_item jsonb;
  v_allowed text[]:=array[
    'business_objective','target_audience','primary_conversion','approved_content','brand_assets',
    'research','information_architecture','user_flow','wireframe','design_system','design_file','prototype','handoff_notes'
  ];
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' then raise exception 'Settings payload must be an object.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_old
  from public.system_configuration where config_key='design_delivery_sop_v1' for update;
  if v_old='{}'::jsonb then raise exception 'PF-SOP-08 Design Delivery configuration is unavailable.'; end if;

  begin
    v_wip:=coalesce((p_settings->>'wipLimit')::int,(v_old->>'wipLimit')::int,2);
    v_score:=coalesce((p_settings->>'minimumDesignQaScore')::int,(v_old->>'minimumDesignQaScore')::int,90);
    v_review_sla:=coalesce((p_settings->>'reviewSlaHours')::int,(v_old->>'reviewSlaHours')::int,24);
    v_client_sla:=coalesce((p_settings->>'clientReviewSlaHours')::int,(v_old->>'clientReviewSlaHours')::int,72);
  exception when others then raise exception 'WIP, quality score and SLA values must be whole numbers.'; end;

  if v_wip<1 or v_wip>20 then raise exception 'Designer WIP limit must be between 1 and 20.'; end if;
  if v_score<90 or v_score>100 then raise exception 'PF-SOP-08 requires the independent Design QA pass threshold to remain between 90 and 100.'; end if;
  if v_review_sla<1 or v_review_sla>168 then raise exception 'Internal review SLA must be between 1 and 168 hours.'; end if;
  if v_client_sla<1 or v_client_sla>336 then raise exception 'Client review SLA must be between 1 and 336 hours.'; end if;

  v_packages:=coalesce(p_settings->'packageDepthByProductCode',v_old->'packageDepthByProductCode','{}'::jsonb);
  if jsonb_typeof(v_packages)<>'object' then raise exception 'Package depth mapping must be an object.'; end if;
  for v_key,v_value in select key,value from jsonb_each_text(v_packages) loop
    if length(trim(v_key))<1 or length(v_key)>100 then raise exception 'Package product codes must be valid non-empty values.'; end if;
    if v_value not in('Launch','Growth','Scale','Custom','Unmapped') then raise exception 'Unsupported Design Delivery depth for package %.',v_key; end if;
  end loop;

  v_evidence:=coalesce(p_settings->'requiredSubmissionEvidenceByDepth',v_old->'requiredSubmissionEvidenceByDepth','{}'::jsonb);
  if jsonb_typeof(v_evidence)<>'object' then raise exception 'Evidence requirements must be grouped by Design Delivery depth.'; end if;
  foreach v_depth in array array['Launch','Growth','Scale','Custom','Unmapped'] loop
    if jsonb_typeof(v_evidence->v_depth)<>'array' then raise exception 'Evidence requirements for % must be an array.',v_depth; end if;
    for v_item in select value from jsonb_array_elements(v_evidence->v_depth) loop
      if jsonb_typeof(v_item)<>'string' or not (trim(both '"' from v_item::text)=any(v_allowed)) then
        raise exception 'Unsupported Design Delivery evidence type in %.',v_depth;
      end if;
    end loop;
  end loop;

  -- Minimum package evidence is part of PF-SOP-08 and may be extended, never removed.
  if not (v_evidence->'Launch' @> '["design_file"]'::jsonb) then raise exception 'Launch requires a design file.'; end if;
  if not (v_evidence->'Growth' @> '["research","information_architecture","user_flow","wireframe","design_system","design_file"]'::jsonb) then raise exception 'Growth minimum PF-SOP-08 evidence cannot be removed.'; end if;
  if not (v_evidence->'Scale' @> '["research","information_architecture","user_flow","wireframe","design_system","design_file","prototype"]'::jsonb) then raise exception 'Scale minimum PF-SOP-08 evidence cannot be removed.'; end if;
  if not (v_evidence->'Custom' @> '["user_flow","wireframe","design_system","design_file","prototype"]'::jsonb) then raise exception 'Custom minimum PF-SOP-08 evidence cannot be removed.'; end if;
  if not (v_evidence->'Unmapped' @> '["design_file"]'::jsonb) then raise exception 'Unmapped work requires at least a design file.'; end if;

  v_new:=v_old || jsonb_build_object(
    'wipLimit',v_wip,
    'minimumDesignQaScore',v_score,
    'reviewSlaHours',v_review_sla,
    'clientReviewSlaHours',v_client_sla,
    'packageDepthByProductCode',v_packages,
    'requiredSubmissionEvidenceByDepth',v_evidence,
    -- Non-negotiable PF-SOP-08 controls are deliberately restored true on every save.
    'requireIndependentDesignQa',true,
    'requireAccessibilityReview',true,
    'requireTechnicalReview',true,
    'requireBusinessObjective',true,
    'requireTargetAudience',true,
    'requirePrimaryConversion',true,
    'requireContentReference',true,
    'requireBrandAssetsReference',true
  );

  update public.system_configuration
  set config_value=v_new,
      description='PF-SOP-08 executable Design Delivery controls. Admin-managed operating values with protected quality minimums.',
      updated_at=now()
  where config_key='design_delivery_sop_v1';

  insert into public.configuration_audit_log(config_key,old_value,new_value,changed_by,changed_at)
  values('design_delivery_sop_v1',v_old,v_new,auth.uid(),now());

  return v_new;
end;
$$;

revoke all on function public.admin_get_design_delivery_settings() from public,anon;
grant execute on function public.admin_get_design_delivery_settings() to authenticated;
revoke all on function public.admin_update_design_delivery_settings(jsonb) from public,anon;
grant execute on function public.admin_update_design_delivery_settings(jsonb) to authenticated;
