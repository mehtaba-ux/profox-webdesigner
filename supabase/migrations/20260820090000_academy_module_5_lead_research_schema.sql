-- Sales Academy Module 5 — Lead Research & Qualification
-- Research-first practical certification. No production CRM lead is created by this migration.

CREATE TABLE IF NOT EXISTS public.lead_research_training_config (
  module_id uuid PRIMARY KEY REFERENCES public.training_modules(id) ON DELETE CASCADE,
  min_candidates integer NOT NULL DEFAULT 20 CHECK (min_candidates BETWEEN 5 AND 100),
  min_source_types integer NOT NULL DEFAULT 4 CHECK (min_source_types BETWEEN 1 AND 20),
  qualified_required integer NOT NULL DEFAULT 5 CHECK (qualified_required BETWEEN 1 AND 25),
  rejected_required integer NOT NULL DEFAULT 5 CHECK (rejected_required BETWEEN 1 AND 25),
  source_types jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_types)='array'),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rejection_reasons)='array'),
  profox_fit_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(profox_fit_options)='array'),
  hard_gates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hard_gates)='array'),
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rubric)='array'),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_research_training_state (
  progress_id uuid PRIMARY KEY REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_data)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE TABLE IF NOT EXISTS public.lead_research_review_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id uuid NOT NULL REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.training_assignments(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rubric_scores jsonb NOT NULL CHECK (jsonb_typeof(rubric_scores)='object'),
  total_score integer NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  status text NOT NULL CHECK (status IN ('Passed','Retry Required')),
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_research_state_user_module ON public.lead_research_training_state(user_id,module_id);
CREATE INDEX IF NOT EXISTS idx_lead_research_review_progress_created ON public.lead_research_review_details(progress_id,created_at DESC);

ALTER TABLE public.lead_research_training_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_research_training_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_research_review_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_research_config_admin_all ON public.lead_research_training_config;
CREATE POLICY lead_research_config_admin_all ON public.lead_research_training_config FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS lead_research_config_learner_select ON public.lead_research_training_config;
CREATE POLICY lead_research_config_learner_select ON public.lead_research_training_config FOR SELECT TO authenticated USING (public.can_access_sales_academy_module(module_id));
DROP POLICY IF EXISTS lead_research_state_select ON public.lead_research_training_state;
CREATE POLICY lead_research_state_select ON public.lead_research_training_state FOR SELECT TO authenticated USING (public.is_admin() OR user_id=auth.uid());
DROP POLICY IF EXISTS lead_research_review_admin_all ON public.lead_research_review_details;
CREATE POLICY lead_research_review_admin_all ON public.lead_research_review_details FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS lead_research_review_owner_select ON public.lead_research_review_details;
CREATE POLICY lead_research_review_owner_select ON public.lead_research_review_details FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_training_progress p WHERE p.id=lead_research_review_details.progress_id AND p.user_id=auth.uid()));

UPDATE public.training_modules
SET title='Lead Research & Qualification', description='Find legitimate prospects across Google Maps, Google Search, LinkedIn, social platforms, directories and public business sources; verify evidence, prevent duplicates, qualify objectively, and keep garbage out of the CRM.', module_type='assignment', required=true, active=true, passing_score=80, requires_admin_review=true, updated_at=now()
WHERE slug='lead-research';

