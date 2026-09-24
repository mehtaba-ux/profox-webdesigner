-- Module 4 / Niche 1 — Roofing Contractor Industry Expert Training
-- Approved founder-reviewed training. Designed as a reusable vertical-certification framework.

ALTER TABLE public.training_lessons ADD COLUMN IF NOT EXISTS niche_slug text NOT NULL DEFAULT '';
ALTER TABLE public.training_assessment_questions ADD COLUMN IF NOT EXISTS niche_slug text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.niche_training_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  niche_name text NOT NULL,
  slug text NOT NULL,
  summary text NOT NULL DEFAULT '',
  passing_score integer NOT NULL DEFAULT 85 CHECK (passing_score BETWEEN 1 AND 100),
  pre_survey_questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pre_survey_questions)='array'),
  diagnostic_questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diagnostic_questions)='array'),
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_id, slug)
);

CREATE TABLE IF NOT EXISTS public.user_niche_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.niche_training_tracks(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','Retry Required','Completed')),
  lesson_index integer NOT NULL DEFAULT 0 CHECK (lesson_index >= 0),
  pre_survey_answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pre_survey_answers)='array'),
  diagnostic_answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diagnostic_answers)='array'),
  score integer CHECK (score BETWEEN 0 AND 100),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, track_id)
);

CREATE TABLE IF NOT EXISTS public.niche_training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.niche_training_tracks(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  critical_misses integer NOT NULL DEFAULT 0,
  feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_niche_tracks_module_sort ON public.niche_training_tracks(module_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_niche_progress_user ON public.user_niche_training_progress(user_id, track_id);
CREATE INDEX IF NOT EXISTS idx_niche_attempts_user_track ON public.niche_training_attempts(user_id, track_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_lessons_niche ON public.training_lessons(module_id, niche_slug, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_questions_niche ON public.training_assessment_questions(module_id, niche_slug, sort_order);

ALTER TABLE public.niche_training_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_niche_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niche_training_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS niche_tracks_admin_all ON public.niche_training_tracks;
CREATE POLICY niche_tracks_admin_all ON public.niche_training_tracks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS niche_progress_admin_all ON public.user_niche_training_progress;
CREATE POLICY niche_progress_admin_all ON public.user_niche_training_progress FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS niche_attempts_admin_all ON public.niche_training_attempts;
CREATE POLICY niche_attempts_admin_all ON public.niche_training_attempts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

UPDATE public.training_modules
SET description='Deep vertical business education. Learn one industry at a time so you can understand the customer journey, diagnose root problems, speak the buyer language, and recommend the right ProFox solution with trust.',
    module_type='lesson', required=true, active=true, updated_at=now()
WHERE slug='niche-training';

-- Remove the old placeholder lesson only; keep historical data by deactivating rather than deleting.
UPDATE public.training_lessons
SET active=false, updated_at=now()
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1)
  AND title='test' AND content='tes';

INSERT INTO public.niche_training_tracks(module_id,niche_name,slug,summary,passing_score,pre_survey_questions,diagnostic_questions,sort_order,required,active)
SELECT m.id,'Roofing Contractors','roofing',
'Industry-expert training covering residential and commercial roofing, customer psychology, lead generation, inspections and estimating, sales-to-production operations, reviews, technology, compliance boundaries and ProFox solution diagnosis.',85,
'[
"What is the difference between roof repair and roof replacement?",
"What is the difference between residential and commercial roofing?",
"What is a roof inspection?",
"What normally happens after a homeowner requests an estimate?",
"What is the difference between a retail roofing job and an insurance-related roofing job?",
"What is roof decking?",
"What is flashing?",
"What is underlayment?",
"What is a roof valley?",
"What is a ridge?",
"What is a low-slope roof?",
"Name three common roofing materials or systems.",
"Why do homeowners often compare several roofing companies?",
"What makes a homeowner trust one roofer more than another?",
"What can happen when a roofing company responds slowly to a new lead?",
"Why are reviews especially important for roofers?",
"What happens between a signed roofing proposal and installation?",
"Why are job-site photos important?",
"Why might a roofing company use CRM software?",
"What information does an estimator need before creating a reliable proposal?",
"What business problems could automation solve for a roofing company?",
"When might a roofing company need a custom application rather than another website?",
"What problems can occur when the sales team and production team use disconnected systems?",
"Why should a ProFox seller never promise an insurance outcome?",
"If a roofing owner says, We need more leads, what would you investigate before recommending marketing?"
]'::jsonb,
'[
"Map this roofing company customer journey from first lead through inspection, proposal, production, payment and review. Identify at least three places where revenue or trust could leak.",
"The owner says, We need more leads. Write the questions you would ask before deciding whether the real problem is acquisition, response speed, qualification, inspection booking, proposal follow-up or close rate.",
"The company says jobs become chaotic after a signed proposal. Diagnose the sales-to-production handoff and list the information, people and systems you would investigate.",
"Recommend a ProFox solution architecture for the business. Explain what belongs in Web, Apps, Flow, Care, integration or discovery—and what you would deliberately not sell yet.",
"List the technical, insurance, safety, regulatory or commercial statements you would refuse to guess about, and explain how you would escalate them while preserving customer confidence."
]'::jsonb,
1,true,true
FROM public.training_modules m WHERE m.slug='niche-training'
ON CONFLICT (module_id,slug) DO UPDATE SET niche_name=EXCLUDED.niche_name,summary=EXCLUDED.summary,passing_score=EXCLUDED.passing_score,pre_survey_questions=EXCLUDED.pre_survey_questions,diagnostic_questions=EXCLUDED.diagnostic_questions,sort_order=EXCLUDED.sort_order,required=true,active=true,updated_at=now();

DELETE FROM public.training_lessons
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1) AND niche_slug='roofing';

