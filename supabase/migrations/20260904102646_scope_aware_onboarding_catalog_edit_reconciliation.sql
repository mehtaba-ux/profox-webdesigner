create or replace function public.client_onboarding_default_requirements(
  p_code text,
  p_name text,
  p_category text,
  p_product_type text,
  p_scope jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_category text:=lower(btrim(coalesce(p_category,'')));
  v_type text:=lower(btrim(coalesce(p_product_type,'')));
  v_hint text:=lower(concat_ws(' ',coalesce(p_code,''),coalesce(p_name,''),coalesce(p_category,''),coalesce(p_scope,'[]'::jsonb)::text));
  v_keys text[]:=array[]::text[];
begin
  case v_code
    when 'PF-WEB-LAUNCH' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','trustProof','formRouting','contactActions','seoMarkets','analyticsAccess','technicalAccess'];
    when 'PF-WEB-GROWTH' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','competitors','trustProof','formRouting','contactActions','seoMarkets','keywordPriorities','analyticsAccess','trackingGoals','integrationRequirements','copyVoice','technicalAccess'];
    when 'PF-WEB-SCALE' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','competitors','trustProof','formRouting','contactActions','seoMarkets','keywordPriorities','seoAssets','analyticsAccess','trackingGoals','integrationRequirements','copyVoice','croPriorities','accessibilityNeeds','stakeholderList','technicalAccess'];
    when 'PF-CUSTOM' then v_keys:=array['projectGoals','targetAudience','primaryOffer','userRoles','workflowRequirements','featurePriorities','portalRequirements','adminReporting','authPermissions','dataRequirements','integrationRequirements','paymentGatewayRequirements','automationRequirements','designPreferences','brandAssetsUrl','acceptanceCriteria','technicalAccess','trainingHandover','stakeholderList'];
    when 'PF-DISCOVERY' then v_keys:=array['projectGoals','targetAudience','userRoles','workflowRequirements','featurePriorities','integrationRequirements','discoveryConstraints','acceptanceCriteria'];
    when 'PF-ADD-PAGE' then v_keys:=array['additionalPageBriefs','contentStatus','assetLinks'];
    when 'PF-ADD-CUSTOM-PAGE' then v_keys:=array['additionalPageBriefs','designPreferences','contentStatus','assetLinks'];
    when 'PF-ADD-LANDING' then v_keys:=array['landingPageBrief','primaryCta','trustProof','assetLinks'];
    when 'PF-ADD-COPY' then v_keys:=array['copyPageBrief','copyVoice','trustProof'];
    when 'PF-ADD-BLOG' then v_keys:=array['blogRequirements','assetLinks'];
    when 'PF-ADD-MIGRATION20' then v_keys:=array['migrationRequirements','technicalAccess'];
    when 'PF-ADD-LEADFORM' then v_keys:=array['leadFormRequirements','formRouting'];
    when 'PF-ADD-BOOKING' then v_keys:=array['bookingRequirements','technicalAccess'];
    when 'PF-ADD-CHAT' then v_keys:=array['chatRequirements'];
    when 'PF-ADD-REVIEWS' then v_keys:=array['reviewsRequirements'];
    when 'PF-ADD-CRM' then v_keys:=array['crmRequirements','technicalAccess'];
    when 'PF-ADD-TRACKING' then v_keys:=array['trackingGoals','analyticsAccess','technicalAccess'];
    when 'PF-ADD-CRO' then v_keys:=array['croPriorities','trackingGoals'];
    when 'PF-ADD-LOCALSEO' then v_keys:=array['seoMarkets','seoAssets','technicalAccess'];
    when 'PF-ADD-ADVSEO' then v_keys:=array['seoMarkets','keywordPriorities','seoAssets','technicalAccess'];
    when 'PF-ADD-AIDISCOVERY' then v_keys:=array['aiDiscoveryTopics','seoMarkets'];
    when 'PF-ADD-SEOAUDIT' then v_keys:=array['seoAssets','technicalAccess'];
    when 'PF-ADD-SEOMIGRATION' then v_keys:=array['seoMigration','seoAssets','technicalAccess'];
    when 'PF-ADD-LOGOREFRESH' then v_keys:=array['brandDirection','brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-MINIBRAND' then v_keys:=array['brandDirection','brandAssetsUrl'];
    when 'PF-ADD-ICONS' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-ANIMATION' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-ILLUSTRATION' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-3D' then v_keys:=array['brandAssetsUrl','creativeAssetBrief','technicalAccess'];
    when 'PF-ADD-COMMERCE25' then v_keys:=array['ecommerceRequirements','paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-COMMERCEADD25' then v_keys:=array['ecommerceRequirements','assetLinks'];
    when 'PF-ADD-FILTERS' then v_keys:=array['productFilterRequirements'];
    when 'PF-ADD-SUBSCRIPTION' then v_keys:=array['subscriptionRequirements','paymentGatewayRequirements'];
    when 'PF-ADD-PAYGATEWAY' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-CHECKOUT' then v_keys:=array['checkoutRequirements','paymentGatewayRequirements'];
    when 'PF-ADD-INT-SIMPLE' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-INT-ADV' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-API' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-EMAIL' then v_keys:=array['emailAutomationRequirements','technicalAccess'];
    when 'PF-ADD-LEADROUTE' then v_keys:=array['crmLeadRouting','crmRequirements'];
    when 'PF-ADD-PAYMENT' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-BPA' then v_keys:=array['automationRequirements','integrationRequirements'];
    when 'PF-CARE' then v_keys:=array['maintenancePriorities','technicalAccess'];
    when 'PF-CARE-GROWTH' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','technicalAccess'];
    when 'PF-CARE-PRIORITY' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','strategyPriorities','technicalAccess'];
    else
      if v_type='package' and v_category like '%web%' then
        v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','technicalAccess'];
      elsif v_type='discovery' then
        v_keys:=array['projectGoals','targetAudience','workflowRequirements','featurePriorities','discoveryConstraints'];
      elsif v_type='custom' then
        v_keys:=array['projectGoals','targetAudience','workflowRequirements','featurePriorities','acceptanceCriteria','technicalAccess'];
      elsif v_category like '%page%' or v_category like '%content%' then
        if v_hint like '%landing%' or v_hint like '%campaign%' then v_keys:=array['landingPageBrief','primaryCta','trustProof','assetLinks'];
        elsif v_hint like '%blog%' or v_hint like '%article%' then v_keys:=array['blogRequirements','assetLinks'];
        elsif v_hint like '%migrat%' or v_hint like '%transfer%' or v_hint like '%import%' then v_keys:=array['migrationRequirements','technicalAccess'];
        elsif v_hint like '%copy%' or v_hint like '%writing%' then v_keys:=array['copyPageBrief','copyVoice','trustProof'];
        elsif v_hint like '%custom%page%' or v_hint like '%page%custom%' then v_keys:=array['additionalPageBriefs','designPreferences','contentStatus','assetLinks'];
        else v_keys:=array['additionalPageBriefs','contentStatus','assetLinks']; end if;
      elsif v_category like '%lead%' then
        if v_hint like '%book%' or v_hint like '%calendar%' or v_hint like '%appointment%' then v_keys:=array['bookingRequirements','technicalAccess'];
        elsif v_hint like '%whatsapp%' or v_hint like '%chat%' or v_hint like '%messag%' then v_keys:=array['chatRequirements'];
        elsif v_hint like '%review%' or v_hint like '%testimonial%' then v_keys:=array['reviewsRequirements'];
        elsif v_hint like '%crm%' and (v_hint like '%automati%' or v_hint like '%workflow%') then v_keys:=array['crmRequirements','automationRequirements','technicalAccess'];
        elsif v_hint like '%crm%' then v_keys:=array['crmRequirements','technicalAccess'];
        elsif v_hint like '%track%' or v_hint like '%analytics%' or v_hint like '%conversion event%' then v_keys:=array['trackingGoals','analyticsAccess','technicalAccess'];
        elsif v_hint like '%cro%' or v_hint like '%conversion optim%' then v_keys:=array['croPriorities','trackingGoals'];
        else v_keys:=array['leadFormRequirements','formRouting']; end if;
      elsif v_category like '%search%' or v_category like '%seo%' then
        if v_hint like '%migrat%' or v_hint like '%redirect%' then v_keys:=array['seoMigration','seoAssets','technicalAccess'];
        elsif v_hint like '%ai%' or v_hint like '%geo%' or v_hint like '%generative%' then v_keys:=array['aiDiscoveryTopics','seoMarkets'];
        elsif v_hint like '%local%' or v_hint like '%maps%' or v_hint like '%business profile%' then v_keys:=array['seoMarkets','seoAssets','technicalAccess'];
        elsif v_hint like '%audit%' or v_hint like '%technical%' then v_keys:=array['seoAssets','technicalAccess'];
        elsif v_hint like '%advanced%' or v_hint like '%keyword%' then v_keys:=array['seoMarkets','keywordPriorities','seoAssets','technicalAccess'];
        else v_keys:=array['seoMarkets','seoAssets','technicalAccess']; end if;
      elsif v_category like '%brand%' then
        if v_hint like '%logo%' then v_keys:=array['brandDirection','brandAssetsUrl','creativeAssetBrief'];
        elsif v_hint like '%icon%' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
        elsif v_hint like '%animation%' or v_hint like '%motion%' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
        elsif v_hint like '%illustrat%' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
        elsif v_hint like '%3d%' or v_hint like '%interactive%' then v_keys:=array['brandAssetsUrl','creativeAssetBrief','technicalAccess'];
        else v_keys:=array['brandDirection','brandAssetsUrl']; end if;
      elsif v_category like '%commerce%' then
        if v_hint like '%filter%' or v_hint like '%sort%' then v_keys:=array['productFilterRequirements'];
        elsif v_hint like '%subscription%' or v_hint like '%recurring%' then v_keys:=array['subscriptionRequirements','paymentGatewayRequirements'];
        elsif v_hint like '%gateway%' or v_hint like '%payment%' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
        elsif v_hint like '%checkout%' then v_keys:=array['checkoutRequirements','paymentGatewayRequirements'];
        else v_keys:=array['ecommerceRequirements','paymentGatewayRequirements','technicalAccess']; end if;
      elsif v_category like '%integration%' then
        if v_hint like '%crm%' and (v_hint like '%automati%' or v_hint like '%workflow%') then v_keys:=array['crmRequirements','automationRequirements','technicalAccess'];
        elsif v_hint like '%crm%' then v_keys:=array['crmRequirements','technicalAccess'];
        elsif v_hint like '%email%' or v_hint like '%newsletter%' then v_keys:=array['emailAutomationRequirements','technicalAccess'];
        elsif v_hint like '%lead rout%' then v_keys:=array['crmLeadRouting','crmRequirements'];
        elsif v_hint like '%payment%' or v_hint like '%gateway%' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
        elsif v_hint like '%automati%' or v_hint like '%workflow%' or v_hint like '%business process%' then v_keys:=array['automationRequirements','integrationRequirements'];
        else v_keys:=array['integrationRequirements','technicalAccess']; end if;
      elsif v_category like '%care%' then
        if v_hint like '%priority%' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','strategyPriorities','technicalAccess'];
        elsif v_hint like '%growth%' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','technicalAccess'];
        else v_keys:=array['maintenancePriorities','technicalAccess']; end if;
      else
        v_keys:=array['projectGoals'];
      end if;
  end case;
  return jsonb_build_object('fieldKeys',to_jsonb(v_keys));
end;$function$;

create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_id uuid; v_code text:=upper(trim(coalesce(p_product->>'code',''))); v_name text:=trim(coalesce(p_product->>'name','')); v_category text:=trim(coalesce(p_product->>'category',''));
  v_product_type text:=trim(coalesce(p_product->>'product_type','')); v_price_mode text:=trim(coalesce(p_product->>'price_mode','')); v_scope jsonb:=coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb:=coalesce(p_product->'public_details','{}'::jsonb); v_client_expectations jsonb:=coalesce(p_product->'client_expectations','{}'::jsonb);
  v_payment_schedule jsonb:=case when p_product ? 'payment_schedule' then p_product->'payment_schedule' else null end;
  v_duration_min integer:=case when nullif(p_product->>'delivery_duration_min','') is null then null else (p_product->>'delivery_duration_min')::integer end;
  v_duration_max integer:=case when nullif(p_product->>'delivery_duration_max','') is null then null else (p_product->>'delivery_duration_max')::integer end;
  v_timeline_impact text:=coalesce(nullif(p_product->>'timeline_impact',''),case when v_product_type='care_plan' then 'parallel' when v_price_mode='custom' or v_product_type='custom' then 'assessment_required' when v_product_type='package' then 'base' when v_product_type in ('addon','discovery') then 'additive' else 'assessment_required' end);
  v_requirements jsonb; v_current_requirements jsonb; v_old_default jsonb; v_cfg jsonb:=public.client_onboarding_config(); v_key text;
  v_current_code text; v_current_name text; v_current_category text; v_current_product_type text; v_current_scope jsonb;
  v_active boolean:=coalesce((p_product->>'active')::boolean,true);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_code='' or v_name='' or v_category='' then raise exception 'Product code, name and category are required'; end if;
  if v_product_type not in ('package','addon','care_plan','discovery','custom') then raise exception 'Invalid product type'; end if;
  if v_price_mode not in ('fixed','starting_at','custom') then raise exception 'Invalid price mode'; end if;
  if v_timeline_impact not in ('base','additive','parallel','assessment_required') then raise exception 'Invalid timeline impact'; end if;
  if (v_duration_min is null)<>(v_duration_max is null) or coalesce(v_duration_min,0)<0 or (v_duration_min is not null and v_duration_max<v_duration_min) then raise exception 'Delivery duration must contain a valid minimum and maximum business-day range'; end if;
  if jsonb_typeof(v_scope)<>'array' then raise exception 'Scope must be an array'; end if;
  if jsonb_typeof(v_public_details)<>'object' then raise exception 'Public details must be an object'; end if;
  if jsonb_typeof(v_client_expectations)<>'object' then raise exception 'Client expectations must be an object'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry where entry.key not in ('clientResponsibilities','deliveryAssumptions','reviewAndApproval','handoverAndSupport') or jsonb_typeof(entry.value)<>'array') then raise exception 'Client expectations contain an unsupported section or non-array value'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry cross join lateral jsonb_array_elements(entry.value) item where jsonb_typeof(item)<>'string') then raise exception 'Each client expectation must be text'; end if;
  if v_payment_schedule is not null and jsonb_typeof(v_payment_schedule)<>'array' then raise exception 'Payment schedule must be an array'; end if;
  if coalesce((p_product->>'base_price')::numeric,0)<0 then raise exception 'Base price cannot be negative'; end if;

  if p_product ? 'onboarding_requirements' then
    v_requirements:=p_product->'onboarding_requirements';
  elsif nullif(p_product->>'id','') is not null then
    select onboarding_requirements,code,name,category,product_type,scope
      into v_current_requirements,v_current_code,v_current_name,v_current_category,v_current_product_type,v_current_scope
    from public.sales_products where id=(p_product->>'id')::uuid;
    if not found then raise exception 'Sales product not found'; end if;
    v_old_default:=public.client_onboarding_default_requirements(v_current_code,v_current_name,v_current_category,v_current_product_type,v_current_scope);
    if v_current_requirements is distinct from v_old_default then
      v_requirements:=v_current_requirements;
    else
      v_requirements:=public.client_onboarding_default_requirements(v_code,v_name,v_category,v_product_type,v_scope);
    end if;
  else
    v_requirements:=public.client_onboarding_default_requirements(v_code,v_name,v_category,v_product_type,v_scope);
  end if;

  if jsonb_typeof(v_requirements)<>'object' then raise exception 'Onboarding requirements must be an object.'; end if;
  if jsonb_typeof(coalesce(v_requirements->'fieldKeys','[]'::jsonb))<>'array' then raise exception 'Onboarding fieldKeys must be an array.'; end if;
  if v_requirements ? 'customFields' and jsonb_typeof(v_requirements->'customFields')<>'array' then raise exception 'Onboarding customFields must be an array.'; end if;
  if v_active
     and jsonb_array_length(coalesce(v_requirements->'fieldKeys','[]'::jsonb))=0
     and jsonb_array_length(case when jsonb_typeof(v_requirements->'customFields')='array' then v_requirements->'customFields' else '[]'::jsonb end)=0 then
    raise exception 'An active catalog product must define at least one onboarding requirement.';
  end if;
  for v_key in select value from jsonb_array_elements_text(coalesce(v_requirements->'fieldKeys','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'fieldLibrary','[]'::jsonb)) f where f->>'key'=v_key) then raise exception 'Unknown onboarding field key: %.',v_key; end if;
  end loop;

  if nullif(p_product->>'id','') is null then
    insert into public.sales_products(code,name,category,product_type,price_mode,base_price,currency,billing_period,short_description,full_description,scope,technology,manager_approval_required,active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,client_expectations,delivery_duration_min,delivery_duration_max,delivery_duration_unit,timeline_impact,delivery_duration_note,onboarding_requirements,updated_at)
    values(v_code,v_name,v_category,v_product_type,v_price_mode,coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),coalesce((p_product->>'manager_approval_required')::boolean,false),v_active,coalesce((p_product->>'sort_order')::integer,0),nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,v_public_details,v_client_expectations,v_duration_min,v_duration_max,'business_days',v_timeline_impact,nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),v_requirements,timezone('utc',now())) returning id into v_id;
  else
    v_id:=(p_product->>'id')::uuid;
    update public.sales_products set code=v_code,name=v_name,category=v_category,product_type=v_product_type,price_mode=v_price_mode,base_price=coalesce((p_product->>'base_price')::numeric,0),currency=coalesce(nullif(p_product->>'currency',''),'USD'),billing_period=nullif(p_product->>'billing_period',''),short_description=nullif(p_product->>'short_description',''),full_description=nullif(p_product->>'full_description',''),scope=v_scope,technology=nullif(p_product->>'technology',''),manager_approval_required=coalesce((p_product->>'manager_approval_required')::boolean,false),active=v_active,sort_order=coalesce((p_product->>'sort_order')::integer,0),standard_payment_terms=nullif(p_product->>'standard_payment_terms',''),payment_schedule=v_payment_schedule,public_visible=case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,public_details=v_public_details,client_expectations=v_client_expectations,delivery_duration_min=v_duration_min,delivery_duration_max=v_duration_max,delivery_duration_unit='business_days',timeline_impact=v_timeline_impact,delivery_duration_note=nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),onboarding_requirements=v_requirements,updated_at=timezone('utc',now()) where id=v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;
  return v_id;
end;$function$;