INSERT INTO public.lead_research_training_config(module_id,min_candidates,min_source_types,qualified_required,rejected_required,source_types,rejection_reasons,profox_fit_options,hard_gates,rubric,critical_failures,updated_at)
SELECT m.id,20,4,5,5,
'["Google Maps","Google Search","LinkedIn","Facebook","Instagram","Yelp","BBB","Industry Directory","Business Registry","Company Website","Association / Chamber","News / Press","Job Board / Hiring","Conference / Exhibitor Directory","Partner / Vendor Directory","Other Approved Public Source"]'::jsonb,
'["Duplicate","Closed / Inactive","Wrong Niche","Wrong Territory","Unverifiable","No Legitimate Contact Route","No Plausible ProFox Fit","Fake / Spam Listing","Individual / Non-business","Competitor / Excluded","Incorrect Data","Insufficient Evidence","Below Qualification Threshold","Other"]'::jsonb,
'["ProFox Web","ProFox Apps","ProFox Flow","Integration","Care","Discovery","No Fit Yet"]'::jsonb,
'[{"key":"target","label":"Correct target: approved niche / market"},{"key":"geography","label":"Correct geography / approved sales territory"},{"key":"operating","label":"Real operating business verified"},{"key":"duplicate","label":"CRM duplicate check completed and clear"},{"key":"identity","label":"Business identity is distinguishable and verified"},{"key":"contactable","label":"At least one legitimate business contact route exists"},{"key":"profox_fit","label":"There is a plausible ProFox fit or discovery reason"},{"key":"evidence","label":"The researcher can explain the opportunity using evidence"}]'::jsonb,
'[{"key":"business_verification","label":"Business verification accuracy","max":15},{"key":"duplicate_prevention","label":"Duplicate prevention","max":10},{"key":"icp_qualification","label":"ICP / niche qualification","max":15},{"key":"source_evidence","label":"Source quality & evidence","max":10},{"key":"fact_hypothesis_discipline","label":"Fact vs hypothesis discipline","max":15},{"key":"stakeholder_research","label":"Decision-maker / contact research","max":10},{"key":"opportunity_diagnosis","label":"Digital / business opportunity diagnosis","max":10},{"key":"qualification_consistency","label":"Qualification / scoring consistency","max":10},{"key":"crm_record_quality","label":"CRM record quality","max":5}]'::jsonb,
'[{"key":"fabricated_company","label":"Fabricated company"},{"key":"fabricated_person","label":"Fabricated person / stakeholder"},{"key":"fabricated_contact","label":"Fabricated contact information"},{"key":"known_duplicate","label":"Knowingly submitted an existing CRM duplicate as new"},{"key":"closed_business","label":"Submitted a clearly closed / nonexistent company as qualified"},{"key":"invented_problem","label":"Invented business problems or financial losses as facts"},{"key":"fake_evidence","label":"Used fake or falsified evidence / sources"},{"key":"hidden_source","label":"Intentionally hid or misrepresented the source"},{"key":"prohibited_scraping","label":"Used prohibited scraping / automation or bypassed platform controls"},{"key":"unverified_ai","label":"Submitted AI-generated research without independent verification"}]'::jsonb,now()
FROM public.training_modules m WHERE m.slug='lead-research'
ON CONFLICT(module_id) DO UPDATE SET min_candidates=EXCLUDED.min_candidates,min_source_types=EXCLUDED.min_source_types,qualified_required=EXCLUDED.qualified_required,rejected_required=EXCLUDED.rejected_required,source_types=EXCLUDED.source_types,rejection_reasons=EXCLUDED.rejection_reasons,profox_fit_options=EXCLUDED.profox_fit_options,hard_gates=EXCLUDED.hard_gates,rubric=EXCLUDED.rubric,critical_failures=EXCLUDED.critical_failures,updated_at=now();

DELETE FROM public.training_lessons WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='lead-research' LIMIT 1);