INSERT INTO public.training_lessons(module_id,niche_slug,title,content,video_url,sort_order,active,updated_at)
SELECT m.id,'roofing',v.title,v.content,'',1000+v.ord,true,now()
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'Roofing 01 · How the Business Actually Works',$md$# Roofing is more than installation

A roofing company is simultaneously a **construction business, sales business and service business**.

A typical operation can include marketing, incoming calls, lead qualification, inspections, estimating, proposals, financing, insurance documentation where relevant, material ordering, crews or subcontractors, installation, customer communication, invoicing, collections, warranties, reviews and maintenance.

Your first mental shift is simple:

> **Do not ask only whether the roofer needs a website. Ask where the full customer and operating journey loses opportunity, time, money or trust.**

A strong seller understands the flow before recommending technology.
$md$),
(2,'Roofing 02 · Residential Roofing',$md$# Residential roofing

Residential roofers primarily serve homeowners. Work can include inspection, leak repair, replacement, storm damage, new construction, shingles, metal, tile or slate depending on market, ventilation, skylights and related exterior work.

The homeowner does not buy a roof frequently. That makes the decision **high-consideration, trust-sensitive, reputation-sensitive and often price-sensitive**.

Homeowners may compare several contractors, reviews, credentials, warranties, written estimates, previous work and communication quality.

Seller question: **What must this company prove before a homeowner feels safe inviting them onto the property and trusting them with a high-value project?**
$md$),
(3,'Roofing 03 · Commercial Roofing',$md$# Commercial, industrial and institutional roofing

Commercial buyers may include building owners, property managers, facilities teams, developers, general contractors, schools, public bodies or asset managers.

Their decision can involve roof condition, disruption, budget, maintenance history, warranty, safety, procurement and long-term asset planning.

The psychology differs:

- Residential: **Can I trust you with my home?**
- Commercial: **Can you manage this building asset reliably without creating unnecessary operational risk?**

Commercial sales can be longer, more technical and involve multiple stakeholders. Do not use a residential script unchanged.
$md$),
(4,'Roofing 04 · Revenue Models & Job Types',$md$# How roofing companies generate revenue

Recognize several common models:

**Retail residential:** lead → inspection → estimate → proposal → decision → payment/financing → production → completion → final payment.

**Storm/restoration:** demand can rise after hail, wind or major weather. The workflow may involve the homeowner and insurer. ProFox sellers must not interpret policy coverage, guarantee claim outcomes or act as adjusters.

**Commercial projects:** condition assessment → proposal/budget → procurement approval → scheduling → production → ongoing maintenance opportunity.

**New construction:** the roofer may subcontract to builders or general contractors.

**Service & maintenance:** repairs and preventive maintenance can create recurring relationships, especially commercially.

Ask which model produces the **best-fit and most profitable work**, not merely the largest lead volume.
$md$),
(5,'Roofing 05 · Roofing Language You Must Recognize',$md$# Basic roofing vocabulary

You are not being trained to install roofs. You are being trained not to become lost in the conversation.

Recognize terms such as:

- **Deck/decking:** structural surface under the roofing system.
- **Underlayment:** layer between deck and roof covering.
- **Flashing:** material around transitions or penetrations to help control water intrusion.
- **Ridge:** upper point where slopes meet.
- **Valley:** internal intersection where slopes meet and water drains.
- **Eaves:** lower roof edge.
- **Fascia:** board/finish along the roof edge.
- **Soffit:** underside beneath an overhang.
- **Ventilation:** roof/attic airflow components.
- **Penetrations:** pipes, chimneys, skylights, vents or equipment passing through the roof.
- **Pitch/slope:** roof angle.
- **Low-slope roofing:** common on many commercial buildings.
- **Membrane:** waterproof layer used in many low-slope systems.

Recognize the language; **do not give technical installation advice**.
$md$),
(6,'Roofing 06 · The Residential Customer Journey',$md$# Think like the homeowner

A common journey is:

Problem noticed → search/referral/advertising → website and profile review → compare reputation → call/form → response → inspection scheduled → inspection/photos/measurements → options/proposal → comparison/questions → contract → financing/payment/claim process where applicable → scheduling → materials/crew → installation → updates → completion → final payment → warranty → review/referral.

Every transition can either build trust or lose the job.

As a ProFox seller, map the journey before prescribing. A technically beautiful website cannot rescue a business that ignores leads for two days.
$md$),
(7,'Roofing 07 · What the Homeowner Is Really Buying',$md$# Roofing is a trust sale

A homeowner is not merely buying shingles or membrane. They are buying confidence that their home will remain protected and that the contractor will behave professionally.

Trust signals can include real company identity, clear service area, legitimate credentials where applicable, team information, authentic reviews, completed work, before/after evidence, accurate warranty information, process clarity, professional estimates and responsive communication.

> **For a roofer, trust is often a conversion feature.**

A modern-looking website with weak proof can still underperform.
$md$),
(8,'Roofing 08 · How Roofing Leads Arrive',$md$# Lead sources and lead quality

Roofing opportunities can come from organic search, Google Maps/Business Profile, Local Services Ads where supported, paid search, referrals, previous customers, neighbourhood visibility, door-to-door activity, social media, builders, property managers, lead marketplaces, storm campaigns or direct outreach.

If the owner says **“We need more leads,”** do not prescribe ads immediately.

Investigate:

- How many leads already arrive?
- Where do they come from?
- How quickly are they answered?
- How many become inspections?
- How many inspections become proposals?
- How many proposals become jobs?

The business may have a **conversion or follow-up problem**, not a traffic problem.
$md$),
(9,'Roofing 09 · Inspection & Estimate Workflow',$md$# The inspection and estimate stage

After initial contact, a roofer may need to capture property details, schedule an inspection, document roof condition, take photos and measurements, determine work, create options, produce an estimate/proposal and follow up.

When an owner says **“Our estimates take too long,”** possible root causes include measurements, scattered pricing, duplicated data entry, proposal creation, missing photos, approval delays or disconnected systems.

> **Symptom is not root cause.**

Map every handoff before suggesting software.
$md$),
(10,'Roofing 10 · After the Sale: Production',$md$# Production begins after the signature

A signed proposal can still require permits, material ordering, supplier coordination, delivery, crew/subcontractor scheduling, weather planning, customer notifications, documentation, change orders, quality checks, invoicing and payment.

If the owner says **“Sales is fine, but everything becomes chaotic after we sell the job,”** treat that as an operations/system signal.

Investigate how sales information reaches production, who owns each next action, what data is re-entered, and where staff lose visibility.
$md$),
(11,'Roofing 11 · Communication as a Business System',$md$# Customers want to know what is happening

Repeated customer questions often reveal process friction:

- When is the inspection?
- Did you receive my documents?
- When do materials arrive?
- When will work begin?
- What happens if weather changes?
- Is the job complete?
- What do I owe?
- Where is my warranty?

ProFox Flow is not about “sending more email.” It is about **moving the customer through the journey without requiring staff to remember every communication manually**.

Automation should support the process, not replace human judgment where it matters.
$md$),
(12,'Roofing 12 · Reviews, Referrals & Retention',$md$# The job continues after installation

A healthy post-job journey can be:

Completion → payment → warranty/handover → review request → referral → future maintenance.

If the owner says customers are happy but review count is low, investigate whether anyone owns the request, whether there is a completion trigger, and whether follow-up is systematic.

A reputation system is not fake-review generation. It should make it easier for real customers to share genuine experience.
$md$),
(13,'Roofing 13 · Roofing Business Pain Map',$md$# Common problem categories

**Acquisition:** poor local visibility, weak reputation, poor website, unclear service areas, low-quality paid leads, no source tracking.

**Conversion:** unanswered calls/forms, slow response, weak trust, poor mobile experience, no clear CTA, delayed inspections, weak proposal follow-up.

**Sales:** poor qualification, inconsistent inspection process, no pipeline discipline, scattered notes, weak estimate follow-up, limited close-rate visibility.

**Production:** lost handoffs, material confusion, scattered photos, scheduling problems, unmanaged change orders, repeated status questions.

**Finance:** unclear deposits, late invoices, manual collection, disconnected financing/payment status.

**Reputation:** inconsistent review requests, complaints discovered late, weak referral journey.

Classify the problem before recommending a product.
$md$),
(14,'Roofing 14 · Symptom vs Root Cause',$md$# Diagnose before selling

Customer: **“We need more leads.”**

Possible roots: weak demand, poor lead quality, slow response, weak booking, poor close rate, or a business already at operational capacity.

Customer: **“Our website is not working.”**

Possible roots: low traffic, wrong traffic, weak trust, bad mobile experience, unclear positioning, poor local content, or slow response after conversion.

Customer: **“We need a CRM.”**

Possible roots: no standardized process, no ownership, disconnected systems, duplicate data entry, poor adoption or lack of automation.

> **Never sell the customer's proposed solution until you understand the customer's actual problem.**
$md$),
(15,'Roofing 15 · Digital Maturity Model',$md$# Roofing digital maturity

**Level 1 — Survival:** phone, paper, spreadsheets, personal texts; owner remembers everything.

**Level 2 — Fragmented Digital:** modern website and several apps, but duplicated information and weak automation.

**Level 3 — Structured:** CRM, digital estimating, project workflow, online payments, reviews, source tracking.

**Level 4 — Connected:** website → CRM → inspection → estimate → production → payment → review, with major transitions connected.

**Level 5 — Optimized:** management can measure bottlenecks, journeys, attribution and business performance.

Do not force every business to Level 5. Ask:

> **What is the next highest-value improvement?**
$md$),
(16,'Roofing 16 · Technology Ecosystem',$md$# Understand the categories, not just brands

Roofers may use tools for CRM/job management, roof measurement, field photo documentation, estimating/proposals, accounting, insurance-related estimating, financing, supplier/material ordering and marketing attribution.

The seller should ask what the existing stack already does well and where staff still work outside it.

> **Integration can be better than replacement.**

Do not casually tell a company to replace a specialized roofing platform because ProFox can build custom software. First prove the business case.
$md$),
(17,'Roofing 17 · Business Diagnostic: Business & Leads',$md$# Diagnostic questions — business model and acquisition

Use conversationally, not as an interrogation.

- Residential, commercial or both?
- Which services generate most work?
- Which geography do you serve?
- Retail, insurance-related, maintenance, new construction or mixed?
- Which project type do you want more of?
- Where do leads come from?
- Which channel produces the best customers?
- Can you connect lead source to revenue?
- How many opportunities arrive in a typical month?
- Are you trying to increase volume or improve quality?
- Who answers new enquiries?
- What happens when nobody answers?
- How quickly are web leads contacted?
- How do you qualify before inspection?
$md$),
(18,'Roofing 18 · Business Diagnostic: Inspection & Sales',$md$# Diagnostic questions — inspection and sales

- How are inspections scheduled?
- How are measurements handled?
- Where are inspection photos stored?
- How long does proposal creation take?
- How are unaccepted estimates followed up?
- Can you see every opportunity and its stage?
- Do you know inspection-to-sale conversion?
- Do salespeople follow a consistent process?
- How do you know which estimate needs follow-up?
- Where do sales notes live?

Listen for duplicated entry, missing ownership and long waiting periods.
$md$),
(19,'Roofing 19 · Business Diagnostic: Production & CX',$md$# Diagnostic questions — production and customer experience

- What happens internally after signature?
- How does sales hand work to production?
- How are crews/subcontractors scheduled?
- How are materials ordered?
- How are scope changes communicated?
- How are appointment reminders sent?
- How does the customer know job status?
- Which questions does the office answer repeatedly?
- How are final documents/warranties delivered?
- How are reviews requested?

The goal is to find friction between teams and customers.
$md$),
(20,'Roofing 20 · Business Diagnostic: Systems & Management',$md$# Diagnostic questions — systems and management

- Which platforms are used today?
- Which systems already integrate?
- Where does staff enter information twice?
- Which spreadsheets remain essential?
- What does the team complain about most?
- Which numbers do you review weekly?
- Can you see lead → inspection → estimate → sale → revenue?
- Which stage loses the most opportunity?
- Which repetitive administrative task would you remove tomorrow?
- What growth target is the company trying to reach?

A strong recommendation connects operational evidence to the business goal.
$md$),
(21,'Roofing 21 · What to Listen For',$md$# Listen for hidden opportunity signals

**“We manually…”** → possible automation/system opportunity.

**“We always forget…”** → workflow/ownership problem.

**“Customers keep calling asking…”** → communication visibility problem.

**“It takes our estimator forever…”** → estimating/data/process problem.

**“Our leads aren't good.”** → qualification/source-tracking question.

**“We never know where the job is.”** → project visibility problem.

**“Sales says production lost the information.”** → handoff/system problem.

**“Everything is in everyone's phones.”** → centralization problem.

**“We already have a CRM, but…”** → adoption/integration/process opportunity.

**“We spend on leads but don't know what sells.”** → attribution/reporting opportunity.
$md$),
(22,'Roofing 22 · ProFox Solution Map',$md$# Match problems to the right capability

Weak digital presence → **ProFox Web**.

Traffic but poor conversion → **Web + CRO + measurement**.

Leads arrive but response/follow-up is inconsistent → **ProFox Flow**.

Inspection booking is manual → **Web + approved booking/integration + Flow**, if the workflow supports it.

Disconnected systems → **Apps / Integration** where technically feasible.

Custom workflow not handled by existing tools → **ProFox Apps**, often after Discovery.

Customers repeatedly ask job status → **Apps/portal/Flow** only if the business case justifies it.

Reviews requested inconsistently → **Flow**.

Management lacks visibility → **Integration/App dashboard**.

Do not sell all of these at once. Diagnose the highest-value need.
$md$),
(23,'Roofing 23 · Trust-First Website Audit',$md$# Audit through the homeowner's eyes

Can I immediately understand:

- Who are you?
- Where do you work?
- Which roofing services do you provide?
- Can I trust you?
- Can I see genuine work?
- Can I verify reputation?
- What happens after I contact you?
- How do I request an inspection or estimate?
- Is the mobile experience easy?

If these are difficult to answer, the website may have a conversion problem even when the visual design is modern.
$md$),
(24,'Roofing 24 · Local Search & Lead Handling',$md$# Local visibility is connected to lead handling

For relevant markets, review Google Business Profile, reviews and recency, photos, services, service area, website consistency, local landing pages, calls-to-action, tracking and Local Services Ads where supported.

The key seller insight is:

> **Generating a lead is only half the system. Handling the lead matters too.**

A roofing company can spend heavily on acquisition and still lose revenue through missed calls, slow web follow-up or weak inspection booking.
$md$),
(25,'Roofing 25 · Storm & Insurance Boundaries',$md$# Hard boundary: do not become an insurance adviser

ProFox sellers must never promise claim approval, interpret policies as if qualified, guarantee insurer payment, encourage falsification, tell homeowners damage is definitely covered, promote unlawful deductible tactics, or pretend to be an adjuster.

Correct posture:

> **We can design the lawful customer journey and systems around the contractor's approved process, but coverage decisions and insurance advice belong to appropriately authorized parties.**

If uncertain, capture the requirement and escalate.
$md$),
(26,'Roofing 26 · Safety & Regional Awareness',$md$# Safety and market context

Roofing is physically hazardous work. A ProFox seller does not design or override the contractor's safety policy. If an app/workflow requirement could affect field safety, escalate and build around the customer's authorized procedures.

Regulation, licensing, insurance practices and advertising rules differ by country, state/province and locality. Never apply a U.S. assumption blindly to Canada, the UK, Australia or another market.

Always ask which market and regulatory environment the business operates in.
$md$),
(27,'Roofing 27 · Roofing Owner Psychology',$md$# Speak in business outcomes

Owners usually care more about qualified jobs, conversion, estimate speed, follow-up, staff accountability, customer communication, fewer manual steps, operational visibility and reputation than about React, APIs or database architecture.

A stronger opening is:

> **“I'd first like to understand how a lead moves from finding you to becoming a completed roofing job, because that's usually where we find the biggest opportunities.”**

Technology enters after the business problem is understood.
$md$),
(28,'Roofing 28 · Eight Practice Cases',$md$# Practice cases

1. **We need more leads:** many enquiries already arrive but half are contacted slowly → investigate response workflow before ads.
2. **Owner runs everything:** 20 employees but owner personally schedules jobs and answers status questions → investigate centralization, Apps and Flow.
3. **Great company, poor website:** strong reputation but weak mobile site and CTA → likely Web opportunity.
4. **Many open estimates:** weak proposal follow-up → CRM/Flow opportunity.
5. **Commercial roofer:** good installation revenue but no maintenance lifecycle → explore recurring relationship system.
6. **Storm restoration:** lead spikes overwhelm office → intake, qualification, routing and communication; keep insurance compliance boundaries.
7. **We need custom software:** capable roofing CRM exists but one report is poor → investigate reporting/integration before a custom rebuild.
8. **Three branches:** leadership cannot connect branch/source/seller to profitable jobs → integration/reporting opportunity.
$md$),
(29,'Roofing 29 · Expert Standard & Trust Formula',$md$# Roofing seller trust formula

**Know the workflow.** Demonstrate industry familiarity.

**Use their language.** Avoid generic agency jargon.

**Ask operational questions.** Show business understanding.

**Do not pretend.** Confirm technical, insurance, regulatory or safety matters when required.

**Diagnose before selling.** Recommendation follows evidence.

**Recommend less when less is enough.** Trust grows when you can say, “You do not need that yet.”

**Connect every recommendation to a real business problem.**

Before certification you should be able to explain residential vs commercial roofing, project types, customer psychology, lead sources, inspection/estimate workflow, production handoff, communication, reviews, common software categories, operational bottlenecks, symptom vs root cause, Web/Apps/Flow fit, integration vs replacement, discovery and escalation boundaries.
$md$)
) AS v(ord,title,content)
WHERE m.slug='niche-training';

