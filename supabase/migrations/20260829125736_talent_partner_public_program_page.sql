-- ProFox Talent Partner public program page.
-- Reuses the existing CMS content store, Template Manager, career jobs, Talent Partner settings,
-- reward plans, footer configuration, and media uploader. No duplicate reward/configuration table is created.

create or replace function public.public_get_talent_partner_program()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with settings as (
  select
    coalesce((select enabled from public.talent_partner_program_settings where id = 'default'), false) as enabled,
    coalesce((select attribution_window_days from public.talent_partner_program_settings where id = 'default'), 30) as attribution_window_days,
    coalesce((select payout_hold_days from public.talent_partner_program_settings where id = 'default'), 0) as payout_hold_days,
    coalesce((select minimum_payout from public.talent_partner_program_settings where id = 'default'), 0) as minimum_payout,
    coalesce((select default_currency from public.talent_partner_program_settings where id = 'default'), 'USD') as default_currency,
    coalesce((select require_admin_approval from public.talent_partner_program_settings where id = 'default'), true) as require_admin_approval
), role_rows as (
  select
    j.id as career_job_id,
    j.title as job_title,
    j.slug as job_slug,
    j.display_order,
    p.reward_model,
    p.qualifying_event_count,
    p.event_rewards,
    p.retention_enabled,
    p.retention_months,
    p.retention_reward_kind,
    p.retention_rate_percent,
    p.retention_fixed_amount,
    p.currency,
    (
      s.enabled
      and p.enabled
      and (
        exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(p.event_rewards) = 'array' then p.event_rewards else '[]'::jsonb end
          ) reward
          where
            (lower(coalesce(reward->>'kind', '')) = 'percent' and coalesce((reward->>'ratePercent')::numeric, 0) > 0)
            or
            (lower(coalesce(reward->>'kind', '')) = 'fixed' and coalesce((reward->>'fixedAmount')::numeric, 0) > 0)
        )
        or (
          p.retention_enabled
          and (
            (p.retention_reward_kind = 'percent' and coalesce(p.retention_rate_percent, 0) > 0)
            or (p.retention_reward_kind = 'fixed' and coalesce(p.retention_fixed_amount, 0) > 0)
          )
        )
      )
    ) as reward_published
  from settings s
  join public.talent_partner_reward_plans p on true
  join public.career_jobs j on j.id = p.career_job_id
  where lower(coalesce(j.status, '')) = 'published'
), roles as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'careerJobId', career_job_id,
        'jobTitle', job_title,
        'jobSlug', job_slug,
        'rewardPublished', reward_published,
        'rewardModel', case when reward_published then reward_model else null end,
        'qualifyingEventCount', case when reward_published then qualifying_event_count else null end,
        'eventRewards', case when reward_published then coalesce(event_rewards, '[]'::jsonb) else '[]'::jsonb end,
        'retentionEnabled', case when reward_published then coalesce(retention_enabled, false) else false end,
        'retentionMonths', case when reward_published and retention_enabled then retention_months else null end,
        'retentionRewardKind', case when reward_published and retention_enabled then retention_reward_kind else null end,
        'retentionRatePercent', case when reward_published and retention_enabled and retention_reward_kind = 'percent' then retention_rate_percent else null end,
        'retentionFixedAmount', case when reward_published and retention_enabled and retention_reward_kind = 'fixed' then retention_fixed_amount else null end,
        'currency', case when reward_published then currency else null end
      )
      order by display_order, job_title
    ),
    '[]'::jsonb
  ) as value
  from role_rows
)
select jsonb_build_object(
  'enabled', s.enabled,
  'attributionWindowDays', s.attribution_window_days,
  'payoutHoldDays', s.payout_hold_days,
  'minimumPayout', s.minimum_payout,
  'defaultCurrency', s.default_currency,
  'requireAdminApproval', s.require_admin_approval,
  'roles', r.value
)
from settings s
cross join roles r;
$function$;