INSERT INTO public.training_lessons(module_id,title,content,video_url,sort_order,active,updated_at)
SELECT m.id,v.title,v.content,'',v.ord,true,now() FROM public.training_modules m CROSS JOIN (VALUES
(1,'Lead Research 01 · A Business Listing Is Not a Lead',$md$# Discover broadly. Verify carefully. Qualify objectively. Only then create a CRM lead.
A name found on Google Maps, LinkedIn or a directory is only a **raw business candidate**.
**Raw Business → Verified Business → Qualified Prospect → CRM Lead**
- Raw Business: found somewhere online.
- Verified Business: evidence shows the company is real and correctly identified.
- Qualified Prospect: it fits our target profile and there is a reasonable ProFox opportunity.
- CRM Lead: verified, qualified and evidence-backed enough to deserve sales attention.
> **A source gives you a candidate. Research gives you a lead.**
The CRM is not a dumping ground. Your job is quality, not database volume.$md$),
(2,'Lead Research 02 · Where ProFox Finds Leads',$md$# Use multiple source categories
Local/service discovery: **Google Maps, Google Search, Facebook, Instagram, Yelp, BBB, industry associations, chambers and local directories**.
B2B/professional/technology discovery: **LinkedIn, company websites, Google Search, associations, registries, news, hiring activity and conference/exhibitor directories**.
Additional approved public sources can include partner/vendor and professional directories.
**Source ≠ qualification.**$md$),
(3,'Lead Research 03 · Google Maps Discovery',$md$# Google Maps workflow
Search service + city/state/ZIP/neighbourhood and residential/commercial intent combinations. Capture exact business name, category, geography, phone, website, hours, review presence, services, activity and Maps/Profile URL.
Do not only copy top results. Reviews create hypotheses; one review does not prove an internal problem.
Google Maps terms restrict mass downloading/bulk extraction. Use manual research or an Admin-approved permitted tool/API. Never use random scraping tools.$md$),
(4,'Lead Research 04 · Company Website Research',$md$# The website is a research source
Understand services, customer types, geography, locations, emergency availability, financing, maintenance, booking, portals, memberships, resources and careers where relevant.
Walk the customer journey: can I understand the offer, trust it, determine service area, contact/book, and understand the next step?
Record observations, not invented outcomes. “No visible mobile booking option” is evidence; “they lose $100,000 per year” is not.$md$),
(5,'Lead Research 05 · Google Search Verification',$md$# Search beyond Maps
Search the exact company plus city, owner/founder, LinkedIn, reviews, careers, news or expansion. Corroborate official website, social profiles, leaders, directories, locations, hiring, registrations and memberships. Search is a verification and context tool.$md$),
(6,'Lead Research 06 · LinkedIn Company & Stakeholder Research',$md$# LinkedIn research
Confirm domain, geography, branding and business identity. Find roles relevant to the diagnosed problem. A title does not prove authority; record **Likely stakeholder — requires confirmation** unless verified.
Never use unauthorized LinkedIn scraping, bots, scripts, fake accounts, credential sharing or extensions that bypass limits.$md$),
(7,'Lead Research 07 · Facebook Business Research',$md$# Facebook Pages
Use Pages to corroborate address, phone, website, services, reviews, activity, messaging/booking and locations. No recent post does not automatically mean closed. Verify elsewhere.$md$),
(8,'Lead Research 08 · Instagram Business Research',$md$# Instagram business research
Professional profiles may reveal category, website/link-in-bio, contact buttons, location clues, promotions, services, team mentions and current positioning. Corroborate important facts with another source.$md$),
(9,'Lead Research 09 · Yelp, BBB & Secondary Directories',$md$# Secondary directories
Use Yelp and BBB to corroborate category, geography, phone, website, status and reputation. A rating, review count or directory presence is not automatic qualification.$md$),
(10,'Lead Research 10 · Industry & Association Directories',$md$# Higher-confidence niche discovery
Trade associations, professional organizations, chambers, franchise/accreditation directories and niche marketplaces can be strong discovery sources. Membership supports industry identity, not budget, need or ProFox fit.$md$),
(11,'Lead Research 11 · Business Registries & Identity Verification',$md$# Verify questionable identities
Where names conflict, use the appropriate official registry/authoritative public source. Match name, jurisdiction and identifiers carefully. Do not assume similarly named entities are the same company.$md$),
(12,'Lead Research 12 · The Two-Source Rule',$md$# Find on one source. Confirm on another.
Use at least **two independent public sources** before a normal prospect deserves CRM space. Examples: Maps + official site; LinkedIn + company site; industry directory + Business Profile; Facebook + registry.
For rejected candidates, retain enough evidence to explain the rejection.$md$),
(13,'Lead Research 13 · Fact, Observation, Hypothesis & Unknown',$md$# Protect the CRM from assumptions becoming facts
**FACT:** directly supported by reliable evidence.
**OBSERVATION:** something you directly see.
**HYPOTHESIS:** reasonable possibility that discovery must confirm.
**UNKNOWN:** cannot currently be determined.
> Never upgrade a hypothesis into a fact because it sounds plausible.$md$),
(14,'Lead Research 14 · Minimum Research Record',$md$# What a qualified record needs
Capture identity, geography, niche, website/domain if available, active-business evidence, legitimate contact route, likely stakeholder when identified, original source, verification source, research date, services/customer/business model, facts, observations, hypotheses, unknowns, possible ProFox fit, score, qualification reason and next action.$md$),
(15,'Lead Research 15 · The No-Garbage CRM Gate',$md$# Eight hard gates before CRM
1 Correct target. 2 Correct geography. 3 Real operating business. 4 CRM duplicate check clear. 5 Valid identity. 6 Legitimate contact route. 7 Plausible ProFox fit/discovery reason. 8 Evidence-backed reason.
A failed hard gate cannot be rescued by a high score.$md$),
(16,'Lead Research 16 · What Does NOT Automatically Qualify a Lead',$md$# Avoid lazy shortcuts
No website can be a Web opportunity. A beautiful website does not rule out Apps/Flow/integration. Bad reviews do not automatically create an opportunity. Good reviews do not prove no friction. Large does not automatically qualify; small does not automatically disqualify. A title does not prove authority. A directory listing is not a verified opportunity.$md$),
(17,'Lead Research 17 · Disqualification Rules',$md$# Say no when the record does not belong
Reject/hold candidates that are duplicate, closed, fake/spam, wrong niche/territory, irrelevant, unverifiable, excluded, clearly outside fit, contain incorrect data or lack evidence. AI-generated data is not evidence until independently verified.
> **Twenty real qualified prospects are more valuable than five hundred garbage records.**$md$),
(18,'Lead Research 18 · ProFox Prospect Quality Score',$md$# Score only after hard gates
- ICP / Business Fit — 25
- Evidence of Meaningful Need — 25
- Commercial Opportunity Potential — 15
- Decision-maker / Contactability — 15
- Timing / Activity — 10
- Data / Research Confidence — 10
80–100 high priority; 65–79 potentially qualified; 50–64 Research Pending; below 50 disqualify. Hard-gate failure overrides score.$md$),
(19,'Lead Research 19 · Map Evidence to ProFox Fit',$md$# Diagnose before recommending
Map evidence to **ProFox Web, ProFox Flow, ProFox Apps, Integration, Care, Discovery, or No Fit Yet**. Discovery is valid when a meaningful issue may exist but information is insufficient to prescribe. No Fit Yet is also valid.$md$),
(20,'Lead Research 20 · Platform-Specific Research Order',$md$# Use an order that fits the niche
Home services: Maps → Website → Search → Facebook/Instagram → BBB/Yelp → Industry Directory → LinkedIn → Registry if needed.
Professional/SaaS/larger B2B: LinkedIn → Website → Search → Stakeholder → Industry Directory → Registry.
Clinics/Dental/Hotels/Real Estate: Maps → Website → Reviews → Social → LinkedIn → Industry/Professional Directory → Registry.
Adapt while preserving verification and evidence quality.$md$),
(21,'Lead Research 21 · Research Compliance & Data Discipline',$md$# Research legally and professionally
Use public/business information appropriately. Respect terms and access controls. Never use fake identities, unauthorized scraping/bots, credential sharing, or tools that bypass limits. Do not collect irrelevant sensitive data. Do not guess emails and call them verified. Record sources/date and separate facts from assumptions.
**Automation is allowed only when the method and platform use are Admin-approved and compliant.**$md$),
(22,'Lead Research 22 · The ProFox Research SOP & Certification',$md$# Repeatable SOP
1 targeting instructions; 2 search CRM for duplicates; 3 discover; 4 official website/source; 5 independent verification; 6 niche/geography/status; 7 services/journey; 8 digital experience; 9 stakeholder; 10 activity/timing; 11 facts/observations/hypotheses/unknowns; 12 ProFox fit; 13 hard gates; 14 score; 15 recheck duplicate; 16 qualified records may later become CRM leads; 17 attach evidence; 18 define next action.

## Practical certification
Research the Admin-defined raw-candidate count (default **20**) across at least the Admin-defined source count (default **4**), then submit **5 qualified** and **5 rejected** dossiers. Admin grades the 100-point rubric; current pass is **80%**, and critical integrity failures force Retry Required.$md$)
) AS v(ord,title,content) WHERE m.slug='lead-research';