DELETE FROM public.training_assessment_questions
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1) AND niche_slug='roofing';

-- 40-question Roofing certification. 20 industry knowledge + 15 diagnosis/solution + 5 critical trust/compliance.
INSERT INTO public.training_assessment_questions(module_id,niche_slug,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical)
SELECT m.id,'roofing',v.prompt,v.options::jsonb,v.correct_index,v.explanation,2000+v.ord,true,v.section,'niche:roofing:'||v.case_key,v.critical
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'Which description best captures a roofing contractor business?','["Only a construction crew","A connected sales, service and construction operation with lead, estimate, production and customer workflows","A marketing company","A retail store"]',1,'Roofing businesses combine acquisition, sales, field work, production, finance and customer communication.','knowledge','industry',false),
(2,'Why is residential roofing usually a trust-sensitive purchase?','["Homeowners buy roofs weekly","It is infrequent, high-consideration work affecting the home and can involve meaningful cost/risk","Roofers never compete","Only color matters"]',1,'Homeowners often compare contractors because the purchase is infrequent and consequential.','knowledge','industry',false),
(3,'Which buyer is more typical in commercial roofing?','["Only homeowners","Facilities or property management, building owners, developers or procurement stakeholders","Only social-media creators","Only insurance agents"]',1,'Commercial work often involves professional asset stakeholders.','knowledge','industry',false),
(4,'What is flashing?','["A marketing banner","Material used around roof transitions or penetrations to help control water intrusion","A roofing CRM","A financing product"]',1,'Flashing is a roofing component around transitions/penetrations.','knowledge','terms',false),
(5,'What is a roof valley?','["The highest roof point","An internal intersection where roof slopes meet and water drains","A type of invoice","A customer portal"]',1,'A valley is the inward intersection between slopes.','knowledge','terms',false),
(6,'What is low-slope roofing commonly associated with?','["Many commercial buildings","Only garden sheds","Only steep residential roofs","Social advertising"]',0,'Low-slope systems are common in commercial roofing.','knowledge','terms',false),
(7,'Which sequence best represents a common residential retail journey?','["Lead → inspection → estimate/proposal → decision → production → completion/payment","Production → random lead → quote","Payment → advertising → inspection","Review → materials → first contact"]',0,'The normal journey starts with opportunity and discovery before production.','knowledge','journey',false),
(8,'After a proposal is signed, which work may still remain?','["Nothing","Materials, permits where applicable, scheduling, crews, communication, changes, quality, invoicing and payment","Only a review request","Only logo design"]',1,'Production requires many coordinated steps after the sale.','knowledge','journey',false),
(9,'Why are job-site photos operationally useful?','["Only for decoration","They can document inspections, progress, completion and support communication/evidence","They replace all contracts","They guarantee claims"]',1,'Photos can support documentation and handoffs; they do not guarantee external outcomes.','knowledge','operations',false),
(10,'What does a roofing CRM/job-management system typically help organize?','["Only social posts","Leads, inspections, estimates, jobs, communication and related workflow","Roof installation technique","Weather itself"]',1,'The value is centralizing workflow and visibility.','knowledge','technology',false),
(11,'What is the strongest first response to “we need more leads”?','["Immediately sell ads","Investigate current lead volume, sources, response time, inspections, proposals and close rate","Build a custom app immediately","Promise doubled revenue"]',1,'The stated symptom can hide response, qualification or conversion issues.','knowledge','diagnosis',false),
(12,'What does “symptom ≠ root cause” mean in roofing sales discovery?','["Accept the requested solution without questions","A complaint such as slow estimates may originate in measurements, data, process or handoff issues","Never trust customers","Only technical staff can ask questions"]',1,'Sellers should diagnose the mechanism behind the symptom.','knowledge','diagnosis',false),
(13,'Which signal most strongly suggests a sales-to-production handoff problem?','["The new logo is blue","Production regularly says key sold-job information is missing","The owner likes referrals","The roof has a ridge"]',1,'Missing information after the sale is a classic handoff issue.','knowledge','operations',false),
(14,'Which is the best reason to explore ProFox Flow for a roofer?','["The owner likes automation as a buzzword","Leads and customer updates depend on staff remembering repetitive follow-up","The company has a roof","Every roofer must buy Flow"]',1,'Flow should solve repetitive journey/process movement.','knowledge','profox',false),
(15,'When is ProFox Apps more likely to fit?','["The business needs role-based workflows, dashboards or custom operational capability not handled well by existing tools","The owner only needs a five-page brochure site","They want a new logo","They want one review"]',0,'Apps fits ongoing operational capability, not simple presence.','knowledge','profox',false),
(16,'Why can integration be better than replacement?','["Existing specialized software may already do important work and only specific gaps need connecting","Replacement is always illegal","Integrations never fail","Custom software is never useful"]',0,'Preserve working specialist systems when integration can solve the actual gap.','knowledge','technology',false),
(17,'What is the best website-audit perspective for a residential roofer?','["Only animation quality","Can a homeowner quickly understand who the company is, where it works, what it does, why to trust it and how to request service?","Only source code size","Only desktop layout"]',1,'Trust, clarity and action matter strongly in this category.','knowledge','web',false),
(18,'Why do reviews matter to roofing companies?','["They are decorative only","They influence customer trust and can affect visibility on some local service platforms","They replace workmanship","They guarantee ranking"]',1,'Reviews provide trust evidence and can influence platform visibility.','knowledge','reputation',false),
(19,'What is the best use of a digital-maturity model?','["Force every company to buy the maximum solution","Identify the next highest-value improvement based on the company current state","Judge owners personally","Replace discovery"]',1,'Maturity is a diagnostic guide, not an upsell ladder.','knowledge','maturity',false),
(20,'Which question best reveals management visibility?','["What is your favorite framework?","Can you see lead → inspection → estimate → sale → revenue and identify where opportunities are lost?","What color is the office?","Do you own a drone?"]',1,'The question connects pipeline stages to outcomes.','knowledge','management',false),
(21,'A roofer receives 120 monthly leads but many web forms wait until the next day. What should you investigate first?','["More paid traffic","Response ownership, routing and follow-up workflow","A complete custom ERP","A brand name change"]',1,'More traffic can worsen a lead-handling leak.','scenario','lead-response',false),
(22,'A company has strong close rates but jobs become chaotic after signature. What is the best diagnostic direction?','["Increase ad spend","Map sales-to-production data, owners, scheduling, materials, communication and system handoffs","Redesign the logo first","Ask for more reviews only"]',1,'The issue begins after sale and points to production/handoff.','scenario','handoff',false),
(23,'A roofer already uses a capable roofing CRM but wants one custom management report. What is the best first move?','["Replace the CRM","Investigate available data, APIs/integrations and reporting options before proposing a rebuild","Promise a new platform immediately","Ignore the request"]',1,'Solve the gap with the least disruptive appropriate architecture.','scenario','integration',false),
(24,'A commercial roofer wants more recurring revenue after installations. What should you explore?','["Only residential ads","Maintenance/service lifecycle, account follow-up and supporting systems","A basic logo refresh","A consumer coupon only"]',1,'Commercial maintenance can create recurring customer relationships.','scenario','commercial',false),
(25,'A roofing owner says customers call constantly asking for job status. What is the likely category?','["Only lead acquisition","Customer communication/visibility and possibly workflow integration","Roofing terminology","Brand color"]',1,'Repeated status calls reveal communication and process visibility friction.','scenario','cx',false),
(26,'A small roofer has a poor mobile site, excellent operations and strong customer reviews. What is the most likely first ProFox direction?','["Custom operational app","ProFox Web focused on trust, mobile journey and conversion","Replace accounting","Automate every process"]',1,'The primary diagnosed gap is customer-facing experience.','scenario','web',false),
(27,'A team manually copies every website lead into CRM and sends the same confirmation email. What should you explore?','["Flow/integration","A new roof membrane","Only SEO","No change"]',0,'Duplicate data entry and repetitive communication are strong integration/Flow signals.','scenario','flow',false),
(28,'A three-branch roofer cannot tell which branch or lead source produces profitable jobs. What is the likely opportunity?','["A landing page only","Data integration and management reporting after validating the source systems","More door-to-door sales only","A new slogan"]',1,'The root problem is management attribution/visibility.','scenario','analytics',false),
(29,'A storm restoration company receives a surge of enquiries after severe weather and the office is overwhelmed. What can ProFox reasonably explore?','["Intake, qualification, routing and lawful customer communication automation","Guaranteeing insurance approval","Changing policy coverage","Acting as a public adjuster"]',0,'Process automation may help; insurance decisions remain outside ProFox authority.','scenario','storm',false),
(30,'An owner says “our estimates take forever.” Which response is strongest?','["Sell a new website","Map measurements, pricing data, photos, approvals, proposal creation and duplicated entry before recommending a fix","Promise same-day estimates","Blame the estimator"]',1,'Estimate speed is a symptom requiring process diagnosis.','scenario','estimating',false),
(31,'A roofer has very few Google reviews despite happy customers. What should you investigate?','["Whether review requests have an owner, completion trigger and appropriate follow-up","Buying fake reviews","Deleting unhappy customers","Guaranteed ranking"]',0,'The process may be missing, but review generation must stay genuine.','scenario','reviews',false),
(32,'A prospect asks for a custom customer portal because competitors have one. What should you do?','["Build it immediately","Identify the actual customer problem, usage need, data sources and expected value before recommending Apps","Say portals are always required","Bundle it without scope"]',1,'Competitor imitation is not enough business justification.','scenario','portal',false),
(33,'A roofing company is at digital-maturity Level 1. What is the right sales approach?','["Sell the full Level 5 system immediately","Prioritize the next highest-value foundation based on bottlenecks and readiness","Refuse them","Automate unsafe field work"]',1,'Maturity informs sequencing, not maximal scope.','scenario','maturity',false),
(34,'A prospect says “we already have a CRM, but everyone still uses spreadsheets.” What should you investigate?','["Adoption, missing workflows, integration gaps and why spreadsheets remain essential","Buy another CRM immediately","Assume staff are lazy","Only redesign the website"]',0,'The root issue can be process fit, adoption or gaps rather than absence of software.','scenario','crm',false),
(35,'A roofer asks whether ProFox can connect a specialized measurement platform you have never integrated before. What is the correct response?','["Promise it","Capture the exact platform/workflow and confirm API/technical feasibility before commitment","Say every integration is included","Invent a timeline"]',1,'Unknown integration feasibility requires validation.','scenario','integration',true),
(36,'A homeowner-facing roofing client wants marketing copy that guarantees every storm-damage claim will be paid. What do you do?','["Approve it","Refuse the guarantee and explain that coverage/claim decisions belong to authorized insurance parties; escalate compliance questions","Use smaller text","Guarantee only on premium packages"]',1,'ProFox must not create unsupported insurance guarantees.','scenario','compliance',true),
(37,'A roofer wants an app workflow that you suspect may conflict with field safety procedures. What should a seller do?','["Design the safety policy personally","Capture the requirement and escalate; build only around the contractor authorized safety process","Ignore safety","Promise that software makes roof work safe"]',1,'Sellers do not replace qualified safety decision-makers.','scenario','safety',true),
(38,'A roofer in another country asks whether a specific license is legally required. What is the right answer?','["Guess based on U.S. rules","Confirm the market and escalate to appropriate legal/regulatory sources rather than inventing an answer","Say licenses never matter","Promise ProFox certification"]',1,'Licensing is jurisdiction-specific and high-stakes.','scenario','regulatory',true),
(39,'A roofing owner asks you to promise a specific revenue increase if they buy ProFox Web + Flow. What should you do?','["Guarantee it to close","Explain the measurable business hypothesis and tracking plan without guaranteeing an outcome outside ProFox control","Promise double revenue verbally","Change the subject"]',1,'Value selling is not unsupported outcome guarantees.','scenario','claims',true),
(40,'What is the strongest overall Roofing seller standard?','["Sound technical even when uncertain","Understand the workflow, use industry language, diagnose root causes, recommend only justified solutions and confirm what you do not know","Always sell Apps","Always lead with price"]',1,'Industry fluency plus disciplined diagnosis creates trust.','scenario','expert-standard',false)
) AS v(ord,prompt,options,correct_index,explanation,section,case_key,critical)
WHERE m.slug='niche-training';