revoke all on function public.public_get_talent_partner_program() from public;
grant execute on function public.public_get_talent_partner_program() to anon, authenticated;

-- Seed the new blueprint, page instance, and footer entry through the existing CMS records.
do $seed$
declare
  v_default_data jsonb := $json$
  {
    "hero": {
      "subheading": "PROFOX TALENT PARTNER PROGRAM",
      "title": "Connect Great People.",
      "highlight": "Earn When They Succeed.",
      "description": "Refer capable sales and delivery talent to ProFox through your own tracked links. When a referred professional creates a verified business result that qualifies under the live program rules, your reward is recorded and managed transparently in your Talent Partner dashboard.",
      "image": "https://media.profoxwebdesigner.com/media/brand-visuals/2026-08/website-integrated-capabilities.webp",
      "imageAlt": "ProFox Talent Partner program",
      "ctaText": "Become a Talent Partner",
      "ctaUrl": "/talent-partner",
      "secondaryCtaText": "See How It Works",
      "secondaryCtaUrl": "#how-it-works"
    },
    "quote": "The strongest referral is not the most applications. It is the right person, matched to the right opportunity, who goes on to produce a real result.",
    "quoteHeading": "A referral program built around qualified outcomes, not vanity numbers.",
    "quoteDescription": "ProFox tracks referral ownership, hiring progress, performance qualification, reward approval, and payout status through one connected system so Partners can focus on finding strong people rather than chasing spreadsheets.",
    "howWeHelpEyebrow": "WHY PARTNER WITH PROFOX",
    "howWeHelpTitle": "A referral program built around real outcomes.",
    "howWeHelpDesc": "You bring strong people into the ProFox network. The existing recruitment, performance, reward, and payout systems handle the rest with clear controls and traceability.",
    "howWeHelp": [
      {
        "title": "Your Own Trackable Referral Links",
        "desc": "Share job-specific links tied to your Talent Partner code. Valid visits and applications are attributed through the existing server-controlled referral system.",
        "features": ["Job-specific links", "First-valid-referral ownership", "Source and visit analytics"]
      },
      {
        "title": "Rewards Tied to Verified Results",
        "desc": "Reward eligibility follows the live role plan and verified qualifying events—not a manually invented marketing number.",
        "features": ["Sales or project-based qualification", "Admin-controlled reward plans", "Retention reward support"]
      },
      {
        "title": "Transparent Progress & Earnings",
        "desc": "See partner-safe referral progress, earned rewards, approval status, and payout history in the existing Talent Partner portal.",
        "features": ["Referral progress", "Earnings status", "Payout history"]
      },
      {
        "title": "A Direct Partner Relationship",
        "desc": "The program rewards direct, attributable referrals. There is no downline, recruitment chain, or MLM-style structure.",
        "features": ["No downline", "No duplicate attribution", "Clear ownership rules"]
      }
    ],
    "processEyebrow": "HOW IT WORKS",
    "processTitle": "Refer the right person. We handle the hiring. You earn when the result qualifies.",
    "processDescription": "Each step uses the existing ProFox recruitment and Talent Partner systems, so attribution and rewards stay connected from the first referral through payout.",
    "ourProcess": [
      {
        "step": "01",
        "title": "Join the Talent Partner Program",
        "desc": "Create your Talent Partner account. ProFox reviews and activates the relationship through the existing approval workflow."
      },
      {
        "step": "02",
        "title": "Choose a Live Role & Share Your Link",
        "desc": "Use the job-specific referral links in your dashboard for the people you genuinely believe fit the opportunity."
      },
      {
        "step": "03",
        "title": "ProFox Recruits & Qualifies the Candidate",
        "desc": "The candidate moves through the canonical recruitment, assessment, agreement, training, certification, and activation process for that role."
      },
      {
        "step": "04",
        "title": "Qualified Results Create Rewards",
        "desc": "When the configured qualifying sale, completed project, or retention condition is verified, the existing reward engine creates the eligible reward for review and payout."
      }
    ],
    "pricingEyebrow": "LIVE REWARDS BY ROLE",
    "pricingTitle": "See only rewards that Admin has actually published.",
    "pricingDescription": "Reward amounts and percentages are never hard-coded into this website page. They are displayed only when the corresponding Talent Partner reward plan is enabled with a positive value in the existing Admin configuration.",
    "challengesEyebrow": "QUALITY OVER VOLUME",
    "challengesTitle": "A strong referral is the right person—not just another application.",
    "challengesDescription": "Help us protect candidate quality, attribution integrity, and long-term delivery standards by referring people who genuinely match the opportunity.",
    "challenges": [
      "Refer real people you know, source, or genuinely identify as suitable for an open ProFox role.",
      "Do not refer yourself, create duplicate applications, or attempt to replace another Partner's valid attribution.",
      "Set realistic expectations. Hiring, activation, performance, reward approval, and payout are governed by the live program rules.",
      "Use ProFox-approved role information and referral resources rather than making unsupported promises to candidates.",
      "Protect candidate privacy and never request or retain information you do not need for a legitimate referral introduction."
    ],
    "faqsTitle": "Talent Partner FAQs",
    "faqsDesc": "The live system remains the source of truth for eligibility, reward values, attribution, and payout status. These answers explain how the public program works.",
    "faqs": [
      {
        "question": "When do I provide payout details?",
        "answer": "Payout setup is requested only after you have an approved reward that needs a payout destination. Sensitive payout details are handled through the secure Talent Partner payout setup rather than the website form."
      },
      {
        "question": "Where do the reward amounts on this page come from?",
        "answer": "Directly from the existing Talent Partner reward plan configured by ProFox Admin. If a plan is disabled, incomplete, or has no positive reward configured, this page does not advertise a placeholder amount."
      },
      {
        "question": "How long does referral attribution last?",
        "answer": "The live attribution window is controlled from Talent Partner Admin and is displayed dynamically on this page. The first valid referral is protected according to the existing attribution rules."
      },
      {
        "question": "Do I earn simply because someone applies?",
        "answer": "No. An application can establish valid referral attribution, but rewards are tied to the configured qualifying business outcome, such as verified sales, completed project work, or an eligible retention event."
      },
      {
        "question": "Can another Talent Partner claim the same candidate later?",
        "answer": "The existing system protects valid attribution ownership. Administrative overrides are controlled, require a reason, and are restricted once financial activity exists."
      },
      {
        "question": "Is this an MLM or downline program?",
        "answer": "No. Talent Partners refer candidates directly to ProFox. The program does not create downlines or rewards for recruiting other Talent Partners into a chain."
      }
    ],
    "ctaEyebrow": "BUILD A STRONGER PROFOX NETWORK",
    "ctaTitle": "Know someone who could do exceptional work here?",
    "ctaDescription": "Create your Talent Partner account, choose a live role, share your tracked referral link, and follow qualified outcomes from one secure dashboard.",
    "ctaButtonText": "Join the Talent Partner Program",
    "ctaUrl": "/talent-partner"
  }
  $json$::jsonb;
  v_blueprint jsonb;
  v_page jsonb;
  v_items jsonb;
  v_footer jsonb;
  v_links jsonb;
  v_contact_ordinal integer;