CREATE OR REPLACE FUNCTION public.get_niche_training_module(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_tracks jsonb; v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='niche-training' AND active=true) THEN RAISE EXCEPTION 'Niche Training module not found.'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',t.id,'nicheName',t.niche_name,'slug',t.slug,'summary',t.summary,'passingScore',t.passing_score,'sortOrder',t.sort_order,'required',t.required,
    'preSurveyQuestions',t.pre_survey_questions,'diagnosticQuestions',t.diagnostic_questions,
    'lessons',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'content',l.content,'sortOrder',l.sort_order) ORDER BY l.sort_order),'[]'::jsonb) FROM public.training_lessons l WHERE l.module_id=t.module_id AND l.niche_slug=t.slug AND l.active=true),
    'questions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'section',q.assessment_section,'caseKey',q.case_key,'sortOrder',q.sort_order) ORDER BY q.sort_order),'[]'::jsonb) FROM public.training_assessment_questions q WHERE q.module_id=t.module_id AND q.niche_slug=t.slug AND q.active=true),
    'progress',(SELECT jsonb_build_object('id',p.id,'status',p.status,'lessonIndex',p.lesson_index,'preSurveyAnswers',p.pre_survey_answers,'diagnosticAnswers',p.diagnostic_answers,'score',p.score,'attempts',p.attempts,'completedAt',p.completed_at) FROM public.user_niche_training_progress p WHERE p.user_id=v_user AND p.track_id=t.id)
  ) ORDER BY t.sort_order),'[]'::jsonb)
  INTO v_tracks
  FROM public.niche_training_tracks t WHERE t.module_id=p_module_id AND t.active=true;
  RETURN jsonb_build_object('tracks',v_tracks);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_pre_survey(p_track_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; n int; p public.user_niche_training_progress%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true;
 IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'Niche training access denied.'; END IF;
 IF jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'Survey answers must be an array.'; END IF;
 n:=jsonb_array_length(t.pre_survey_questions);
 IF jsonb_array_length(p_answers)<>n THEN RAISE EXCEPTION 'Exactly % survey answers are required.',n; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_answers) x WHERE btrim(x)='') THEN RAISE EXCEPTION 'Answer every pre-training survey question before continuing.'; END IF;
 INSERT INTO public.user_niche_training_progress(user_id,track_id,status,pre_survey_answers,updated_at)
 VALUES(auth.uid(),t.id,'In Progress',p_answers,now())
 ON CONFLICT(user_id,track_id) DO UPDATE SET status=CASE WHEN public.user_niche_training_progress.status='Completed' THEN 'Completed' ELSE 'In Progress' END,pre_survey_answers=EXCLUDED.pre_survey_answers,updated_at=now()
 RETURNING * INTO p;
 RETURN jsonb_build_object('status',p.status,'saved',true);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_step(p_track_id uuid,p_lesson_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; p public.user_niche_training_progress%ROWTYPE; max_idx int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true;
 IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'Niche training access denied.'; END IF;
 SELECT GREATEST(count(*)-1,0)::int INTO max_idx FROM public.training_lessons WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true;
 IF p_lesson_index<0 OR p_lesson_index>max_idx THEN RAISE EXCEPTION 'Invalid lesson step.'; END IF;
 INSERT INTO public.user_niche_training_progress(user_id,track_id,status,lesson_index,updated_at)
 VALUES(auth.uid(),t.id,'In Progress',p_lesson_index,now())
 ON CONFLICT(user_id,track_id) DO UPDATE SET lesson_index=GREATEST(public.user_niche_training_progress.lesson_index,EXCLUDED.lesson_index),status=CASE WHEN public.user_niche_training_progress.status='Completed' THEN 'Completed' ELSE 'In Progress' END,updated_at=now()
 RETURNING * INTO p;
 RETURN jsonb_build_object('lessonIndex',p.lesson_index,'status',p.status);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_diagnostic(p_track_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; n int; p public.user_niche_training_progress%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true;
 IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'Niche training access denied.'; END IF;
 IF jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'Diagnostic answers must be an array.'; END IF;
 n:=jsonb_array_length(t.diagnostic_questions);
 IF jsonb_array_length(p_answers)<>n THEN RAISE EXCEPTION 'Exactly % diagnostic answers are required.',n; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_answers) x WHERE length(btrim(x))<30) THEN RAISE EXCEPTION 'Each diagnostic response needs enough detail to demonstrate your reasoning.'; END IF;
 SELECT * INTO p FROM public.user_niche_training_progress WHERE user_id=auth.uid() AND track_id=t.id FOR UPDATE;
 IF NOT FOUND OR jsonb_array_length(p.pre_survey_answers)<>jsonb_array_length(t.pre_survey_questions) THEN RAISE EXCEPTION 'Complete the pre-training survey first.'; END IF;
 UPDATE public.user_niche_training_progress SET diagnostic_answers=p_answers,status=CASE WHEN status='Completed' THEN 'Completed' ELSE 'In Progress' END,updated_at=now() WHERE id=p.id RETURNING * INTO p;
 RETURN jsonb_build_object('saved',true,'status',p.status);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_niche_training_assessment(p_track_id uuid,p_answers integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; p public.user_niche_training_progress%ROWTYPE; q public.training_assessment_questions%ROWTYPE; n int; i int:=0; correct_count int:=0; critical_misses int:=0; score_value int; passed_value boolean; fb jsonb:='[]'::jsonb; lesson_count int; ts timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true;
 IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'Niche training access denied.'; END IF;
 SELECT * INTO p FROM public.user_niche_training_progress WHERE user_id=auth.uid() AND track_id=t.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Start this niche training first.'; END IF;
 IF jsonb_array_length(p.pre_survey_answers)<>jsonb_array_length(t.pre_survey_questions) THEN RAISE EXCEPTION 'Complete the pre-training survey first.'; END IF;
 IF jsonb_array_length(p.diagnostic_answers)<>jsonb_array_length(t.diagnostic_questions) THEN RAISE EXCEPTION 'Complete the Roofing Business Diagnostic exercise before certification.'; END IF;
 SELECT count(*)::int INTO lesson_count FROM public.training_lessons WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true;
 IF lesson_count>0 AND p.lesson_index<lesson_count-1 THEN RAISE EXCEPTION 'Complete all Roofing lessons before certification.'; END IF;
 SELECT count(*)::int INTO n FROM public.training_assessment_questions WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true;
 IF COALESCE(array_length(p_answers,1),0)<>n THEN RAISE EXCEPTION 'Exactly % certification answers are required.',n; END IF;
 FOR q IN SELECT * FROM public.training_assessment_questions WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true ORDER BY sort_order LOOP
   i:=i+1;
   IF p_answers[i]=q.correct_index THEN correct_count:=correct_count+1; ELSIF q.critical THEN critical_misses:=critical_misses+1; END IF;
   fb:=fb||jsonb_build_array(jsonb_build_object('questionId',q.id,'correct',p_answers[i]=q.correct_index,'critical',q.critical,'explanation',q.explanation,'section',q.assessment_section));
 END LOOP;
 score_value:=round((correct_count::numeric*100)/GREATEST(n,1))::int;
 passed_value:=score_value>=t.passing_score AND critical_misses=0;
 INSERT INTO public.niche_training_attempts(user_id,track_id,answers,score,passed,critical_misses,feedback,created_at) VALUES(auth.uid(),t.id,to_jsonb(p_answers),score_value,passed_value,critical_misses,fb,ts);
 UPDATE public.user_niche_training_progress SET status=CASE WHEN passed_value THEN 'Completed' ELSE 'Retry Required' END,score=score_value,attempts=attempts+1,completed_at=CASE WHEN passed_value THEN ts ELSE NULL END,updated_at=ts WHERE id=p.id;
 RETURN jsonb_build_object('score',score_value,'passed',passed_value,'passingScore',t.passing_score,'criticalMisses',critical_misses,'criticalPass',critical_misses=0,'feedback',fb,'status',CASE WHEN passed_value THEN 'Completed' ELSE 'Retry Required' END);
END; $$;

REVOKE ALL ON FUNCTION public.get_niche_training_module(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_pre_survey(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_step(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_diagnostic(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_niche_training_assessment(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_niche_training_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_pre_survey(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_step(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_diagnostic(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_niche_training_assessment(uuid,integer[]) TO authenticated;