begin
  v_blueprint := jsonb_build_object(
    'id', 'talent-partner-program',
    'name', 'Talent Partner Program Blueprint',
    'description', 'Conversion-focused Talent Partner public page. Marketing content is editable in the existing Template Manager; live reward values stay connected to the canonical Talent Partner Admin configuration.',
    'type', 'service-detail',
    'defaultData', v_default_data
  );

  v_page := jsonb_build_object(
    'id', 'talent-partner-program',
    'slug', 'talent-partner-program',
    'title', 'ProFox Talent Partner Program',
    'status', 'published',
    'template', 'talent-partner-program',
    'createdAt', '2026-08-29',
    'updatedAt', '2026-08-29',
    'heroTitle', v_default_data #>> '{hero,title}',
    'heroHighlight', v_default_data #>> '{hero,highlight}',
    'heroSubtitle', v_default_data #>> '{hero,description}',
    'heroSubheading', v_default_data #>> '{hero,subheading}',
    'coverImage', v_default_data #>> '{hero,image}',
    'bodyContent', 'Public information about the ProFox Talent Partner referral and performance reward program.',
    'seo', jsonb_build_object(
      'metaTitle', 'Talent Partner Referral Program | ProFox',
      'metaDescription', 'Join the ProFox Talent Partner Program, refer qualified sales and delivery professionals, track referrals, and earn rewards when configured performance outcomes qualify.',
      'focusKeyword', 'talent partner referral program',
      'canonicalUrl', 'https://www.profoxwebdesigner.com/talent-partner-program',
      'ogTitle', 'ProFox Talent Partner Program',
      'ogDescription', 'Refer strong professionals to ProFox and track qualified referral outcomes through one transparent Talent Partner system.',
      'ogImage', v_default_data #>> '{hero,image}',
      'schemaType', 'WebPage',
      'noIndex', false
    ),
    'serviceDetailData', v_default_data
  );

  -- Existing Template Manager source.
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
  into v_items
  from public.content c,
       jsonb_array_elements(case when jsonb_typeof(c.data) = 'array' then c.data else '[]'::jsonb end) with ordinality as item(value, ordinality)
  where c.id = 'template_blueprints'
    and value->>'id' <> 'talent-partner-program';

  insert into public.content(id, data, updated_at)
  values ('template_blueprints', coalesce(v_items, '[]'::jsonb) || jsonb_build_array(v_blueprint), now())
  on conflict (id) do update
    set data = excluded.data,
        updated_at = now();

  -- Existing Pages Manager source; the page is a normal CMS page with the blueprint applied.
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
  into v_items
  from public.content c,
       jsonb_array_elements(case when jsonb_typeof(c.data) = 'array' then c.data else '[]'::jsonb end) with ordinality as item(value, ordinality)
  where c.id = 'customPages'
    and value->>'id' <> 'talent-partner-program'
    and value->>'slug' <> 'talent-partner-program';

  insert into public.content(id, data, updated_at)
  values ('customPages', coalesce(v_items, '[]'::jsonb) || jsonb_build_array(v_page), now())
  on conflict (id) do update
    set data = excluded.data,
        updated_at = now();

  -- Existing footer configuration; place Talent Partner Program immediately before Contact Us when possible.
  select data into v_footer from public.content where id = 'footer' for update;
  if v_footer is not null then
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into v_links
    from jsonb_array_elements(case when jsonb_typeof(v_footer->'companyLinks') = 'array' then v_footer->'companyLinks' else '[]'::jsonb end)
         with ordinality as item(value, ordinality)
    where value->>'href' <> '/talent-partner-program';

    select ordinality::integer
    into v_contact_ordinal
    from jsonb_array_elements(v_links) with ordinality as item(value, ordinality)
    where value->>'href' = '/contact-us'
    limit 1;

    if v_contact_ordinal is null then
      v_links := v_links || jsonb_build_array(jsonb_build_object('href', '/talent-partner-program', 'label', 'Talent Partner Program'));
    else
      v_links := jsonb_insert(
        v_links,
        array[(v_contact_ordinal - 1)::text],
        jsonb_build_object('href', '/talent-partner-program', 'label', 'Talent Partner Program'),
        false
      );
    end if;

    update public.content
    set data = jsonb_set(v_footer, '{companyLinks}', v_links, true),
        updated_at = now()
    where id = 'footer';
  end if;
end;
$seed$;
